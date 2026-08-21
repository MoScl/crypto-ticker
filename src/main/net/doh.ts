import https from 'node:https';

/**
 * DNS-over-HTTPS 解析：绕过被劫持/失效的本地 DNS（如深信服抢占 127.0.0.1:53）。
 * 使用公共 DoH 服务（DNSPod / 阿里云），走 HTTPS 443，不受本地 53 端口劫持影响。
 * 直连出口、DNS 劫持检测、域名预解析均依赖此模块。
 */

const DOH_ENDPOINTS = ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'];

/** 解析 A 记录，返回 IPv4 列表；全部失败返回空数组（不抛异常） */
export function resolveDoh(host: string, timeoutMs = 5000): Promise<string[]> {
  return new Promise((resolve) => {
    let idx = 0;
    const tryNext = (): void => {
      if (idx >= DOH_ENDPOINTS.length) {
        resolve([]);
        return;
      }
      const url = new URL(DOH_ENDPOINTS[idx]);
      url.searchParams.set('name', host);
      url.searchParams.set('type', 'A');
      idx += 1;
      const req = https.get(
        url,
        { timeout: timeoutMs, headers: { accept: 'application/dns-json' } },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c: string) => (body += c));
          res.on('end', () => {
            try {
              const j = JSON.parse(body) as { Answer?: Array<{ type: number; data?: string }> };
              const addrs = (j.Answer ?? [])
                .filter((a) => a.type === 1 && typeof a.data === 'string')
                .map((a) => a.data as string);
              if (addrs.length > 0) {
                resolve(addrs);
              } else {
                tryNext();
              }
            } catch {
              tryNext();
            }
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        tryNext();
      });
      req.on('error', () => tryNext());
    };
    tryNext();
  });
}
