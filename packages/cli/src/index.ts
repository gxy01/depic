import { analyze, analyzeImpact, type ImpactTarget } from '@depic/core';
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

export async function runImpact(
  rootDir: string,
  diffPath: string,
  targetsPath: string | undefined,
  reportPath: string,
): Promise<string> {
  const diff = readFileSync(diffPath, 'utf-8');
  let targets: ImpactTarget[] | undefined;
  if (targetsPath) {
    const parsedTargets = JSON.parse(readFileSync(targetsPath, 'utf-8')) as unknown;
    if (!Array.isArray(parsedTargets)) {
      throw new Error('Impact targets JSON must be an array.');
    }
    targets = parsedTargets as ImpactTarget[];
  }

  const report = await analyzeImpact({
    root: rootDir,
    diff,
    targets,
  });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

  const lines = [
    `Impacted targets: ${report.impactedTargetCount} / ${report.totalTargetCount}`,
    ...report.impacts.map((impact) =>
      `- ${impact.target.id} (${impact.target.kind}; ${impact.impact}; ${impact.changedFiles.join(', ')})`,
    ),
  ];
  if (report.diagnostics.length > 0) {
    lines.push(`Diagnostics: ${report.diagnostics.length}`);
  }
  lines.push(`Report written to ${reportPath}`);
  return lines.join('\n');
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
    const lines = content.split('\n');
    if (lines.some((line: string) => line.trim() === pattern)) {
      return 'Depic rules already in .gitignore';
    }

    const selectiveRules = new Set([
      '# Depic generated artifacts',
      '.depic/*',
      '!.depic/impact-targets.json',
    ]);
    if (lines.some((line: string) => selectiveRules.has(line.trim()))) {
      const retainedLines = lines.filter(
        (line: string) => !selectiveRules.has(line.trim()),
      );
      while (retainedLines.at(-1) === '') retainedLines.pop();
      writeFileSync(
        gitignorePath,
        `${retainedLines.length > 0 ? `${retainedLines.join('\n')}\n` : ''}${pattern}\n`,
      );
      return 'Migrated Depic rules in .gitignore';
    }

    appendFileSync(gitignorePath, `${content.endsWith('\n') ? '' : '\n'}${pattern}\n`);
  } else {
    writeFileSync(gitignorePath, `${pattern}\n`);
  }
  return 'Added Depic rules to .gitignore';
}

export async function runServe(rootDir: string, port = 3000): Promise<string> {
  await startServer(rootDir, port);
  // startServer resolves after listen; keep alive
  return `Server running at http://localhost:${port} (Ctrl+C to stop)`;
}
