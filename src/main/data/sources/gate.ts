import { getJson, type GetJsonOptions } from '../../http';
import type { CoinMeta, QuoteAsset, Ticker } from '../../../shared/types';

/**
 * Gate.io 现货行情源（免 key、限流宽松）。
 * 一次 GET /api/v4/spot/tickers 返回全部现货交易对，
 * currency_pair 形如 "BTC_USDT"；24h 涨跌直接用响应自带的 change_percentage（百分比）。
 * 走智能出口路由器。
 */
interface GateTicker {
  currency_pair: string; // "BTC_USDT"
  last: string;
  change_percentage: string; // 24h 涨跌幅（%），如 "8.3"
}

export async function fetchGateSnapshot(
  watchlist: CoinMeta[],
  quote: QuoteAsset,
  opts: GetJsonOptions = {},
): Promise<Ticker[]> {
  if (watchlist.length === 0) return [];
  const data = (await getJson('https://api.gateio.ws/api/v4/spot/tickers', {
    timeoutMs: 15_000,
    retries: 1,
    ...opts,
  })) as GateTicker[] | { message?: string };

  if (!Array.isArray(data)) {
    throw new Error(`Gate 响应异常: ${(data as { message?: string })?.message ?? 'N/A'}`);
  }

  const q = quote.toUpperCase();
  const qSuffix = `_${q}`;
  const byPair = new Map<string, GateTicker>();
  for (const t of data) {
    if (!t.currency_pair || !t.currency_pair.endsWith(qSuffix)) continue;
    byPair.set(t.currency_pair, t);
  }

  const out: Ticker[] = [];
  for (const c of watchlist) {
    const key = `${c.symbol.toUpperCase()}_${q}`;
    const t = byPair.get(key);
    if (!t || t.last == null || t.change_percentage == null) continue;
    const price = parseFloat(t.last);
    const change = parseFloat(t.change_percentage);
    if (Number.isNaN(price) || Number.isNaN(change)) continue;
    out.push({
      symbol: `${c.symbol.toUpperCase()}${q}`,
      base: c.symbol.toUpperCase(),
      price,
      changePercent: change,
      source: 'gate' as const,
      ts: Date.now(),
    });
  }
  return out;
}
