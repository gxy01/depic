import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runAnalyze,
  runCycles,
  runDependents,
  runStats,
  runWeb,
  runImpact,
  runInit,
} from '../index';

describe('CLI commands', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'depic-cli-'));
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('analyze outputs valid JSON', async () => {
    const output = await runAnalyze(tmpDir);

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('nodes');
    expect(parsed).toHaveProperty('edges');
    expect(parsed.nodes.length).toBe(2);
    expect(parsed.edges.length).toBe(1);
  });

  it('analyze --dot outputs DOT format', async () => {
    const output = await runAnalyze(tmpDir, true);

    expect(output).toContain('digraph deps {');
    expect(output).toContain('->');
  });

  it('cycles reports no cycles for acyclic project', async () => {
    const output = await runCycles(tmpDir);

    expect(output).toBe('No circular dependencies found.');
  });

  it('cycles detects circular dependency', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import { y } from './a';`);

    const output = await runCycles(tmpDir);

    expect(output).not.toBe('No circular dependencies found.');
    expect(output).toContain('→');
  });

  it('dependents shows files that import the target', async () => {
    const output = await runDependents(join(tmpDir, 'b.ts'), tmpDir);

    expect(output).toContain('a.ts');
    expect(output).toContain('static-import');
  });

  it('dependents reports none when no dependents', async () => {
    const output = await runDependents(join(tmpDir, 'a.ts'), tmpDir);

    expect(output).toContain('No files depend on');
  });

  it('stats outputs valid JSON with expected keys', async () => {
    const output = await runStats(tmpDir);

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('fileCount');
    expect(parsed).toHaveProperty('edgeCount');
    expect(parsed).toHaveProperty('externalCount');
    expect(parsed.fileCount).toBe(2);
    expect(parsed.edgeCount).toBe(1);
  });

  it('web generates HTML file', async () => {
    const outFile = join(tmpDir, 'deps.html');
    const output = await runWeb(tmpDir, outFile);

    expect(output).toContain('Written to');
    // File should exist and contain HTML
    const content = readFileSync(outFile, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('__GRAPH__');
  });

  it('impact writes a JSON report and returns a summary', async () => {
    const targetsFile = join(tmpDir, 'targets.json');
    const diffFile = join(tmpDir, 'change.diff');
    const reportFile = join(tmpDir, 'impact.json');
    writeFileSync(targetsFile, JSON.stringify([{ kind: 'entry', id: '/', file: 'a.ts', symbol: 'Page' }]));
    writeFileSync(diffFile, `diff --git a/a.ts b/a.ts
index 1111111..2222222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
`);

    const output = await runImpact(tmpDir, diffFile, targetsFile, reportFile);

    expect(output).toContain('Impacted targets: 1 / 1');
    expect(JSON.parse(readFileSync(reportFile, 'utf-8'))).toMatchObject({
      impactedTargetCount: 1,
      impacts: [{ target: { id: '/' }, impact: 'direct' }],
    });
  });

  it('impact reads targets from the shared depic config by default', async () => {
    const diffFile = join(tmpDir, 'change.diff');
    const reportFile = join(tmpDir, 'impact.json');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({
      impact: {
        targets: [{ kind: 'entry', id: '/', file: 'a.ts', symbol: 'Page' }],
      },
    }));
    writeFileSync(diffFile, `diff --git a/a.ts b/a.ts
index 1111111..2222222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
`);

    const output = await runImpact(tmpDir, diffFile, undefined, reportFile);

    expect(output).toContain('Impacted targets: 1 / 1');
    expect(JSON.parse(readFileSync(reportFile, 'utf-8'))).toMatchObject({
      impacts: [{ target: { id: '/' }, impact: 'direct' }],
    });
  });

  it('init ignores the entire runtime artifact directory', () => {
    const output = runInit(tmpDir);
    const gitignore = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');

    expect(output).toContain('Added Depic rules');
    expect(gitignore).toBe('.depic/\n');
  });

  it('impact exposes configured exclusions in both the summary and JSON report', async () => {
    const diffFile = join(tmpDir, 'change.diff');
    const reportFile = join(tmpDir, 'impact.json');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({
      impact: {
        targets: [{ kind: 'entry', id: '/', file: 'a.ts' }],
        excludeChangedFiles: ['b.ts'],
      },
    }));
    writeFileSync(diffFile, 'diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-old\n+new\n');

    const output = await runImpact(tmpDir, diffFile, undefined, reportFile);

    expect(output).toContain('Impacted targets: 0 / 1');
    expect(output).toContain('Excluded changed files (not analyzed): b.ts');
    expect(JSON.parse(readFileSync(reportFile, 'utf-8'))).toMatchObject({
      changedFiles: [],
      impacts: [],
      diagnostics: [{ code: 'excluded-changed-files', files: ['b.ts'] }],
    });
    expect(JSON.parse(await runAnalyze(tmpDir)).nodes).toHaveLength(2);
  });

  it('init migrates selective artifact rules after config moves to the root', () => {
    writeFileSync(
      join(tmpDir, '.gitignore'),
      'node_modules/\n# Depic generated artifacts\n.depic/*\n!.depic/impact-targets.json\n',
    );

    const output = runInit(tmpDir);
    const gitignore = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');

    expect(output).toContain('Migrated Depic rules');
    expect(gitignore).toBe('node_modules/\n.depic/\n');
  });

  it('impact exposes symbol refinement and conservative fallback in CLI and JSON', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'export const fetchA = () => "new";\n');
    writeFileSync(join(tmpDir, 'b.ts'), 'export const fetchB = () => "b";\n');
    writeFileSync(join(tmpDir, 'barrel.ts'), 'export * from "./a"; export * from "./b";');
    writeFileSync(join(tmpDir, 'page.ts'), 'import * as api from "./barrel"; export const page = () => api.fetchB();');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({
      impact: { targets: [{ kind: 'entry', id: 'page', file: 'page.ts' }] },
    }));
    const diff = join(tmpDir, 'change.diff');
    const report = join(tmpDir, 'impact.json');
    writeFileSync(diff, 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-export const fetchA = () => "old";\n+export const fetchA = () => "new";\n');
    const output = await runImpact(tmpDir, diff, undefined, report);
    expect(output).toContain('Impacted targets: 0 / 1');
    expect(output).toContain('Symbol analysis: 1 refined, 0 file-level');
    expect(JSON.parse(readFileSync(report, 'utf8')).symbolEvidence[0]).toMatchObject({ precision: 'symbol', affected: false });
    writeFileSync(join(tmpDir, 'page.ts'), 'import * as api from "./barrel"; export const page = (key: string) => api[key]();');
    expect(await runImpact(tmpDir, diff, undefined, report)).toContain('File-level reasons: dynamic-member');
    expect(JSON.parse(readFileSync(report, 'utf8')).symbolEvidence[0]).toMatchObject({ precision: 'file', affected: true });
  });

  it('impact reports semantic no-ops separately from excluded files', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), '// updated docs\nexport const page = () => 1;\n');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({ impact: { targets: [{ kind: 'entry', id: 'page', file: 'a.ts' }] } }));
    const diff = join(tmpDir, 'change.diff');
    const report = join(tmpDir, 'impact.json');
    writeFileSync(diff, 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-// old docs\n+// updated docs\n');
    const output = await runImpact(tmpDir, diff, undefined, report);
    expect(output).toContain('Impacted targets: 0 / 1');
    expect(output).toContain('Semantic no-op files (checked AST equivalence): a.ts');
    expect(output).not.toContain('not analyzed');
    expect(JSON.parse(readFileSync(report, 'utf8'))).toMatchObject({ changedFiles: [], diagnostics: [{ code: 'semantic-noop', files: ['a.ts'] }] });
  });

  it('impact reads type-symbol refinement from shared config', async () => {
    writeFileSync(join(tmpDir, 'models.ts'), 'export interface User { enabled?: boolean }\nexport interface Other { name: string }\n');
    writeFileSync(join(tmpDir, 'a.ts'), 'import type { User } from "./models"; export const page = (x: User) => x;');
    writeFileSync(join(tmpDir, 'b.ts'), 'import type { Other } from "./models"; export const page = (x: Other) => x;');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({ impact: {
      includeTypeOnly: true, targets: ['a', 'b'].map((id) => ({ kind: 'entry', id, file: `${id}.ts` })),
    } }));
    const diff = join(tmpDir, 'change.diff');
    const report = join(tmpDir, 'impact.json');
    writeFileSync(diff, 'diff --git a/models.ts b/models.ts\n--- a/models.ts\n+++ b/models.ts\n@@ -1 +1 @@\n-export interface User {}\n+export interface User { enabled?: boolean }\n');
    expect(await runImpact(tmpDir, diff, undefined, report)).toContain('Impacted targets: 1 / 2');
    expect(JSON.parse(readFileSync(report, 'utf8')).symbolEvidence[0]).toMatchObject({ precision: 'symbol', changedSymbols: ['User'] });
  });
});
