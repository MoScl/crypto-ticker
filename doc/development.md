# CryptoTicker 开发指南

> 面向贡献者：环境搭建、代码结构、构建打包、调试与规范。

## 1. 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 16（推荐 18/20/22） | Vite 在 Node<19 的 crypto 问题已由 `scripts/fix-vite-crypto.cjs` 修复（postinstall 自动执行） |
| npm | 随 Node | `npm install` 自动跑 patch-package + Vite 修复 |
| 平台 | Windows / macOS | Linux 未适配（托盘/穿透为 Win/mac 特化） |

## 2. 目录与代码结构

```
src/
├── shared/            # ★ 跨进程唯一共享层
│   ├── types.ts       #   所有接口类型 + AppConfig/DEFAULT_CONFIG/TOP10_COINS
│   └── constants.ts   #   IPC 通道名（IPC 对象）、快捷键、数据源标签
├── main/              # 主进程（Node 侧，tsc 编译到 dist/main）
│   ├── index.ts       #   入口：生命周期、全部 ipcMain、穿透光标轮询
│   ├── windows.ts     #   无边框透明窗口创建
│   ├── tray.ts        #   托盘
│   ├── preload.ts     #   contextBridge 桥
│   ├── config.ts      #   electron-store 读写 + 迁移
│   ├── network.ts     #   网络状态检测/推送
│   ├── http.ts        #   getJson（走出口路由）
│   ├── data/          #   行情：dataSource 调度 + 各交易所适配
│   │   ├── dataSource.ts    # 调度中心（WS+REST链+熔断）
│   │   ├── binance.ts       # WS 流 + REST 快照
│   │   ├── sources/         # okx / bybit / gate
│   │   ├── coingecko.ts     # 快照 + trending + 市值榜
│   │   ├── ranking.ts       # 五类榜单
│   │   └── trending.ts      # 热门榜
│   └── net/           #   智能出口路由：egress / doh / systemProxy / rawRequest / logger
└── renderer/          # 渲染进程（React，vite 构建到 dist/renderer）
    ├── App.tsx        #   根组件：init + IPC 订阅
    ├── main.tsx       #   入口（I18nProvider 包裹）
    ├── components/    #   MiniWindow / CoinRow / AddCoinModal / SettingsPanel /
    │                  #   NetworkIndicator / RefreshTime / PlatformBar / ClickThroughEscape
    ├── store/useAppStore.ts   # zustand 全局状态
    ├── lib/api.ts     #   window.api 类型化封装
    ├── data/          #   platforms.ts（跳转模板）/ coins.ts（币种元数据）
    ├── i18n/          #   zh.ts / en.ts / index.tsx
    └── styles/global.css
```

分层纪律（重要）：

1. **shared 是唯一跨进程层**，不得 import 主/渲染任何一侧的模块。
2. **渲染进程零 Node API**：只能通过 `lib/api.ts` → preload 暴露的 `window.api` → IPC → 主进程。
3. **IPC 通道名一律走 `shared/constants.ts` 的 `IPC` 对象**，禁止裸字符串。
4. 主进程 data 模块间用**延迟 require** 规避循环依赖（见 dataSource.ts）。

## 3. 开发工作流

```bash
npm install     # postinstall: patch-package + fix-vite-crypto
npm run dev     # 三个进程并行：tsc -w（蓝）/ vite（绿）/ electron（青）
```

- 渲染进程改动：Vite HMR 即时生效。
- 主进程改动：`tsc -w` 自动重编译，但需要重启 electron 进程（`Ctrl+C` 后重新 `npm run dev`，或只跑 `npm run dev:electron`）。
- `run.bat` 为 Windows 一键启动脚本（含环境清理，可参考其逻辑）。

### 类型检查

```bash
npm run typecheck   # tsc --noEmit，提交前必须零错误
```

注意：i18n 的 `en: typeof zh` 是**编译期同构校验**——给 zh.ts 加 key 而漏了 en.ts 会直接报错。

## 4. 常见开发任务

### 新增 UI 文案

1. 在 `src/renderer/i18n/zh.ts` 和 `en.ts` **同时**加 key。
2. 组件中 `const { t } = useI18n();` 使用 `t('key')` / `t('key', {name: v})`。
3. 禁止在组件里写死中/英文文案（注释除外）。

### 新增数据源

1. `src/main/data/sources/xxx.ts`：实现 `fetchXxxSnapshot(watchlist, quote, opts): Promise<Ticker[]>`（参考 `sources/okx.ts`）。
2. `shared/types.ts`：`DataSource` 联合类型加 `'xxx'`；`constants.ts` 的 `SOURCE_LABELS` 加双语标签。
3. `dataSource.ts`：`candidates()` 加分支；`fetchBySource()` 加 case。
4. 同步更新 `.agent/architecture.md` 与 `doc/design.md`。

