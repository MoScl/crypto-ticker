import net from 'node:net';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { readSystemProxy } from './systemProxy';
import { resolveDoh } from './doh';
import { rawGet } from './rawRequest';
import { netLog } from './logger';

/**
 * 智能出口路由器（全新网络方案核心）：
 *
 * 候选出口链（按优先级）：
 *   1. 配置代理（设置面板 proxyUrl）
 *   2. 系统代理（Windows 注册表，Clash Verge 等开启「系统代理」时写入）
 *   3. 本地代理端口扫描（7897 / 7890 / 1080 / 10809 / 10808 / 8888 / 8118 / 2080）
 *   4. 直连兜底（用 DoH 解析绕过被劫持的本地 DNS）
 *
 * 关键设计：
 * - 走 HTTP 代理 CONNECT 隧道时，域名解析由代理远端完成 —— 天然绕过
 *   本地 53 劫持（深信服 Sangfor 抢占 127.0.0.1:53 的问题不再影响应用）
 * - 直连场景用 DoH（doh.pub / alidns）解析，同样绕开本地 DNS
 * - 并行探测候选，选首个连通出口；60s TTL 健康缓存；请求失败即时失效重探
 * - 出口切换通过 onEgressChanged 广播（数据源据此重连/刷新）
 */

export type EgressMode = 'proxy' | 'direct';

export interface EgressInfo {
  mode: EgressMode;
  proxyUrl: string | null;
  latencyMs: number; // 探测耗时；-1 表示全部候选不可达
  checkedAt: number;
  reason: string; // 选择原因（用于日志/诊断展示）
}

const LOCAL_PORTS = [7897, 7890, 7891, 1080, 10809, 10808, 8888, 8118, 2080];
// 探针端点：第一顺位与真实业务同源（coingecko），第二顺位 Google 轻量端点
const PROBE_TARGETS = ['https://api.coingecko.com/api/v3/ping', 'https://www.gstatic.com/generate_204'];
const TTL_MS = 60_000;
const PROBE_TIMEOUT_MS = 6_000;
const SCAN_TIMEOUT_MS = 400;

let configured: string | null = null; // 设置面板配置的代理
let current: EgressInfo | null = null;
let probing = false;
let agentCache: HttpsProxyAgent | null = null;
const waiters: Array<() => void> = [];
const listeners = new Set<(info: EgressInfo) => void>();

function normalizeProxy(raw: string): string {
  const s = raw.trim();
  return /^https?:\/\//i.test(s) ? s : `http://${s}`;
}

/** 设置面板修改代理时调用：更新配置并触发重探 */
export function setConfiguredProxy(url: string | undefined): void {
  const next = url?.trim() || null;
  if (next === configured) return;
  configured = next;
  invalidateEgress();
  void ensureEgress();
}

export function getEgress(): EgressInfo | null {
  return current;
}

export function invalidateEgress(): void {
  current = null;
  agentCache = null;
}

