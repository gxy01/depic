import { analyze, type DependencyGraph } from '@depic/core';
import { renderHtml } from './template';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

/**
 * 生成交互式依赖图 HTML 字符串。
 */
export async function generateHtml(rootDir: string): Promise<string> {
  const graph = await analyze({ root: rootDir });
  const json = JSON.stringify(graph.toJSON());
  return renderHtml(json, rootDir.split('/').pop() ?? rootDir);
}

/**
 * 从已有的 DependencyGraph 生成 HTML。
 */
export function generateHtmlFromGraph(graph: DependencyGraph, title: string): string {
  return renderHtml(JSON.stringify(graph.toJSON()), title);
}

/**
 * 启动本地 Web 服务器，提供 API 和可视化界面。
 */
export function startServer(rootDir: string, port = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = req.url ?? '/';

      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');

      try {
        if (url === '/api/graph') {
          const graph = await analyze({ root: rootDir });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(graph.toJSON()));
        } else if (url === '/api/stats') {
          const graph = await analyze({ root: rootDir });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(graph.stats()));
        } else if (url === '/api/cycles') {
          const graph = await analyze({ root: rootDir });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(graph.getCircularDependencies()));
        } else {
          // Serve the interactive HTML page
          const graph = await analyze({ root: rootDir });
          const html = generateHtmlFromGraph(graph, rootDir.split('/').pop() ?? rootDir);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });

    server.listen(port, () => {
      console.log(`  depic web server running at http://localhost:${port}`);
      resolve();
    });

    server.on('error', reject);
  });
}
