import { analyze, type DependencyGraph } from '@depic/core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 预编译的 HTML shell，Vite build 产出 */
function getHtmlShell(): string {
  // Resolve dist-client relative to __dirname (works for both src/ and dist/)
  const webRoot = resolve(__dirname, '..');
  const paths = [
    resolve(webRoot, 'dist-client/index.html'),
  ];
  for (const p of paths) {
    if (existsSync(p)) return readFileSync(p, 'utf-8');
  }
  // Fallback: minimal shell
  return '<!DOCTYPE html><html><body><div id="root"></div><script>window.__GRAPH__ = %%GRAPH_JSON%%;</script></body></html>';
}

/**
 * 生成交互式依赖图 HTML 字符串。
 */
export async function generateHtml(rootDir: string): Promise<string> {
  const graph = await analyze({ root: rootDir });
  return generateHtmlFromGraph(graph, rootDir.split('/').pop() ?? rootDir);
}

/**
 * 从已有的 DependencyGraph 生成 HTML。
 */
export function generateHtmlFromGraph(graph: DependencyGraph, _title: string): string {
  const shell = getHtmlShell();
  const json = JSON.stringify(graph.toJSON());
  return shell.replace('%%GRAPH_JSON%%', json);
}

/**
 * 启动本地 Web 服务器。
 */
export function startServer(rootDir: string, port = 3000): Promise<void> {
  return new Promise((_resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = req.url ?? '/';
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
          const html = await generateHtml(rootDir);
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
    });
    server.on('error', reject);
  });
}
