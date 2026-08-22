import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
import { searchCoins, type CoinInfo } from '../data/coins';
import { CoinRow } from './CoinRow';
import { SettingsPanel } from './SettingsPanel';
import { AddCoinModal } from './AddCoinModal';
import { NetworkIndicator } from './NetworkIndicator';
import { ClickThroughEscape } from './ClickThroughEscape';
import { RefreshTime } from './RefreshTime';
import { useI18n } from '../i18n';
import { SOURCE_LABELS } from '../../shared/constants';

export function MiniWindow() {
  const { t, lang } = useI18n();
  const config = useAppStore((s) => s.config);
  const tickers = useAppStore((s) => s.tickers);
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const networkStatus = useAppStore((s) => s.networkStatus);
  const addCoin = useAppStore((s) => s.addCoin);
  const removeCoin = useAppStore((s) => s.removeCoin);
  const reorderCoin = useAppStore((s) => s.reorderCoin);

  const [query, setQuery] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // 穿透开启后窗口将忽略鼠标事件，设置面板会被“锁死”无法点击关闭：
  // 无论从设置、托盘还是快捷键开启，都在穿透生效时自动收起面板与多选模式
  useEffect(() => {
    if (config.clickThrough) {
      setShowSettings(false);
      setShowAddModal(false);
      setSelectMode(false);
      setSelectedIds(new Set());
    }
  }, [config.clickThrough]);

  const sorted = [...config.watchlist].sort((a, b) => a.order - b.order);
  const suggestions = query.trim() ? searchCoins(query, 8) : [];

  const addByInfo = (c: CoinInfo) => {
    addCoin(c.symbol);
    setQuery('');
    setShowSuggest(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = sorted.length > 0 && selectedIds.size === sorted.length;

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(sorted.map((c) => c.id)));
  };

  const removeSelected = () => {
    selectedIds.forEach((id) => removeCoin(id));
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    resizeRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: window.innerWidth,
      h: window.innerHeight,
    };
    const move = (ev: globalThis.PointerEvent) => {
      const d = resizeRef.current;
      if (!d) return;
      const w = Math.max(200, d.w + (ev.clientX - d.x));
      const h = Math.max(200, d.h + (ev.clientY - d.y));
      api.resizeWindow(w, h);
    };
    const up = () => {
      resizeRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const srcName = sourceStatus ? SOURCE_LABELS[sourceStatus.source]?.[lang] ?? sourceStatus.source : '';
  const srcStateName = !sourceStatus
    ? t('mainSrcStateConnecting')
    : !sourceStatus.ok
      ? t('mainSrcStateBad')
      : sourceStatus.degraded
        ? t('mainSrcStateDegraded')
        : t('mainSrcStateOk');
  const statusTitle = sourceStatus
    ? t('mainSrcTitle', { source: srcName, state: srcStateName }) +
      (sourceStatus.degraded && sourceStatus.ok ? t('mainSrcTitleRest') : '')
    : t('mainSrcConnecting');
  const srcState = !sourceStatus
    ? 'pending'
    : !sourceStatus.ok
      ? 'bad'
      : sourceStatus.degraded
        ? 'degraded'
        : 'ok';
  // 底部状态栏右侧：数据源简要状态
  const srcLabel = !sourceStatus
    ? t('mainSrcConnecting')
    : t('mainSrcState', { label: srcName, state: srcStateName });

  return (
    <div className="app">
      <div className="titlebar">
        <span className="title">
          <svg
            className="title-logo"
            width="16"
            height="16"
            viewBox="0 0 44 44"
            aria-label="Crypto"
          >
            {/* 简化 ₿ 徽章：金色平底圆 + 亮金描边 + 深色 B 字与双竖线 */}
            <circle cx="22" cy="22" r="20" fill="#F6B73C" />
            <circle cx="22" cy="22" r="20" fill="none" stroke="#FFD98A" strokeWidth="1.5" />
            <text
              x="22"
              y="30"
              textAnchor="middle"
              fontSize="26"
              fontWeight="700"
              fill="#1a1a1a"
              fontFamily="Arial, Helvetica, sans-serif"
            >
              B
            </text>
            <rect x="16.8" y="13" width="2.6" height="19" fill="#1a1a1a" />
            <rect x="25" y="13" width="2.6" height="19" fill="#1a1a1a" />
          </svg>
          Crypto
        </span>
        <NetworkIndicator status={networkStatus} />
        <span
          className={`status-dot ${srcState}`}
          title={statusTitle}
        />
        <div className="title-actions no-drag">
          <ClickThroughEscape />
          <button
            className={`icon-btn${config.clickThrough ? ' ct-available' : ''}`}
            title={config.clickThrough ? t('mainSettingsTitle') : t('mainSettingsTitle')}
            onClick={() => setShowSettings(true)}
          >
            ⚙
          </button>
          <button
            className={`icon-btn${config.clickThrough ? ' ct-available' : ''}`}
            title={t('mainMinimizeTitle')}
            onClick={() => api.minimizeWindow()}
          >
            <svg
              className="icon-min"
              width="11"
              height="11"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {/* 标准最小化：水平短横线，与常见窗口控制按钮一致 */}
              <line x1="1.5" y1="6" x2="10.5" y2="6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="add-row no-drag">
        {selectMode ? (
          <div className="select-row">
            <button className="select-btn" title={allSelected ? t('mainCancelAll') : t('mainSelectAll')} onClick={toggleAll}>
              {allSelected ? t('mainCancelAll') : t('mainSelectAll')}
            </button>
            <span className="select-count">
              {t('mainSelectedCount', { n: selectedIds.size, total: sorted.length })}
            </span>
            <button
              className="select-remove"
              title={t('mainRemove')}
              disabled={selectedIds.size === 0}
              onClick={removeSelected}
            >
              {t('mainRemove')}
            </button>
            <button className="select-cancel" title={t('mainCancel')} onClick={exitSelectMode}>
              {t('mainCancel')}
            </button>
          </div>
        ) : (
          <>
            <div className="add-wrap">
              <input
                className="add-input"
                placeholder={t('searchPlaceholder')}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggest(true);
                }}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && suggestions[0]) addByInfo(suggestions[0]);
                }}
              />
              {showSuggest && suggestions.length > 0 && (
                <ul className="suggestions">
                  {suggestions.map((c) => (
                    <li key={c.symbol} onMouseDown={() => addByInfo(c)}>
                      <span className="s-sym">{c.symbol}</span>
                      <span className="s-name">{c.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              className="add-btn list-btn"
              title={t('mainListBtnTitle')}
              onClick={() => setShowAddModal(true)}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="6" y1="20" x2="6" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="18" y1="20" x2="18" y2="14" />
              </svg>
            </button>
            <button
              className="add-btn"
              title={t('mainMultiSelTitle')}
              onClick={() => setSelectMode(true)}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </button>
          </>
        )}
      </div>

      <div className="list">
        {sorted.map((c, i) => (
          <div
            key={c.id}
            draggable={!selectMode}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) reorderCoin(sorted[dragIndex].id, i);
              setDragIndex(null);
            }}
          >
            <CoinRow
              coin={c}
              ticker={tickers[c.id]}
              selectMode={selectMode}
              selected={selectedIds.has(c.id)}
              onToggleSelect={() => toggleSelect(c.id)}
            />
          </div>
        ))}
        {sorted.length === 0 && <div className="empty">{t('mainEmpty')}</div>}
      </div>

      <div className="statusbar no-drag">
        <RefreshTime />
        <span className={`statusbar-src ${srcState}`}>{srcLabel}</span>
      </div>

      <div className="resize-handle no-drag" onPointerDown={onResizeDown} title={t('mainResizeTitle')} />

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showAddModal && <AddCoinModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
