import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron';
import zlib from 'node:zlib';

/**
 * 运行时生成一枚 32x32 的 PNG 图标（金色圆形，透明背景），
 * 避免依赖外部 .ico/.png 资源文件，保证开箱即用。
 */
function createTrayPng(size = 32): Buffer {
  const w = size;
  const h = size;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const cx = w / 2;
  const cy = h / 2;
  const r = w / 2 - 2;
  let pos = 0;
  for (let y = 0; y < h; y++) {
    raw[pos++] = 0; // 过滤器：无
    for (let x = 0; x < w; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const inside = dx * dx + dy * dy <= r * r;
      if (inside) {
        raw[pos++] = 0xf0; // R 金
        raw[pos++] = 0xb9; // G
        raw[pos++] = 0x0b; // B
        raw[pos++] = 255; // A
      } else {
        raw[pos++] = 0;
        raw[pos++] = 0;
        raw[pos++] = 0;
        raw[pos++] = 0;
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
