import { analyze } from '@depic/core';
import { generateHtml, startServer } from '@depic/web';
import { relative, join } from 'node:path';
import { writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs';

export async function runAnalyze(rootDir: string, dot = false): Promise<string> {
  const graph = await analyze({ root: rootDir });
  if (dot) return graph.toDot();
  return JSON.stringify(graph.toJSON(), null, 2);
}

export async function runCycles(rootDir: string): Promise<string> {
  const graph = await analyze({ root: rootDir });
  const cycles = graph.getCircularDependencies();
  if (cycles.length === 0) return 'No circular dependencies found.';
  return cycles.map((c) => c.map((f) => relative(rootDir, f)).join(' → ')).join('\n');
}

export async function runDependents(file: string, rootDir: string): Promise<string> {
  const graph = await analyze({ root: rootDir });
  const deps = graph.getDependents(file);
  if (deps.length === 0) return `No files depend on ${relative(rootDir, file)}.`;
  return deps
    .map((d) => `${relative(rootDir, d.source)} (${d.kind}: ${d.specifier})`)
    .join('\n');
}

export async function runStats(rootDir: string): Promise<string> {
  const graph = await analyze({ root: rootDir });
  return JSON.stringify(graph.stats(), null, 2);
}

export async function runWeb(rootDir: string, output?: string): Promise<string> {
  const html = await generateHtml(rootDir);
  const outFile = output ?? 'deps.html';
  writeFileSync(outFile, html, 'utf-8');
  return `Written to ${outFile}`;
}

export function runInit(rootDir: string): string {
  const gitignorePath = join(rootDir, '.gitignore');
  const pattern = '.depic/';

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (content.split('\n').some((line: string) => line.trim() === pattern)) {
      return `${pattern} already in .gitignore`;
    }
    appendFileSync(gitignorePath, `\n${pattern}\n`);
  } else {
    writeFileSync(gitignorePath, `${pattern}\n`);
  }
  return `Added ${pattern} to .gitignore`;
}

export async function runServe(rootDir: string, port = 3000): Promise<string> {
  await startServer(rootDir, port);
  // startServer resolves after listen; keep alive
  return `Server running at http://localhost:${port} (Ctrl+C to stop)`;
}
