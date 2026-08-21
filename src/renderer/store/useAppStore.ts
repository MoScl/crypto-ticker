import { create } from 'zustand';
import {
  DEFAULT_CONFIG,
  type AppConfig,
  type CoinMeta,
  type NetworkStatus,
  type Ticker,
} from '../../shared/types';
import { api, type SourceStatus } from '../lib/api';
import { findCoin } from '../data/coins';

interface AppState {
  config: AppConfig;
  tickers: Record<string, Ticker>; // 以 symbol(BTCUSDT) 为键
  sourceStatus: SourceStatus | null;
  networkStatus: NetworkStatus | null;
  lastUpdateTs: number; // 最近一次收到行情数据的时间戳（用于「更新于 X 前」显示）
  loaded: boolean;

  init: () => Promise<void>;
  patchConfig: (patch: Partial<AppConfig>) => void;
  addCoin: (symbol: string) => void;
  removeCoin: (id: string) => void;
  reorderCoin: (id: string, toIndex: number) => void;
  applyTicker: (t: Ticker) => void;
  applySnapshot: (list: Ticker[]) => void;
  setSourceStatus: (s: SourceStatus) => void;
  setNetworkStatus: (s: NetworkStatus) => void;
  setClickThrough: (v: boolean) => void;
  setAutoStart: (v: boolean) => void;
}

/** 合并配置并立即持久化到主进程（触发数据源重订阅） */
function persist(config: AppConfig) {
  api.saveConfig(config);
}

export const useAppStore = create<AppState>((set, get) => ({
  config: structuredClone(DEFAULT_CONFIG),
  tickers: {},
  sourceStatus: null,
  networkStatus: null,
  lastUpdateTs: 0,
  loaded: false,

  init: async () => {
    const config = await api.getConfig();
    set({ config, loaded: true });
    // 订阅网络状态：先拉一次当前值，再监听主进程推送
    api.getNetworkStatus().then((s) => set({ networkStatus: s })).catch(() => undefined);
    api.onNetworkStatus((s) => set({ networkStatus: s }));
    // 订阅主进程侧配置变更（托盘 / 全局快捷键切换穿透后，界面复选框与悬浮按钮同步）
    api.onConfigChanged((config) => set({ config }));
  },

  patchConfig: (patch) => {
    const config = { ...get().config, ...patch };
    set({ config });
    persist(config);
  },

  addCoin: (symbol) => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    const cfg = get().config;
    const id = `${sym}${cfg.quoteAsset}`;
    if (cfg.watchlist.some((c) => c.id === id)) return; // 已存在
    const order = cfg.watchlist.reduce((m, c) => Math.max(m, c.order), -1) + 1;
    const info = findCoin(sym);
    const coin: CoinMeta = {
      id,
      symbol: sym,
      name: info?.name ?? sym,
      order,
      coingeckoId: info?.coingeckoId,
    };
    const watchlist = [...cfg.watchlist, coin];
    const config = { ...cfg, watchlist };
    set({ config });
    persist(config);
  },

  removeCoin: (id) => {
    const cfg = get().config;
    const watchlist = cfg.watchlist.filter((c) => c.id !== id);
    const config = { ...cfg, watchlist };
    set({ config });
    persist(config);
  },

  reorderCoin: (id, toIndex) => {
    const cfg = get().config;
    const list = [...cfg.watchlist].sort((a, b) => a.order - b.order);
    const from = list.findIndex((c) => c.id === id);
    if (from < 0) return;
    const [moved] = list.splice(from, 1);
    const clamped = Math.max(0, Math.min(toIndex, list.length));
    list.splice(clamped, 0, moved);
    const watchlist = list.map((c, i) => ({ ...c, order: i }));
    const config = { ...cfg, watchlist };
    set({ config });
    persist(config);
  },

  applyTicker: (t) => {
    set((s) => ({
      tickers: { ...s.tickers, [t.symbol]: t },
      lastUpdateTs: Math.max(s.lastUpdateTs, t.ts),
    }));
  },

  applySnapshot: (list) => {
    set((s) => {
      const next = { ...s.tickers };
      let last = s.lastUpdateTs;
      for (const t of list) {
        next[t.symbol] = t;
        if (t.ts > last) last = t.ts;
      }
      return { tickers: next, lastUpdateTs: last };
    });
  },

  setSourceStatus: (s) => set({ sourceStatus: s }),
  setNetworkStatus: (s) => set({ networkStatus: s }),

  setClickThrough: (v) => {
    const config = { ...get().config, clickThrough: v };
    set({ config });
    api.setClickThrough(v);
    persist(config);
  },

  setAutoStart: (v) => {
    const config = { ...get().config, autoStart: v };
    set({ config });
    api.saveConfig(config); // 主进程 SAVE_CONFIG 会应用 setLoginItemSettings
  },
}));
