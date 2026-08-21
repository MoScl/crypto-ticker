# IPC 接口契约

```yaml
doc: ipc-interfaces
project: crypto-ticker
audience: AI
source_of_truth: src/shared/constants.ts (IPC 对象) + src/main/index.ts + src/main/preload.ts
rule: 修改 IPC 时必须三处同步 —— shared/constants.ts 通道名 / main/index.ts 或 preload.ts 实现 / 本文档
```

通用约束：
- 通道名常量集中在 `src/shared/constants.ts` 的 `IPC` 对象，禁止裸字符串。
- 渲染进程只能经 `src/renderer/lib/api.ts` 调用（preload contextBridge 暴露的 `window.api`）。
- 主→渲染推送均为 `webContents.send`；渲染→主查询用 `ipcRenderer.invoke`（返回 Promise），通知用 `ipcRenderer.send`。

## 1. 配置

| 通道 | 方向 | 机制 | Payload | 语义 |
|---|---|---|---|---|
| `config:get` | R→M | invoke | 无 → `AppConfig` | 拉取当前完整配置（启动时） |
| `config:save` | R→M | invoke | `AppConfig` → void | 保存全量配置；主进程应用：透明度/置顶/穿透/自启/代理（代理变化会重探网络）并 `dataService.update(cfg)` |
| `config:changed` | M→R | send | `AppConfig` | 主进程侧变更（托盘/快捷键切穿透）广播同步界面 |

## 2. 窗口控制

| 通道 | 方向 | 机制 | Payload | 语义 |
|---|---|---|---|---|
| `window:set-opacity` | R→M | send | `number` (0.3–1.0) | 设置窗口透明度并持久化 |
| `window:set-always-on-top` | R→M | send | `boolean` | 置顶开关并持久化 |
| `window:hide` | R→M | send | 无 | 隐藏窗口（托盘驻留） |
| `window:show` | R→M | send | 无 | 显示并聚焦窗口 |
| `window:minimize` | R→M | send | 无 | 最小化 |
| `window:resize` | R→M | send | `(w: number, h: number)` | setSize 并把尺寸存入 `windowBounds` |
| `window:set-click-through` | R→M | send | `boolean` | 切换穿透（设置面板入口，统一走 setClickThroughState） |

## 3. 点击穿透（穿透态交互协议）

| 通道 | 方向 | 机制 | Payload | 语义 |
|---|---|---|---|---|
| `window:click-through-btn-rect` | R→M | send | `{x,y,w,h} \| null` | 上报右上角按钮区相对矩形；主进程光标轮询命中判定用 |
| `window:click-through-hold` | R→M | send | `boolean` | true=设置面板打开需保持整窗交互 |
| `window:click-through-hover-state` | M→R | send | `boolean` | 当前是否处于临时可交互态（渲染侧按钮高亮） |

## 4. 行情数据

| 通道 | 方向 | 机制 | Payload | 语义 |
|---|---|---|---|---|
| `ticker:update` | M→R | send | `Ticker` | WS 实时单条推送 |
| `ticker:snapshot` | M→R | send | `Ticker[]` | REST 快照批量推送 |
| `source:status` | M→R | send | `SourceStatus` | 数据源健康状态（ok/degraded/detail） |

## 5. 榜单与外部跳转

| 通道 | 方向 | 机制 | Payload | 语义 |
|---|---|---|---|---|
| `coins:fetch-trending` | R→M | invoke | 无 → `CoinEntry[]` | CoinGecko 热门榜 |
| `coins:fetch-ranking` | R→M | invoke | `RankingKind` → `CoinEntry[]` | 涨幅/跌幅/新币/市值/成交额榜（top15） |
| `shell:open-external` | R→M | send | `string` (url) | 经域名白名单校验后浏览器打开；失败静默忽略 |

## 6. 网络

| 通道 | 方向 | 机制 | Payload | 语义 |
|---|---|---|---|---|
| `network:get` | R→M | invoke | 无 → `NetworkStatus` | 主动查询（先 refresh 再返回） |
| `network:changed` | M→R | send | `NetworkStatus` | 网络状态变化推送 |

## 7. Payload 类型定义（摘自 shared/types.ts）

```ts
interface Ticker { symbol: string; base: string; price: number; changePercent: number; source: DataSource; ts: number }
interface SourceStatus { source: string; ok: boolean; degraded?: boolean; detail?: string }
interface CoinEntry { symbol: string; name: string; coingeckoId?: string; rank?: number; priceChange24h?: number | null; volume24h?: number; marketCap?: number; listedAt?: number }
type RankingKind = 'gainers' | 'losers' | 'new' | 'marketcap' | 'volume'
interface NetworkStatus { online: boolean; reachable: boolean; degraded: boolean; type: 'wifi'|'ethernet'|'unknown'; interfaceName: string|null; ipv4: string|null; egress: EgressInfo|null; dnsBlocked: boolean; lastError: string|null; ts: number }
interface EgressInfo { mode: 'proxy'|'direct'; proxyUrl: string|null; latencyMs: number; reason: string }
```
