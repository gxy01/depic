# JS 代码依赖分析库 — 需求文档

## 1. 项目定位

一个基于 SWC 的 JavaScript/TypeScript 代码依赖分析库。输入项目源码目录，输出模块依赖图（有向图），辅助理解项目内的模块引用关系、循环依赖检测、依赖拓扑排序等场景。

## 2. 架构分层

项目采用分层架构，**core** 是唯一的核心引擎，所有上层功能都基于 core 构建。

```
┌──────────────────────────────┐
│           CLI                │  命令行走廊（future）
├──────────────────────────────┤
│         VS Code 插件          │  IDE 集成（future）
├──────────────────────────────┤
│         Web UI / API         │  可视化界面（future）
├──────────────────────────────┤
│                               │
│           core                │  核心引擎（P0）
│   ┌─────┐ ┌─────┐ ┌───────┐  │
│   │parser│ │resol│ │ graph │  │
│   └─────┘ └─────┘ └───────┘  │
│                               │
└──────────────────────────────┘
```

### 2.1 core — 核心引擎

**职责**：解析源码、解析模块路径、构建依赖图、提供查询 API。不包含任何 UI、CLI、网络或交互逻辑。

**子模块**：

| 模块 | 职责 |
|---|---|
| `parser` | 用 SWC 解析文件，提取 import/export/require 信息 |
| `resolver` | 将 specifier 字符串解析为文件路径（tsconfig paths / node_modules / extensions） |
| `graph` | 图构建、图算法（循环检测、拓扑排序、传递依赖）、查询接口 |

### 2.2 cli — 命令行走廊（P1）

基于 core 的命令行工具，提供：

- `depic analyze <root>` — 分析项目，输出 JSON / DOT
- `depic cycles <root>` — 只检测循环依赖
- `depic dependents <file>` — 查看谁依赖了某个文件
- `depic stats <root>` — 输出统计信息

### 2.3 后续扩展（P2+）

- **VS Code 插件**：通过 Language Server Protocol 提供 IDE 内的依赖提示
- **Web UI**：可视化浏览依赖图
- **CI 集成**：作为 CI 检查步骤，阻止引入循环依赖

### 2.4 包结构

```
depic/
├── packages/
│   ├── core/           # @depic/core — 核心引擎
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── parser/
│   │   │   ├── resolver/
│   │   │   ├── graph/
│   │   │   └── output/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cli/            # @depic/cli — 命令行工具（后续）
│       ├── src/
│       │   └── index.ts
│       └── package.json
│
├── spec.md             # 本需求文档
├── package.json        # workspace root
└── tsconfig.base.json  # 共享 tsconfig
```

## 3. 分析目标

### 3.1 依赖类型（全部支持）

| 类型 | 代码示例 | 优先级 |
|---|---|---|
| ESM 静态导入 | `import { foo } from 'bar'` | P0 |
| ESM 默认导入 | `import foo from 'bar'` | P0 |
| ESM 命名空间导入 | `import * as foo from 'bar'` | P0 |
| ESM 副作用导入 | `import 'bar'` | P0 |
| ESM 类型导入 | `import type { Foo } from 'bar'` | P0 |
| ESM 混合导入 | `import foo, { bar } from 'baz'` | P0 |
| ESM 重导出 | `export { foo } from 'bar'` | P0 |
| ESM 全量重导出 | `export * from 'bar'` | P0 |
| ESM 类型重导出 | `export type { Foo } from 'bar'` | P0 |
| CommonJS require | `const x = require('foo')` | P0 |
| 动态导入 | `import('foo')` / `() => import('bar')` | P1 |
| CSS 导入 | `import './style.css'` | P1 |
| Sass/SCSS 导入 | `@import 'foo.scss'` / `@use 'bar'` | P2 |
| TypeScript 三斜线引用 | `/// <reference path="..." />` | P2 |
| Webpack 特定语法 | `require.context(...)` | P2 |

### 3.2 分析粒度

- **文件级（P0）**：节点是文件，边表示"文件 A 引用了文件 B"。能回答"谁依赖了这个文件"、"这个文件依赖了谁"。
- **符号级（P0）**：节点是具体的导出/导入符号，能回答"这个函数来自哪个文件"、"改了文件 B 的 `foo` 会影响哪些文件"。

