import { getJson, type GetJsonOptions } from '../../http';
import type { CoinMeta, QuoteAsset, Ticker } from '../../../shared/types';

/**
 * Bybit 现货行情源（免 key，V5 公开接口）。
 * 一次 GET /v5/market/tickers?category=spot 返回全部现货交易对，
 * symbol 形如 "BTCUSDT"；24h 涨跌优先用响应自带 price24hPcnt（比例），
 * 缺失时用 prevPrice24h 计算。走智能出口路由器。
 */
interface BybitTicker {
  symbol: string; // "BTCUSDT"
  lastPrice: string;
  prevPrice24h?: string; // 24h 前价格
  price24hPcnt?: string; // 24h 涨跌比例，如 "0.083" = +8.3%
}

export async function fetchBybitSnapshot(
  watchlist: CoinMeta[],
  quote: QuoteAsset,
  opts: GetJsonOptions = {},
): Promise<Ticker[]> {
  if (watchlist.length === 0) return [];
  const data = (await getJson('https://api.bybit.com/v5/market/tickers?category=spot', {
    timeoutMs: 15_000,
    retries: 1,
    ...opts,
  })) as { retCode?: number; retMsg?: string; result?: { list?: BybitTicker[] } };

  if (data?.retCode !== 0 || !Array.isArray(data?.result?.list)) {
    throw new Error(`Bybit 响应异常: retCode=${data?.retCode ?? 'N/A'} retMsg=${data?.retMsg ?? ''}`);
  }

  const q = quote.toUpperCase();
  const bySym = new Map<string, BybitTicker>();
  for (const t of data.result.list) {
    if (!t.symbol || !t.symbol.endsWith(q)) continue;
    bySym.set(t.symbol, t);
  }

  const out: Ticker[] = [];
  for (const c of watchlist) {
    const key = `${c.symbol.toUpperCase()}${q}`;
    const t = bySym.get(key);
    if (!t || t.lastPrice == null) continue;
    const price = parseFloat(t.lastPrice);
    if (Number.isNaN(price)) continue;
    let change: number | null = null;
    if (t.price24hPcnt != null) {
      const p = parseFloat(t.price24hPcnt);
      if (!Number.isNaN(p)) change = p * 100; // 比例 → 百分比
    } else if (t.prevPrice24h != null) {
      const prev = parseFloat(t.prevPrice24h);
      if (!Number.isNaN(prev) && prev !== 0) change = ((price - prev) / prev) * 100;
    }
    if (change == null) continue;
    out.push({
      symbol: key,
      base: c.symbol.toUpperCase(),
      price,
      changePercent: change,
      source: 'bybit' as const,
      ts: Date.now(),
    });
  }
  return out;
}
