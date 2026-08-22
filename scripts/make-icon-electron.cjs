// 用真实 Electron/Chromium 渲染引擎生成应用图标（与标题栏 SVG 完全一致的 B 字 + 碗内双竖线）：
//   assets/icon.ico     —— 多尺寸（16/24/32/48/64/128/256），Windows exe/安装包
//   assets/icon.png     —— 1024x1024，mac 打包用
//   assets/icon-512.png —— 512x512，Linux 打包用
// 与 make-icon.mjs（纯几何近似）相比，本脚本使用真实字体渲染，B 字形与标题栏完全一致。
const { app, BrowserWindow } = require('electron');
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');

const BADGE_SVG = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 44 44">
  <circle cx="22" cy="22" r="20" fill="#F6B73C"/>
  <circle cx="22" cy="22" r="20" fill="none" stroke="#FFD98A" stroke-width="1.5"/>
  <text x="22" y="30" text-anchor="middle" font-size="26" font-weight="700" fill="#1a1a1a" font-family="Arial, Helvetica, sans-serif">B</text>
  <rect x="16.8" y="13" width="2.6" height="19" fill="#1a1a1a"/>
  <rect x="25" y="13" width="2.6" height="19" fill="#1a1a1a"/>
</svg>`;

// macOS 菜单栏托盘图标：彩色圆角矩形（金色底 + 深棕外描边 + 亮金内描边 + 深色 ₿）。
// 与界面徽章同源配色；深棕描边保证浅色菜单栏下轮廓清晰，金色底在深色菜单栏下醒目——
// 深浅两种菜单栏外观均可见。不使用 Template（彩色图标需保留颜色）。
const MAC_TRAY_SVG = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 44 44">
  <rect x="2.5" y="2.5" width="39" height="39" rx="10" fill="#F6B73C" stroke="#8A5A00" stroke-width="3"/>
  <rect x="7" y="7" width="30" height="30" rx="7" fill="none" stroke="#FFD98A" stroke-width="1.5"/>
  <text x="22" y="30" text-anchor="middle" font-size="26" font-weight="700" fill="#1a1a1a" font-family="Arial, Helvetica, sans-serif">B</text>
  <rect x="16.8" y="13" width="2.6" height="19" fill="#1a1a1a"/>
  <rect x="25" y="13" width="2.6" height="19" fill="#1a1a1a"/>
</svg>`;

const PAGE = (size, svg) => `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}
#stage{width:${size}px;height:${size}px}</style></head>
<body><div id="stage">${svg}</div></body></html>`;

function encodePng(w, h, raw) {
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function nativeImageToPng(img, size) {
  // 校准到目标尺寸（处理 scaleFactor 非 1 的情况）
  const img2 = img.getSize().width === size ? img : img.resize({ width: size, height: size });
  return img2.toPNG();
}

app.whenReady().then(async () => {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1024,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  try {
    // 渲染指定 SVG 到目标尺寸，返回 PNG Buffer
    const renderSvg = async (size, svgFn) => {
      await win.setContentSize(size, size);
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE(size, svgFn(size))));
      await new Promise((r) => setTimeout(r, size >= 512 ? 200 : 120));
      const img = await win.webContents.capturePage();
      return nativeImageToPng(img, size);
    };

    const pngs = {};
    for (const size of sizes) {
      pngs[size] = await renderSvg(size, BADGE_SVG);
    }
    const p1024 = await renderSvg(1024, BADGE_SVG);
    const p512 = await renderSvg(512, BADGE_SVG);
    // 托盘专用：Windows 金色徽章 32px + @2x 64px；macOS 彩色圆角矩形 16pt/22pt（@1x/@2x/@3x）
    const trayWin = await renderSvg(32, BADGE_SVG);
    const trayWin2x = await renderSvg(64, BADGE_SVG);
    const mac16 = await renderSvg(16, MAC_TRAY_SVG);
    const mac16x2 = await renderSvg(32, MAC_TRAY_SVG);
    const mac16x3 = await renderSvg(48, MAC_TRAY_SVG);
    const mac22 = await renderSvg(22, MAC_TRAY_SVG);
    const mac22x2 = await renderSvg(44, MAC_TRAY_SVG);
    const mac22x3 = await renderSvg(66, MAC_TRAY_SVG);

    // 组装 ICO
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(sizes.length, 4);
    let offset = 6 + 16 * sizes.length;
    const entries = sizes.map((size) => {
      const png = pngs[size];
      const e = Buffer.alloc(16);
      e.writeUInt8(size >= 256 ? 0 : size, 0);
      e.writeUInt8(size >= 256 ? 0 : size, 1);
      e.writeUInt8(0, 2);
      e.writeUInt8(0, 3);
      e.writeUInt16LE(1, 4);
      e.writeUInt16LE(32, 6);
      e.writeUInt32LE(png.length, 8);
      e.writeUInt32LE(offset, 12);
      offset += png.length;
      return e;
    });
    const ico = Buffer.concat([header, ...entries, ...sizes.map((s) => pngs[s])]);

    const outDir = path.join(__dirname, '..', 'assets');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
    fs.writeFileSync(path.join(outDir, 'icon.png'), p1024);
    fs.writeFileSync(path.join(outDir, 'icon-512.png'), p512);
    fs.writeFileSync(path.join(outDir, 'tray-icon.png'), trayWin);
    fs.writeFileSync(path.join(outDir, 'tray-icon@2x.png'), trayWin2x);
    // macOS：16pt 与 22pt 两组（各 @1x/@2x/@3x），Electron nativeImage 自动合并 representations
    fs.writeFileSync(path.join(outDir, 'tray-mac16.png'), mac16);
    fs.writeFileSync(path.join(outDir, 'tray-mac16@2x.png'), mac16x2);
    fs.writeFileSync(path.join(outDir, 'tray-mac16@3x.png'), mac16x3);
    fs.writeFileSync(path.join(outDir, 'tray-mac22.png'), mac22);
    fs.writeFileSync(path.join(outDir, 'tray-mac22@2x.png'), mac22x2);
    fs.writeFileSync(path.join(outDir, 'tray-mac22@3x.png'), mac22x3);
    console.log(
      'OK: icon.ico', ico.length,
      'icon.png', p1024.length,
      'icon-512.png', p512.length,
      'tray-icon.png', trayWin.length,
      'tray-icon@2x.png', trayWin2x.length,
      'mac16', mac16.length, 'mac22', mac22.length,
    );
  } catch (e) {
    console.error('ICON_RENDER_FAILED', e);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
