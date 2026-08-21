import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/constants';
import type {
  AppConfig,
  CoinEntry,
  NetworkStatus,
  RankingKind,
  SourceStatus,
  Ticker,
} from '../shared/types';

// 安全桥：只暴露白名单方法，渲染进程无法直接访问 Node / Electron 内部。
const api = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.GET_CONFIG),
  saveConfig: (cfg: AppConfig) => ipcRenderer.invoke(IPC.SAVE_CONFIG, cfg),

  setOpacity: (v: number) => ipcRenderer.send(IPC.SET_OPACITY, v),
  setAlwaysOnTop: (v: boolean) => ipcRenderer.send(IPC.SET_ALWAYS_ON_TOP, v),
  hideWindow: () => ipcRenderer.send(IPC.HIDE_WINDOW),
  showWindow: () => ipcRenderer.send(IPC.SHOW_WINDOW),
  resizeWindow: (w: number, h: number) => ipcRenderer.send(IPC.WINDOW_RESIZE, w, h),
  minimizeWindow: () => ipcRenderer.send(IPC.MINIMIZE_WINDOW),
  setClickThrough: (v: boolean) => ipcRenderer.send(IPC.SET_CLICK_THROUGH, v),
  setClickThroughBtnRect: (rect: { x: number; y: number; w: number; h: number } | null) =>
    ipcRenderer.send(IPC.CLICK_THROUGH_BTN_RECT, rect),
  setClickThroughHold: (v: boolean) => ipcRenderer.send(IPC.CLICK_THROUGH_HOLD, v),
  onClickThroughHoverState: (cb: (interactive: boolean) => void) => {
    const listener = (_e: unknown, interactive: boolean) => cb(interactive);
    ipcRenderer.on(IPC.CLICK_THROUGH_HOVER_STATE, listener);
    return () => ipcRenderer.removeListener(IPC.CLICK_THROUGH_HOVER_STATE, listener);
  },

  onConfigChanged: (cb: (cfg: AppConfig) => void) => {
    const listener = (_e: unknown, cfg: AppConfig) => cb(cfg);
    ipcRenderer.on(IPC.CONFIG_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC.CONFIG_CHANGED, listener);
  },

  onTicker: (cb: (t: Ticker) => void) => {
    const listener = (_e: unknown, t: Ticker) => cb(t);
    ipcRenderer.on(IPC.TICKER_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC.TICKER_UPDATE, listener);
  },
  onSnapshot: (cb: (list: Ticker[]) => void) => {
    const listener = (_e: unknown, list: Ticker[]) => cb(list);
    ipcRenderer.on(IPC.TICKER_SNAPSHOT, listener);
    return () => ipcRenderer.removeListener(IPC.TICKER_SNAPSHOT, listener);
  },
  onSourceStatus: (cb: (s: SourceStatus) => void) => {
    const listener = (_e: unknown, s: SourceStatus) => cb(s);
    ipcRenderer.on(IPC.SOURCE_STATUS, listener);
    return () => ipcRenderer.removeListener(IPC.SOURCE_STATUS, listener);
  },

  getNetworkStatus: (): Promise<NetworkStatus> => ipcRenderer.invoke(IPC.NETWORK_STATUS),
  onNetworkStatus: (cb: (s: NetworkStatus) => void) => {
    const listener = (_e: unknown, s: NetworkStatus) => cb(s);
    ipcRenderer.on(IPC.NETWORK_STATUS_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC.NETWORK_STATUS_CHANGED, listener);
  },

  // 币种榜单 & 外部跳转
  fetchTrending: (): Promise<CoinEntry[]> => ipcRenderer.invoke(IPC.FETCH_TRENDING),
  fetchRanking: (kind: RankingKind): Promise<CoinEntry[]> =>
    ipcRenderer.invoke(IPC.FETCH_RANKING, kind),
  openExternal: (url: string) => ipcRenderer.send(IPC.OPEN_EXTERNAL, url),
};

contextBridge.exposeInMainWorld('api', api);
