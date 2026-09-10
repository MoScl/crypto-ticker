import { BrowserWindow } from 'electron';
import path from 'node:path';

/**
 * 创建最小悬浮窗。
 * - frame:false + transparent:true  => 无边框 + 透明（配合 CSS 半透明背景）
 * - alwaysOnTop                    => 置顶
 * - resizable:true                 => 允许缩放（右下角把手通过 IPC 调 setSize 实现）
 * - skipTaskbar:true               => 任务栏不显示窗口按钮，仅通过系统托盘 / 全局快捷键唤出
 */
export function createMiniWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 260,
    height: 360,
    minWidth: 160,
    minHeight: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    // 托盘常驻模式：不在任务栏显示按钮（Windows 走 ITaskbarList::DeleteTab）。
    // 注意：Electron 在部分 Windows 版本上 hide()/show() 之后会重新“长回”任务栏，
    // 因此主进程在每次 window 'show' 事件里会再断言一次，见 src/main/index.ts。
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // dev 下加载 vite 本地服务，生产加载打包后的静态文件
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.once('ready-to-show', () => win.show());
  return win;
}
