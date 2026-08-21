import { getJson } from '../http';
import { netLog } from '../net/logger';
import type { CoinEntry } from '../../shared/types';

/**
 * 热门榜：优先 CoinGecko /search/trending（近 7 天搜索热度，语义最准确）。
 * CoinGecko 不可达/限流时降级为「24h 涨幅榜」：拉取 OKX 全量现货 ticker，
 * 按 24h 涨跌幅降序取前 15，保证弹窗热门榜始终有数据。
 * 走智能出口路由器（配置代理 → 系统代理 → 本地端口 → DoH 直连）。
 */
export async function fetchTrendingCoins(): Promise<CoinEntry[]> {
  try {
    return await fetchTrendingFromCoinGecko();
  } catch (e) {
    netLog('trending-cg-fail', { error: String(e), fallback: 'top-gainers' });
    return fetchTopGainersFallback();
  }
}

/** CoinGecko 搜索热度榜（最多 15 条） */
async function fetchTrendingFromCoinGecko(): Promise<CoinEntry[]> {
  const data = (await getJson('https://api.coingecko.com/api/v3/search/trending', {
    timeoutMs: 15_000,
    retries: 1,
  })) as {
    coins?: Array<{
      item?: {
        id?: string;
        name?: string;
        symbol?: string;
        market_cap_rank?: number | null;
        data?: { price_change_percentage_24h?: { usd?: number } };
      };
    }>;
  };

  const list: CoinEntry[] = [];
  for (const c of data?.coins ?? []) {
    const it = c?.item;
    const raw = it?.symbol;
    if (!raw || typeof raw !== 'string') continue;
    const symbol = raw.toUpperCase();
    list.push({
      symbol,
      name: it?.name ?? symbol,
      coingeckoId: it?.id,
      rank: list.length + 1, // 按热度排序的榜单序号
      priceChange24h: it?.data?.price_change_percentage_24h?.usd ?? null,
    });
  }
  netLog('trending-ok', { count: list.length, mode: 'coingecko' });
  return list;
}

/** 降级：OKX 全量现货按 24h 涨幅降序取前 15 */
async function fetchTopGainersFallback(): Promise<CoinEntry[]> {
  const data = (await getJson('https://www.okx.com/api/v5/market/tickers?instType=SPOT', {
    timeoutMs: 15_000,
    retries: 1,
  })) as {
    code?: string;
    data?: Array<{ instId: string; last: string; open24h: string }>;
  };
  if (data?.code !== '0' || !Array.isArray(data?.data)) {
    throw new Error(`OKX 涨幅榜降级失败: code=${data?.code ?? 'N/A'}`);
  }

  const rows = data.data
    .filter((t) => t.instId?.endsWith('-USDT') && t.last != null && t.open24h != null)
    .map((t) => {
      const symbol = t.instId.slice(0, -5); // "BTC-USDT" -> "BTC"
      const price = parseFloat(t.last);
      const open = parseFloat(t.open24h);
      const change =
        !Number.isNaN(price) && !Number.isNaN(open) && open !== 0
          ? ((price - open) / open) * 100
          : null;
      return { symbol, change };
    })
    .filter(
      (r): r is { symbol: string; change: number } =>
        r.change != null && r.symbol.length > 0 && r.symbol.length <= 12, // 过滤异常长名
    )
    .sort((a, b) => b.change - a.change)
    .slice(0, 15)
    .map((r, i) => ({
      symbol: r.symbol,
      name: r.symbol,
      rank: i + 1,
      priceChange24h: r.change,
    }));

  netLog('trending-ok', { count: rows.length, mode: 'top-gainers-fallback' });
  return rows;
}
