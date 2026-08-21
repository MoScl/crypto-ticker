import { execFile } from 'node:child_process';

/**
 * 读取 Windows 系统代理（HKCU Internet Settings）。
 * Clash Verge / v2rayN 等开启「系统代理」时会写入该注册表键。
 * 用于把「系统代理」纳入候选出口链（配置代理不可用时自动接上）。
 */

export interface SystemProxyInfo {
  enabled: boolean; // ProxyEnable == 1
  server: string | null; // 如 127.0.0.1:7897 / http://proxy.corp:8080
}

function queryReg(valueName: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        'reg',
        [
          'query',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
          '/v',
          valueName,
        ],
        { timeout: timeoutMs, windowsHide: true },
        (err, stdout) => {
          if (err) {
            resolve(null);
            return;
          }
          const m = new RegExp(`\\s${valueName}\\s+REG_\\w+\\s+(\\S+)`).exec(stdout);
          resolve(m ? m[1].trim() : null);
        },
      );
    } catch {
      resolve(null);
    }
  });
}

/** 并行读取 ProxyEnable 与 ProxyServer */
export function readSystemProxy(timeoutMs = 2000): Promise<SystemProxyInfo> {
  return Promise.all([queryReg('ProxyEnable', timeoutMs), queryReg('ProxyServer', timeoutMs)]).then(
    ([enableRaw, server]) => {
      const enabled = enableRaw !== null && parseInt(enableRaw, 16) === 1;
      if (!server || server.startsWith('<')) return { enabled, server: null };
      return { enabled, server: server.replace(/^https?:\/\//i, '').split(';')[0].trim() };
    },
  );
}
