# Depic

JS/TS 代码依赖分析库 — 基于 SWC 解析源码，构建模块依赖图，支持循环依赖检测、拓扑排序等场景。

## 架构

```
┌──────────────────────────────┐
│           CLI                │  命令行走廊
├──────────────────────────────┤
│         VS Code 插件          │  IDE 集成
├──────────────────────────────┤
│         Web UI / API         │  可视化界面
├──────────────────────────────┤
│                              │
│           core               │  核心引擎
│   ┌─────┐ ┌─────┐ ┌───────┐ │
│   │parser│ │resol│ │ graph │ │
│   └─────┘ └─────┘ └───────┘ │
│                              │
└──────────────────────────────┘
```

### Packages

| 包 | 说明 |
|---|---|
| `packages/core` | 核心引擎：解析、路径解析、图构建与查询 |
| `packages/cli` | 命令行工具 |
| `packages/vscode` | VS Code 插件 |
| `packages/web` | Web 可视化界面 |

### core 子模块

| 模块 | 职责 |
|---|---|
| `parser` | 基于 SWC 解析文件，提取 import/export/require |
| `resolver` | specifier → 文件路径（tsconfig paths / node_modules / extensions） |
| `graph` | 图构建、循环检测、拓扑排序、传递依赖查询 |

## 开发

```bash
# 安装依赖
pnpm install

# 运行测试
pnpm test

# 构建
pnpm build

# 类型检查
pnpm typecheck
```

## 技术栈

- **TypeScript** — 类型安全
- **SWC** — 快速 AST 解析
- **Vitest** — 测试框架
- **pnpm** — workspace monorepo 管理
