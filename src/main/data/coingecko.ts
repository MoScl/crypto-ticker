import { getJson, type GetJsonOptions } from '../http';
import type { CoinMeta, Ticker } from '../../shared/types';

/**
 * 常用币 symbol -> CoinGecko id 映射。
 * 2026-08 逐项实测验证：CoinGecko 的 id 与 symbol 并不总是一致
 * （如 HYPE=hyperliquid、ETHFI=ether-fi、SNX=havven、EGLD=elrond-erd-2、SAGA=saga-2），
 * 缺失映射时回退「小写 symbol」直查会拿到空数组，导致该币无数据。
 * 新增币种时请先到 CoinGecko 搜索确认 id 再补充。
 */
const SYMBOL_TO_ID: Record<string, string> = {
  // —— Top 主流 ——
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  TRX: 'tron',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  LTC: 'litecoin',
  SHIB: 'shiba-inu',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AVAX: 'avalanche-2',
  ATOM: 'cosmos',
  XLM: 'stellar',
  BCH: 'bitcoin-cash',
  NEAR: 'near',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  TON: 'toncoin',
  PEPE: 'pepe',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  WBTC: 'wrapped-bitcoin',

  // —— 高市值 / 用户常用 ——
  HYPE: 'hyperliquid', // Hyperliquid（id 不是 hype）
  ETHFI: 'ether-fi', // Ether.fi（id 不是 ethfi）
  INJ: 'injective-protocol',
  EGLD: 'elrond-erd-2', // MultiversX（曾用名 Elrond，id 保持 elrond-erd-2）
  ENA: 'ethena',
  ONDO: 'ondo-finance',
  PENDLE: 'pendle',
  STRK: 'starknet',
  ZK: 'zksync',
  TIA: 'celestia',
  SUI: 'sui',
  SEI: 'sei-network',
  SAGA: 'saga-2',
  AEVO: 'aevo',
  MERL: 'merlin-chain',
  BOME: 'book-of-meme',
  TAO: 'bittensor',
  AKT: 'akash-network',
  WLD: 'worldcoin-wld',
  GMT: 'stepn',
  CAKE: 'pancakeswap-token',
  BNX: 'binaryx',
  CFX: 'conflux-token',
  KAS: 'kaspa',

  // —— 中型市值 ——
  FIL: 'filecoin',
  ICP: 'internet-computer',
  ETC: 'ethereum-classic',
  HBAR: 'hedera-hashgraph',
  SAND: 'the-sandbox',
  MANA: 'decentraland',
  AXS: 'axie-infinity',
  THETA: 'theta-token',
  EOS: 'eos',
  XTZ: 'tezos',
  AAVE: 'aave',
  MKR: 'maker',
  GRT: 'the-graph',
  FTM: 'fantom',
  ALGO: 'algorand',
  FLOW: 'flow',
  CHZ: 'chiliz',
  CRV: 'curve-dao-token',
  SNX: 'havven', // Synthetix 早期名为 Havven
  LDO: 'lido-dao',
  RUNE: 'thorchain',
  KAVA: 'kava',
  NEO: 'neo',
  WAVES: 'waves',
  ZEC: 'zcash',
  DASH: 'dash',
  DCR: 'decred',
  XMR: 'monero',
  KSM: 'kusama',
  COMP: 'compound-governance-token',
  SUSHI: 'sushi',
  YFI: 'yearn-finance',
  BAT: 'basic-attention-token',
  ZIL: 'zilliqa',
  ENJ: 'enjincoin',
  QNT: 'quant-network',
  ONE: 'harmony',
  IOTA: 'iota',
  GALA: 'gala',
  APE: 'apecoin',
  DYDX: 'dydx',
  GMX: 'gmx',
  LRC: 'loopring',
  CELO: 'celo',
  KLAY: 'klay-token',
  WOO: 'woo-network',
  MINA: 'mina-protocol',
  ROSE: 'oasis-network',
  FET: 'fetch-ai',
  RNDR: 'render-token',
  STX: 'blockstack',
  IMX: 'immutable-x',
  JUP: 'jupiter-exchange-solana',
  PYTH: 'pyth-network',
  BLUR: 'blur',
  FLOKI: 'floki',
  WIF: 'dogwifcoin',
  BONK: 'bonk',
  JTO: 'jito-governance-token',
  ALT: 'altlayer',
  MANTA: 'manta-network',
  AI: 'sleepless-ai',
  ARKM: 'arkham',
  PIXEL: 'pixels',
  OMNI: 'omni-network',
  REZ: 'renzo',
  LISTA: 'lista',
  NOT: 'notcoin',
  BB: 'bouncebit',
  ZRO: 'layerzero',
};

/**
 * CoinGecko 兜底快照。auto 模式下 Binance 不可达时启用。
 * 返回的交易对统一记为 `${SYMBOL}USDT` 形式以对齐显示。
 * 自动经出口路由器选择出口（配置代理 / 系统代理 / 本地端口 / 直连）。
 *
 * 实现要点：按 watchlist 的 symbol 解析出 CoinGecko id 查询，
 * 返回结果按 id 反查并**用 watchlist 的 symbol 组装**——
 * CoinGecko 返回的 symbol 可能与标准符号不一致（如 dYdX 返回 ethdydx、
 * RNDR 返回 render），若直接采用会拼出错误交易对导致 UI 匹配不上。
 */
export async function fetchCoinGeckoSnapshot(
  watchlist: CoinMeta[],
  opts: GetJsonOptions = {},
): Promise<Ticker[]> {
  if (watchlist.length === 0) return [];
  const items = watchlist.map((c) => ({
    coin: c,
    id: SYMBOL_TO_ID[c.symbol.toUpperCase()] || c.symbol.toLowerCase(),
  }));
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${items
    .map((i) => i.id)
    .join(',')}&price_change_percentage=24h`;
  const data = (await getJson(url, opts)) as Array<{
    id: string;
    current_price: number;
    price_change_percentage_24h: number | null;
  }>;
  const byId = new Map(data.map((d) => [d.id, d]));
  const out: Ticker[] = [];
  for (const { coin, id } of items) {
    const d = byId.get(id);
    if (!d || d.current_price == null) continue; // CoinGecko 未返回该 id（未上架/id 无效）则跳过
    const base = coin.symbol.toUpperCase();
    out.push({
      symbol: `${base}USDT`,
      base,
      price: d.current_price,
      changePercent: d.price_change_percentage_24h ?? 0,
      source: 'coingecko' as const,
      ts: Date.now(),
    });
  }
  return out;
}
