import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 网络诊断日志（环形文件）：
 * - 路径：userData/logs/network-YYYYMMDD.log
 * - 单文件超过 2MB 自动轮转为 .log.1（保留最近两份）
 * - 每次网络请求 / 出口切换 / 重连 / 错误均记录一行 JSON，便于回溯故障
 */

const MAX_BYTES = 2 * 1024 * 1024;
let dir: string | null = null;
let filePath: string | null = null;

function ensureDir(): string {
  if (!dir) {
    dir = path.join(app.getPath('userData'), 'logs');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* 目录创建失败则日志静默降级 */
    }
  }
  return dir;
}

function todayFile(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `network-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.log`;
}

function rotateIfNeeded(): void {
  try {
    const st = fs.statSync(filePath!);
    if (st.size > MAX_BYTES) {
      fs.renameSync(filePath!, `${filePath!}.1`);
    }
  } catch {
    /* 无文件则不轮转 */
  }
}

/** 追加一行网络日志。任何失败都不向外抛（日志不阻塞业务） */
export function netLog(evt: string, detail?: Record<string, unknown>): void {
  try {
    if (!filePath) {
      filePath = path.join(ensureDir(), todayFile());
      rotateIfNeeded();
    }
    const line = `${new Date().toISOString()} [${evt}] ${detail ? JSON.stringify(detail) : ''}\n`;
    fs.appendFileSync(filePath, line);
  } catch {
    /* 忽略写日志失败 */
  }
}

export function getNetLogPath(): string {
  return path.join(ensureDir(), todayFile());
}
