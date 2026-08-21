import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
import { useI18n } from '../i18n';

/**
 * 穿透态的「逃生出口」：标题栏右上角一枚纯图标按钮，与设置图标并排。
 *
 * 交互模型（穿透真正生效 + 可随时退出）：
 * 开启穿透后窗口**默认保持穿透**——鼠标点击直达下层应用，不再被窗口拦截。
 * 只有光标移到右上角按钮区域（本按钮 / 设置 / 最小化）时，主进程全局光标轮询
 * 才临时恢复整窗交互；移出后立即恢复穿透。设置面板打开时请求「保持交互」，
 * 面板关闭后回到穿透判定。
 *
 * 原理（不依赖窗口鼠标事件的可靠实现）：
 * Windows 下 setIgnoreMouseEvents(true, {forward:true}) 的 mousemove 转发依赖窗口焦点，
 * 窗口失焦后渲染进程收不到任何鼠标事件，旧的「mousemove→IPC 临时恢复交互」方案会锁死按钮。
 * 因此改为主进程定时读取全局光标位置（screen.getCursorScreenPoint，与焦点/激活状态无关），
 * 并用本组件上报的按钮矩形（相对窗口内容区）判定「光标命中按钮区域」。
 * - 状态变化时经 CLICK_THROUGH_HOVER_STATE 广播到本组件，驱动按钮高亮（armed）
 * - 点击本按钮 → 永久关闭穿透（走统一入口 setClickThrough(false)）
 *
 * 边界处理：
 * - 非穿透态：组件不渲染、不订阅，零开销
 * - 穿透关闭（点击按钮 / 托盘 / 快捷键）导致组件卸载：上报 null 清除按钮区域，
 *   主进程统一停止轮询并恢复交互，组件自身无竞态清理逻辑
 * - 窗口缩放时按钮位置变化：监听 window resize 重新上报（相对坐标，窗口移动无需重报）
 */
export function ClickThroughEscape() {
  const { t } = useI18n();
  const clickThrough = useAppStore((s) => s.config.clickThrough);
  const setClickThrough = useAppStore((s) => s.setClickThrough);
  const [interactive, setInteractive] = useState(false); // 主进程广播：当前是否处于可交互状态
  const btnRef = useRef<HTMLButtonElement>(null);

  // 穿透开启时上报按钮矩形（相对窗口内容区，CSS px = DIP，与主进程 getBounds 坐标系一致）；
  // 窗口尺寸变化（resize 把手拖动）后按钮位置改变，需重新上报。
  useEffect(() => {
    if (!clickThrough) return;
    const report = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      api.setClickThroughBtnRect({ x: r.x, y: r.y, w: r.width, h: r.height });
    };
    report();
    window.addEventListener('resize', report);
    return () => {
      window.removeEventListener('resize', report);
      api.setClickThroughBtnRect(null); // 组件卸载 / 退出穿透：清除按钮区域
    };
  }, [clickThrough]);

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

  if (!clickThrough) return null;
  return (
    <button
      ref={btnRef}
      className={`ct-escape icon-btn ${interactive ? 'armed' : ''}`}
      title={t('ctExitTitle')}
      onClick={() => setClickThrough(false)}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </svg>
    </button>
  );
}
