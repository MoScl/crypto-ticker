import type {
  AppConfig,
  CoinEntry,
  NetworkStatus,
  RankingKind,
  SourceStatus,
  Ticker,
} from '../../shared/types';

// 渲染进程通过 preload 暴露的 window.api 与主进程通信（类型化封装）
export type { SourceStatus };

export const api = (window as unknown as { api: ApiBridge }).api;

interface ApiBridge {
  getConfig: () => Promise<AppConfig>;
  saveConfig: (cfg: AppConfig) => void;
  setOpacity: (v: number) => void;
  setAlwaysOnTop: (v: boolean) => void;
  hideWindow: () => void;
  showWindow: () => void;
  resizeWindow: (w: number, h: number) => void;
  minimizeWindow: () => void;
  setClickThrough: (v: boolean) => void;
  setClickThroughBtnRect: (rect: { x: number; y: number; w: number; h: number } | null) => void;
  setClickThroughHold: (v: boolean) => void;
  onClickThroughHoverState: (cb: (interactive: boolean) => void) => () => void;
  onConfigChanged: (cb: (cfg: AppConfig) => void) => () => void;
  onTicker: (cb: (t: Ticker) => void) => () => void;
  onSnapshot: (cb: (list: Ticker[]) => void) => () => void;
  onSourceStatus: (cb: (s: SourceStatus) => void) => () => void;
  getNetworkStatus: () => Promise<NetworkStatus>;
  onNetworkStatus: (cb: (s: NetworkStatus) => void) => () => void;
  fetchTrending: () => Promise<CoinEntry[]>;
  fetchRanking: (kind: RankingKind) => Promise<CoinEntry[]>;
  openExternal: (url: string) => void;
}
