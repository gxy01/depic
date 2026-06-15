# @depic/core

Core engine for JS/TS dependency analysis. Parses source files with SWC, resolves module specifiers, and builds a dependency graph.

English | [中文](https://github.com/gxy01/depic/blob/main/packages/core/README.zh-CN.md)

## Features

- **Parser** — Extract `import`/`export`/`require` via SWC AST, supports 15+ syntax forms
- **Resolver** — Resolve specifiers: relative paths, tsconfig paths (with nested support), node_modules, monorepo workspace packages
- **Graph** — Directed graph with cycle detection, transitive deps, dependency chains, symbol tracing (re-export / export * resolution)
- **Monorepo** — Auto-detect package boundaries from `package.json`, include/exclude glob patterns
- **Symbol-level** — Optional `symbolLevel` analysis with `resolveSymbol()` for origin tracing

## Install

```bash
npm install @depic/core
```

## Usage

```ts
import { analyze } from '@depic/core';

const graph = await analyze({ root: '/path/to/project' });

// Circular dependencies
graph.getCircularDependencies();

// Who depends on a file
graph.getDependents('/path/to/file.ts');

// Find all paths between two files
graph.getDependencyChain('a.ts', 'b.ts');

// Trace symbol to original definition
graph.resolveSymbol('index.ts', 'formatDate');

// Statistics
graph.stats(); // { fileCount, edgeCount, externalCount, ... }

// Export
graph.toJSON();
graph.toDot();
```

## API

### `analyze(options): Promise<DependencyGraph>`

| Option | Type | Default | Description |
|---|---|---|---|
| `root` | `string` | required | Project root directory |
| `include` | `string[]` | `['**/*.{ts,tsx,js,jsx}']` | File glob patterns |
| `exclude` | `string[]` | `[]` | Exclude glob patterns |
| `tsconfigPath` | `string` | auto | Path to tsconfig.json |
| `extensions` | `string[]` | `['.ts','.tsx','.js','.jsx']` | Extension order |
| `symbolLevel` | `boolean` | `false` | Enable symbol analysis |
| `workspace` | `WorkspaceConfig` | - | Monorepo workspace config |

### `DependencyGraph`

| Method | Description |
|---|---|
| `getFileNode(path)` | Get file node by path |
| `getExternalNode(name)` | Get external dependency node |
| `getSymbolNode(id)` | Get symbol node (`file#name`) |
| `getDependencies(file)` | Edges from this file |
| `getDependents(file)` | Edges to this file |
| `getDependencyChain(from, to)` | All paths between two files |
| `getCircularDependencies()` | Detect all cycles |
| `getTransitiveDependencies(file)` | All reachable files (BFS) |
| `hasCycle(path)` | Check if file is in a cycle |
| `resolveSymbol(file, name)` | Trace symbol across re-exports |
| `files()` / `externalModules()` / `edges()` | Iterate nodes and edges |
| `stats()` / `toJSON()` / `toDot()` | Export and statistics |

## License

MIT
