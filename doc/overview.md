# CryptoTicker 项目总览

> 桌面加密货币价格监控悬浮窗 —— 让行情始终在屏幕一角，不打扰工作。
>
> 技术栈：Electron 30 · React 18 · TypeScript 5.5 · Vite 5 · Zustand 4

## 1. 项目背景与目标

盯盘的人往往面临两难：开交易网页太重（整页图表+广告+噪声），切窗口又打断心流；而企业网络环境下（代理、DNS 劫持）很多行情工具直接连不上。

CryptoTicker 的目标：

1. **轻**：一个无边框透明小窗贴在屏幕角落，只显示你最关心的价格和涨跌。
2. **稳**：多数据源自动容灾 + 智能网络出口路由，在代理/被污染网络下依然有数据。
3. **快**：WebSocket 实时推送，毫秒级感知价格变化，一键跳转交易所下单。

## 2. 核心功能清单

| 分类 | 功能 |
|---|---|
| 悬浮窗 | 无边框透明置顶小窗 · 透明度调节（30%–100%）· 自由拖拽 · 右下角缩放 · 尺寸记忆 |
| 自选列表 | 增删币种 · 拖拽排序 · 多选批量操作 · 默认市值 Top 10 |
| 行情 | Binance WebSocket 实时推送 · 多源 REST 容灾（OKX→Binance→Bybit→Gate→CoinGecko）· 单源熔断冷却 · 涨跌幅高亮（涨红跌绿） |
| 数据控制 | 数据源手动指定/自动 · 计价币切换（USDT/USDC/FDUSD）· 实时/轮询模式（≥5s） |
| 找币 | 搜索 + 7 大榜单：主流币 · 热门 · 涨幅 · 跌幅 · 新币 · 市值 · 成交额 |
| 交易跳转 | 一行内直达 Binance / OKX / Gate.io 对应交易页（域名白名单安全校验） |
| 穿透 | 点击穿透模式（鼠标穿透到下层应用）· 全局快捷键 `Ctrl+Shift+X` 随时切换 · 穿透态智能识别按钮悬停 |
| 网络 | 智能出口路由（配置代理→系统代理→本地端口探测→DoH 直连）· 网络诊断面板（连通性/出口/DNS 劫持检测） |
| 系统 | 托盘常驻 · 开机自启 · 单实例 · 高 DPI 适配 · 中英文界面 |

## 3. 系统架构

Electron 三进程架构，主进程负责一切系统能力与网络，渲染进程只做 UI：

```
┌─────────────────────── 主进程 (Node.js) ───────────────────────┐
│ 生命周期/托盘/全局快捷键     IPC 路由       点击穿透光标轮询器      │
│ ┌────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│ │ DataService │  │ 智能出口路由器 │  │ 网络状态监控 network      │ │
│ │  行情调度    │→ │ egress       │  │ (在线/降级/DNS劫持)      │ │
│ │ WS+REST链   │  │ 代理→系统→端口 │  └─────────────────────────┘ │
│ │ 熔断冷却    │  │ →DoH直连     │  config (electron-store)     │
│ └────────────┘  └──────────────┘                               │
└────────────────────────┬───────────────────────────────────────┘
                    IPC（通道名集中于 shared/constants.ts）
┌────────────────────────┴───────────────────────────────────────┐
│ preload: contextBridge 白名单桥 window.api（contextIsolation） │
└────────────────────────┬───────────────────────────────────────┘
┌────────────────────────┴───────────────────────────────────────┐
│ 渲染进程 (React 18 + Zustand)                                  │
│ MiniWindow → CoinRow / AddCoinModal / SettingsPanel /           │
│ NetworkIndicator / PlatformBar / ClickThroughEscape + i18n     │
└─────────────────────────────────────────────────────────────────┘
```

各模块职责、依赖图与数据流详见 [设计文档](./design.md)；机器可读版本见 `.agent/` 目录。

## 4. 技术栈说明

| 层 | 选型 | 理由 |
|---|---|---|
| 壳 | Electron 30 | 跨平台桌面 + 透明无边框窗口 + 系统托盘/全局快捷键 |
| UI | React 18 + TypeScript | 组件化 + 类型安全（`tsc --noEmit` 零错误） |
| 构建 | Vite 5（渲染）+ tsc（主进程） | 快速 HMR；主进程保持 Node 产物 |
| 状态 | Zustand 4 | 轻量、无样板代码、天然支持 IPC 推送写入 |
| 持久化 | electron-store | JSON 配置，无需数据库 |
| 网络 | ws + 自研 rawRequest/DoH | 应对代理与 DNS 劫持场景，axios 等不满足定制需求 |
| i18n | 自研（约 120 key） | 零依赖；`en: typeof zh` 编译期强制双语言包同构 |
| 打包 | electron-builder | NSIS（Windows）/ dmg+zip（macOS） |

## 5. 目录结构

```
crypto-ticker/
├── src/
│   ├── shared/          # 跨进程共享：类型定义、IPC 通道名、常量
│   ├── main/            # 主进程：窗口/托盘/穿透/网络出口路由/行情调度
│   │   ├── data/        #   数据源适配器（OKX/Binance/Bybit/Gate/CoinGecko）
│   │   └── net/         #   智能出口路由器、DoH、系统代理、原始请求
│   └── renderer/        # 渲染进程：React 组件、zustand store、i18n
├── .agent/              # AI 可读文档（结构化：架构/数据流/IPC/配置）
├── doc/                 # 人类阅读文档（本文档/用户手册/开发指南/设计文档）
├── scripts/             # 图标生成、Vite 兼容修复、启动包装、冒烟测试
├── patches/             # patch-package 补丁（Vite Node<19 crypto 问题）
├── assets/              # 应用图标（icon.ico / icon.png）
├── electron-builder.yml # 打包配置
└── run.bat              # Windows 一键启动
```

## 6. 运行与部署

### 开发运行

```bash
npm install          # 自动应用 patch-package 补丁与 Vite 修复
npm run dev          # tsc -w + vite + electron 三进程并行
```

### 生产构建

```bash
npm run build        # 主进程 tsc + 渲染进程 vite → dist/
npm run dist         # build + electron-builder → release/ 安装包
npx electron-builder --mac   # 需在 macOS 上执行，产出 dmg + zip
```

### 分发产物

- **Windows**：`release/CryptoTicker Setup x.x.x.exe`（NSIS 向导式安装包，可选安装目录）
- **macOS**：`release/CryptoTicker-x.x.x.dmg` + `.zip`（未签名，首次打开需右键→打开）

详细步骤见 [开发指南](./development.md)。

## 7. 文档地图

| 文档 | 受众 |
|---|---|
| [用户手册](./user-guide.md) | 最终用户：安装、界面、每个功能怎么用 |
| [开发指南](./development.md) | 贡献者：环境搭建、代码结构、构建打包、调试技巧 |
| [设计文档](./design.md) | 架构师/深度贡献者：架构决策、关键机制设计、技术选型缘由 |
| `.agent/*.md` + `project-manifest.json` | AI/工具：结构化机器可读版本，与本文档一一呼应 |
| `README.md` / `README.zh-CN.md` | 开源首页（英/中双语，内容一致） |
