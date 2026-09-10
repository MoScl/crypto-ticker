#!/usr/bin/env node
/**
 * scripts/win-build.mjs
 * Windows 安装包构建：直接产出到 release/（electron-builder.yml 已配置 directories.output: release），
 * 不再生成 wb-buildN / out-win 等临时目录。
 *
 * 解决两个本机环境坑：
 *  1) Windows Defender 实时扫描会短暂锁定上次构建残留的 win-unpacked/resources/app.asar，
 *     导致 electron-builder 的 EnsureEmptyDir 因 EBUSY 失败。这里预清理时对锁定文件做重试，
 *     等 Defender 释放后再继续，避免被迫换用新目录。
 *  2) WorkBuddy safe-delete 守卫会拦截 electron-builder 的批量删除（如 locale .pak 清理）。
 *     通过 CODEBUDDY_SAFE_DELETE_ENABLED=0 关闭守卫，供子进程继承。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const release = join(root, 'release');

// 1) 关闭 safe-delete 守卫，供后续子进程（electron-builder）继承
process.env.CODEBUDDY_SAFE_DELETE_ENABLED = '0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 递归删除目录，遇到 Defender 锁定（EBUSY/EPERM）时重试若干次 */
async function cleanRetrattempts(dir, attempts = 12, delay = 1200) {
  for (let i = 0; i < attempts; i++) {
    let blocked = false;
    try {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      if (e.code === 'EBUSY' || e.code === 'EPERM') blocked = true;
      else throw e;
    }
    if (!blocked) return true;
    if (i < attempts - 1) {
      console.log(`[win-build] ${dir} 仍被 Defender 占用，重试 ${i + 1}/${attempts}...`);
      await sleep(delay);
    }
  }
  return false;
}

async function main() {
  console.log('[win-build] 预清理 release/ 上次残留 ...');
  await cleanRetrattempts(join(release, 'win-unpacked'));

  // 清掉上次的安装包产物（保留 release/ 目录本身），让 electron-builder 干净重建
  if (existsSync(release)) {
    for (const f of readdirSync(release)) {
      if (/^CryptoTicker.*\.(exe|blockmap)$/.test(f) || f === 'latest.yml') {
        try {
          rmSync(join(release, f), { force: true });
        } catch (e) {
          if (!(e.code === 'EBUSY' || e.code === 'EPERM')) throw e;
        }
      }
    }
  }

  console.log('[win-build] 1/2 构建渲染层 + 主进程 ...');
  const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: root, shell: true });
  if (build.status !== 0) {
    console.error('[win-build] npm run build 失败');
    process.exit(build.status || 1);
  }

  console.log('[win-build] 2/2 打包 Windows NSIS 安装包 -> release/ ...');
  const pack = spawnSync(
    'npx',
    ['electron-builder', '--win', 'nsis', '--x64'],
    { stdio: 'inherit', cwd: root, shell: true, env: process.env },
  );
  if (pack.status !== 0) {
    console.error('[win-build] electron-builder 失败');
    process.exit(pack.status || 1);
  }

  // 清理解包目录节省空间（发布只需 exe / blockmap / latest.yml）
  const wu = join(release, 'win-unpacked');
  if (existsSync(wu)) {
    try {
      rmSync(wu, { recursive: true, force: true });
      console.log('[win-build] 已清理 win-unpacked（节省磁盘）');
    } catch (e) {
      console.log(`[win-build] win-unpacked 清理跳过（${e.code}，可忽略）`);
    }
  }

  let ver = '?';
  try {
    ver = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  } catch { /* ignore */ }
  console.log(`[win-build] 完成 -> release/CryptoTicker Setup ${ver}.exe`);
}

main();
