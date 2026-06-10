# @depic/web

Interactive web UI for visualizing JS/TS dependency graphs. Generate standalone HTML reports or start a local server with live graph browsing.

## Install

```bash
npm i @depic/web
```

## API

```ts
import { generateHtml, generateHtmlFromGraph, startServer } from '@depic/web';
import { analyze } from '@depic/core';

// Generate HTML from a project root
const html = await generateHtml('/path/to/project');

// Or from an existing graph
const graph = await analyze({ root: '/path/to/project' });
const html2 = generateHtmlFromGraph(graph, 'My Project');

// Start a local server with API + visualization
await startServer('/path/to/project', 3000);
// → http://localhost:3000
```

## Endpoints (when using startServer)

| Path | Description |
|---|---|
| `GET /` | Interactive dependency graph page |
| `GET /api/graph` | Full graph as JSON |
| `GET /api/stats` | Dependency statistics |
| `GET /api/cycles` | Circular dependency list |
