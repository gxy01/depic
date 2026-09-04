# @depic/web

Interactive dependency graph visualization. Generates a self-contained HTML file with a React app, supporting thousands of files.

English | [中文](https://github.com/gxy01/depic/blob/main/packages/web/README.zh-CN.md)

## Features

- **Sigma.js WebGL** — Hardware-accelerated graph rendering for 3,000+ nodes
- **Three views** — Graph (force-directed), Tree (virtual scrolling via react-virtuoso), File (detail panel)
- **Search autocomplete** — cmdk-powered command palette with file name matching
- **Package filter** — Monorepo support: auto-detect sub-packages, filter by dropdown
- **Cycle highlighting** — Files in circular dependencies marked in red
- **Self-contained** — Single HTML file, no server required
- **Structured embedding** — Graph strings round-trip through an inert JSON data block under a restrictive content policy

## Install

```bash
npm install @depic/web
```

## Usage

```ts
import { analyze } from '@depic/core';
import { generateHtmlFromGraph } from '@depic/web';
import { writeFileSync } from 'node:fs';

const graph = await analyze({ root: '/path/to/project' });
const html = generateHtmlFromGraph(graph, 'My Project');
writeFileSync('deps.html', html);
```

Or via CLI:

```bash
npx depic web /path/to/project
npx depic serve /path/to/project  # live server on :3000
```

## API

| Function | Description |
|---|---|
| `generateHtml(rootDir)` | Analyze project and return HTML string |
| `generateHtmlFromGraph(graph, title)` | Build HTML from existing graph |
| `startServer(rootDir, port?)` | Start HTTP server with API + viz |
| `toLightweightJSON(graph)` | Serialize graph to compact JSON |
| `getFileDetails(graph, fileId)` | Get full import/export details for a file |

## License

MIT