### 3.3 模块解析

输入 `import` 语句中的 specifier 字符串，输出解析后的目标。

| specifier 形态 | 示例 | 处理方式 |
|---|---|---|
| 相对路径 | `'./utils'`, `'../foo'` | 基于当前文件目录 resolve |
| tsconfig paths 别名 | `'@/utils/foo'` | 读取 tsconfig.json 的 paths + baseUrl |
| 裸 specifier（外部包） | `'react'`, `'lodash/debounce'` | node_modules 查找，标记为外部依赖 |
| 绝对路径 | `'/src/utils'` | 直接 resolve |

**外部依赖处理**：标记为 `ExternalNode`，记录包名。不分析其内部结构。不标记为未解析。

**路径解析细节**：
- 扩展名补全：按 `.ts → .tsx → .js → .jsx → /index.ts → /index.tsx → /index.js` 顺序尝试
- tsconfig paths 通配符匹配（`@/* → ./src/*`）
- tsconfig paths 多 fallback 逐个尝试
- 支持 monorepo 中嵌套 tsconfig.json（从当前文件向上查找最近的 tsconfig）
- **暂不支持**：pnpm 软链接、Yarn PnP、package.json `imports`（`#` 前缀）、`moduleResolution: "bundler"` 的特殊行为

## 4. 输入

```typescript
interface AnalyzeOptions {
  /** 项目根目录（绝对路径），必填 */
  root: string;
  
  /** 需要分析的文件 glob 模式 */
  include?: string[];    // 默认: ['src/**/*.{ts,tsx,js,jsx}']
  
  /** 排除的文件 glob 模式 */
  exclude?: string[];    // 默认: ['node_modules/**']
  
  /** tsconfig 路径，不填则自动查找 */
  tsconfigPath?: string;
  
  /** 扩展名补全顺序 */
  extensions?: string[]; // 默认: ['.ts', '.tsx', '.js', '.jsx']
  
  /** 是否启用符号级分析 */
  symbolLevel?: boolean; // 默认: true
}
```

## 5. 输出

### 5.1 节点

```typescript
/** 项目内文件 */
interface FileNode {
  kind: 'file';
  id: string;              // 文件绝对路径
  exports: ExportInfo[];   // 该文件导出的符号
  imports: ImportInfo[];   // 该文件导入的符号
}

/** 外部依赖 */
interface ExternalNode {
  kind: 'external';
  id: string;              // 包名，如 'react'、'lodash/debounce'
}

/** 符号 */
interface SymbolNode {
  kind: 'symbol';
  id: string;              // '文件路径#符号名'
  file: string;            // 所属文件绝对路径
  name: string;            // 符号名
}
```

### 5.2 边

```typescript
interface Edge {
  source: string;          // 引用方 FileNode.id
  target: string;          // 被引用方 FileNode.id 或 ExternalNode.id
  kind: 'static-import' | 'dynamic-import' | 'require' | 're-export' | 'css-import';
  specifier: string;       // 代码中写的原始路径字符串，如 '@/utils/foo'
  symbols?: ImportedSymbol[]; // 引用涉及的符号，symbolLevel 为 true 时有值
  loc?: SourceLocation;    // 引用发生的位置
}
```

### 5.3 Import / Export 详情

```typescript
interface ImportInfo {
  specifier: string;       // '@/utils/foo'
  symbols: ImportedSymbol[];
  kind: 'static-import' | 'require' | 'dynamic-import' | 'css-import';
  isTypeOnly: boolean;
  resolvedFile?: string;   // 解析后的绝对路径（项目内文件时有值）
  resolvedExternal?: string; // 解析后的包名（外部依赖时有值）
  loc: SourceLocation;
}

interface ExportInfo {
  name: string;            // 导出名
  kind: 'named' | 'default' | 'all' | 'ts-namespace';
  reExportFrom?: string;   // 如果是重导出，记录来源
  isTypeOnly: boolean;
  loc: SourceLocation;
}

interface ImportedSymbol {
  imported: string;        // 来源模块中的名字，如 'default'、'foo'
  local: string;           // 当前模块中的名字
}

interface SourceLocation {
  line: number;
  column: number;
}
```

