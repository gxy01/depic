# @depic/web

[English](#english) | [中文](#chinese)

---

<a name="english"></a>

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

---

<a name="chinese"></a>

交互式 Web 可视化界面，用于浏览 JS/TS 依赖图。可生成独立 HTML 报告，或启动本地服务器实时探索。

## 安装

```bash
npm i @depic/web
```

## API

```ts
import { generateHtml, generateHtmlFromGraph, startServer } from '@depic/web';
import { analyze } from '@depic/core';

// 从项目根目录生成 HTML
const html = await generateHtml('/path/to/project');

// 或从已有图生成
const graph = await analyze({ root: '/path/to/project' });
const html2 = generateHtmlFromGraph(graph, 'My Project');

// 启动本地服务器，包含 API 和可视化
await startServer('/path/to/project', 3000);
// → http://localhost:3000
```

## 接口 (使用 startServer 时)

| 路径 | 说明 |
|---|---|
| `GET /` | 交互式依赖图页面 |
| `GET /api/graph` | 完整依赖图 JSON |
| `GET /api/stats` | 依赖统计 |
| `GET /api/cycles` | 循环依赖列表 |