export function onEgressChanged(cb: (info: EgressInfo) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 获取当前出口对应的代理 agent（直连返回 null）；出口失效时返回 null */
export function getProxyAgent(): HttpsProxyAgent | null {
  if (current?.mode === 'proxy' && current.proxyUrl) {
    if (!agentCache) {
      try {
        agentCache = new HttpsProxyAgent(current.proxyUrl);
      } catch {
        return null;
      }
    }
    return agentCache;
  }
  agentCache = null;
  return null;
}

/** 获取当前出口的代理 URL（供 ws 等需要字符串的场景；直连返回 undefined） */
export function getProxyUrl(): string | undefined {
  return current?.mode === 'proxy' && current.proxyUrl ? current.proxyUrl : undefined;
}

/** 确保拿到可用出口：有新鲜缓存直接返回，否则后台重探（并发去重，等待同一结果） */
export async function ensureEgress(force = false): Promise<EgressInfo> {
  const now = Date.now();
  if (!force && current && now - current.checkedAt < TTL_MS) return current;
  if (probing) {
    await new Promise<void>((r) => waiters.push(r));
    return current ?? { mode: 'direct', proxyUrl: null, latencyMs: -1, checkedAt: Date.now(), reason: 'probe failed' };
  }
  probing = true;
  try {
    const info = await resolveFresh();
    current = info;
    netLog('egress', { mode: info.mode, proxy: info.proxyUrl, latencyMs: info.latencyMs, reason: info.reason });
    for (const cb of listeners) {
      try {
        cb(info);
      } catch {
        /* 监听器异常不影响主流程 */
      }
    }
    return info;
  } finally {
    probing = false;
    while (waiters.length > 0) waiters.shift()!();
  }
}

/** 扫描本机常见代理端口是否开放（TCP 快速连接测试） */
async function scanLocalPorts(ports: number[]): Promise<number[]> {
  const results = await Promise.all(
    ports.map(
      (port) =>
        new Promise<number | null>((resolve) => {
          const sock = net.connect({ host: '127.0.0.1', port, timeout: SCAN_TIMEOUT_MS });
          sock.once('connect', () => {
            sock.destroy();
            resolve(port);
          });
          sock.once('error', () => resolve(null));
          sock.once('timeout', () => {
            sock.destroy();
            resolve(null);
          });
        }),
    ),
  );
  return results.filter((p): p is number => p !== null);
}

/** 通过指定代理探测目标端点（代理隧道内 DNS 由远端解析） */
function probeViaProxy(proxyUrl: string, target: string): Promise<number | null> {
  return new Promise((resolve) => {
    let agent: HttpsProxyAgent;
    try {
      agent = new HttpsProxyAgent(proxyUrl);
    } catch {
      resolve(null);
      return;
    }
    const started = Date.now();
    rawGet(target, { agent: agent as unknown as import('node:http').Agent, timeoutMs: PROBE_TIMEOUT_MS })
      .then((res) => resolve(res.status >= 200 && res.status < 500 ? Date.now() - started : null))
      .catch(() => resolve(null));
  });
}

/** 直连探测：DoH 解析目标域名后按 IP 直连（绕过本地 DNS 劫持） */
async function probeDirect(target: string): Promise<number | null> {
  try {
    const host = new URL(target).hostname;
    const ips = await resolveDoh(host, 4000);
    if (ips.length === 0) return null;
    const started = Date.now();
    const res = await rawGet(target, { resolveIp: ips[0], timeoutMs: PROBE_TIMEOUT_MS });
    return res.status >= 200 && res.status < 500 ? Date.now() - started : null;
  } catch {
    return null;
  }
}

/** 构建候选出口列表（配置 → 系统 → 本地端口扫描）并去重 */
async function buildCandidates(): Promise<Array<{ proxy: string; label: string }>> {
  const list: Array<{ proxy: string; label: string }> = [];
  if (configured) list.push({ proxy: normalizeProxy(configured), label: 'config' });
  try {
    const sys = await readSystemProxy();
    if (sys.enabled && sys.server) list.push({ proxy: normalizeProxy(sys.server), label: 'system' });
  } catch {
    /* 读取失败跳过系统代理 */
  }
  const openPorts = await scanLocalPorts(LOCAL_PORTS);
  for (const p of openPorts) list.push({ proxy: `http://127.0.0.1:${p}`, label: `local:${p}` });
  const seen = new Set<string>();
  return list.filter((c) => {
    if (seen.has(c.proxy)) return false;
    seen.add(c.proxy);
    return true;
  });
}

/** 完整出口探测：候选代理并行探测，全失败则直连兜底 */
async function resolveFresh(): Promise<EgressInfo> {
  const candidates = await buildCandidates();
  const results = await Promise.all(
    candidates.map(async (c) => ({ c, latency: await probeViaProxy(c.proxy, PROBE_TARGETS[0]) })),
  );
  const hit = results.find((r) => r.latency !== null);
  if (hit) {
    return {
      mode: 'proxy',
      proxyUrl: hit.c.proxy,
      latencyMs: hit.latency!,
      checkedAt: Date.now(),
      reason: `probe ok via ${hit.c.label}`,
    };
  }
  const directLatency = await probeDirect(PROBE_TARGETS[0]);
  if (directLatency !== null) {
    return { mode: 'direct', proxyUrl: null, latencyMs: directLatency, checkedAt: Date.now(), reason: 'no proxy works, direct ok (DoH)' };
  }
  return {
    mode: 'direct',
    proxyUrl: null,
    latencyMs: -1,
    checkedAt: Date.now(),
    reason: `all unreachable (${candidates.length} proxies + direct)`,
  };
}
