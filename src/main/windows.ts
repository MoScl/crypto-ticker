import { BrowserWindow } from 'electron';
import path from 'node:path';

/**
 * 创建最小悬浮窗。
 * - frame:false + transparent:true  => 无边框 + 透明（配合 CSS 半透明背景）
 * - alwaysOnTop                    => 置顶
 * - resizable:true                 => 允许缩放（右下角把手通过 IPC 调 setSize 实现）
 * - skipTaskbar:true               => 仅在托盘可见（托盘为 P6，先保留可见性便于开发）
 */
export function createMiniWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 260,
    height: 360,
    minWidth: 200,
    minHeight: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
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
