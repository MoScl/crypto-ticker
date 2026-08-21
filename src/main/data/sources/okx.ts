import { getJson, type GetJsonOptions } from '../../http';
import type { CoinMeta, QuoteAsset, Ticker } from '../../../shared/types';

/**
 * OKX 现货行情源（免 key、无地区限制、限流宽松 20 次/2s）。
 * 一次 GET /api/v5/market/tickers?instType=SPOT 返回全部现货交易对，
 * 在内存中建 Map 后按 watchlist 匹配，覆盖率高，适合做多源容灾的主源。
 * 走智能出口路由器（配置代理 → 系统代理 → 本地端口 → 直连）。
 *
 * instId 形如 "BTC-USDT"；24h 涨跌由 (last - open24h) / open24h 计算。
 */
interface OKXTicker {
  instId: string; // "BTC-USDT"
  last: string; // 最新成交价
  open24h: string; // 24h 开盘价
}

export async function fetchOKXSnapshot(
  watchlist: CoinMeta[],
  quote: QuoteAsset,
  opts: GetJsonOptions = {},
): Promise<Ticker[]> {
  if (watchlist.length === 0) return [];
  const data = (await getJson('https://www.okx.com/api/v5/market/tickers?instType=SPOT', {
    timeoutMs: 15_000,
    retries: 1,
    ...opts,
  })) as { code?: string; msg?: string; data?: OKXTicker[] };

  if (data?.code !== '0' || !Array.isArray(data?.data)) {
    throw new Error(`OKX 响应异常: code=${data?.code ?? 'N/A'} msg=${data?.msg ?? ''}`);
  }

  const q = quote.toUpperCase();
  const qSuffix = `-${q}`;
  const byInst = new Map<string, OKXTicker>();
  for (const t of data.data) {
    if (!t.instId || !t.instId.endsWith(qSuffix)) continue; // 只保留 quote 计价对
    byInst.set(t.instId, t);
  }

  const out: Ticker[] = [];
  for (const c of watchlist) {
    const key = `${c.symbol.toUpperCase()}-${q}`;
    const t = byInst.get(key);
    if (!t || t.last == null || t.open24h == null) continue;
    const price = parseFloat(t.last);
    const open = parseFloat(t.open24h);
    if (Number.isNaN(price) || Number.isNaN(open) || open === 0) continue;
    out.push({
      symbol: `${c.symbol.toUpperCase()}${q}`,
      base: c.symbol.toUpperCase(),
      price,
      changePercent: ((price - open) / open) * 100,
      source: 'okx' as const,
      ts: Date.now(),
    });
  }
  return out;
}
