# 配置参考（AppConfig）

```yaml
doc: config-reference
project: crypto-ticker
audience: AI
source_of_truth: src/shared/types.ts (AppConfig + DEFAULT_CONFIG) + src/main/config.ts
persistence: electron-store, 文件 crypto-ticker-config.json, 位于系统用户配置目录 (app.getPath('userData'))
merge_rule: loadConfig 时 {...DEFAULT_CONFIG, ...saved} —— 新增字段对旧用户自动补默认值
```

## 字段表

| 字段 | 类型 | 默认值 | 取值/约束 | 说明 |
|---|---|---|---|---|
| `watchlist` | `CoinMeta[]` | TOP10_COINS（BTC/ETH/BNB/SOL/XRP/DOGE/ADA/TRX/AVAX/LINK） | — | 监控列表；CoinMeta = `{id, symbol, name, order, coingeckoId?}` |
| `quoteAsset` | `'USDT'\|'USDC'\|'FDUSD'` | `'USDT'` | 三选一 | 计价币；改动触发 WS 重订阅 + 快照 |
| `dataSource` | `DataSource` | `'auto'` | `okx\|binance\|bybit\|gate\|coingecko\|auto` | auto = REST 链全序容灾 |
| `proxyUrl` | `string \| undefined` | 无 | `http://host:port` 或 `host:port`（自动补 http://） | 配置代理；变化时重应用 session.setProxy + 重探网络 + 出口重探 |
| `refreshMode` | `'realtime'\|'poll'` | `'realtime'` | — | realtime=Binance WS；poll=定时快照 |
| `refreshIntervalSec` | `number` | `15` | 实际生效 `max(5, n)` 秒 | poll 模式轮询间隔 |
| `opacity` | `number` | `0.9` | 0.3–1.0 | 窗口透明度 |
| `alwaysOnTop` | `boolean` | `true` | — | 窗口置顶 |
| `clickThrough` | `boolean` | `false` | — | 点击穿透（Ctrl+Shift+X 可切） |
| `autoStart` | `boolean` | `false` | — | 开机自启（app.setLoginItemSettings） |
| `theme` | `'dark'` | `'dark'` | 当前仅 dark | 预留主题字段 |
| `language` | `'zh'\|'en'` | `'zh'` | — | 界面语言，设置面板即时切换 |
| `windowBounds` | `{x?,y?,w,h} \| undefined` | 无 | — | 窗口尺寸持久化（resize 时写入） |

## 修改配置的注意事项（AI 必读）

1. **新增字段**：必须同时在 `AppConfig` 接口和 `DEFAULT_CONFIG` 中添加，否则旧用户配置合并后为 `undefined`。
2. **保存路径**：渲染进程只经 zustand `patchConfig`（内部 `api.saveConfig` 全量保存）；主进程侧变更（托盘/快捷键）直接改 `appConfig` + `saveConfig` + `broadcastConfig()`。
3. **副作用集中在主进程 `config:save` handler**：透明度/置顶/穿透/自启的即时应用、代理重探、`dataService.update(cfg)`。新增带副作用的配置在此扩展。
4. **迁移逻辑**：`config.ts` 的 `isLegacyDefaultWatchlist` 会把旧版默认列表（仅 BTC/ETH）迁移为 Top10；仅命中「默认两币」特征时触发，不碰用户自定义列表。
5. 配置文件位置（Windows）：`%APPDATA%/crypto-ticker/crypto-ticker-config.json`。

## 相关常量

| 常量 | 值 | 位置 |
|---|---|---|
| `CLICK_THROUGH_ACCELERATOR` | `CommandOrControl+Shift+X` | shared/constants.ts |
| 熔断阈值 | 连续失败 3 次 | DataService.FAIL_THRESHOLD |
| 熔断冷却 | 120 秒 | DataService.COOLDOWN_MS |
| 出口健康 TTL | 60 秒 | egress.TTL_MS |
| 出口探测超时 | 6 秒 / 端口扫描 400ms | egress |
| 本地代理端口候选 | 7897,7890,7891,1080,10809,10808,8888,8118,2080 | egress.LOCAL_PORTS |
| 榜单条数 | 15 | ranking.RANK_LIMIT |
