import { setConfiguredProxy, onEgressChanged, getEgress } from '../net/egress';
import { netLog } from '../net/logger';
import type { GetJsonOptions } from '../http';
import type { AppConfig, CoinMeta, QuoteAsset, SourceStatus, Ticker } from '../../shared/types';

interface Callbacks {
  onTicker: (t: Ticker) => void;
  onSnapshot: (list: Ticker[]) => void;
  onStatus: (s: SourceStatus) => void;
}

/** 当前出口摘要（用于状态详情展示） */
function egressDetail(): string {
  const e = getEgress();
  if (!e) return '出口探测中…';
  if (e.mode === 'proxy') return `代理 ${e.proxyUrl} (${e.latencyMs}ms)`;
  return e.latencyMs >= 0 ? `直连 (${e.latencyMs}ms, DoH解析)` : '全部出口不可达';
}

/**
 * 行情调度中心：多源自动容灾。
 * - WS 实时流：Binance（realtime 模式增强实时性，断线自动重连）
 * - REST 快照链：OKX → Binance → Bybit → CoinGecko（按配置数据源过滤）
 *   主源失败自动降级到下一个可用源，无需人工干预
 * - 健康熔断：单源连续失败 FAIL_THRESHOLD 次后冷却 COOLDOWN_MS，
 *   冷却期跳过该源，到期自动恢复试探
 * 所有网络请求经「智能出口路由器」选路（配置代理 → 系统代理 → 本地端口 → 直连）。
 *
 * 状态语义：
 * - ok=true, degraded=false => 实时主通道正常（WS 已连接）
 * - ok=true, degraded=true  => 有数据但非实时主通道（WS 断线走 REST 兜底 / 快照源为备源）
 * - ok=false                => 完全拿不到数据
 */
export class DataService {
  private cfg: AppConfig;
  private cb: Callbacks;
  private stream: import('./binance').BinanceStream | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  /** Binance WS 实时流当前是否存活（用于判定降级） */
  private binanceWsOk = false;
  /** 出口切换触发的快照刷新防抖 */
  private egressRefreshTimer: NodeJS.Timeout | null = null;
  private offEgress: (() => void) | null = null;
  /** 单源连续失败计数（达到阈值进入冷却） */
  private srcFail = new Map<string, number>();
  /** 单源冷却截止时间戳（冷却期内跳过该源） */
  private srcCooldown = new Map<string, number>();
  private static readonly FAIL_THRESHOLD = 3;
  private static readonly COOLDOWN_MS = 120_000;

  constructor(cfg: AppConfig, cb: Callbacks) {
    this.cfg = cfg;
    this.cb = cb;
  }

  start(): void {
    setConfiguredProxy(this.cfg.proxyUrl);
    // 出口切换（代理恢复/切换）时刷新一次快照，让数据尽快恢复
    this.offEgress = onEgressChanged(() => {
      if (this.egressRefreshTimer) clearTimeout(this.egressRefreshTimer);
      this.egressRefreshTimer = setTimeout(() => void this.snapshot(), 300);
    });
    if (this.cfg.dataSource !== 'coingecko') {
      this.connectBinance();
    }
    void this.snapshot();
    if (this.cfg.refreshMode === 'poll' || this.cfg.dataSource === 'coingecko') {
      this.startPoll();
    }
  }

  /** 监控列表 / 配置变化时调用：重连 WS + 重新快照 */
  update(cfg: AppConfig): void {
    this.cfg = cfg;
    setConfiguredProxy(this.cfg.proxyUrl);
    this.stream?.close();
    this.stream = null;
    this.binanceWsOk = false; // 新 WS 未连上前按降级显示
    if (this.cfg.dataSource !== 'coingecko') {
      this.connectBinance();
    }
    void this.snapshot();
    if (this.cfg.refreshMode === 'poll' || this.cfg.dataSource === 'coingecko') {
      this.startPoll();
    } else {
      this.stopPoll();
    }
  }

  stop(): void {
    this.stream?.close();
    this.stream = null;
    this.stopPoll();
    this.offEgress?.();
    if (this.egressRefreshTimer) clearTimeout(this.egressRefreshTimer);
  }

  private connectBinance(): void {
    // 延迟引入避免循环依赖
    const { BinanceStream } = require('./binance') as typeof import('./binance');
    this.stream = new BinanceStream(
      this.cfg.watchlist,
      this.cfg.quoteAsset,
      (t) => this.cb.onTicker(t),
      (ok) => {
        if (ok) {
          // WS 实时流恢复
          this.binanceWsOk = true;
          this.cb.onStatus({ source: 'binance', ok: true, degraded: false, detail: egressDetail() });
        } else {
          // WS 断线：标记降级（数据仍可通过 REST 快照获取），并触发兜底快照
          this.binanceWsOk = false;
          this.cb.onStatus({ source: 'binance', ok: true, degraded: true, detail: `WS断线，走REST兜底 · ${egressDetail()}` });
          if (this.cfg.dataSource === 'auto') {
            void this.snapshot();
          }
        }
      },
    );
    this.stream.start();
  }