### 新增/修改 IPC

1. `shared/constants.ts` 的 `IPC` 对象加通道名。
2. 主进程 `index.ts` 注册（invoke 用 `ipcMain.handle`，通知用 `ipcMain.on`）。
3. `preload.ts` 暴露到 `window.api`；渲染侧经 `lib/api.ts` 封装。
4. 同步 `.agent/ipc-interfaces.md`。

### 新增配置项

1. `shared/types.ts`：`AppConfig` 加字段 + `DEFAULT_CONFIG` 加默认值（**两处都必须**，旧用户靠合并补默认值）。
2. 若有副作用（窗口/网络/系统），在主进程 `config:save` handler 里应用。
3. `SettingsPanel.tsx` 加 UI；同步 `.agent/config-reference.md`。

## 5. 构建与打包

```bash
npm run build          # dist/main + dist/renderer
npm run dist           # build + electron-builder（Windows 出 NSIS 安装包）
npx electron-builder --mac   # 仅 macOS 上可用，产出 dmg + zip
```

### 打包配置（electron-builder.yml）

| 平台 | 目标 | 说明 |
|---|---|---|
| win | NSIS | 向导式安装、可选目录、per-user；`signAndEditExecutable: false`（跳过 exe 图标注入，见下） |
| mac | dmg + zip | `identity: null` 跳过签名；图标用 `assets/icon.png` 自动转 icns |
| linux | AppImage + deb | 需在 Linux 上构建；图标用 `assets/icon.png`，deb hicolor 用 `icon-512.png` |

所有平台图标统一为 **₿ 金色徽章**（金色径向渐变圆面 + 暗棕 ₿ 字形），由 `scripts/make-icon.mjs` 一键生成，运行时托盘图标（`src/main/tray.ts`）与标题栏 logo（`MiniWindow.tsx` 内联 SVG）同源同几何。

### 打包相关脚本

| 脚本 | 用途 |
|---|---|
| `scripts/make-icon.mjs` | 生成 ₿ 徽章图标：`assets/icon.ico`（win，16–256 多尺寸抗锯齿）与 `icon.png` 1024²（mac）/ `icon-512.png`（linux） |
| `scripts/fix-vite-crypto.cjs` | 修 Vite 5.4 在 Node<19 的 `crypto.getRandomValues` 报错（幂等） |
| `scripts/run-electron.cjs` | electron 启动包装：清 `ELECTRON_RUN_AS_NODE`/`NODE_OPTIONS` 等破坏性环境变量 |
| `scripts/smoke-ranking.cjs` / `smoke-mcap.cjs` / `test-data.cjs` | 数据源冒烟测试（真实网络请求验证榜单/市值/快照） |
| `patches/vite+5.4.21.patch` | patch-package 补丁 |

### 打包踩坑记录（Windows 沙箱/受限环境）

1. **electron-builder 工具镜像**需设 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`（**必须带尾斜杠**）。
2. **NSIS 工具链**可手动预置到 `%LOCALAPPDATA%/electron-builder/Cache/nsis/`（`nsis-3.0.4.1/` + `nsis-resources-3.4.1/`）绕过下载。
3. **winCodeSign 解压失败**（darwin 符号链接权限）→ `win.signAndEditExecutable: false` 跳过，仅影响 exe 文件图标，安装包图标不受影响。
4. Vite build 偶发「清空目录被拦截」→ 先 `rm -rf dist/renderer` 再构建。

## 6. 调试技巧

- **DevTools**：渲染进程是 React，dev 模式下可临时加 `win.webContents.openDevTools()`（`windows.ts`）。
- **网络诊断日志**：主进程 `netLog(event, data)` 会输出出口探测/熔断等事件到 stdout——`npm run dev` 终端可直接看到。
- **数据源冒烟**：`node scripts/smoke-ranking.cjs` 不启动 UI 直接验证榜单 API。
- **单实例锁**：调试多实例前注释 `index.ts` 的 `requestSingleInstanceLock` 段，勿提交。

## 7. 提交前检查清单

- [ ] `npm run typecheck` 零错误
- [ ] UI 新文案同时进了 zh.ts 与 en.ts（同构校验会兜底）
- [ ] IPC 改动同步了 `.agent/ipc-interfaces.md`
- [ ] 配置改动同步了 `.agent/config-reference.md`
- [ ] 新功能在 `doc/user-guide.md`（用户视角）与 `.agent/architecture.md`（AI 视角）有对应说明
- [ ] 涉及网络的改动跑过冒烟脚本
