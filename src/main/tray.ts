import { Tray, Menu, app, BrowserWindow, nativeImage, type NativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * 托盘图标加载策略：
 * 1. 优先加载打包/构建时用真实字体渲染生成的 PNG（与标题栏 B 字形完全一致）：
 *    - Windows：assets/tray-icon.png（金色徽章 32px，HiDPI 自动合并 @2x 64px）
 *    - macOS：assets/tray-mac22.png（**彩色**圆角矩形金底 ₿，22pt，Electron 自动合并
 *      @2x/@3x representations；16pt 组 tray-mac16.png 作为回退）。彩色图标不使用
 *      Template（Template 只渲染 alpha 单色、丢弃颜色，会导致背景色缺失）。
 * 2. 资源缺失时回退到运行时几何渲染（createTrayPng，造型同源）。
 */
function resolveTrayImagePath(): string | null {
  const isMac = process.platform === 'darwin';
  // macOS 优先 22pt（现代菜单栏高度），回退 16pt
  const name = isMac ? ['tray-mac22.png', 'tray-mac16.png'] : ['tray-icon.png'];
  // 打包后：asar 根（files 配置带入 assets/）；开发：项目根 assets/
  const roots = [path.join(app.getAppPath(), 'assets'), path.join(__dirname, '..', '..', 'assets')];
  for (const root of roots) {
    for (const n of name) {
      const p = path.join(root, n);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function loadTrayImage(): NativeImage {
  const p = resolveTrayImagePath();
  if (p) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) return img; // 彩色图标：不设置 Template，保留背景色与颜色
  }
  return nativeImage.createFromBuffer(createTrayPng(32));
}
// ₿ 字形几何（归一化坐标，与 scripts/make-icon.mjs、MiniWindow.tsx 的 SVG 同源）
// 参考稿样式：描边式 "B"（空心碗）+ 碗内双竖线
const GLYPH_RECTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.42, 0.52, 0.20, 0.72], // B 竖干
  [0.21, 0.79, 0.20, 0.28], // B 顶横
  [0.21, 0.60, 0.44, 0.52], // B 中横
  [0.21, 0.79, 0.64, 0.72], // B 底横
  [0.63, 0.71, 0.28, 0.44], // B 上碗右缘
  [0.63, 0.71, 0.52, 0.64], // B 下碗右缘
  [0.33, 0.41, 0.26, 0.72], // 左竖线
  [0.58, 0.63, 0.26, 0.72], // 右竖线
];
const GB = { x0: 0.16, x1: 0.84, y0: 0.08, y1: 0.92 };

function glyphHit(u: number, v: number): boolean {
  for (const [x0, x1, y0, y1] of GLYPH_RECTS) {
    if (u >= x0 && u <= x1 && v >= y0 && v <= y1) return true;
  }
  return false;
}

function createTrayPng(size = 32): Buffer {
  const w = size;
  const h = size;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const cx = w / 2;
  const cy = h / 2;
  const rFace = w / 2 - Math.max(0.5, w * 0.03);
  const rimW = Math.max(1, rFace * 0.065);
  const rInner = rFace - rimW;
  const gh = GB.y1 - GB.y0;
  const scale = (rInner * 2 * 0.89) / gh;
  const ox = cx - ((GB.x0 + GB.x1) / 2) * scale;
  const oy = cy - ((GB.y0 + GB.y1) / 2) * scale;
  const ss = 4; // 超采样倍数，保证 32px 下 ₿ 边缘平滑

  let pos = 0;
  for (let y = 0; y < h; y++) {
    raw[pos++] = 0; // 过滤器：无
    for (let x = 0; x < w; x++) {
      let rAcc = 0, gAcc = 0, bAcc = 0, solid = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          const dx = px - cx;
          const dy = py - cy;
          const d = Math.hypot(dx, dy);
          if (d > rFace) continue;
          let r: number, g: number, b: number;
          if (d > rInner) {
            r = 255; g = 217; b = 138; // 亮金描边 #FFD98A
          } else {
            r = 246; g = 183; b = 60; // 金色平底 #F6B73C
            if (glyphHit((px - ox) / scale, (py - oy) / scale)) {
              r = 26; g = 26; b = 26; // ₿ 近黑 #1a1a1a
            }
          }
          rAcc += r; gAcc += g; bAcc += b; solid++;
        }
      }
      if (solid === 0) {
        raw[pos++] = 0; raw[pos++] = 0; raw[pos++] = 0; raw[pos++] = 0;
      } else {
        raw[pos++] = Math.round(rAcc / solid);
        raw[pos++] = Math.round(gAcc / solid);
        raw[pos++] = Math.round(bAcc / solid);
        raw[pos++] = Math.round((solid / (ss * ss)) * 255);
      }
    }
  }

  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export interface TrayOptions {
  getWindow: () => BrowserWindow | null;
  getClickThrough: () => boolean;
  setClickThrough: (v: boolean) => void;
  toggleWindow: () => void;
  onQuit: () => void;
}

let tray: Tray | null = null;

/**
 * 创建系统托盘。返回 refresh()，主进程在点击穿透状态变化时调用以重建菜单。
 * 托盘是操作系统级入口，不依赖窗口状态——窗口被穿透屏蔽、隐藏或最小化时依然可用，
 * 是「取消穿透」最可靠的入口。
 */
export function createTray(opts: TrayOptions): { refresh: () => void } {
  const image = loadTrayImage();
  tray = new Tray(image);

  const build = () => {
    const ct = opts.getClickThrough();
    tray?.setToolTip(`CryptoTicker${ct ? ' · 点击穿透中（Ctrl+Shift+X 退出）' : ''}`);
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示 / 隐藏', click: opts.toggleWindow },
        {
          // 复选项：勾选态 = 穿透开启；点击即切换，是穿透态下最直接的恢复入口
          label: ct ? '退出点击穿透' : '开启点击穿透',
          type: 'checkbox',
          checked: ct,
          click: () => opts.setClickThrough(!ct),
        },
        { type: 'separator' },
        { label: '退出', click: opts.onQuit },
      ]),
    );
  };

  build();
  tray.on('click', opts.toggleWindow);
  return { refresh: build };
}
