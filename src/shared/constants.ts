// 主进程 <-> 渲染进程 的 IPC 通道名（集中管理，避免拼写错误）
export const IPC = {
  // 配置
  GET_CONFIG: 'config:get',
  SAVE_CONFIG: 'config:save',
  // 窗口
  SET_OPACITY: 'window:set-opacity',
  SET_ALWAYS_ON_TOP: 'window:set-always-on-top',
  HIDE_WINDOW: 'window:hide',
  SHOW_WINDOW: 'window:show',
  WINDOW_RESIZE: 'window:resize',
  MINIMIZE_WINDOW: 'window:minimize',
  SET_CLICK_THROUGH: 'window:set-click-through',
  CLICK_THROUGH_HOVER_STATE: 'window:click-through-hover-state', // 主进程→渲染：当前是否处于可交互状态（穿透态按钮高亮）
  CLICK_THROUGH_BTN_RECT: 'window:click-through-btn-rect', // 渲染→主：上报退出按钮区域（相对窗口的矩形），主进程据此判定光标命中
  CLICK_THROUGH_HOLD: 'window:click-through-hold', // 渲染→主：设置面板打开等场景保持整窗交互（穿透判定暂停）
  CONFIG_CHANGED: 'config:changed', // 主进程配置变更广播（托盘/快捷键切换后同步界面）
  // 行情
  TICKER_UPDATE: 'ticker:update', // 单条推送
  TICKER_SNAPSHOT: 'ticker:snapshot', // 批量快照
  SOURCE_STATUS: 'source:status', // 数据源状态
  // 币种榜单 & 外部跳转
  FETCH_TRENDING: 'coins:fetch-trending', // 渲染→主：拉取热门榜（CoinGecko trending，走出口路由器）
  FETCH_RANKING: 'coins:fetch-ranking', // 渲染→主：拉取分类榜单（涨幅/跌幅/新币/市值/成交额榜）
  OPEN_EXTERNAL: 'shell:open-external', // 渲染→主：浏览器打开外部链接（域名白名单校验）
  // 网络
  NETWORK_STATUS: 'network:get', // 渲染进程主动查询
  NETWORK_STATUS_CHANGED: 'network:changed', // 主进程推送状态变化
} as const;

// 全局快捷键：切换点击穿透。系统级注册，窗口隐藏/最小化/穿透态下均可用。
export const CLICK_THROUGH_ACCELERATOR = 'CommandOrControl+Shift+X';

/**
 * Windows AppUserModelID（AUMID）。
 * 必须与 electron-builder.yml 的 appId 完全一致：
 * - 主进程在窗口创建前调用 app.setAppUserModelId() 注册
 * - NSIS 安装脚本用 WinShell::SetLnkAUMI 把同一个 ID 写进快捷方式
 * 两边一致，任务栏固定 / 跳转列表 / Toast 通知才会归属到本应用而不是其他 Electron 应用。
 */
export const APP_USER_MODEL_ID = 'com.cryptoticker.app';

/**
 * 极简模式切换时的窗口宽度（仅改宽度，高度与位置锚定右边缘）。
 * 进入极简收窄到 MINIMAL_WINDOW_WIDTH，退出极简恢复到 NORMAL_WINDOW_WIDTH。
 * 两个值都必须 >= windows.ts 里的 minWidth(160)，否则 setBounds 会被系统夹回。
 */
export const MINIMAL_WINDOW_WIDTH = 160;
export const NORMAL_WINDOW_WIDTH = 240;

// 数据源展示名（网络详情面板 / 状态栏使用，i18n 双语）
export const SOURCE_LABELS: Record<string, { zh: string; en: string }> = {
  okx: { zh: 'OKX', en: 'OKX' },
  binance: { zh: 'Binance', en: 'Binance' },
  bybit: { zh: 'Bybit', en: 'Bybit' },
  gate: { zh: 'Gate.io', en: 'Gate.io' },
  coingecko: { zh: 'CoinGecko', en: 'CoinGecko' },
  auto: { zh: '多源自动', en: 'Auto' },
};
