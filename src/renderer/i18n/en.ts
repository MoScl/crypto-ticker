// English language pack. Must stay structurally identical to zh.ts (en: typeof zh enforces it at compile time).
import { zh } from './zh';

export const en: typeof zh = {
  // Common
  commonLoading: 'Loading…',
  commonRetry: 'Retry',
  commonRefresh: 'Refresh',
  commonClose: 'Close',
  commonNormal: 'Normal',
  commonAbnormal: 'Error',
  commonDegraded: 'Degraded',
  commonWaiting: 'Waiting for data…',
  commonMonitoring: 'Monitoring {count} coins',
  commonUpdatedAgo: 'Updated {time} ago',
  commonDash: '—',

  // Data source labels
  sourceAuto: 'Auto',

  // Search
  searchPlaceholder: 'Search & add coin, e.g. BTC',

  // Main window
  mainListBtnTitle: 'Browse coin rankings (Mainstream / Trending / Gainers / Losers / New / Market Cap / Volume)',
  mainMultiSelTitle: 'Remove coins (multi-select)',
  mainSettingsTitle: 'Settings',
  mainMinimizeTitle: 'Minimize to taskbar',
  mainMinimalEnter: 'Enter minimal mode',
  mainEmpty: 'No coins yet, add one above',
  mainSelectAll: 'Select all',
  mainCancelAll: 'Deselect all',
  mainSelectedCount: '{n}/{total} selected',
  mainRemove: 'Remove',
  mainCancel: 'Cancel',
  mainSrcConnecting: 'Connecting…',
  mainSrcState: '{label} · {state}',
  mainSrcStateConnecting: 'Connecting…',
  mainSrcStateBad: 'Error',
  mainSrcStateDegraded: 'Degraded',
  mainSrcStateOk: 'OK',
  mainSrcTitle: 'Source: {source} ({state})',
  mainSrcTitleRest: ' · Live feed down, using REST fallback',
  mainResizeTitle: 'Drag to resize window',

  // Watchlist rows
  rowSelectHint: 'Click to select this coin',
  rowUnselectHint: 'Click to deselect',
  rowExpandHint: 'Click to expand platform links',
  rowGoTitle: 'Open trading platform',

  // Ranking tabs
  tabMainstream: 'Mainstream',
  tabTrending: 'Trending',
  tabGainers: 'Gainers',
  tabLosers: 'Losers',
  tabNew: 'New',
  tabMarketcap: 'Market Cap',
  tabVolume: 'Volume',

  // Ranking modal
  addLoadingTrending: 'Loading trending…',
  addLoadingRank: 'Loading ranking…',
  addNoTrending: 'No trending data',
  addNoRank: 'No ranking data',
  addExpandHint: 'Click to expand platform links',
  addMcapTitle: 'Market cap',
  addVolTitle: '24h volume',
  addListedTitle: 'Listed at',
  addAddedTitle: 'Already in watchlist',
  addAddTitle: 'Add {symbol} to watchlist',
  addFooterHint: 'Click a coin to expand platforms · ＋ to add',
  addAgeToday: 'Listed today',
  addAgeDays: '{days}d ago',

  // Network status
  netChecking: 'Checking network…',
  netTypeWifi: 'Wi-Fi',
  netTypeEthernet: 'Ethernet',
  netTypeUnknown: 'Unknown type',
  netPanelTitle: 'Network Status',
  netKeyType: 'Network type',
  netKeyIface: 'Active interface',
  netKeyIpv4: 'IPv4 address',
  netKeyEgress: 'Egress',
  netKeyEgressReason: 'Egress reason',
  netKeyDns: 'DNS status',
  netKeySource: 'Market data source',
  netKeyRefresh: 'Data refresh',
  netKeyTime: 'Checked at',
  netKeyError: 'Last error',
  netEgressProxy: 'Proxy {url} ({ms}ms)',
  netEgressDirect: 'Direct (DoH)',
  netEgressNone: 'All unreachable',
  netEgressProbing: 'Probing…',
  netDnsBlocked: 'Local DNS broken · auto-bypassed',
  netDnsOk: 'Normal',
  netStateOffline: 'Offline',
  netStateOnline: 'Online',
  netStateOnlineLimited: 'Online (limited)',
  netStateOnlineTimeout: 'Online (timeout)',
  netStateProbing: 'Checking…',
  netTitleOffline: 'Offline · no network connection',
  netTitleOnline: 'Online · {type} · {iface} · Egress: {egress}',
  netTitleDegraded: 'Local network OK · external probe failed · Egress: {egress}',
  netTitleTimeout: 'Online (timeout) · {type} · {iface} · Egress: {egress}',
  netCtPrefix: 'Click passes through while click-through is on. Exit it to view details · {title}',
  netClickHint: 'Click to view network details',
  netSrcText: '{label} ({state})',

  // Refresh time
  refreshJustNow: 'Just now',
  refreshSec: '{n}s',
  refreshMin: '{n}m',
  refreshHour: '{n}h',
  refreshTitle: 'Time since the latest market data arrived',

  // Click-through escape button
  ctExitTitle: 'Exit click-through (Ctrl+Shift+X)',

  // Platform bar
  platformView: 'Trade on:',

  // Settings panel
  setTitle: 'Settings',
  setLang: 'Language',
  setSource: 'Data source',
  setQuote: 'Quote asset',
  setProxy: 'Proxy URL',
  setProxyPlaceholder: 'Optional, e.g. http://127.0.0.1:7890',
  setProxyHint: 'Applied immediately: market WebSocket / REST and network probes all go through this proxy',
  setRefreshMode: 'Refresh mode',
  setInterval: 'Poll interval (s)',
  setOpacity: 'Opacity {pct}%',
  setModeRealtime: 'Realtime (WebSocket)',
  setModePoll: 'Polling',
  setDsAuto: 'Auto failover (OKX first)',
  setDsOkx: 'OKX only',
  setDsBinance: 'Binance only',
  setDsBybit: 'Bybit only',
  setDsGate: 'Gate.io only',
  setDsCoingecko: 'CoinGecko only',
  setNetTitle: 'Network Status',
  setKeyConn: 'Connection',
  setAlwaysOnTop: 'Always on top',
  setClickThrough: 'Click-through (mouse passes through)',
  setCtHintOn:
    'Enabled: mouse clicks pass through to apps below. To interact with this window, move the cursor to the top-right button area (exit/settings/minimize), or use the tray menu or Ctrl+Shift+X.',
  setCtHintOff:
    'When enabled, mouse clicks pass through the window. To restore: move the cursor to the top-right buttons, use the tray menu "Exit click-through", or press Ctrl+Shift+X.',
  setAutoStart: 'Launch at startup',
  setMinimalMode: 'Minimal mode',
  setMinimalModeHint:
    'Hide the search bar, logo and toolbar, keeping only the watchlist; the status bar keeps "Unlock / Exit minimal" icon buttons so you can always restore.',
  setDone: 'Done',
  langZh: '中文',
  langEn: 'English',
  // Minimal-mode status bar action buttons (icons only, tooltip text)
  minimalCtTitleOff: 'Enable click-through',
  minimalCtTitleOn: 'Disable click-through',
  minimalExitTitle: 'Exit minimal mode',
};
