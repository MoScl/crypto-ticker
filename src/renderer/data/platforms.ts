// 交易平台 / 行情站跳转定义：榜单弹窗与自选列表共用
export interface PlatformDef {
  id: string;
  label: string;
  color: string;
  /** 根据币种符号（及可选 CoinGecko id）拼出详情 / 交易页 URL */
  build: (symbol: string, coingeckoId?: string) => string;
}

export const PLATFORMS: PlatformDef[] = [
  {
    id: 'binance',
    label: 'Binance',
    color: '#f0b90b',
    build: (symbol) => `https://www.binance.com/zh-CN/trade/${symbol}_USDT`,
  },
  {
    id: 'okx',
    label: 'OKX',
    color: '#e8710c',
    build: (symbol) => `https://www.okx.com/zh-hans/trade-spot/${symbol.toLowerCase()}-usdt`,
  },
  {
    id: 'gate',
    label: 'Gate.io',
    color: '#7a5cff',
    build: (symbol) => `https://www.gate.io/trade/${symbol}_USDT`,
  },
  {
    id: 'coingecko',
    label: 'CoinGecko',
    color: '#8dc647',
    build: (symbol, coingeckoId) =>
      coingeckoId
        ? `https://www.coingecko.com/en/coins/${coingeckoId}`
        : `https://www.coingecko.com/en/coins/${symbol.toLowerCase()}`,
  },
];
