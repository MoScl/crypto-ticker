import { getJson } from '../http';
import { netLog } from '../net/logger';
import type { CoinEntry, RankingKind } from '../../shared/types';

/**
 * 分类榜单（涨幅 / 跌幅 / 新币 / 市值 / 成交额），供添加币种弹窗使用。
 * 数据源策略（全部免 key、走智能出口路由器）：
 *  - 涨幅 / 跌幅 / 成交额榜：OKX 全量现货 ticker（一次拉取复用，字段齐全且与行情主源一致）
 *  - 新币榜：Gate.io 全量现货交易对，按 buy_start（上线时间）降序取最新
 *  - 市值榜：CoinGecko coins/markets（无 key 时可能 429）→ 降级 CoinCap assets
 */
const RANK_LIMIT = 15;

interface OKXTicker {
  instId: string; // "BTC-USDT"
  last: string;
  open24h: string;
  volCcy24h?: string; // 按计价币（USDT）计的 24h 成交额
}

/** 拉取 OKX 全量现货 ticker（仅保留 USDT 计价对），返回结构化的行数据 */
async function fetchOKXRows(): Promise<
  Array<{ symbol: string; change: number; volume: number }>
> {
  const data = (await getJson('https://www.okx.com/api/v5/market/tickers?instType=SPOT', {
    timeoutMs: 15_000,
    retries: 1,
  })) as { code?: string; msg?: string; data?: OKXTicker[] };

  if (data?.code !== '0' || !Array.isArray(data?.data)) {
    throw new Error(`OKX 榜单数据异常: code=${data?.code ?? 'N/A'} msg=${data?.msg ?? ''}`);
  }

  const rows: Array<{ symbol: string; change: number; volume: number }> = [];
  for (const t of data.data) {
    if (!t.instId || !t.instId.endsWith('-USDT')) continue;
    const symbol = t.instId.slice(0, -5); // "BTC-USDT" -> "BTC"
    if (!symbol || symbol.length > 12) continue; // 过滤异常长名
    const price = parseFloat(t.last);
    const open = parseFloat(t.open24h);
    const volume = parseFloat(t.volCcy24h ?? '');
    const change =
      !Number.isNaN(price) && !Number.isNaN(open) && open !== 0
        ? ((price - open) / open) * 100
        : NaN;
    if (Number.isNaN(price) || Number.isNaN(change)) continue;
    rows.push({ symbol, change, volume: Number.isNaN(volume) ? 0 : volume });
  }
  return rows;
}

/** 涨幅 / 跌幅榜：OKX 按 24h 涨跌幅排序（gainers 降序、losers 升序） */
async function fetchOKXByChange(dir: -1 | 1): Promise<CoinEntry[]> {
  const rows = await fetchOKXRows();
  // dir=1 → (b.change - a.change) 降序（涨幅榜）；dir=-1 → (a.change - b.change) 升序（跌幅榜）
  rows.sort((a, b) => (dir === 1 ? b.change - a.change : a.change - b.change));
  return rows.slice(0, RANK_LIMIT).map((r, i) => ({
    symbol: r.symbol,
    name: r.symbol,
    rank: i + 1,
    priceChange24h: r.change,
  }));
}

/** 成交额榜：OKX 按 24h 成交额（USDT）降序 */
async function fetchOKXByVolume(): Promise<CoinEntry[]> {
  const rows = await fetchOKXRows();
  rows.sort((a, b) => b.volume - a.volume);
  return rows.slice(0, RANK_LIMIT).map((r, i) => ({
    symbol: r.symbol,
    name: r.symbol,
    rank: i + 1,
    volume24h: r.volume,
    priceChange24h: r.change,
  }));
}

interface GatePair {
  id: string; // "BTC_USDT"
  base: string; // "BTC"
  base_name?: string; // "Bitcoin"
  quote?: string;
  trade_status?: string; // "tradable"
  buy_start?: number; // Unix 秒
  st_tag?: boolean; // true=特殊标签（杠杆/指数等，新币榜需排除）
}

