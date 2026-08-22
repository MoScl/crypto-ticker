#!/usr/bin/env node
/**
 * 发布 CryptoTicker 到 GitHub Releases（绕过被墙的 github.com 主站，走 API）。
 *
 * 背景：本机网络 github.com 主站不可达（代理 CONNECT 502），但 api.github.com
 * 与 uploads.github.com 通畅。git push 推送大附件会失败，故全部操作走 REST API。
 *
 * 用法：
 *   node scripts/publish.mjs                # 用 package.json 的 version 打 tag 并发布
 *   node scripts/publish.mjs 0.2.0          # 指定版本号
 *   node scripts/publish.mjs 0.2.0 --prerelease
 *
 * 流程（幂等，可重复执行）：
 *   1. 从 git credential 读取 GitHub token（ghp/github_pat 开头）
 *   2. 取 main 分支最新 commit SHA
 *   3. 若 tag 不存在则创建（refs/tags/v<version>）
 *   4. 若 Release 不存在则创建
 *   5. 上传固定文件名附件：release/CryptoTicker-universal.dmg + CryptoTicker-arm64-mac.zip
 *
 * 固定文件名策略：README 用 latest/download 永久链接，每次发布上传同名文件，
 * 下载按钮自动指向最新版，无需改 README。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OWNER = 'MoScl';
const REPO = 'crypto-ticker';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const UPLOADS = `https://uploads.github.com/repos/${OWNER}/${REPO}`;

// 固定文件名（与 README 下载按钮一致，勿改）
// from: 打包产物通配（带版本号）；file: 上传到 Release 的固定名
const ASSETS = [
  { file: 'CryptoTicker-universal.dmg', from: 'CryptoTicker-*-universal.dmg' },
  { file: 'CryptoTicker-arm64-mac.zip', from: 'CryptoTicker-*-arm64-mac.zip' },
];

const args = process.argv.slice(2);
const versionArg = args.find((a) => !a.startsWith('--'));
const isPrerelease = args.includes('--prerelease');
const version = versionArg ?? JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
const tag = `v${version}`;

function getToken() {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  });
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error('未能从 git credential 读取 GitHub token，请先 git push 一次完成认证');
  return m[1].trim();
}

async function api(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      Authorization: `token ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`API ${options.method ?? 'GET'} ${pathname} 失败 ${res.status}: ${body.message ?? JSON.stringify(body)}`);
  return body;
}

const TOKEN = getToken();

// 1. 取 main 最新 commit
const head = await api('/commits/main');
const sha = head.sha;
console.log(`main HEAD: ${sha.slice(0, 7)}`);

// 2. 创建 tag（幂等：已存在则跳过）
try {
  await api('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/tags/${tag}`, sha }) });
  console.log(`✓ tag ${tag} 已创建`);
} catch (e) {
  if (String(e.message).includes('already exists')) console.log(`tag ${tag} 已存在，跳过`);
  else throw e;
}

// 3. 查找或创建 Release
let release;
try {
  release = await api(`/releases/tags/${tag}`);
  console.log(`✓ Release ${tag} 已存在（id=${release.id}），复用`);
} catch {
  const body = {
    tag_name: tag,
    name: tag,
    body:
      `CryptoTicker ${version} 发布。\n\n` +
      `- 金色 ₿ 徽章 logo（真实字体渲染）\n` +
      `- 极简模式 + 细化点击穿透\n` +
      `- macOS 彩色托盘图标\n` +
      `- 多数据源：OKX / Binance / Bybit / Gate.io / CoinGecko 自动容灾\n` +
      `- 点击穿透贴纸模式、一键直达交易所交易对\n\n` +
      `安装包未签名：macOS 首次打开请右键 → 打开。`,
    draft: false,
    prerelease: isPrerelease,
  };
  release = await api('/releases', { method: 'POST', body: JSON.stringify(body) });
  console.log(`✓ Release ${tag} 已创建（id=${release.id}）`);
}

// 4. 上传附件（已存在的同名附件会先删除再传，保证内容最新）
const existingAssets = await api(`/releases/${release.id}/assets`);
for (const a of ASSETS) {
  const src = resolveAsset(a);
  if (!src) {
    console.warn(`⚠ 未找到 ${a.from}，跳过（先运行 npm run build && npx electron-builder --mac）`);
    continue;
  }
  const dup = existingAssets.find((x) => x.name === a.file);
  if (dup) {
    await api(`/releases/assets/${dup.id}`, { method: 'DELETE' });
    console.log(`  删除旧附件 ${a.file}（asset ${dup.id}）`);
  }
  const stat = fs.statSync(src);
  console.log(`上传 ${a.file}（${(stat.size / 1024 / 1024).toFixed(1)} MB）…`);
  const buf = fs.readFileSync(src);
  const up = await fetch(`${UPLOADS}/releases/${release.id}/assets?name=${encodeURIComponent(a.file)}`, {
    method: 'POST',
    headers: { Authorization: `token ${TOKEN}`, 'Content-Type': 'application/octet-stream' },
    body: buf,
  });
  const upBody = await up.json().catch(() => ({}));
  if (!up.ok) throw new Error(`上传 ${a.file} 失败 ${up.status}: ${upBody.message ?? ''}`);
  console.log(`✓ ${a.file} 上传成功（${upBody.size} bytes）`);
}

console.log(`\n发布完成：https://github.com/${OWNER}/${REPO}/releases/tag/${tag}`);
console.log(`下载页：https://github.com/${OWNER}/${REPO}/releases/latest`);

function resolveAsset(asset) {
  const dir = path.join(repoRoot, 'release');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => !f.endsWith('.blockmap'));
  // 1) 固定文件名已存在（上次发布/手工复制）→ 直接上传它
  if (files.includes(asset.file)) return path.join(dir, asset.file);
  // 2) 否则匹配打包产物通配（CryptoTicker-<version>-universal.dmg）
  const base = asset.from.replace(/\*/g, '').replace(/\.(dmg|zip)$/, '');
  const match = files.find((f) => f.startsWith(base) && f.endsWith(asset.file.includes('dmg') ? '.dmg' : '.zip'));
  return match ? path.join(dir, match) : null;
}
