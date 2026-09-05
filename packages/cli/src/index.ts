import { analyze, analyzeImpact, suggestTargets, type ImpactOptions, type ImpactTarget } from '@depic/core';
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
  overrides: Pick<ImpactOptions, 'baselineRoot' | 'maxChainsPerTarget' | 'maxTotalChains'> = {},
): Promise<string> {
  let diff: string;
  try {
    diff = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(diffPath));
  } catch {
    throw new Error('Impact diff must be valid UTF-8.');
  }
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
    ...overrides,
  });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

  const lines = [
    `Impacted targets: ${report.impactedTargetCount} / ${report.totalTargetCount}`,
    ...report.impacts.map((impact) =>
      `- ${impact.target.id} (${impact.target.kind}; ${impact.impact}; ${impact.changedFiles.join(', ')})`,
    ),
  ];
  if (report.analysisStatus === 'incomplete') {
    lines.push('INCOMPLETE impact analysis: target coverage is not fully proven; inspect warning diagnostics.');
    if (report.unresolvedChanges.length > 0) {
      lines.push(`Unresolved changed files: ${report.unresolvedChanges.length}`);
    }
    for (const unresolved of report.unresolvedChanges) {
      lines.push(`- ${unresolved.file}: ${unresolved.reason}; recovery=${unresolved.recovery.action}; rerun with ${unresolved.recovery.cli}`);
    }
  }
  for (const diagnostic of report.diagnostics) {
    if (diagnostic.code === 'excluded-changed-files') {
      lines.push(`Excluded changed files (not analyzed): ${diagnostic.files?.join(', ')}`);
    }
    if (diagnostic.code === 'semantic-noop') {
      lines.push(`Semantic no-op files (checked AST equivalence): ${diagnostic.files?.join(', ')}`);
    }
    if (diagnostic.code === 'non-source-file') {
      lines.push(`Non-source changed files (outside analyzed graph): ${diagnostic.files?.join(', ')}`);
    }
    if (diagnostic.code === 'unmapped-file') {
      lines.push(`Unmapped source/analysis files (warning): ${diagnostic.files?.join(', ')}`);
    }
    if (diagnostic.code === 'parse-failed') {
      lines.push(`Parse-failed source files (warning): ${diagnostic.files?.join(', ')}`);
      if (diagnostic.reason) {
        lines.push(`Parse reason: ${diagnostic.reason}`);
      }
    }
    if (diagnostic.code === 'resolution-failed') {
      lines.push(`Resolution-failed source files (warning): ${diagnostic.files?.join(', ')}`);
    }
    if (diagnostic.code === 'chain-limit-reached' && diagnostic.chainLimit) {
      const detail = diagnostic.chainLimit;
      lines.push(`Truncated target ${detail.targetId}: returned ${detail.returnedChainCount} / at least ${detail.knownMinimumChainCount} chains (limits: per-target=${detail.maxChainsPerTarget}, total=${detail.maxTotalChains}).`);
      lines.push(`Omitted chain sample: ${detail.omittedDependencyChain.join(' -> ')}`);
      lines.push(`Recovery: rerun with ${detail.recovery.cli} or set ${detail.recovery.config}`);
    }
  }
  if (report.diagnostics.length > 0) {
    const warningCount = report.diagnostics.filter((item) => item.level === 'warning').length;
    const infoCount = report.diagnostics.filter((item) => item.level === 'info').length;
    lines.push(`Diagnostics: ${warningCount} warning(s), ${infoCount} info`);
  }
  if (report.symbolEvidence?.length) {
    const precise = report.symbolEvidence.filter((item) => item.precision === 'symbol');
    const fallbacks = report.symbolEvidence.filter((item) => item.precision === 'file');
    lines.push(`Symbol analysis: ${precise.length} refined, ${fallbacks.length} file-level (target/change pairs)`);
    if (fallbacks.length) {
      lines.push(`File-level reasons: ${[...new Set(fallbacks.map((item) => item.fallbackReason))].sort().join(', ')}; see symbolEvidence in report`);
    }
  }
  lines.push(`Report written to ${reportPath}`);
  return lines.join('\n');
}

export async function runTargetsSuggest(rootDir: string): Promise<string> {
  const report = await suggestTargets(rootDir);
  return JSON.stringify(report, null, 2);
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
