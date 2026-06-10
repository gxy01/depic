# @depic/core

[English](#english) | [中文](#chinese)

---

<a name="english"></a>

Core engine for JS/TS dependency analysis. Parses source files with SWC, resolves module specifiers to file paths, and builds a directed dependency graph with query APIs.

## Features

- **Parser** — Extract `import`/`export`/`require` statements via SWC
- **Resolver** — Resolve bare specifiers, relative paths, tsconfig paths, and workspace packages
- **Graph** — Build dependency graph, detect cycles, topological sort, transitive dependencies

## Install

```bash
npm i @depic/core
```

## API

```ts
import { analyze, parseFile, Resolver, DependencyGraph } from '@depic/core';

// Analyze a project root
const graph = await analyze({ root: '/path/to/project' });

// JSON output
console.log(JSON.stringify(graph.toJSON(), null, 2));

// DOT output (for Graphviz)
console.log(graph.toDot());

// Stats
console.log(graph.stats());

// Circular dependencies
console.log(graph.getCircularDependencies());

// Who depends on a file?
console.log(graph.getDependents('/path/to/file.ts'));
```

---

<a name="chinese"></a>

JS/TS 依赖分析核心引擎。使用 SWC 解析源码、将模块标识符解析为文件路径、构建有向依赖图并提供查询 API。

## 功能

- **Parser** — 通过 SWC 提取 `import`/`export`/`require` 语句
- **Resolver** — 解析裸标识符、相对路径、tsconfig 路径、workspace 包
- **Graph** — 构建依赖图、循环检测、拓扑排序、传递依赖

## 安装

```bash
npm i @depic/core
```

## API

```ts
import { analyze, parseFile, Resolver, DependencyGraph } from '@depic/core';

// 分析项目
const graph = await analyze({ root: '/path/to/project' });

// JSON 输出
console.log(JSON.stringify(graph.toJSON(), null, 2));

// DOT 输出 (用于 Graphviz)
console.log(graph.toDot());

// 统计信息
console.log(graph.stats());

// 循环依赖
console.log(graph.getCircularDependencies());

// 谁依赖了某文件？
console.log(graph.getDependents('/path/to/file.ts'));
```
