import { app, BrowserWindow, globalShortcut, ipcMain, screen, session, shell } from 'electron';
import { createMiniWindow } from './windows';
import { loadConfig, saveConfig } from './config';
import {
  IPC,
  CLICK_THROUGH_ACCELERATOR,
  APP_USER_MODEL_ID,
  MINIMAL_WINDOW_WIDTH,
  NORMAL_WINDOW_WIDTH,
} from '../shared/constants';
import { DataService } from './data/dataSource';
import { fetchTrendingCoins } from './data/trending';
import { fetchRanking } from './data/ranking';
import type { RankingKind } from '../shared/types';
import { createTray } from './tray';
import {
  getNetworkStatus,
  onNetworkStatus,
  refreshNetworkStatus,
  startNetworkMonitor,
} from './network';
import { setConfiguredProxy, ensureEgress } from './net/egress';
import { netLog } from './net/logger';
import type { AppConfig } from '../shared/types';

// 外部跳转域名白名单：仅允许 https 且命中以下域名（或子域名），防止渲染进程被注入后任意打开链接
const EXTERNAL_ALLOWED_HOSTS = [
  'binance.com',
  'okx.com',
  'gate.io',
  'coingecko.com',
  'coinmarketcap.com',
  'bybit.com',
  'bitget.com',
  'htx.com',
  'kucoin.com',
  't.me',
  'x.com',
  'twitter.com',
];

function openExternalSafe(raw: unknown): void {
  if (typeof raw !== 'string') return;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return;
    const host = u.hostname.toLowerCase();
    if (!EXTERNAL_ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return;
    void shell.openExternal(u.toString());
  } catch {
    /* 非法 URL 忽略 */
  }
}

// P8：高 DPI 适配（125% / 150% 缩放下显示正常）
app.commandLine.appendSwitch('high-dpi-support', '1');

// Windows：注册 AppUserModelID。必须在创建任何 BrowserWindow 之前调用，
// 否则任务栏分组 / 通知 / 跳转列表会被归到默认的 Electron 分组。
// ID 与 electron-builder.yml 的 appId、NSIS 快捷方式写入的 AUMI 三者保持一致。
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

let mainWindow: BrowserWindow | null = null;
let dataService: DataService | null = null;
let appConfig: AppConfig = loadConfig();
let quitting = false;
let trayRefresh: (() => void) | null = null;

// 穿透态「悬停交互」检测器（主进程全局光标轮询）：
// Windows 下 setIgnoreMouseEvents(true, {forward:true}) 的 mousemove 转发依赖窗口焦点，
// 窗口失焦后渲染进程收不到任何鼠标事件，按钮会永久锁死。
// 因此改为主进程定时读取全局光标位置（screen.getCursorScreenPoint 不依赖窗口是否收到鼠标消息，
// 任何焦点/激活状态下都返回真实坐标）。
//
// 交互判定策略（关键）：
// 穿透开启后窗口默认保持穿透（点击直达下层应用）。只有当
//   1) 光标落在白名单按钮区域（解锁穿透/退出极简/右上角逃生，由渲染进程上报屏幕绝对坐标），或
//   2) 设置面板打开（渲染进程请求 hold，窗口需可交互以便操作面板）
// 时才临时恢复整窗交互，其余位置一律保持穿透——否则「光标在窗口内就恢复交互」
// 会令窗口始终拦截鼠标，穿透形同虚设。
const HOVER_POLL_MS = 60;
const CT_BTN_MARGIN = 12; // 按钮区域外扩容差，便于鼠标命中（小按钮 + 边缘抖动需更大容差）
const CT_HIT_GRACE_MS = 600; // 命中后点击保护：覆盖用户从光标进入按钮到 mousedown 的反应时间（通常 200-500ms）
let hoverTimer: NodeJS.Timeout | null = null;
let ctInteractive = false; // 当前是否处于「可交互」状态
let ctBtnRect: { x: number; y: number; w: number; h: number } | null = null; // 渲染进程上报的按钮区域（屏幕绝对坐标，DIP）
let ctHold = false; // 渲染进程请求保持整窗交互（设置面板打开等）
let ctLastHitAt = 0; // 最近一次命中按钮区域的时间戳（点击保护）

