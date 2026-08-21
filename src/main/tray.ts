import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron';
import zlib from 'node:zlib';

/**
 * 运行时生成 ₿ 金色徽章 PNG 图标（与标题栏 SVG logo / 应用图标同一几何设计），
 * 避免依赖外部 .ico/.png 资源文件，保证开箱即用。
 */
// ₿ 字形几何（归一化坐标，与 scripts/make-icon.mjs、MiniWindow.tsx 的 SVG 同源）
const GLYPH_RECTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.3, 0.44, 0.16, 0.84], // 竖干
  [0.16, 0.26, 0.06, 0.22], // 上刻线 1
  [0.33, 0.43, 0.06, 0.22], // 上刻线 2
  [0.16, 0.26, 0.78, 0.94], // 下刻线 1
  [0.33, 0.43, 0.78, 0.94], // 下刻线 2
  [0.3, 0.58, 0.18, 0.31], // 上横杠
  [0.3, 0.53, 0.45, 0.57], // 中横杠
  [0.3, 0.62, 0.69, 0.82], // 下横杠
];
const GLYPH_RINGS = [
  { cx: 0.615, cy: 0.395, rO: 0.2, rI: 0.095, uMin: 0.4 }, // 上半环
  { cx: 0.645, cy: 0.635, rO: 0.215, rI: 0.105, uMin: 0.4 }, // 下半环
];
const GB = { x0: 0.16, x1: 0.86, y0: 0.06, y1: 0.94 };

function glyphHit(u: number, v: number): boolean {
  for (const [x0, x1, y0, y1] of GLYPH_RECTS) {
    if (u >= x0 && u <= x1 && v >= y0 && v <= y1) return true;
  }
  for (const r of GLYPH_RINGS) {
    if (u >= r.uMin) {
      const d2 = (u - r.cx) ** 2 + (v - r.cy) ** 2;
      if (d2 <= r.rO * r.rO && d2 >= r.rI * r.rI) return true;
    }
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
            r = 185; g = 126; b = 0; // 外圈 #B97E00
          } else {
            // 金面渐变 #FFD25E → #E89B00
            const t = Math.min(1, Math.max(0, dy / rInner));
            r = Math.round(255 + (232 - 255) * t);
            g = Math.round(210 + (155 - 210) * t);
            b = Math.round(94 + (0 - 94) * t);
            if (glyphHit((px - ox) / scale, (py - oy) / scale)) {
              r = 92; g = 61; b = 0; // ₿ 深棕 #5C3D00
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
  const image = nativeImage.createFromBuffer(createTrayPng());
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
