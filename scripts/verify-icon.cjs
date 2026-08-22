// 验证生成的 ₿ 徽章 PNG：统计三色像素（亮金描边/金面/近黑字形）并输出 32px ASCII 预览
const zlib = require('node:zlib');
const fs = require('node:fs');

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let off = 8, w, h, bitDepth, colorType, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      w = buf.readUInt32BE(off + 8);
      h = buf.readUInt32BE(off + 12);
      bitDepth = buf[off + 16];
      colorType = buf[off + 17];
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(off + 8, off + 8 + len));
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`unsupported ${bitDepth}/${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, data: out };
}

function stats(png) {
  const { w, h, data } = png;
  let rim = 0, face = 0, glyph = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    if (r === 255 && g === 217 && b === 138) rim++;
    else if (r === 246 && g === 183 && b === 60) face++;
    else if (r === 26 && g === 26 && b === 26) glyph++;
  }
  return { w, h, rim, face, glyph };
}

function asciiPreview(png, target = 32) {
  const { w, h, data } = png;
  const scale = w / target;
  let s = '';
  for (let y = 0; y < target; y++) {
    let row = '';
    for (let x = 0; x < target; x++) {
      const i = ((Math.floor(y * scale) * w) + Math.floor(x * scale)) * 4;
      const a = data[i + 3];
      if (a < 128) row += ' ';
      else {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r === 26 && g === 26 && b === 26) row += '#';
        else if (r === 255 && g === 217 && b === 138) row += '.';
        else row += '+';
      }
    }
    s += row + '\n';
  }
  return s;
}

const png = decodePng(fs.readFileSync(process.argv[2] || 'assets/icon.png'));
console.log(stats(png));
console.log(asciiPreview(png, 32));
