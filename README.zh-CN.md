# Depic

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
| `depic-vscode` | VS Code 插件 | VS Code Marketplace |

## 开发

```bash
pnpm install   # 安装依赖
pnpm build     # 构建所有包
pnpm test      # 运行测试
pnpm typecheck # 类型检查
```

## 技术栈

**TypeScript** · **SWC** · **Vitest** · **pnpm** monorepo