  /** 根据配置生成候选数据源链（auto = 多源自动容灾） */
  private candidates(): string[] {
    switch (this.cfg.dataSource) {
      case 'okx':
        return ['okx'];
      case 'binance':
        return ['binance'];
      case 'bybit':
        return ['bybit'];
      case 'gate':
        return ['gate'];
      case 'coingecko':
        return ['coingecko'];
      default:
        return ['okx', 'binance', 'bybit', 'gate', 'coingecko'];
    }
  }

  private srcBlocked(src: string): boolean {
    const until = this.srcCooldown.get(src);
    if (until == null) return false;
    if (Date.now() < until) return true;
    this.srcCooldown.delete(src); // 冷却到期，恢复试探
    return false;
  }

  private srcSuccess(src: string): void {
    this.srcFail.delete(src);
    this.srcCooldown.delete(src);
  }

  private srcFailOnce(src: string): void {
    const n = (this.srcFail.get(src) ?? 0) + 1;
    this.srcFail.set(src, n);
    if (n >= DataService.FAIL_THRESHOLD) {
      this.srcCooldown.set(src, Date.now() + DataService.COOLDOWN_MS);
      this.srcFail.delete(src);
      netLog('source-cooldown', { src, cooldownMs: DataService.COOLDOWN_MS });
    }
  }

  /** 按源取数（延迟 require 避免循环依赖） */
  private async fetchBySource(
    src: string,
    watchlist: CoinMeta[],
    quote: QuoteAsset,
    opts: GetJsonOptions,
  ): Promise<Ticker[]> {
    switch (src) {
      case 'okx': {
        const { fetchOKXSnapshot } = require('./sources/okx') as typeof import('./sources/okx');
        return fetchOKXSnapshot(watchlist, quote, opts);
      }
      case 'binance': {
        const { fetchBinanceSnapshot } = require('./binance') as typeof import('./binance');
        return fetchBinanceSnapshot(watchlist, quote, opts);
      }
      case 'bybit': {
        const { fetchBybitSnapshot } = require('./sources/bybit') as typeof import('./sources/bybit');
        return fetchBybitSnapshot(watchlist, quote, opts);
      }
      case 'gate': {
        const { fetchGateSnapshot } = require('./sources/gate') as typeof import('./sources/gate');
        return fetchGateSnapshot(watchlist, quote, opts);
      }
      case 'coingecko': {
        const { fetchCoinGeckoSnapshot } = require('./coingecko') as typeof import('./coingecko');
        return fetchCoinGeckoSnapshot(watchlist, opts);
      }
      default:
        throw new Error(`未知数据源: ${src}`);
    }
  }

  private async snapshot(): Promise<void> {
    const opts = { proxyUrl: this.cfg.proxyUrl };
    const chain = this.candidates().filter((s) => !this.srcBlocked(s));
    if (chain.length === 0) {
      this.cb.onStatus({
        source: this.cfg.dataSource,
        ok: false,
        detail: `全部数据源熔断冷却中 · ${egressDetail()}`,
      });
      return;
    }
    const wsExpected = this.cfg.dataSource !== 'coingecko' && this.cfg.refreshMode === 'realtime';
    let lastErr: unknown = null;
    for (const src of chain) {
      try {
        const list = await this.fetchBySource(src, this.cfg.watchlist, this.cfg.quoteAsset, opts);
        this.srcSuccess(src);
        this.cb.onSnapshot(list);
        const isFallback = chain.indexOf(src) > 0; // 非首选 => 兜底生效
        const detail = isFallback
          ? `${src} 兜底生效${lastErr ? `（前置失败: ${String(lastErr).slice(0, 60)}）` : ''} · ${egressDetail()}`
          : egressDetail();
        this.cb.onStatus({
          source: src,
          ok: true,
          degraded: wsExpected && !this.binanceWsOk,
          detail,
        });
        return;
      } catch (e) {
        lastErr = e;
        this.srcFailOnce(src);
      }
    }
    this.cb.onStatus({
      source: this.cfg.dataSource,
      ok: false,
      detail: `所有数据源均失败 · ${egressDetail()}`,
    });
  }

  private startPoll(): void {
    this.stopPoll();
    const interval = Math.max(5, this.cfg.refreshIntervalSec) * 1000;
    this.pollTimer = setInterval(() => void this.snapshot(), interval);
  }

  private stopPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
