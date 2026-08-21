// 生成 assets/icon.ico（金色圆形，透明底，256x256，ICO 内嵌 PNG）+ assets/icon.png（1024x1024，mac 打包用，electron-builder 自动转 icns）。
// 仅构建安装包前需要；开发运行（npm run dev）不需要。
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function createPng(size = 256) {
  const w = size;
  const h = size;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const cx = w / 2;
  const cy = h / 2;
  const r = w / 2 - Math.round(w * 0.06);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    raw[pos++] = 0;
    for (let x = 0; x < w; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const inside = dx * dx + dy * dy <= r * r;
      if (inside) {
        raw[pos++] = 0xf0; raw[pos++] = 0xb9; raw[pos++] = 0x0b; raw[pos++] = 255;
      } else {
        raw[pos++] = 0; raw[pos++] = 0; raw[pos++] = 0; raw[pos++] = 0;
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
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const png = createPng(256);

// 封装为 ICO（单图，PNG 内嵌）
const dir = Buffer.alloc(6 + 16);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // type=icon
dir.writeUInt16LE(1, 4); // count=1
// ICONDIRENTRY
dir.writeUInt8(0, 6); // width (0 => 256)
dir.writeUInt8(0, 7); // height
dir.writeUInt8(0, 8); // colors
dir.writeUInt8(0, 9); // reserved
dir.writeUInt16LE(1, 10); // planes
dir.writeUInt16LE(32, 12); // bitcount
dir.writeUInt32LE(png.length, 14); // bytes in res
dir.writeUInt32LE(22, 18); // image offset

const ico = Buffer.concat([dir, png]);

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
console.log('wrote assets/icon.ico', ico.length, 'bytes');

// mac 图标：1024x1024 PNG（electron-builder 在 mac 上用 iconutil 自动转 icns）
fs.writeFileSync(path.join(outDir, 'icon.png'), createPng(1024));
console.log('wrote assets/icon.png (1024x1024)');
