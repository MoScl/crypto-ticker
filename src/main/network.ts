import { app, net } from 'electron';
import os from 'node:os';
import { lookup } from 'node:dns/promises';
import type { NetworkStatus } from '../shared/types';
import { ensureEgress, getEgress, invalidateEgress } from './net/egress';
import { resolveDoh } from './net/doh';
import { netLog } from './net/logger';

/**
 * 网络状态检测模块（增强版）：
 * - 系统在线状态：net.isOnline()（Electron 原生）+ online/offline 事件
 * - 网络类型 / 接口 / IPv4：os.networkInterfaces() 启发式识别
 * - 实际连通性：经「智能出口路由器」探测（配置代理 → 系统代理 → 本地端口 → 直连），
 *   并区分国际端点（gstatic）与国内端点（baidu）
 * - DNS 劫持检测：系统解析失败但 DoH 可解析 => dnsBlocked=true（本地 53 被劫持）
 * - 周期性复查（默认 30s），状态变化时回调 onChanged
 */

const DOMESTIC_PROBE = 'https://www.baidu.com';
const GLOBAL_PROBE = 'https://www.gstatic.com/generate_204';
const PROBE_TIMEOUT_MS = 8000;
const RECHECK_INTERVAL_MS = 30_000;

type Listener = (status: NetworkStatus) => void;

let current: NetworkStatus = {
  online: true,
  reachable: true,
  degraded: false,
  type: 'unknown',
  interfaceName: null,
  ipv4: null,
  egress: null,
  dnsBlocked: false,
  lastError: null,
  ts: Date.now(),
};
let timer: NodeJS.Timeout | null = null;
let listeners = new Set<Listener>();
let probing = false;

/** 识别活动网卡（优先第一个非 internal 的 IPv4 接口） */
function detectInterface(): Pick<NetworkStatus, 'type' | 'interfaceName' | 'ipv4'> {
  const ifs = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifs)) {
    const v4 = addrs?.find((a) => a.family === 'IPv4' && !a.internal);
    if (!v4) continue;
    const lower = name.toLowerCase();
    const type =
      /wi-?fi|wlan|wireless/.test(lower) || lower.includes('无线')
        ? 'wifi'
        : /eth|ethernet/.test(lower) || lower.includes('以太')
          ? 'ethernet'
          : 'unknown';
    return { type, interfaceName: name, ipv4: v4.address };
  }
  return { type: 'unknown', interfaceName: null, ipv4: null };
}

/** 探测单个端点（对失败静默，不影响系统在线状态） */
function probeOne(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const req = net.request({ url });
      const t = setTimeout(() => {
        try {
          req.abort();
        } catch {
          /* noop */
        }
        resolve(false);
      }, PROBE_TIMEOUT_MS);
      const done = (ok: boolean) => {
        clearTimeout(t);
        try {
          req.abort();
        } catch {
          /* noop */
        }
        resolve(ok);
      };
      req.on('response', (res) => done(res.statusCode >= 200 && res.statusCode < 500));
      req.on('error', () => done(false));
      req.end();
    } catch {
      resolve(false);
    }
  });
}

/** DNS 劫持/污染检测：系统解析结果与 DoH 权威结果不一致 => 本地 DNS 被劫持/污染 */
async function detectDnsBlock(timeoutMs = 4000): Promise<boolean> {
  let sysAddr: string | null = null;
  try {
    const r = await lookup('api.coingecko.com');
    sysAddr = r.address;
  } catch {
    sysAddr = null;
  }
  const doh = await resolveDoh('api.coingecko.com', timeoutMs);
  if (sysAddr === null) return doh.length > 0; // 系统解析失败但 DoH 可解析 => 被劫持
  if (doh.length === 0) return false; // DoH 亦失败，无法判断
  return !doh.includes(sysAddr); // 系统解析到错误 IP（如 Facebook IP）=> 被污染
}

/** 执行一次完整检测并更新 current（幂等，并发探测去重） */
export async function refreshNetworkStatus(): Promise<NetworkStatus> {
  if (probing) return current;
  probing = true;
  try {
    const base = detectInterface();
    let online: boolean;
    try {
      online = net.isOnline();
    } catch {
      online = base.ipv4 !== null;
    }

    // 出口探测（强制重探，附带 60s TTL 缓存内复用由 ensureEgress 内部处理）
    let egress = getEgress();
    let egressErr: string | null = null;
    try {
      egress = await ensureEgress();
    } catch (e) {
      egressErr = e instanceof Error ? e.message : String(e);
      invalidateEgress();
    }

    const [dnsBlocked, globalOk, domesticOk] = await Promise.all([
      detectDnsBlock(),
      probeOne(GLOBAL_PROBE),
      probeOne(DOMESTIC_PROBE),
    ]);

    const reachable = globalOk || domesticOk || (egress?.latencyMs ?? -1) >= 0;
    const next: NetworkStatus = {
      online,
      reachable,
      // 本地网络通、但国际端点不通 => 代理未生效或规则直连导致
      degraded: online && reachable && !globalOk,
      ...base,
      egress,
      dnsBlocked,
      lastError:
        egressErr ??
        (!reachable ? '全部出口不可达（详见日志）' : dnsBlocked && !globalOk ? '本地DNS被劫持，已用DoH/代理绕过' : null),
      ts: Date.now(),
    };
    const changed =
      next.online !== current.online ||
      next.reachable !== current.reachable ||
      next.degraded !== current.degraded ||
      next.type !== current.type ||
      next.interfaceName !== current.interfaceName ||
      next.ipv4 !== current.ipv4 ||
      next.dnsBlocked !== current.dnsBlocked ||
      JSON.stringify(next.egress) !== JSON.stringify(current.egress) ||
      next.lastError !== current.lastError;
    current = next;
    if (changed) {
      netLog('net-status', { online: next.online, reachable: next.reachable, degraded: next.degraded, dnsBlocked: next.dnsBlocked, egress: next.egress?.reason });
      emit();
    }
    return current;
  } finally {
    probing = false;
  }
}

export function getNetworkStatus(): NetworkStatus {
  return current;
}

function emit(): void {
  for (const fn of listeners) fn(current);
}

export function onNetworkStatus(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 启动：监听系统在线/离线事件 + 定时复查 */
export function startNetworkMonitor(): void {
  refreshNetworkStatus();
  const emitter = app as unknown as NodeJS.EventEmitter;
  emitter.on('online', () => void refreshNetworkStatus());
  emitter.on('offline', () => void refreshNetworkStatus());
  timer = setInterval(() => void refreshNetworkStatus(), RECHECK_INTERVAL_MS);
  timer.unref?.();
}

export function stopNetworkMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  listeners.clear();
}
