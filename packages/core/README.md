# @depic/core

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
