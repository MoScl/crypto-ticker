import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Agent } from 'node:http';
import { ensureEgress, invalidateEgress, getEgress, setConfiguredProxy, getProxyUrl } from './net/egress';
import { resolveDoh } from './net/doh';
import { rawGet } from './net/rawRequest';
import { netLog } from './net/logger';

/**
 * 智能请求层（重写）：
 * - 每次请求先经出口路由器选择可用出口（配置代理 → 系统代理 → 本地端口 → 直连）
 * - 代理模式：CONNECT 隧道，DNS 由代理远端解析（绕开本地 53 劫持）
 * - 直连模式：DoH 解析域名后按 IP 直连（同样绕开本地 DNS 劫持）
 * - 失败自动重试：每轮重试前使出口缓存失效，重新探测换出口
 * - 全程写网络日志（出口、耗时、状态码、错误）
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export interface GetJsonOptions {
  /** 设置面板配置的代理（会同步给出口路由器，纳入候选链首位） */
  proxyUrl?: string;
  timeoutMs?: number;
  /** 额外重试次数（默认 2，即最多 3 次尝试） */
  retries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 单次实际请求：代理出口走 agent 隧道；直连出口用 DoH IP 直连 */
async function requestOnce(url: string, timeoutMs: number): Promise<unknown> {
  const egress = await ensureEgress();
  let agent: Agent | undefined;
  if (egress.mode === 'proxy' && egress.proxyUrl) {
    try {
      agent = new HttpsProxyAgent(egress.proxyUrl) as unknown as Agent;
    } catch {
      throw new Error(`无效代理地址: ${egress.proxyUrl}`);
    }
    const res = await rawGet(url, { agent, timeoutMs, headers: { 'user-agent': BROWSER_UA } });
    if (res.status >= 200 && res.status < 300) return parseBody(res.body, url);
    throw new Error(`HTTP ${res.status}`);
  }
  // 直连出口：DoH 解析（绕过本地被劫持 DNS）
  const host = new URL(url).hostname;
  const ips = await resolveDoh(host, Math.min(timeoutMs, 5000));
  if (ips.length === 0) throw new Error(`DoH 解析失败: ${host}`);
  const res = await rawGet(url, { resolveIp: ips[0], timeoutMs, headers: { 'user-agent': BROWSER_UA } });
  if (res.status >= 200 && res.status < 300) return parseBody(res.body, url);
  throw new Error(`HTTP ${res.status}`);
}

function parseBody(body: string, url: string): unknown {
  try {
    return JSON.parse(body || 'null');
  } catch {
    throw new Error(`JSON 解析失败: ${url}`);
  }
}

/** 对外统一入口：自动选出口 + 失败重试换出口 */
export async function getJson(url: string, opts: GetJsonOptions = {}): Promise<unknown> {
  if (opts.proxyUrl) setConfiguredProxy(opts.proxyUrl);
  const retries = Math.max(0, opts.retries ?? 2);
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await requestOnce(url, timeoutMs);
      netLog('req-ok', {
        url,
        attempt,
        mode: getEgress()?.mode,
        proxy: getProxyUrl() ?? null,
        latencyMs: getEgress()?.latencyMs,
      });
      return data;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      netLog('req-fail', {
        url,
        attempt,
        mode: getEgress()?.mode,
        proxy: getProxyUrl() ?? null,
        error: lastErr.message,
      });
      invalidateEgress(); // 出口失效：下一轮重新探测，可能切到其他代理/直连
      if (attempt < retries) await sleep(400 * 2 ** attempt);
    }
  }
  throw lastErr ?? new Error('请求失败');
}
