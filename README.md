# CryptoTicker

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg)](#download)
[![Electron](https://img.shields.io/badge/Electron-30-47848F?logo=electron&logoColor=white)](#tech-stack)

**A tiny always-on-top desktop widget for crypto prices.** Frameless, transparent, click-through-capable — real-time tickers live in the corner of your screen and never get in your way. One click jumps straight to the exchange.

[简体中文](./README.zh-CN.md)

---

## Why CryptoTicker

Keeping a browser tab open for prices is heavy and distracting; most ticker tools simply break behind proxies or polluted DNS. CryptoTicker is built for both problems:

- **Lightweight** — a frameless translucent mini window pinned in a corner. Nothing but the prices you care about.
- **Resilient** — multi-source failover (OKX → Binance → Bybit → Gate → CoinGecko) plus a **smart egress router** (your proxy → system proxy → local port scan → DoH direct) that survives proxied and DNS-hijacked networks without any configuration.
- **Fast** — Binance WebSocket push for millisecond updates; jump to the trading page in one click.

## Features

| | |
|---|---|
| 🪟 **Floating widget** | Frameless transparent always-on-top window · opacity 30–100% · drag to move · resize handle · size remembered |
| ⭐ **Watchlist** | Add/remove coins · drag to reorder · multi-select batch actions · default Top 10 by market cap |
| ⚡ **Live quotes** | Binance WebSocket real-time push · REST snapshot failover chain · per-source circuit breaker (3 fails → 120s cooldown) |
| 🔀 **Data control** | Source: OKX / Binance / Bybit / Gate.io / CoinGecko / Auto · quote asset USDT / USDC / FDUSD · realtime or polling mode |
| 🔍 **Discover coins** | Search + 7 rankings: Major · Trending · Gainers · Losers · New listings · Market cap · Volume |
| 🖱 **Click-through** | The window becomes a "sticker" — clicks pass through to apps below. Toggle anytime with `Ctrl+Shift+X`; smart hover detection keeps the buttons clickable |
| 🌐 **Smart networking** | Egress router: configured proxy → system proxy → local port scan → DoH direct · network diagnostics panel (connectivity, egress, DNS-hijack detection) |
| 🚀 **One-click trading** | Jump to the exact trading pair page on Binance / OKX / Gate.io (domain-whitelisted) |
| 🧩 **Desktop-friendly** | System tray · launch at startup · single instance · HiDPI · English / 简体中文 UI |

> Note: price colors follow the convention used by Chinese exchanges — red = up, green = down.

## Download

Prebuilt installers are available for Windows (NSIS setup) and macOS (dmg). The app is unsigned; on first launch, choose **More info → Run anyway** (Windows SmartScreen) or right-click → Open (macOS).

## Quick Start (from source)

```bash
npm install   # auto-applies patch-package fixes
npm run dev   # tsc watch + vite + electron, in parallel
```

Requirements: Node.js ≥ 16 (18/20/22 recommended). See the [development guide](doc/development.md) for details.

### Build installers

```bash
npm run dist                 # Windows: release/CryptoTicker Setup x.x.x.exe (NSIS)
npx electron-builder --mac   # macOS only: dmg + zip
```

## Usage

- **Move / resize**: drag the title bar; drag the bottom-right handle.
- **Add coins**: type a symbol in the bottom search box (autocomplete + Enter), or open the rankings modal via the bar-chart button and click **＋** on any row of the 7 tabs.
- **Remove coins**: enter multi-select mode (checkmark button) → select rows → **Remove**.
- **Click-through**: enable it in Settings, the tray menu, or with `Ctrl+Shift+X`. While on, the window ignores clicks except over the top-right buttons (auto-detected) or an open settings panel.
- **Quit**: tray right-click → Quit (the window ✕ button only hides it).

Full reference: [User Guide](doc/user-guide.md).

## Tech Stack

Electron 30 · React 18 · TypeScript 5.5 · Vite 5 · Zustand 4 · electron-store · ws — plus a hand-rolled HTTP/DoH layer for the smart egress router. No API keys required for any data source.

```
Main process                      Renderer (React + Zustand)
├── DataService  ← WS + REST chain    ├── MiniWindow / CoinRow
├── Egress router (proxy/DoH)         ├── AddCoinModal (7 rankings)
├── Network monitor                   ├── SettingsPanel / NetworkIndicator
├── Click-through cursor poller       └── i18n (zh/en, compile-time checked)
└── Tray / shortcuts / config
        └──────── IPC (shared/constants.ts) ────────┘
```

Architecture deep-dive: [design doc](doc/design.md) · machine-readable docs: [`.agent/`](.agent/README.md)

## Project Structure

```
src/shared/    Types + IPC channel names (single source of truth)
src/main/      Window, tray, egress router, quote scheduling, exchange adapters
src/renderer/  React UI, zustand store, i18n
doc/           Human-readable docs (overview / user guide / dev guide / design)
.agent/        Machine-readable docs (architecture, dataflow, IPC, config)
```

## Documentation

| Doc | Audience |
|---|---|
| [Project overview](doc/overview.md) | Everyone — background, features, architecture |
| [User guide](doc/user-guide.md) | End users |
| [Development guide](doc/development.md) | Contributors |
| [Design doc](doc/design.md) | Architecture decisions |
| [`.agent/`](.agent/README.md) | AI agents & tooling |

## Roadmap / Limitations

- Multi-watchlist / multi-window
- Light theme (field reserved)
- Auto-update via electron-updater
- Linux support

## Contributing

PRs are welcome. Before submitting: `npm run typecheck` must pass with zero errors; new UI strings must be added to both `src/renderer/i18n/zh.ts` and `en.ts` (a compile-time check enforces this); IPC/config changes should be reflected in `.agent/ipc-interfaces.md` / `.agent/config-reference.md`. See the [development guide](doc/development.md).

## License

[MIT](LICENSE)
