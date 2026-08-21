// 生成 ₿ 金色徽章图标（与标题栏 SVG logo 同一几何设计）：
//   assets/icon.ico     —— 多尺寸（16/24/32/48/64/128/256），Windows exe/安装包
//   assets/icon.png     —— 1024x1024，mac 打包用（electron-builder 自动转 icns，含 Retina 512@2x）
//   assets/icon-512.png —— 512x512，Linux 打包用
// 仅构建安装包前需要；开发运行（npm run dev）不需要。
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ===== ₿ 字形几何（归一化坐标 u,v ∈ [0,1]，与 MiniWindow.tsx 的 SVG 字形同源）=====
const GLYPH_RECTS = [
  [0.30, 0.44, 0.16, 0.84], // 竖干
  [0.16, 0.26, 0.06, 0.22], // 上刻线 1
  [0.33, 0.43, 0.06, 0.22], // 上刻线 2
  [0.16, 0.26, 0.78, 0.94], // 下刻线 1
  [0.33, 0.43, 0.78, 0.94], // 下刻线 2
  [0.30, 0.58, 0.18, 0.31], // 上横杠
  [0.30, 0.53, 0.45, 0.57], // 中横杠
  [0.30, 0.62, 0.69, 0.82], // 下横杠
];
const GLYPH_RINGS = [
  { cx: 0.615, cy: 0.395, rO: 0.2, rI: 0.095, uMin: 0.4 }, // 上半环
  { cx: 0.645, cy: 0.635, rO: 0.215, rI: 0.105, uMin: 0.4 }, // 下半环
];
// 字形包围盒（用于在图标内居中）
const GB = { x0: 0.16, x1: 0.86, y0: 0.06, y1: 0.94 };

function glyphHit(u, v) {
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

// ===== 徽章配色（与 SVG 一致）=====
const RIM = [185, 126, 0]; // #B97E00 外圈描边
const FACE_TOP = [255, 210, 94]; // #FFD25E 顶部高光
const FACE_BOT = [232, 155, 0]; // #E89B00 底部
const GLYPH = [92, 61, 0]; // #5C3D00 深棕 ₿

/** 渲染一枚 ₿ 金色徽章 PNG（RGBA，透明底），ss = 每边超采样倍数 */
function renderBadgePng(size, ss = 2) {
  const w = size;
  const h = size;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const cx = w / 2;
  const cy = h / 2;
  const rFace = w / 2 - Math.max(0.5, w * 0.03); // 徽章半径（含描边）
  const rimW = Math.max(1, rFace * 0.065); // 外圈描边宽度
  const rInner = rFace - rimW;

  // 字形映射：以包围盒高度为准缩放（占内径 ~89%），整体居中
  const gh = GB.y1 - GB.y0;
  const scale = (rInner * 2 * 0.89) / gh;
  const ox = cx - ((GB.x0 + GB.x1) / 2) * scale;
  const oy = cy - ((GB.y0 + GB.y1) / 2) * scale;

  let pos = 0;
  for (let y = 0; y < h; y++) {
    raw[pos++] = 0; // PNG 行过滤器：无
    for (let x = 0; x < w; x++) {
      // 超采样：仅统计不透明子样本，颜色取其均值，alpha 取占比（正确的边缘 AA）
      let rAcc = 0, gAcc = 0, bAcc = 0, solid = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          const dx = px - cx;
          const dy = py - cy;
          const d = Math.hypot(dx, dy);
          if (d > rFace) continue; // 透明
          let r, g, b;
          if (d > rInner) {
            r = RIM[0]; g = RIM[1]; b = RIM[2]; // 外圈
          } else {
            // 金面：自上而下渐变
            const t = Math.min(1, Math.max(0, dy / rInner));
            r = Math.round(FACE_TOP[0] + (FACE_BOT[0] - FACE_TOP[0]) * t);
            g = Math.round(FACE_TOP[1] + (FACE_BOT[1] - FACE_TOP[1]) * t);
            b = Math.round(FACE_TOP[2] + (FACE_BOT[2] - FACE_TOP[2]) * t);
            // ₿ 字形覆盖
            if (glyphHit((px - ox) / scale, (py - oy) / scale)) {
              r = GLYPH[0]; g = GLYPH[1]; b = GLYPH[2];
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
  return encodePng(w, h, raw);
}

// ===== PNG 编码 =====
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
};
function encodePng(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ===== 输出 =====
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

// 多尺寸 ICO（小尺寸用更高超采样倍数保证 ₿ 清晰）
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const images = ICO_SIZES.map((s) => {
  const ss = s <= 32 ? 4 : s <= 64 ? 3 : 2;
  return { size: s, png: renderBadgePng(s, ss) };
});
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type=icon
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const entries = images.map(({ size, png }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0); // width
  e.writeUInt8(size >= 256 ? 0 : size, 1); // height
  e.writeUInt8(0, 2); // colors
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bitcount
  e.writeUInt32LE(png.length, 8); // bytes in res
  e.writeUInt32LE(offset, 12); // image offset
  offset += png.length;
  return e;
});
const ico = Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
console.log('wrote assets/icon.ico', ico.length, 'bytes', `(${ICO_SIZES.join('/')}px)`);

// mac：1024x1024 PNG（iconutil 自动转全套 icns，含 Retina 512@2x）
fs.writeFileSync(path.join(outDir, 'icon.png'), renderBadgePng(1024, 2));
console.log('wrote assets/icon.png (1024x1024)');

// linux：512x512 PNG
fs.writeFileSync(path.join(outDir, 'icon-512.png'), renderBadgePng(512, 2));
console.log('wrote assets/icon-512.png (512x512)');
