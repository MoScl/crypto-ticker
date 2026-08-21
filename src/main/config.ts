import Store from 'electron-store';
import { AppConfig, DEFAULT_CONFIG, TOP10_COINS } from '../shared/types';

// 配置持久化。文件名 crypto-ticker-config.json，存于系统用户配置目录。
const store = new Store<{ config: AppConfig }>({ name: 'crypto-ticker-config' });

/** 是否为旧版本默认监控列表（仅 BTC+ETH 两个币）——用于升级迁移到 Top 10 */
function isLegacyDefaultWatchlist(watchlist?: AppConfig['watchlist']): boolean {
  if (!watchlist || watchlist.length !== 2) return false;
  const ids = new Set(watchlist.map((c) => c.id));
  return ids.size === 2 && ids.has('BTCUSDT') && ids.has('ETHUSDT');
}

export function loadConfig(): AppConfig {
  const saved = store.get('config') as AppConfig | undefined;
  if (!saved) {
    const init = structuredClone(DEFAULT_CONFIG);
    store.set('config', init);
    return init;
  }
  // 与默认配置合并，保证新增字段有默认值
  const merged = { ...structuredClone(DEFAULT_CONFIG), ...saved };
  // 旧默认（仅 BTC/ETH）→ 升级为 Top 10 币种（仅对默认列表迁移，用户自定义列表不受影响）
  if (isLegacyDefaultWatchlist(saved.watchlist)) {
    merged.watchlist = structuredClone(TOP10_COINS);
    store.set('config', merged);
  }
  return merged;
}

export function saveConfig(cfg: AppConfig): void {
  store.set('config', cfg);
}
