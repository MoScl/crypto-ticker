# CryptoTicker 设计文档

> 架构决策、关键机制设计与技术选型缘由。机器可读版本见 `.agent/`（architecture.md / dataflow.md）。

## 1. 总体架构决策

### 1.1 三进程 + 唯一共享层

```
主进程（一切系统能力与网络） ⇄ IPC ⇄ preload 白名单桥 ⇄ 渲染进程（纯 UI）
                    └────── shared/（类型 + IPC 通道名）──────┘
```

**决策**：
- 所有交易所请求放**主进程**而非渲染进程——绕开 CORS、可自由定制代理/DNS 行为、网络状态全局一致。
- `shared/` 只放类型与常量，不放逻辑；主↔渲染通信**只有 IPC 一条路**，通道名集中 `constants.ts` 的 `IPC` 对象，杜绝拼写错误与私设通道。
- 安全基线：`contextIsolation: true` + `nodeIntegration: false`，渲染进程被注入也无法直接触达 Node；外链经主进程**域名白名单**校验后才 `shell.openExternal`。

### 1.2 渲染层选型：React + Zustand，不用 Redux/路由

小工具单窗口，无路由需求；Zustand 的 `set()` 天然适合「IPC 推送即写入」的模式（`applyTicker/applySnapshot/setNetworkStatus` 全是主进程推送的落点）。配置变更用 `patchConfig`（浅合并 → 全量保存 → 主进程应用副作用）单向闭环。

### 1.3 i18n 自研而非 react-i18next

约 120 个 key 的静态双语言，引 i18next（+运行时）得不偿失。核心技巧：`export const en: typeof zh = {...}` 让 TypeScript **在编译期强制两个语言包同构**——漏 key 直接构建失败，比运行时缺 key 报错可靠得多。语言存 `AppConfig.language` 持久化，切换即时生效。

## 2. 关键机制设计

### 2.1 行情调度：WS 实时 + REST 容灾链 + 熔断（`main/data/dataSource.ts`）

```
Binance WS（实时主通道，断线自动重连）
     │ 断线 → 降级标记 + 触发快照
     ▼
REST 快照链（auto 模式）：OKX → Binance → Bybit → Gate → CoinGecko
     │ 任一成功即停；第 2 顺位起 = 「兜底生效」状态
     │ 单源连续失败 3 次 → 熔断冷却 120s → 到期自动恢复试探
     ▼
ticker:update / ticker:snapshot / source:status → 渲染进程
```

**三级状态语义**（`SourceStatus`）：`ok+非degraded`＝实时主通道正常；`ok+degraded`＝有数据但走兜底（WS 断线 REST 兜底/备源）；`ok=false`＝无数据。状态栏黄点即 degraded——用户能区分「有数据」与「数据健康」。

**出口联动**：订阅 `onEgressChanged`，代理恢复/切换后防抖 300ms 自动刷新快照，数据尽快自愈。

### 2.2 智能出口路由器（`main/net/egress.ts`）—— 网络层的核心设计

针对三类真实故障：本地 DNS 被劫持（如安全软件抢占 127.0.0.1:53）、代理存在但未配置进应用、直连可达但解析失败。

```
候选出口链（并行探测，取首个连通）：
  1. 配置代理（设置面板 proxyUrl）
  2. 系统代理（Windows 注册表，Clash 等开启「系统代理」时写入）
  3. 本地代理端口扫描（7897/7890/7891/1080/10809/10808/8888/8118/2080）
  4. 直连兜底（DoH 解析：doh.pub / alidns）
```

设计要点：
- **代理 CONNECT 隧道天然绕过本地 DNS 劫持**：域名解析由代理远端完成，本地 53 端口被谁占都不影响。
- **直连场景用 DoH** 同样绕开本地被污染的解析。
- 60s TTL 健康缓存；**请求失败即时失效重探**；探针第一顺位与真实业务同源（CoinGecko ping）避免「探针通业务不通」。
- 产出 `EgressInfo {mode, proxyUrl, latencyMs, reason}` 直供网络诊断面板，可解释性强。

### 2.3 点击穿透的光标轮询方案（Windows 特化）

**问题**：`setIgnoreMouseEvents(true, {forward:true})` 的鼠标转发依赖窗口焦点——失焦后渲染进程收不到任何鼠标事件，穿透态下的退出按钮会永久「点不动」。

**方案**：穿透期间主进程每 **100ms** 轮询 `screen.getCursorScreenPoint()`（不依赖窗口是否收到消息）。判定规则：
- 光标命中**右上角按钮矩形**（渲染进程经 IPC 上报相对坐标）→ 临时恢复交互 + `win.focus()`（修「无边框失焦窗首击只激活不触发 click」）；
- 设置面板打开（hold 信号）→ 保持整窗交互；
- 其余位置 → 纯穿透。

刻意不做「光标在窗口内就恢复交互」——那会让穿透形同虚设。全局快捷键 `Ctrl+Shift+X` 作为穿透/隐藏态下的保底退出手段，系统级注册不受窗口鼠标屏蔽影响。

### 2.4 榜单数据源策略（免 API key 前提）

| 榜单 | 数据源 | 备注 |
|---|---|---|
| 涨幅/跌幅/成交额 | OKX 全量现货 tickers | 一次拉取复用三榜；与行情主源一致 |
| 新币 | Gate.io currency_pairs | `buy_start` 降序；`st_tag` + `/[0-9][LS]$/` 双过滤杠杆代币（ORDI3S/LAB3L 类） |
| 市值 | CoinGecko markets | 无 key 易 429 → **降级 CoinCap assets** |
| 热门 | CoinGecko trending | — |

全部走出口路由器，无需任何 API key。

### 2.5 穿透/托盘/快捷键的配置同步

同一配置可能从三个入口变更（设置面板 IPC / 托盘菜单 / 全局快捷键）。统一收敛到主进程 `setClickThroughState()`：改 `appConfig` → `saveConfig` → 应用窗口 → 刷新托盘勾选态 → `config:changed` 广播渲染进程。避免「托盘切了、界面复选框还显示旧值」的状态漂移。

### 2.6 配置迁移

`loadConfig()` 用 `{...DEFAULT_CONFIG, ...saved}` 合并——新增配置字段对存量用户自动补默认值；另含一次性迁移：旧版默认列表（仅 BTC/ETH）升级为 Top 10（严格匹配特征，不误伤自定义列表）。

## 3. 安全设计清单

| 措施 | 位置 |
|---|---|
| contextIsolation + 禁 nodeIntegration | windows.ts |
| preload 白名单桥（仅暴露业务 API） | preload.ts |
| 外链域名白名单（12 个交易所/社交域，仅 https） | index.ts `openExternalSafe` |
| 单实例锁 | index.ts |
| 退出时注销全局快捷键与轮询定时器 | will-quit |

## 4. 已知限制与演进方向

- **单窗口单列表**：多监视列表/多窗口需重构窗口管理（当前 BrowserWindow 单例）。
- **mac 构建未验证**：配置已就绪（dmg+zip、identity:null），需真机跑一次。
- **主题**：`theme` 字段预留，当前仅 dark。
- **行情源加权**：容灾链是固定顺序，可演进为按历史成功率动态排序。
- **自动更新**：未接入 electron-updater，发版靠安装包覆盖。
- **Linux**：托盘/穿透逻辑为 Win/mac 特化，未适配。