## 6. 查询 API

```typescript
class DependencyGraph {
  // --- 节点查询 ---
  getFileNode(path: string): FileNode | undefined;
  getExternalNode(name: string): ExternalNode | undefined;
  getSymbolNode(id: string): SymbolNode | undefined;
  
  // --- 依赖查询 ---
  getDependencies(file: string, opts?: { kind?: EdgeKind }): Edge[];
  getDependents(file: string, opts?: { kind?: EdgeKind }): Edge[];
  getDependencyChain(fromFile: string, toFile: string): string[][]; // 两个文件之间的所有路径
  
  // --- 图算法 ---
  getCircularDependencies(): string[][];            // 所有循环依赖
  getTransitiveDependencies(file: string): Set<string>; // 传递依赖
  hasCycle(path: string): boolean;                  // 指定文件是否在环中
  
  // --- 遍历 ---
  files(): FileNode[];
  externalModules(): ExternalNode[];
  edges(): Edge[];
  
  // --- 统计 ---
  stats(): {
    fileCount: number;
    externalCount: number;
    edgeCount: number;
    internalEdgeCount: number;
    externalEdgeCount: number;
  };
  
  // --- 导出 ---
  toJSON(): DependencyGraphJSON;
  toDot(): string;                                   // Graphviz DOT 格式
}
```

## 7. 使用场景

### 场景 A：循环依赖检测

```typescript
const graph = await analyze({ root: '/project' });
const cycles = graph.getCircularDependencies();
// cycles = [['a.ts', 'b.ts', 'a.ts'], ['c.ts', 'd.ts', 'e.ts', 'c.ts']]
```

### 场景 B：影响面分析

```typescript
// 改了 ./utils/format.ts 的 formatDate，哪些文件会受影响？
const dependents = graph.getDependents('/project/src/utils/format.ts');
// 可继续递归：二级受影响、三级受影响...
```

### 场景 C：符号溯源

```typescript
// 文件里用的 formatDate 到底是从哪来的？
// 特别是经过多层 re-export 时
const chain = graph.resolveSymbol('/project/src/index.ts', 'formatDate');
// chain = ['index.ts → a.ts → b.ts (原始定义)']
```

### 场景 D：外部依赖审计

```typescript
// 项目用了哪些外部包？每个包被几个文件引用？
const externals = graph.externalModules();
for (const ext of externals) {
  const refs = graph.getDependents(ext.id);
  console.log(`${ext.id}: ${refs.length} files`);
}
```

### 场景 E：可视化

```typescript
const dot = graph.toDot();
fs.writeFileSync('deps.dot', dot);
// $ dot -Tpng deps.dot -o deps.png
```

## 8. 边界条件

| 条件 | 行为 |
|---|---|
| specifier 指向不存在的文件 | 标记为 `unresolved`，保留原始 specifier 字符串 |
| 文件解析失败（语法错误） | 记录错误，跳过该文件，继续分析其余文件 |
| 含字节顺序标记（BOM）的文件 | 正常解析 |
| 空文件 | 产生 FileNode，imports/exports 为空 |
| 超大项目（10,000+ 文件） | 全量分析，利用 SWC 并行解析 |
| import type 引用的类型 | 正常建立边，标记 `isTypeOnly: true` |
| 符号级分析中 re-export 链 | 追踪到原始定义文件 |
| tsconfig.json 不存在 | 跳过 paths 解析，只做相对路径和 node_modules 解析 |
| 循环引用 | 正常建立边，不中断，由 `getCircularDependencies()` 报告 |

## 9. 性能目标

| 项目规模 | 目标耗时 |
|---|---|
| 100 文件 | < 1s |
| 1,000 文件 | < 5s |
| 5,000 文件 | < 30s |

## 10. 不做什么（第一期）

- 不分析 node_modules 内部依赖
- 不做增量更新，每次全量分析
- 不支持 Sass/Less CSS 预处理器的 `@import` 分析（只支持 ESM 形式的 `import './style.css'`）
- 不做 bundle 后的依赖分析（不模拟打包行为如 tree-shaking、dead code elimination）
- 不做类型推导（`import type` 只标记，不解析背后的类型实现）
