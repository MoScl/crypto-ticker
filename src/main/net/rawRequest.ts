import https from 'node:https';
import http from 'node:http';
import type { Agent } from 'node:http';

/**
 * 底层 HTTPS/HTTP GET 原语。
 * - 支持注入代理 agent（HttpsProxyAgent，CONNECT 隧道：DNS 由代理远端解析）
 * - 支持 resolveIp：用 DoH 预解析的 IP 直连（绕过本地被劫持的 DNS），
 *   通过 servername 保留 TLS SNI、Host 头保留域名
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export interface RawGetOptions {
  agent?: Agent;
  timeoutMs?: number;
  resolveIp?: string;
  headers?: Record<string, string>;
}

export interface RawResponse {
  status: number;
  body: string;
}

export function rawGet(url: string, opts: RawGetOptions = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('无效 URL'));
      return;
    }
    const mod = u.protocol === 'https:' ? https : http;
    const isHttps = u.protocol === 'https:';
    const headers: Record<string, string> = { 'user-agent': UA, accept: 'application/json', ...opts.headers };
    const reqOpts: https.RequestOptions = {
      method: 'GET',
      hostname: opts.resolveIp ?? u.hostname,
      port: u.port !== '' ? Number(u.port) : isHttps ? 443 : 80,
      path: u.pathname + u.search,
      headers,
      timeout: opts.timeoutMs ?? 15_000,
    };
    if (opts.resolveIp) {
      // 用 IP 直连但保留 SNI/Host，避免 TLS 校验与虚拟主机解析失败
      reqOpts.servername = u.hostname;
      headers.Host = u.hostname;
    }
    if (opts.agent) reqOpts.agent = opts.agent;
    const req = mod.request(reqOpts, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    req.end();
  });
}
