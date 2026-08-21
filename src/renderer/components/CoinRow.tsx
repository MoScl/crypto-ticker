import { useState } from 'react';
import { findCoin } from '../data/coins';
import { PlatformBar } from './PlatformBar';
import { useI18n } from '../i18n';
import type { CoinMeta, Ticker } from '../../shared/types';

function formatPrice(p: number): string {
  if (!isFinite(p) || p <= 0) return '—';
  if (p >= 1) {
    return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // 低价币种保留更多有效数字
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function formatPct(p: number): string {
  if (!isFinite(p)) return '—';
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

interface Props {
  coin: CoinMeta;
  ticker?: Ticker;
  /** 多选模式：显示复选框，点击行切换选中 */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function CoinRow({ coin, ticker, selectMode = false, selected = false, onToggleSelect }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const change = ticker?.changePercent ?? 0;
  const up = change >= 0;
  const changeCls = ticker ? (up ? 'up' : 'down') : 'neutral';
  // 老数据可能没存 coingeckoId，渲染时用内置库反查兜底
  const coingeckoId = coin.coingeckoId ?? findCoin(coin.symbol)?.coingeckoId;

  const rowCls = [
    'coin-row',
    'in-list',
    selectMode ? 'select-mode' : '',
    selected ? 'selected' : '',
    !selectMode && expanded ? 'expanded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rowCls}
      onClick={selectMode ? onToggleSelect : () => setExpanded((v) => !v)}
      title={selectMode ? (selected ? t('rowUnselectHint') : t('rowSelectHint')) : t('rowExpandHint')}
    >
      {selectMode && (
        <span className={`coin-check${selected ? ' checked' : ''}`}>{selected ? '✓' : ''}</span>
      )}
      <div className="coin-id">
        <span className="coin-symbol">{coin.symbol}</span>
        <span className="coin-name">{coin.name}</span>
      </div>
      <div className="coin-data">
        <span className="coin-price">{ticker ? `$${formatPrice(ticker.price)}` : '—'}</span>
        <span className={`coin-change ${changeCls}`}>
          {ticker ? formatPct(ticker.changePercent) : '—'}
        </span>
      </div>
      {!selectMode && (
        <span className="row-go no-drag" title={t('rowGoTitle')}>
          ↗
        </span>
      )}
      {!selectMode && expanded && (
        <PlatformBar symbol={coin.symbol} coingeckoId={coingeckoId} />
      )}
    </div>
  );
}
