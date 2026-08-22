import { useRef } from 'react';
import { api } from '../lib/api';

/**
 * 窗口边缘调整大小：鼠标悬停窗口四边/四角时指针自动切换为调整光标，
 * 按下并拖动即可改变窗口尺寸（替代原右下角缩放把手）。
 *
 * 方向说明：
 * - e/s 方向：窗口左上角固定，直接增/减宽高
 * - w/n 方向：对边（右/下）固定，主进程按 keepRight/keepBottom 补偿窗口位置
 * 实现沿用原把手方案：pointerdown 记录起点与初始宽高，window 级
 * pointermove/pointerup 驱动，松手结束；最小窗口 200×200。
 */
const EDGES: { cls: string; dir: string; cursor: string }[] = [
  { cls: 'edge-n', dir: 'n', cursor: 'ns-resize' },
  { cls: 'edge-s', dir: 's', cursor: 'ns-resize' },
  { cls: 'edge-e', dir: 'e', cursor: 'ew-resize' },
  { cls: 'edge-w', dir: 'w', cursor: 'ew-resize' },
  { cls: 'edge-ne', dir: 'ne', cursor: 'nesw-resize' },
  { cls: 'edge-nw', dir: 'nw', cursor: 'nwse-resize' },
  { cls: 'edge-se', dir: 'se', cursor: 'nwse-resize' },
  { cls: 'edge-sw', dir: 'sw', cursor: 'nesw-resize' },
];

export function EdgeResize() {
  const dragRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
    dir: string;
  } | null>(null);

  const startResize = (dir: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: window.innerWidth,
      h: window.innerHeight,
      dir,
    };
    const move = (ev: globalThis.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      let w = d.w;
      let h = d.h;
      let keepRight = false;
      let keepBottom = false;
      if (d.dir.includes('e')) w = d.w + (ev.clientX - d.x);
      if (d.dir.includes('w')) {
        w = d.w - (ev.clientX - d.x);
        keepRight = true;
      }
      if (d.dir.includes('s')) h = d.h + (ev.clientY - d.y);
      if (d.dir.includes('n')) {
        h = d.h - (ev.clientY - d.y);
        keepBottom = true;
      }
      api.resizeWindow(Math.max(200, w), Math.max(200, h), { keepRight, keepBottom });
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <>
      {EDGES.map((edge) => (
        <div
          key={edge.cls}
          className={`${edge.cls} no-drag`}
          style={{ cursor: edge.cursor }}
          onPointerDown={startResize(edge.dir)}
        />
      ))}
    </>
  );
}
