// 跨主进程 / 渲染进程共享的类型与默认配置

export type QuoteAsset = 'USDT' | 'USDC' | 'FDUSD';
export type DataSource = 'okx' | 'binance' | 'bybit' | 'gate' | 'coingecko' | 'auto';
export type RefreshMode = 'realtime' | 'poll';
export type AppLanguage = 'zh' | 'en';

/** 监控列表中的单个币种元数据 */
export interface CoinMeta {
  id: string; // 内部唯一 id，如 "BTCUSDT"
  symbol: string; // 基础币符号，如 "BTC"
  name: string; // 中文/英文名称，如 "Bitcoin"
  order: number; // 自定义排序权重
  /** CoinGecko id（可选，用于拼详情页跳转链接） */
  coingeckoId?: string;
}

/** 全局配置（持久化到 electron-store） */
export interface AppConfig {
  watchlist: CoinMeta[];
  quoteAsset: QuoteAsset;
  dataSource: DataSource;
  proxyUrl?: string;
  refreshMode: RefreshMode;
  refreshIntervalSec: number;
  opacity: number; // 0.3 - 1.0
  alwaysOnTop: boolean;
  clickThrough: boolean;
  autoStart: boolean;
  theme: 'dark';
  language: AppLanguage; // 界面语言：zh 中文 / en English
  windowBounds?: { x?: number; y?: number; w: number; h: number };
}

/** 当前网络出口（智能出口路由器探测结果） */
export interface EgressInfo {
  mode: 'proxy' | 'direct'; // proxy=走代理隧道；direct=DoH解析后直连
  proxyUrl: string | null; // 选中的代理地址（直连为 null）
  latencyMs: number; // 出口探测耗时；-1 表示全部出口不可达
  reason: string; // 选择原因（日志/诊断展示）
}

/** 网络连接状态（主进程检测并推送） */
export interface NetworkStatus {
  online: boolean; // 系统级在线状态（net.isOnline()）
  reachable: boolean; // 实际连通性（任一探测端点成功）
  degraded: boolean; // 降级：本地网络可达但国际/外网探测失败（如代理未生效）
  type: 'wifi' | 'ethernet' | 'unknown'; // 网络类型
  interfaceName: string | null; // 活动网卡名，如 "WLAN" / "Ethernet"
  ipv4: string | null; // 本机 IPv4
  egress: EgressInfo | null; // 当前出口（智能路由）
  dnsBlocked: boolean; // 系统 DNS 被劫持/失效（DoH 可解析但系统解析失败）
  lastError: string | null; // 最近一次网络错误摘要
  ts: number; // 检测时间戳
}

/** 行情数据源状态（主进程推送）。degraded=true 表示有数据但非实时主通道（如 WS 断线走 REST 兜底） */
export interface SourceStatus {
  source: string;
  ok: boolean;
  degraded?: boolean;
  detail?: string; // 诊断详情：出口、降级原因等
}

/** 实时行情（主进程推送） */
export interface Ticker {
  symbol: string; // 交易对，如 "BTCUSDT"
  base: string; // 基础币，如 "BTC"
  price: number;
  changePercent: number; // 24h 涨跌幅(%)
  source: DataSource;
  ts: number;
}

/** 币种榜单条目（主流榜 / 热门榜 / 涨幅 / 跌幅 / 新币 / 市值 / 成交额榜通用） */
export interface CoinEntry {
  symbol: string; // 基币符号（大写），如 "HYPE"
  name: string; // 全名
  coingeckoId?: string; // CoinGecko id（用于拼详情页链接）
  rank?: number; // 榜单序号（1 起）
  priceChange24h?: number | null; // 24h 涨跌幅%（热门/涨幅/跌幅榜提供）
  volume24h?: number; // 24h 成交额（USD，成交额榜提供）
  marketCap?: number; // 市值（USD，市值榜提供）
  listedAt?: number; // 上线时间戳（ms，新币榜提供）
}

/** 榜单种类：涨幅 / 跌幅 / 新币 / 市值 / 成交额 */
export type RankingKind = 'gainers' | 'losers' | 'new' | 'marketcap' | 'volume';

/** 市值 Top 10 币种（按市值排序，USDT 计价），用于初始默认监控列表与一键恢复 */
export const TOP10_COINS: CoinMeta[] = [
  { id: 'BTCUSDT', symbol: 'BTC', name: 'Bitcoin', order: 0 },
  { id: 'ETHUSDT', symbol: 'ETH', name: 'Ethereum', order: 1 },
  { id: 'BNBUSDT', symbol: 'BNB', name: 'BNB', order: 2 },
  { id: 'SOLUSDT', symbol: 'SOL', name: 'Solana', order: 3 },
  { id: 'XRPUSDT', symbol: 'XRP', name: 'XRP', order: 4 },
  { id: 'DOGEUSDT', symbol: 'DOGE', name: 'Dogecoin', order: 5 },
  { id: 'ADAUSDT', symbol: 'ADA', name: 'Cardano', order: 6 },
  { id: 'TRXUSDT', symbol: 'TRX', name: 'TRON', order: 7 },
  { id: 'AVAXUSDT', symbol: 'AVAX', name: 'Avalanche', order: 8 },
  { id: 'LINKUSDT', symbol: 'LINK', name: 'Chainlink', order: 9 },
];

export const DEFAULT_CONFIG: AppConfig = {
  watchlist: structuredClone(TOP10_COINS),
  quoteAsset: 'USDT',
  dataSource: 'auto',
  refreshMode: 'realtime',
  refreshIntervalSec: 15,
  opacity: 0.9,
  alwaysOnTop: true,
  clickThrough: false,
  autoStart: false,
  theme: 'dark',
  language: 'zh',
};
