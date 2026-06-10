# Depic

[English](#english) | [中文](#chinese)

---

<a name="english"></a>

A JavaScript/TypeScript dependency analysis toolkit powered by SWC. Parse source code into module dependency graphs, with circular dependency detection, topological sorting, and interactive visualization.

## Architecture

```
┌──────────────────────────────┐
│           CLI                │  Command-line interface
├──────────────────────────────┤
│         VS Code              │  IDE integration
├──────────────────────────────┤
│         Web UI / API         │  Interactive visualization
├──────────────────────────────┤
│                              │
│           core               │  Core engine
│   ┌─────┐ ┌──────┐ ┌──────┐ │
│   │parser│ │resolv│ │graph │ │
│   └─────┘ └──────┘ └──────┘ │
│                              │
└──────────────────────────────┘
```

## Packages

| Package | Description | npm |
|---|---|---|
| `@depic/core` | Core engine: parsing, resolution, graph operations | `npm i @depic/core` |
| `@depic/cli` | Command-line tool | `npm i @depic/cli` |
| `@depic/web` | Interactive web UI & server | `npm i @depic/web` |
| `depic-vscode` | VS Code extension | [VS Code Marketplace]() |

## Development

```bash
pnpm install   # Install dependencies
pnpm build     # Build all packages
pnpm test      # Run tests
pnpm typecheck # Type-check
```

## Tech Stack

**TypeScript** · **SWC** · **Vitest** · **pnpm** monorepo

---

<a name="chinese"></a>

一个基于 SWC 的 JavaScript/TypeScript 依赖分析工具集。输入源码目录，输出模块依赖图，支持循环依赖检测、拓扑排序和交互式可视化。

## 架构

```
┌──────────────────────────────┐
│           CLI                │  命令行走廊
├──────────────────────────────┤
│         VS Code              │  IDE 集成
├──────────────────────────────┤
│         Web UI / API         │  交互式可视化
├──────────────────────────────┤
│                              │
│           core               │  核心引擎
│   ┌─────┐ ┌──────┐ ┌──────┐ │
│   │parser│ │resolv│ │graph │ │
│   └─────┘ └──────┘ └──────┘ │
│                              │
└──────────────────────────────┘
```

## 包列表

| 包 | 说明 | 安装 |
|---|---|---|
| `@depic/core` | 核心引擎：解析、路径解析、图操作 | `npm i @depic/core` |
| `@depic/cli` | 命令行工具 | `npm i @depic/cli` |
| `@depic/web` | 交互式 Web 界面与服务器 | `npm i @depic/web` |
| `depic-vscode` | VS Code 插件 | [VS Code Marketplace]() |

## 开发

```bash
pnpm install   # 安装依赖
pnpm build     # 构建所有包
pnpm test      # 运行测试
pnpm typecheck # 类型检查
```

## 技术栈

**TypeScript** · **SWC** · **Vitest** · **pnpm** monorepo