function startHoverDetector(): void {
  stopHoverDetector();
  ctInteractive = false;
  ctLastHitAt = 0;
  hoverTimer = setInterval(() => {
    const win = mainWindow;
    // 窗口不可见 / 最小化 / 销毁 / 已退出穿透时暂停判定
    if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
    if (!appConfig.clickThrough) {
      stopHoverDetector();
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    // 可交互条件：面板保持交互 或 光标命中按钮区域。
    // 按钮区域由渲染进程上报**屏幕绝对坐标**（window.screenX/screenY + rect，DIP），
    // 与 screen.getCursorScreenPoint 同坐标系——判定区域与用户看到的按钮位置严格对齐。
    let hit = false;
    if (ctBtnRect) {
      hit =
        cursor.x >= ctBtnRect.x - CT_BTN_MARGIN &&
        cursor.x <= ctBtnRect.x + ctBtnRect.w + CT_BTN_MARGIN &&
        cursor.y >= ctBtnRect.y - CT_BTN_MARGIN &&
        cursor.y <= ctBtnRect.y + ctBtnRect.h + CT_BTN_MARGIN;
    }
    if (hit) ctLastHitAt = Date.now();
    // 点击保护：命中后 600ms 内即使移出按钮区也保持交互，防止
    // 快速点击瞬间（mousedown 时尚未命中）被判定 miss 而穿透到下层
    let interactive = ctHold || hit || Date.now() - ctLastHitAt < CT_HIT_GRACE_MS;
    if (interactive && !ctInteractive) {
      ctInteractive = true;
      win.setIgnoreMouseEvents(false); // 光标在按钮区域：临时恢复交互（按钮可点击）
      // 关键：恢复交互时主动激活窗口。Windows 无边框窗口失焦时，
      // 第一次点击仅激活窗口、click 事件不触发（设置/最小化按钮会"点不动"）。
      // 激活后首次点击即可完整触发 click，避免用户以为按钮失效。
      if (!win.isFocused()) win.focus();
      win.webContents.send(IPC.CLICK_THROUGH_HOVER_STATE, true);
    } else if (!interactive && ctInteractive) {
      ctInteractive = false;
      ctLastHitAt = 0;
      win.setIgnoreMouseEvents(true, { forward: false }); // 光标移出按钮区域：恢复穿透
      win.webContents.send(IPC.CLICK_THROUGH_HOVER_STATE, false);
    }
  }, HOVER_POLL_MS);
}

function stopHoverDetector(): void {
  if (hoverTimer) {
    clearInterval(hoverTimer);
    hoverTimer = null;
  }
}

// 单实例锁，避免重复启动
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function startData(): void {
  dataService = new DataService(appConfig, {
    onTicker: (t) => mainWindow?.webContents.send(IPC.TICKER_UPDATE, t),
    onSnapshot: (list) => mainWindow?.webContents.send(IPC.TICKER_SNAPSHOT, list),
    onStatus: (s) => mainWindow?.webContents.send(IPC.SOURCE_STATUS, s),
  });
  dataService.start();
}

function applyAutoStart(): void {
  app.setLoginItemSettings({ openAtLogin: appConfig.autoStart });
}

/**
 * 将用户配置的代理地址应用到 Chromium 网络栈（session.setProxy），
 * 使 net.request 探测、渲染进程 fetch 等一律走代理；未配置则恢复直连。
 */
async function applyProxy(cfg: AppConfig): Promise<void> {
  const rules = cfg.proxyUrl?.trim();
  try {
    if (rules) {
      // 兼容用户输入：http://127.0.0.1:7897 或 127.0.0.1:7897
      const normalized = /^https?:\/\//i.test(rules) ? rules : `http://${rules}`;
      await session.defaultSession.setProxy({
        proxyRules: normalized,
        proxyBypassRules: '<local>',
      });
    } else {
      await session.defaultSession.setProxy({ mode: 'direct' });
    }
  } catch (e) {
    console.error('[proxy] 应用代理配置失败:', e);
  }
}

/**
 * 将点击穿透状态应用到窗口。
 * 开启：setIgnoreMouseEvents(true, {forward:false}) + 启动全局光标轮询——
 * 常态穿透下渲染层收不到任何鼠标事件（无 hover、无指针样式变化，保持系统默认光标），
 * 仅当光标命中上报的按钮区域时临时恢复交互（按钮可点击），移出后恢复穿透。
 * 关闭：停止轮询，恢复窗口对鼠标事件的正常接收（可点击、可拖拽标题栏、可缩放）。
 */
function applyClickThroughWindow(v: boolean): void {
  if (v) {
    mainWindow?.setIgnoreMouseEvents(true, { forward: false });
    startHoverDetector();
  } else {
    stopHoverDetector();
    ctInteractive = false;
    ctBtnRect = null;
    ctHold = false;
    mainWindow?.setIgnoreMouseEvents(false);
    mainWindow?.webContents.send(IPC.CLICK_THROUGH_HOVER_STATE, false);
  }
}

/**
 * 极简模式切换时同步窗口宽度：进入极简收窄到 160，退出极简恢复到 240（高度不变）。
 * - 锚定右边缘（x 补偿差值）：悬浮窗通常贴屏幕右侧，收窄/展开时右侧不动，视觉更稳。
 * - 用 getDisplayMatching(b).workArea 把窗口夹回当前屏幕可用区，避免展开时越出屏幕边缘。
 * - 只改宽度：用户手动调整过的高度保持不动。
 */
function applyMinimalWindowWidth(minimal: boolean): void {
  const win = mainWindow;
  if (!win) return;
  const b = win.getBounds();
  const w = minimal ? MINIMAL_WINDOW_WIDTH : NORMAL_WINDOW_WIDTH;
  if (b.width === w) return;
  let x = b.x + b.width - w; // 右边缘固定
  const area = screen.getDisplayMatching(b).workArea;
  if (x < area.x) x = area.x;
  if (x + w > area.x + area.width) x = Math.max(area.x, area.x + area.width - w);
  win.setBounds({ x, y: b.y, width: w, height: b.height }, true);
  appConfig.windowBounds = { x, y: b.y, w, h: b.height };
  saveConfig(appConfig);
}

/** 向渲染进程广播最新配置（托盘 / 全局快捷键等主进程侧变更后同步界面状态） */
function broadcastConfig(): void {
  mainWindow?.webContents.send(IPC.CONFIG_CHANGED, appConfig);
}

function showMainWindow(focus = true): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  if (focus) mainWindow.focus();
}

