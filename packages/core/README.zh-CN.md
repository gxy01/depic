# @depic/core

JS/TS 代码依赖分析核心引擎。基于 SWC 解析源码，构建项目依赖图。

[English](./README.md) | 中文

## 特性

- **Parser** — 通过 SWC AST 提取 `import`/`export`/`require`，支持 15+ 种语法
- **Resolver** — 解析 specifier：相对路径、tsconfig paths（含嵌套）、node_modules、monorepo workspace 包
- **Graph** — 有向图，支持环检测、传递依赖、依赖路径、符号溯源（re-export / export * 链路）
- **Monorepo** — 自动检测 package.json 边界，支持 include/exclude glob 过滤
- **符号级分析** — 可选 `symbolLevel`，`resolveSymbol()` 追踪符号原始定义

## 安装

```bash
npm install @depic/core
```

## 使用

```ts
import { analyze } from '@depic/core';

const graph = await analyze({ root: '/path/to/project' });

// 循环依赖检测
graph.getCircularDependencies();

// 谁依赖了某个文件
graph.getDependents('/path/to/file.ts');

// 两个文件间的所有依赖路径
graph.getDependencyChain('a.ts', 'b.ts');

// 符号溯源
graph.resolveSymbol('index.ts', 'formatDate');

// 统计
graph.stats(); // { fileCount, edgeCount, externalCount, ... }

// 导出
graph.toJSON();
graph.toDot();
```

## License

MIT
