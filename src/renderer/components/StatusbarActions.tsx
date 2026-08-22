import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
import { useI18n } from '../i18n';

/**
 * 极简模式下状态栏右侧的纯图标动作组：
 *   - 点击穿透解锁（锁图标）：切换 clickThrough，穿透开启时金色高亮
 *   - 退出极简模式（展开图标）：恢复完整界面
 *
 * 穿透交互：极简模式下标题栏被隐藏，右上角逃生按钮不可用，由本组件承担——
 * 穿透开启时上报整组按钮的矩形（CLICK_THROUGH_BTN_RECT），主进程全局光标轮询
 * 命中该区域即临时恢复整窗交互；hover 高亮由主进程广播驱动。
 */
export function StatusbarActions() {
  const { t } = useI18n();
  const clickThrough = useAppStore((s) => s.config.clickThrough);
  const setClickThrough = useAppStore((s) => s.setClickThrough);
  const patchConfig = useAppStore((s) => s.patchConfig);
  const [interactive, setInteractive] = useState(false); // 主进程广播：穿透态下是否命中按钮区域
  const groupRef = useRef<HTMLDivElement>(null);

  // 穿透开启时上报按钮组的**屏幕绝对坐标**（window.screenX/screenY + getBoundingClientRect），
  // 主进程直接与 screen.getCursorScreenPoint 比对——判定区域与用户看到的按钮位置严格对齐，
  // 规避无边框窗口 getBounds 与内容区可能存在的偏移（DWM 阴影/DPI）导致的命中 miss。
  // 穿透期间每 300ms 重报，覆盖窗口移动 / 缩放 / 布局变化。
  useEffect(() => {
    if (!clickThrough) return;
    const report = () => {
      const el = groupRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      api.setClickThroughBtnRect({
        x: window.screenX + r.x,
        y: window.screenY + r.y,
        w: r.width,
        h: r.height,
      });
    };
    report();
    window.addEventListener('resize', report);
    const timer = window.setInterval(report, 300);
    return () => {
      window.removeEventListener('resize', report);
      window.clearInterval(timer);
      api.setClickThroughBtnRect(null); // 退出穿透 / 组件卸载：清除按钮区域
    };
  }, [clickThrough]);

  // 订阅主进程广播的光标命中状态，驱动高亮
  useEffect(() => {
    if (!clickThrough) {
      setInteractive(false);
      return;
    }
    const off = api.onClickThroughHoverState(setInteractive);
    return () => {
      off();
      setInteractive(false);
    };
  }, [clickThrough]);

  return (
    <div ref={groupRef} className="statusbar-actions no-drag">
      <button
        className={`sb-btn ct-hot${clickThrough ? (interactive ? ' armed interactive' : ' armed') : ''}`}
        title={clickThrough ? t('minimalCtTitleOn') : t('minimalCtTitleOff')}
        onClick={() => setClickThrough(!clickThrough)}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </svg>
      </button>
      <button
        className="sb-btn ct-hot"
        title={t('minimalExitTitle')}
        onClick={() => patchConfig({ minimalMode: false })}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* 恢复窗口：前后叠加，表达「从极简还原到完整界面」 */}
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M4 16V6a2 2 0 0 1 2-2h10" />
        </svg>
      </button>
    </div>
  );
}
