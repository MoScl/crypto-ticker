import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
import { MAINSTREAM_COINS } from '../data/coins';
import { PlatformBar } from './PlatformBar';
import { useI18n } from '../i18n';
import type { CoinEntry, RankingKind } from '../../shared/types';

interface Props {
  onClose: () => void;
}

type Tab = 'mainstream' | 'trending' | RankingKind;

const RANK_TABS: Array<{ id: RankingKind; labelKey: 'tabGainers' | 'tabLosers' | 'tabNew' | 'tabMarketcap' | 'tabVolume' }> = [
  { id: 'gainers', labelKey: 'tabGainers' },
  { id: 'losers', labelKey: 'tabLosers' },
  { id: 'new', labelKey: 'tabNew' },
  { id: 'marketcap', labelKey: 'tabMarketcap' },
  { id: 'volume', labelKey: 'tabVolume' },
];

/** 榜单行（主流榜 / 热门榜 / 分类榜统一结构） */
interface Row {
  key: string;
  symbol: string;
  name: string;
  coingeckoId?: string;
  rank?: number;
  change24h?: number | null;
  marketCap?: number;
  volume24h?: number;
  listedAt?: number;
}

interface RankState {
  data: Row[] | null;
  loading: boolean;
  err: string;
}

/** USD 缩写格式化：$1.2T / $345M / $67K */
function fmtUsd(n?: number): string {
  if (n == null || Number.isNaN(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

/** 上线时间 → 相对天数 */
function fmtAge(t: number | undefined, tAgeToday: string, tAgeDays: string): string {
  if (!t) return '';
  const days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  return days === 0 ? tAgeToday : tAgeDays.replace('{days}', String(days));
}

export function AddCoinModal({ onClose }: Props) {
  const { t } = useI18n();
  const config = useAppStore((s) => s.config);
  const addCoin = useAppStore((s) => s.addCoin);

  const [tab, setTab] = useState<Tab>('mainstream');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [trending, setTrending] = useState<Row[] | null>(null);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [trendingErr, setTrendingErr] = useState('');
  const [ranks, setRanks] = useState<Partial<Record<RankingKind, RankState>>>({});

  // 穿透态下弹窗必须可交互：挂载期间请求主进程保持整窗交互，卸载时恢复穿透判定
  useEffect(() => {
    if (config.clickThrough) api.setClickThroughHold(true);
    return () => api.setClickThroughHold(false);
  }, [config.clickThrough]);

  const watchSymbols = useMemo(
    () => new Set(config.watchlist.map((c) => c.symbol)),
    [config.watchlist],
  );

  const loadTrending = async () => {
    setLoadingTrending(true);
    setTrendingErr('');
    try {
      const list: CoinEntry[] = await api.fetchTrending();
      setTrending(
        list.map((c, i) => ({
          key: `t-${c.symbol}-${i}`,
          symbol: c.symbol,
          name: c.name,
          coingeckoId: c.coingeckoId,
          rank: c.rank ?? i + 1,
          change24h: c.priceChange24h ?? null,
        })),
      );
    } catch (e) {
      setTrendingErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingTrending(false);
    }
  };

  /** 加载分类榜单（已有数据/加载中则跳过，切换 Tab 不重复请求） */
  const loadRank = async (kind: RankingKind) => {
    const cur = ranks[kind];
    if (cur?.data || cur?.loading) return;
    setRanks((p) => ({ ...p, [kind]: { data: null, loading: true, err: '' } }));
    try {
      const list: CoinEntry[] = await api.fetchRanking(kind);
      setRanks((p) => ({
        ...p,
        [kind]: {
          loading: false,
          err: '',
          data: list.map((c, i) => ({
            key: `${kind}-${c.symbol}-${i}`,
            symbol: c.symbol,
            name: c.name,
            coingeckoId: c.coingeckoId,
            rank: c.rank ?? i + 1,
            change24h: c.priceChange24h ?? null,
            marketCap: c.marketCap,
            volume24h: c.volume24h,
            listedAt: c.listedAt,
          })),
        },
      }));
    } catch (e) {
      setRanks((p) => ({
        ...p,
        [kind]: {
          data: null,
          loading: false,
          err: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  };

  // 首次切到对应 Tab 才拉取（避免打开弹窗即请求）
  useEffect(() => {
    if (tab === 'trending' && !trending && !loadingTrending && !trendingErr) void loadTrending();
    if (tab !== 'mainstream' && tab !== 'trending') void loadRank(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const renderRow = (row: Row) => {
    const added = watchSymbols.has(row.symbol);
    const expanded = expandedKey === row.key;
    return (
      <div
        key={row.key}
        className={`coin-row${expanded ? ' expanded' : ''}${added ? ' added' : ''}`}
        onClick={() => setExpandedKey(expanded ? null : row.key)}
        title={t('addExpandHint')}
      >
        <span className="row-rank">{row.rank ?? '·'}</span>
        <span className="row-sym">{row.symbol}</span>
        <span className="row-name">{row.name}</span>
        {tab === 'marketcap' && row.marketCap != null && (
          <span className="row-stat" title={t('addMcapTitle')}>
            {fmtUsd(row.marketCap)}
          </span>
        )}
        {tab === 'volume' && row.volume24h != null && (
          <span className="row-stat" title={t('addVolTitle')}>
            {fmtUsd(row.volume24h)}
          </span>
        )}
        {tab === 'new' && row.listedAt != null && (
          <span className="row-stat dim" title={t('addListedTitle')}>
            {fmtAge(row.listedAt, t('addAgeToday'), t('addAgeDays'))}
          </span>
        )}
        {row.change24h != null && tab !== 'new' && (
          <span className={`row-chg ${row.change24h >= 0 ? 'up' : 'down'}`}>
            {row.change24h >= 0 ? '+' : ''}
            {row.change24h.toFixed(1)}%
          </span>
        )}
        <span className="row-actions">
          {added ? (
            <span className="row-added" title={t('addAddedTitle')}>
              ✓
            </span>
          ) : (
            <button
              className="row-add"
              title={t('addAddTitle', { symbol: row.symbol })}
              onClick={(e) => {
                e.stopPropagation();
                addCoin(row.symbol);
              }}
            >
              ＋
            </button>
          )}
          <span className="row-go" title={t('rowGoTitle')}>
            ↗
          </span>
        </span>
        {expanded && <PlatformBar symbol={row.symbol} coingeckoId={row.coingeckoId} />}
      </div>
    );
  };

  const rankState = tab !== 'mainstream' && tab !== 'trending' ? ranks[tab] : undefined;

  return (
    <div className="addmodal-overlay no-drag" onClick={onClose}>
      <div className="addmodal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="addmodal-header">
          <div className="addmodal-tabs">
            <button
              className={`addmodal-tab${tab === 'mainstream' ? ' active' : ''}`}
              onClick={() => setTab('mainstream')}
            >
              {t('tabMainstream')}
            </button>
            <button
              className={`addmodal-tab${tab === 'trending' ? ' active' : ''}`}
              onClick={() => setTab('trending')}
            >
              {t('tabTrending')}
            </button>
            {RANK_TABS.map((tb) => (
              <button
                key={tb.id}
                className={`addmodal-tab${tab === tb.id ? ' active' : ''}`}
                onClick={() => setTab(tb.id)}
              >
                {t(tb.labelKey)}
              </button>
            ))}
          </div>
          <button className="icon-btn" title={t('commonClose')} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="addmodal-body">
          {tab === 'mainstream' ? (
            <div className="addmodal-list">
              {MAINSTREAM_COINS.map((c, i) =>
                renderRow({
                  key: `m-${c.symbol}`,
                  symbol: c.symbol,
                  name: c.name,
                  coingeckoId: c.coingeckoId,
                  rank: i + 1,
                }),
              )}
            </div>
          ) : tab === 'trending' ? (
            loadingTrending ? (
              <div className="addmodal-state">
                <span className="boot-dot" />
                {t('addLoadingTrending')}
              </div>
            ) : trendingErr ? (
              <div className="addmodal-state">
                <div className="state-err">{trendingErr}</div>
                <button className="btn-ghost" onClick={() => void loadTrending()}>
                  {t('commonRetry')}
                </button>
              </div>
            ) : trending && trending.length > 0 ? (
              <div className="addmodal-list">{trending.map(renderRow)}</div>
            ) : (
              <div className="addmodal-state">
                <div className="state-err">{t('addNoTrending')}</div>
                <button className="btn-ghost" onClick={() => void loadTrending()}>
                  {t('commonRefresh')}
                </button>
              </div>
            )
          ) : rankState?.loading ? (
            <div className="addmodal-state">
              <span className="boot-dot" />
              {t('addLoadingRank')}
            </div>
          ) : rankState?.err ? (
            <div className="addmodal-state">
              <div className="state-err">{rankState.err}</div>
              <button className="btn-ghost" onClick={() => void loadRank(tab)}>
                {t('commonRetry')}
              </button>
            </div>
          ) : rankState?.data && rankState.data.length > 0 ? (
            <div className="addmodal-list">{rankState.data.map(renderRow)}</div>
          ) : (
            <div className="addmodal-state">
              <div className="state-err">{t('addNoRank')}</div>
              <button className="btn-ghost" onClick={() => void loadRank(tab)}>
                {t('commonRefresh')}
              </button>
            </div>
          )}
        </div>

        <div className="addmodal-footer">
          <span className="hint">{t('addFooterHint')}</span>
          <span className="hint">{t('commonMonitoring', { count: config.watchlist.length })}</span>
        </div>
      </div>
    </div>
  );
}