/** 新币榜：Gate.io 全量现货交易对按上线时间（buy_start）降序取最新 */
async function fetchNewListingsFromGate(): Promise<CoinEntry[]> {
  const data = (await getJson('https://api.gateio.ws/api/v4/spot/currency_pairs', {
    timeoutMs: 15_000,
    retries: 1,
  })) as GatePair[] | { message?: string };

  if (!Array.isArray(data)) {
    throw new Error(`Gate 新币榜数据异常: ${(data as { message?: string })?.message ?? 'N/A'}`);
  }

  const rows = data
    .filter(
      (p) =>
        p.id &&
        p.base &&
        (!p.quote || p.quote === 'USDT') && // 只保留 USDT 计价对
        (!p.trade_status || p.trade_status === 'tradable') && // 排除停牌对
        !p.st_tag && // 排除杠杆/特殊标签代币（如 X3L / X3S）
        !/[0-9][LS]$/.test(p.base) && // 双保险：排除 "XXX3L/XXX3S" 型杠杆代币
        p.buy_start != null &&
        p.buy_start > 0,
    )
    .sort((a, b) => (b.buy_start ?? 0) - (a.buy_start ?? 0))
    .slice(0, RANK_LIMIT)
    .map((p, i) => ({
      symbol: p.base,
      name: p.base_name || p.base,
      rank: i + 1,
      listedAt: (p.buy_start as number) * 1000, // 秒 -> ms
    }));

  netLog('ranking-new', { count: rows.length, source: 'gate' });
  return rows;
}

interface CoinGeckoMarketRow {
  id?: string;
  symbol?: string;
  name?: string;
  market_cap?: number | null;
  total_volume?: number | null;
  price_change_percentage_24h?: number | null;
}

interface CoinCapAsset {
  id?: string;
  symbol?: string;
  name?: string;
  marketCapUsd?: string;
  volumeUsd24Hr?: string;
  changePercent24Hr?: string;
}

/** 市值榜：CoinGecko coins/markets 为主源，限流/失败降级 CoinCap assets */
async function fetchMarketCap(): Promise<CoinEntry[]> {
  try {
    return await fetchMarketCapFromCoinGecko();
  } catch (e) {
    netLog('ranking-mcap-cg-fail', { error: String(e), fallback: 'coincap' });
    return fetchMarketCapFromCoinCap();
  }
}

async function fetchMarketCapFromCoinGecko(): Promise<CoinEntry[]> {
  const data = (await getJson(
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=15&price_change_percentage=24h',
    { timeoutMs: 10_000, retries: 1 },
  )) as CoinGeckoMarketRow[] | { status?: { error_message?: string } };

  if (!Array.isArray(data)) {
    throw new Error(
      `CoinGecko 市值榜异常: ${(data as { status?: { error_message?: string } })?.status?.error_message ?? 'N/A'}`,
    );
  }

  const rows = data
    .filter((c) => c.symbol && c.market_cap != null)
    .map((c, i) => ({
      symbol: c.symbol!.toUpperCase(),
      name: c.name ?? c.symbol!.toUpperCase(),
      coingeckoId: c.id,
      rank: i + 1,
      marketCap: c.market_cap ?? 0,
      volume24h: c.total_volume ?? undefined,
      priceChange24h: c.price_change_percentage_24h ?? null,
    }));

  netLog('ranking-mcap', { count: rows.length, source: 'coingecko' });
  return rows;
}

async function fetchMarketCapFromCoinCap(): Promise<CoinEntry[]> {
  const data = (await getJson(
    'https://api.coincap.io/v2/assets?limit=15&sort=marketCapUsd&sortDir=desc',
    { timeoutMs: 10_000, retries: 1 },
  )) as { data?: CoinCapAsset[] } | { error?: string };

  const assets = (data as { data?: CoinCapAsset[] })?.data;
  if (!Array.isArray(assets)) {
    throw new Error(
      `CoinCap 市值榜异常: ${(data as { error?: string })?.error ?? 'N/A'}`,
    );
  }

  const rows = assets
    .filter((c) => c.symbol)
    .map((c, i) => ({
      symbol: c.symbol!.toUpperCase(),
      name: c.name ?? c.symbol!.toUpperCase(),
      coingeckoId: c.id,
      rank: i + 1,
      marketCap: parseFloat(c.marketCapUsd ?? '0'),
      volume24h: parseFloat(c.volumeUsd24Hr ?? '0'),
      priceChange24h: parseFloat(c.changePercent24Hr ?? '') || null,
    }));

  netLog('ranking-mcap', { count: rows.length, source: 'coincap' });
  return rows;
}

/** 榜单入口：按 kind 路由到对应数据源 */
export async function fetchRanking(kind: RankingKind): Promise<CoinEntry[]> {
  switch (kind) {
    case 'gainers':
      return fetchOKXByChange(1); // 降序：涨幅最大在前
    case 'losers':
      return fetchOKXByChange(-1); // 升序：跌幅最大在前
    case 'volume':
      return fetchOKXByVolume();
    case 'new':
      return fetchNewListingsFromGate();
    case 'marketcap':
      return fetchMarketCap();
    default:
      throw new Error(`未知榜单类型: ${kind}`);
  }
}
