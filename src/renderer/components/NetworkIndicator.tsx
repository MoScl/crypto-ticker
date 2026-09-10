import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NetworkStatus } from '../../shared/types';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../i18n';
import { formatUpdatedAgo } from './RefreshTime';
import { SOURCE_LABELS } from '../../shared/constants';

/** 网络类型图标（Wi-Fi 弧线 / 以太网 / 未知-地球） */
function NetGlyph({ type }: { type: NetworkStatus['type'] | 'none' }) {
  if (type === 'wifi') {
    return (
      <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <path d="M2.6 6.1a8.6 8.6 0 0 1 10.8 0" />
        <path d="M4.7 9a5.4 5.4 0 0 1 6.6 0" />
        <path d="M6.7 11.5a2.4 2.4 0 0 1 2.6 0" />
        <circle cx="8" cy="13.7" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (type === 'ethernet') {
    return (
      <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <rect x="2.6" y="2.8" width="10.8" height="7" rx="1.2" />
        <path d="M5.2 2.8v2.4M8 2.8v2.4M10.8 2.8v2.4" />
        <path d="M4.6 9.8v3.4h6.8V9.8" />
        <path d="M6.6 13.2v-1.6h2.8v1.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="8" cy="8" r="5.4" />
      <path d="M2.6 8h10.8" />
      <path d="M8 2.6c1.6 1.5 2.4 3.3 2.4 5.4s-.8 3.9-2.4 5.4C6.4 11.9 5.6 10.1 5.6 8S6.4 4.1 8 2.6z" />
    </svg>
  );
}

interface Props {
  status: NetworkStatus | null;
}

/** 网络关键信息：连接状态 / 类型 / 接口 / IPv4 / 出口 / DNS / 数据源 / 刷新时间 */
export function NetworkIndicator({ status }: Props) {
  const { t, lang } = useI18n();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const lastUpdateTs = useAppStore((s) => s.lastUpdateTs);
  // 与状态栏一致：以 tickers 判定「有数据」，有数据就不显示「等待数据…」
  const hasTickers = useAppStore((s) => Object.keys(s.tickers).length > 0);
  const clickThrough = useAppStore((s) => s.config.clickThrough);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // 详情面板打开期间每秒刷新「更新于 X 前」与检测时间
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  // 弹层边界校正：显示前根据视口尺寸与弹窗实际尺寸，钳制/翻转位置，确保完全可见。
  // 默认向下展开（top:22px，对齐图标左缘），右缘溢出时左移，底缘溢出时向上翻转，
  // 极端小窗时再按上下/左右边距钳制；窗口缩放 / 滚动时重新计算。
  useLayoutEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current;
    const pop = popRef.current;
    if (!wrap || !pop) return;

    const apply = () => {
      const wr = wrap.getBoundingClientRect();
      const popW = pop.offsetWidth;
      const popH = pop.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const M = 8; // 与窗口边缘保持的最小边距

      // 水平：默认对齐图标左缘（left:0），超出视口时钳制
      const leftMin = M - wr.left;
      const leftMax = vw - M - wr.left - popW;
      let left = 0;
      if (leftMax < leftMin) {
        // 弹窗比视口还宽：居中于图标
        left = (leftMin + leftMax) / 2;
      } else {
        left = Math.min(Math.max(left, leftMin), leftMax);
      }

      // 垂直：默认向下 22px；底缘溢出则向上翻转（弹窗底部贴图标上方 6px），再按边距钳制
      let top = 22;
      if (wr.top + top + popH > vh - M) {
        top = -popH - 6;
      }
      if (wr.top + top < M) top = M - wr.top;
      if (wr.top + top + popH > vh - M) top = vh - M - wr.top - popH;

      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
    };

    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('scroll', apply, true);
    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('scroll', apply, true);
    };
  }, [open]);

  // 点击面板外部关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // 穿透开启时图标区域会透传点击，无法交互 => 自动收起面板
  useEffect(() => {
    if (clickThrough) setOpen(false);
  }, [clickThrough]);

  if (!status) {
    return (
      <span className="net-indicator checking" title={t('netChecking')}>
        <NetGlyph type="none" />
      </span>
    );
  }

  const { online, reachable, degraded, type, interfaceName, ipv4, egress, dnsBlocked, lastError, ts } = status;
  const iface = [interfaceName, ipv4].filter(Boolean).join(' · ');
  const typeText = type === 'wifi' ? t('netTypeWifi') : type === 'ethernet' ? t('netTypeEthernet') : t('netTypeUnknown');
  // 出口摘要：代理 127.0.0.1:7897 (30ms) / 直连 (DoH) / 探测中
  const egressText = egress
    ? egress.mode === 'proxy'
      ? t('netEgressProxy', { url: egress.proxyUrl, ms: egress.latencyMs })
      : egress.latencyMs >= 0
        ? t('netEgressDirect')
        : t('netEgressNone')
    : t('netEgressProbing');
  const dnsText = dnsBlocked ? t('netDnsBlocked') : t('netDnsOk');
  // 数据源摘要
  const srcName = sourceStatus ? SOURCE_LABELS[sourceStatus.source]?.[lang] ?? sourceStatus.source : '';
  // 数据源未上报时显示「连接中…」而不是「等待数据…」：
  // 「等待数据…」只保留给真正从未收到过行情数据的场景（首次启动），
  // 否则行情已经在刷新、这里却写着等待数据，语义矛盾。
  const srcStateName = !sourceStatus
    ? t('mainSrcStateConnecting')
    : !sourceStatus.ok
      ? t('commonAbnormal')
      : sourceStatus.degraded
        ? t('commonDegraded')
        : t('commonNormal');
  const srcText = !sourceStatus
    ? t('mainSrcStateConnecting')
    : t('netSrcText', { label: srcName, state: srcStateName });
  const elapsedSec =
    lastUpdateTs > 0 ? Math.max(0, Math.floor((now - lastUpdateTs) / 1000)) : -1;
  const refreshText =
    elapsedSec >= 0
      ? formatUpdatedAgo(elapsedSec, t)
      : hasTickers
        ? t('refreshJustNow')
        : t('commonWaiting');

  let state: 'online' | 'degraded' | 'offline';
  let title: string;
  if (!online) {
    state = 'offline';
    title = t('netTitleOffline');
  } else if (reachable && !degraded) {
    state = 'online';
    title = t('netTitleOnline', { type: typeText, iface: iface || '—', egress: egressText });
  } else if (reachable && degraded) {
    state = 'degraded';
    title = t('netTitleDegraded', { egress: egressText });
  } else {
    state = 'degraded';
    title = t('netTitleTimeout', { type: typeText, iface: iface || '—', egress: egressText });
  }

  const stateText =
    !online ? t('netStateOffline')
    : reachable && !degraded ? t('netStateOnline')
    : reachable ? t('netStateOnlineLimited')
    : t('netStateOnlineTimeout');

  return (
    <div className="net-wrap" ref={wrapRef}>
      <span
        className={`net-indicator ${state}${clickThrough ? ' net-ct-passthrough' : ''}`}
        title={
          clickThrough
            ? t('netCtPrefix', { title })
            : `${title}\n${t('netClickHint')}`
        }
        onClick={() => setOpen((o) => !o)}
      >
        <NetGlyph type={online ? type : 'none'} />
      </span>

      {open && (
        <div className="net-pop" ref={popRef} onClick={(e) => e.stopPropagation()}>
          <div className="net-pop-title">
            {t('netPanelTitle')}
            <span className={`net-state ${state}`}>{stateText}</span>
          </div>
          <div className="net-grid">
            <div className="net-item">
              <span className="net-key">{t('netKeyType')}</span>
              <span className="net-val">{typeText}</span>
            </div>
            <div className="net-item">
              <span className="net-key">{t('netKeyIface')}</span>
              <span className="net-val">{interfaceName ?? t('commonDash')}</span>
            </div>
            <div className="net-item">
              <span className="net-key">{t('netKeyIpv4')}</span>
              <span className="net-val">{ipv4 ?? t('commonDash')}</span>
            </div>
            <div className="net-item">
              <span className="net-key">{t('netKeyEgress')}</span>
              <span className="net-val">{egressText}</span>
            </div>
            {egress?.reason && (
              <div className="net-item">
                <span className="net-key">{t('netKeyEgressReason')}</span>
                <span className="net-val">{egress.reason}</span>
              </div>
            )}
            <div className="net-item">
              <span className="net-key">{t('netKeyDns')}</span>
              <span className={`net-val${dnsBlocked ? ' net-warn' : ''}`}>{dnsText}</span>
            </div>
            <div className="net-item">
              <span className="net-key">{t('netKeySource')}</span>
              <span className="net-val">{srcText}</span>
            </div>
            <div className="net-item">
              <span className="net-key">{t('netKeyRefresh')}</span>
              <span className="net-val">{refreshText}</span>
            </div>
            <div className="net-item">
              <span className="net-key">{t('netKeyTime')}</span>
              <span className="net-val">
                {new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })}
              </span>
            </div>
            {lastError && (
              <div className="net-item">
                <span className="net-key">{t('netKeyError')}</span>
                <span className="net-val net-warn">{lastError}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
