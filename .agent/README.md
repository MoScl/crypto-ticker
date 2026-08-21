# .agent — AI 可读文档索引

> 本目录面向 AI（LLM / Agent / 代码生成工具）设计，采用结构化、机器可解析的格式。
> 人类阅读文档见 `doc/` 目录；两套文档信息互相呼应、内容一致。
> 修改代码时请同步更新本目录对应文档。

```yaml
project: crypto-ticker
version: 0.1.0
description: 桌面加密货币价格监控悬浮窗（Electron + React）
license: MIT
docs_language: zh-CN
last_synced: 2026-08-21
```

## 文件清单

| 文件 | 内容 | 消费场景 |
|---|---|---|
| [`project-manifest.json`](./project-manifest.json) | 项目元数据（技术栈、目录、脚本、数据源、快捷键），纯 JSON 可直接解析 | 快速理解项目全貌、生成脚手架 |
| [`architecture.md`](./architecture.md) | 系统架构、模块职责表、模块依赖图（Mermaid + 结构化列表） | 理解代码组织、定位改动影响面 |
| [`dataflow.md`](./dataflow.md) | 行情数据流、配置流、网络出口选路流、点击穿透交互流 | 理解运行时行为与数据流向 |
| [`ipc-interfaces.md`](./ipc-interfaces.md) | 全部 IPC 通道定义（通道名、方向、payload 类型、语义） | 新增/修改 IPC 时的契约参照 |
| [`config-reference.md`](./config-reference.md) | AppConfig 字段表、默认值、持久化位置、迁移规则 | 修改配置结构时的参照 |

## 快速导航（按任务）

- 改 UI / 文案 → `architecture.md` §renderer + `src/renderer/i18n/`
- 加数据源 → `architecture.md` §main/data + `ipc-interfaces.md`
- 改 IPC → 必须先改 `src/shared/constants.ts` 的 `IPC` 对象，再同步 `ipc-interfaces.md`
- 改配置项 → `src/shared/types.ts`（AppConfig + DEFAULT_CONFIG）+ `config-reference.md`
- 打包发布 → `doc/development.md` §构建与打包
