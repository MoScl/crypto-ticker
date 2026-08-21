import { WebSocket } from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getJson, type GetJsonOptions } from '../http';
import { ensureEgress, getProxyUrl } from '../net/egress';
import { netLog } from '../net/logger';
import type { CoinMeta, QuoteAsset, Ticker } from '../../shared/types';

/** 基础币 + 报价币 => Binance 交易对，如 BTC + USDT => BTCUSDT */
export function toBinanceSymbol(base: string, quote: QuoteAsset): string {
  return `${base.toUpperCase()}${quote.toUpperCase()}`;
}

/** 从交易对反推基础币：BTCUSDT => BTC */
function baseFromSymbol(symbol: string, quote: QuoteAsset): string {
  const q = quote.toUpperCase();
  return symbol.endsWith(q) ? symbol.slice(0, -q.length) : symbol;
}

interface StreamMsg {
  stream?: string;
  data?: {
    s?: string; // symbol
    c?: string; // last price
    P?: string; // price change percent (24h)
  };
}

/**
 * Binance 24h 行情 WebSocket 组合流。
 * 断线自动重连（指数退避上限 15s），每次重连时经出口路由器取最新出口：
 * - 出口为代理 => wss 走 CONNECT 隧道（ws 库不读系统代理，需显式注入 agent）
 * - 出口为直连 => 不注入 agent
 * 出口切换（如代理恢复）后下一次重连自动跟随新出口。
 */
export class BinanceStream {
  private ws: WebSocket | null = null;
  private readonly quote: QuoteAsset;
  private readonly onTicker: (t: Ticker) => void;
  private readonly onStatus: (ok: boolean) => void;
  private shouldRun = true;
  private reconnectDelay = 1000;
  private timer: NodeJS.Timeout | null = null;
  private symbols: string[] = [];

  constructor(
    watchlist: CoinMeta[],
    quote: QuoteAsset,
    onTicker: (t: Ticker) => void,
    onStatus: (ok: boolean) => void,
  ) {
    this.quote = quote;
    this.onTicker = onTicker;
    this.onStatus = onStatus;
    this.symbols = watchlist.map((c) => toBinanceSymbol(c.symbol, quote));
  }

  private get url(): string {
    const streams = this.symbols.map((s) => `${s.toLowerCase()}@ticker`).join('/');
    return `wss://stream.binance.com:9443/stream?streams=${streams}`;
  }

  start(): void {
    this.shouldRun = true;
    void this.connect();
  }

  close(): void {
    this.shouldRun = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.ws) {
      this.ws.onclose = null; // 主动关闭不触发重连
      this.ws.close();
      this.ws = null;
    }
  }

  private async connect(): Promise<void> {
    if (!this.shouldRun || this.symbols.length === 0) return;
    try {
      // 每次连接实时查询出口：出口为代理时注入 HttpsProxyAgent（wss 走隧道，DNS 远端解析）
      const egress = await ensureEgress();
      const proxyUrl = getProxyUrl();
      const agent =
        proxyUrl && egress.mode === 'proxy'
          ? (new HttpsProxyAgent(proxyUrl) as unknown as import('node:http').Agent)
          : undefined;
      netLog('ws-connect', { proxy: proxyUrl ?? null, mode: egress.mode });
      this.ws = new WebSocket(this.url, { agent, handshakeTimeout: 10_000 });
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.onStatus(true);
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as StreamMsg;
        const d = msg.data ?? (msg as unknown as StreamMsg['data']); // 兼容单流格式
        if (!d || !d.s || d.c == null || d.P == null) return;
        const price = parseFloat(d.c);
        const change = parseFloat(d.P);
        if (Number.isNaN(price) || Number.isNaN(change)) return;
        this.onTicker({
          symbol: d.s,
          base: baseFromSymbol(d.s, this.quote),
          price,
          changePercent: change,
          source: 'binance',
          ts: Date.now(),
        });
      } catch {
        /* 忽略单条解析错误 */
      }
    };

    this.ws.onerror = () => this.onStatus(false);

    this.ws.onclose = () => {
      netLog('ws-closed', { reconnecting: this.shouldRun });
      if (this.shouldRun) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.shouldRun) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
  }
}

/** REST 快照（首屏 / 兜底 / 轮询模式使用），自动走出口路由器 */
export async function fetchBinanceSnapshot(
  watchlist: CoinMeta[],
  quote: QuoteAsset,
  opts: GetJsonOptions = {},
): Promise<Ticker[]> {
  if (watchlist.length === 0) return [];
  const symbols = watchlist.map((c) => toBinanceSymbol(c.symbol, quote));
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(
    JSON.stringify(symbols),
  )}`;
  const data = (await getJson(url, opts)) as Array<{
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
  }>;
  return data.map((d) => ({
    symbol: d.symbol,
    base: baseFromSymbol(d.symbol, quote),
    price: parseFloat(d.lastPrice),
    changePercent: parseFloat(d.priceChangePercent),
    source: 'binance' as const,
    ts: Date.now(),
  }));
}