/**
 * 切换点击穿透的统一入口（设置面板 / 托盘 / 全局快捷键都走这里）。
 * - 持久化配置并同步窗口、托盘菜单、渲染进程界面
 * - opts.show：由托盘 / 快捷键触发时确保窗口可见，用户能看到退出入口
 */
function setClickThroughState(v: boolean, opts?: { show?: boolean; focus?: boolean }): void {
  appConfig.clickThrough = v;
  saveConfig(appConfig);
  applyClickThroughWindow(v);
  trayRefresh?.();
  broadcastConfig();
  if (opts?.show) showMainWindow(opts.focus ?? false);
}

function toggleClickThrough(): void {
  const next = !appConfig.clickThrough;
  // 开启时仅确保可见（不抢焦点）；关闭时聚焦，便于用户立即交互
  setClickThroughState(next, { show: true, focus: !next });
}

app.whenReady().then(async () => {
  // 先应用代理，再启动网络探测与数据源（探测会跟随系统代理）
  await applyProxy(appConfig);
  mainWindow = createMiniWindow();
  mainWindow.setOpacity(appConfig.opacity);
  mainWindow.setAlwaysOnTop(appConfig.alwaysOnTop);

  // 启动策略：始终以默认状态启动（非极简 + 非点击穿透）。
  // 上次退出时若停在这两个状态，这里复位并立即持久化，本次与下次启动都是默认状态。
  // 穿透必须在 applyClickThroughWindow 之前复位，否则会带着穿透态启动（鼠标点不到窗口）。
  const resetMinimal = appConfig.minimalMode;
  const resetClickThrough = appConfig.clickThrough;
  if (resetMinimal || resetClickThrough) {
    appConfig.minimalMode = false;
    appConfig.clickThrough = false;
    saveConfig(appConfig);
  }
  applyClickThroughWindow(appConfig.clickThrough);
  // 复位极简时同步窗口宽度（等同「退出极简」→ NORMAL_WINDOW_WIDTH），避免模式与宽度不一致
  if (resetMinimal) applyMinimalWindowWidth(false);

  // 托盘常驻：任务栏不显示窗口按钮。Electron 的 skipTaskbar 等价于 ITaskbarList::DeleteTab，
  // 在部分 Windows 版本上 hide() → show() / restore() 后会重新出现任务栏按钮，
  // 因此每次窗口显示都重新断言一次，保证全程只有托盘图标。
  mainWindow.on('show', () => mainWindow?.setSkipTaskbar(true));

  // P6：系统托盘（点击切换窗口，右键菜单退出 / 切换点击穿透）
  trayRefresh = createTray({
    getWindow: () => mainWindow,
    getClickThrough: () => appConfig.clickThrough,
    setClickThrough: (v) => setClickThroughState(v, { show: true, focus: !v }),
    toggleWindow: () => {
      if (mainWindow?.isVisible()) mainWindow.hide();
      else showMainWindow(true);
    },
    onQuit: () => {
      quitting = true;
      app.quit();
    },
  }).refresh;
  applyAutoStart();

  // 全局快捷键：穿透态 / 窗口隐藏 / 最小化时也能一键切换（系统级，不受窗口鼠标屏蔽影响）
  try {
    const registered = globalShortcut.register(CLICK_THROUGH_ACCELERATOR, toggleClickThrough);
    if (!registered) {
      console.warn(
        `[shortcut] 全局快捷键 ${CLICK_THROUGH_ACCELERATOR} 注册失败（可能被其他应用占用），仍可通过托盘菜单取消穿透`,
      );
    }
  } catch (e) {
    console.warn('[shortcut] 全局快捷键注册异常:', e);
  }

  // 网络状态监控：状态变化推送给渲染进程
  // 智能出口路由器预热：启动即探测可用出口（配置代理 → 系统代理 → 本地端口 → 直连），
  // 后续所有行情请求自动选路，不再依赖单一固定代理
  setConfiguredProxy(appConfig.proxyUrl);
  void ensureEgress().catch((e) => netLog('egress-warmup-fail', { error: String(e) }));
  startNetworkMonitor();
  onNetworkStatus((status) => {
    mainWindow?.webContents.send(IPC.NETWORK_STATUS_CHANGED, status);
  });
  ipcMain.handle(IPC.NETWORK_STATUS, async () => {
    await refreshNetworkStatus();
    return getNetworkStatus();
  });

  // 币种热门榜：CoinGecko trending（走出口路由器，自动绕开 DNS 劫持）
  ipcMain.handle(IPC.FETCH_TRENDING, async () => {
    try {
      return await fetchTrendingCoins();
    } catch (e) {
      netLog('trending-fail', { error: String(e) });
      throw new Error(`热门榜获取失败：${e instanceof Error ? e.message : String(e)}`);
    }
  });
  // 分类榜单：涨幅 / 跌幅 / 新币 / 市值 / 成交额
  ipcMain.handle(IPC.FETCH_RANKING, async (_e, kind: RankingKind) => {
    try {
      return await fetchRanking(kind);
    } catch (e) {
      netLog('ranking-fail', { kind, error: String(e) });
      throw new Error(`榜单获取失败：${e instanceof Error ? e.message : String(e)}`);
    }
  });
  // 浏览器打开外部链接（域名白名单校验）
  ipcMain.on(IPC.OPEN_EXTERNAL, (_e, url: unknown) => openExternalSafe(url));

  // 关闭窗口改为隐藏到托盘（仅右键菜单“退出”真正退出）
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  startData();

  // 渲染进程请求配置
  ipcMain.handle(IPC.GET_CONFIG, () => appConfig);
  ipcMain.handle(IPC.SAVE_CONFIG, (_e, cfg: AppConfig) => {
    const prevProxy = appConfig.proxyUrl;
    const prevClickThrough = appConfig.clickThrough;
    const prevMinimal = appConfig.minimalMode;
    appConfig = cfg;
    saveConfig(cfg);
    // 极简模式切换：同步窗口宽度（进入 160 / 退出 240）
    if (cfg.minimalMode !== prevMinimal) applyMinimalWindowWidth(cfg.minimalMode);
    applyAutoStart(); // P6：开机自启随配置生效
    // 统一应用窗口外观（透明度 / 置顶 / 点击穿透，设置面板改配置即时生效）
    mainWindow?.setOpacity(cfg.opacity);
    mainWindow?.setAlwaysOnTop(cfg.alwaysOnTop);
    applyClickThroughWindow(cfg.clickThrough);
    if (cfg.clickThrough !== prevClickThrough) {
      trayRefresh?.(); // 托盘菜单勾选态同步
      broadcastConfig(); // 界面复选框 / 悬浮按钮同步
    }
    // 代理变化：重新应用系统代理并立即重新探测网络（此前探测结果基于旧代理）
    if (cfg.proxyUrl !== prevProxy) {
      void applyProxy(cfg).then(() => refreshNetworkStatus());
    }
    dataService?.update(cfg);
  });

  // 窗口行为
  ipcMain.on(IPC.SET_OPACITY, (_e, v: number) => {
    appConfig.opacity = v;
    mainWindow?.setOpacity(v);
    saveConfig(appConfig);
  });
  ipcMain.on(IPC.SET_ALWAYS_ON_TOP, (_e, v: boolean) => {
    appConfig.alwaysOnTop = v;
    mainWindow?.setAlwaysOnTop(v);
    saveConfig(appConfig);
  });
  ipcMain.on(IPC.SET_CLICK_THROUGH, (_e, v: boolean) => {
    // 设置面板触发：窗口本身可见，无需额外 show
    setClickThroughState(v);
  });
  // 穿透态交互由主进程全局光标轮询驱动（startHoverDetector），无需渲染进程上报 hover。
  // 渲染进程上报「退出按钮区域」（相对窗口的矩形）与「保持交互」请求，主进程据此判定：
  // 光标命中按钮区域 → 临时恢复交互；设置面板打开 → 保持整窗交互；其余位置保持穿透。
  ipcMain.on(
    IPC.CLICK_THROUGH_BTN_RECT,
    (_e, rect: { x: number; y: number; w: number; h: number } | null) => {
      ctBtnRect = rect;
    },
  );
  ipcMain.on(IPC.CLICK_THROUGH_HOLD, (_e, v: boolean) => {
    ctHold = v;
  });
  ipcMain.on(IPC.HIDE_WINDOW, () => mainWindow?.hide());
  ipcMain.on(IPC.SHOW_WINDOW, () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  ipcMain.on(IPC.MINIMIZE_WINDOW, () => mainWindow?.minimize());
  // 持久化窗口尺寸（P7）。边缘拖拽调整：n/w 方向拖动时保持对边（右/下）固定
  ipcMain.on(
    IPC.WINDOW_RESIZE,
    (
      _e,
      w: number,
      h: number,
      opts?: { keepRight?: boolean; keepBottom?: boolean },
    ) => {
      const win = mainWindow;
      if (!win) return;
      const b = win.getBounds();
      const x = opts?.keepRight ? b.x + b.width - w : b.x;
      const y = opts?.keepBottom ? b.y + b.height - h : b.y;
      win.setBounds({ x, y, width: w, height: h }, true);
      appConfig.windowBounds = { x, y, w, h };
      saveConfig(appConfig);
    },
  );
});

// P6：托盘模式下关闭全部窗口不退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && quitting) app.quit();
});

// 退出前注销全局快捷键并停止穿透轮询，避免残留系统级热键 / 定时器
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopHoverDetector();
});

// 第二实例：聚焦已有窗口
app.on('second-instance', () => {
  showMainWindow(true);
});
