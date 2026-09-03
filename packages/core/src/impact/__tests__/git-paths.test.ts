import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { analyzeImpact } from '../index';

function writeSource(root: string, file: string): void {
  const absolute = join(root, file);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, 'export const value = 2;\n');
}

function target(file: string) {
  return [{ kind: 'entry' as const, id: file, file }];
}

describe('Git diff pathname parsing', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'depic-git-paths-'));
    for (const file of [
      'src/café.ts',
      'src/新.ts',
      'src/with space.ts',
      'src/quo"te.ts',
      'src/café"mix.ts',
      'src/back\\slash.ts',
      'src/tab\tname.ts',
      'src/new\nline.ts',
      'src/x b/y.ts',
      'src/naïve.ts',
      'src/cöpy.ts',
      'src/unique.ts',
      'src/unique-copy.ts',
      'src/a..b.ts',
    ]) writeSource(root, file);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ['quoted UTF-8 octal bytes', 'src/café.ts', String.raw`diff --git "a/src/caf\303\251.ts" "b/src/caf\303\251.ts"
--- "a/src/caf\303\251.ts"
+++ "b/src/caf\303\251.ts"
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`],
    ['raw Unicode from quotePath=false', 'src/café.ts', `diff --git a/src/café.ts b/src/café.ts
--- a/src/café.ts
+++ b/src/café.ts
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`],
    ['an ordinary space and marker tab delimiters', 'src/with space.ts', `diff --git a/src/with space.ts b/src/with space.ts
--- a/src/with space.ts\t
+++ b/src/with space.ts\t
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`],
    ['an embedded raw header separator candidate', 'src/x b/y.ts', `diff --git a/src/x b/y.ts b/src/x b/y.ts
--- a/src/x b/y.ts\t
+++ b/src/x b/y.ts\t
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`],
    ['an escaped double quote', 'src/quo"te.ts', String.raw`diff --git "a/src/quo\"te.ts" "b/src/quo\"te.ts"
--- "a/src/quo\"te.ts"
+++ "b/src/quo\"te.ts"
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`],
    ['literal UTF-8 mixed with an escaped quote', 'src/café"mix.ts', String.raw`diff --git "a/src/café\"mix.ts" "b/src/café\"mix.ts"
--- "a/src/café\"mix.ts"
+++ "b/src/café\"mix.ts"
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`],
    ['a C-style tab escape', 'src/tab\tname.ts', String.raw`diff --git "a/src/tab\tname.ts" "b/src/tab\tname.ts"
--- "a/src/tab\tname.ts"
+++ "b/src/tab\tname.ts"
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`],
    ['a C-style newline escape', 'src/new\nline.ts', String.raw`diff --git "a/src/new\nline.ts" "b/src/new\nline.ts"
--- "a/src/new\nline.ts"
+++ "b/src/new\nline.ts"
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`],
    ['an in-root name containing consecutive dots', 'src/a..b.ts', `diff --git a/src/a..b.ts b/src/a..b.ts
--- a/src/a..b.ts
+++ b/src/a..b.ts
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`],
  ])('analyzes a modified path with %s', async (_case, file, diff) => {
    const report = await analyzeImpact({ root, diff, targets: target(file) });

    expect(report).toMatchObject({
      analysisStatus: 'complete',
      changedFiles: [file],
      impactedTargetCount: 1,
    });
  });

  it.runIf(process.platform !== 'win32')('preserves an escaped backslash as a POSIX filename byte', async () => {
    const diff = String.raw`diff --git "a/src/back\\slash.ts" "b/src/back\\slash.ts"
--- "a/src/back\\slash.ts"
+++ "b/src/back\\slash.ts"
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`;

    const report = await analyzeImpact({ root, diff, targets: target('src/unique.ts') });

    expect(report).toMatchObject({
      analysisStatus: 'complete',
      changedFiles: ['src/back\\slash.ts'],
      impactedTargetCount: 0,
      diagnostics: [],
    });
  });

  it.each([
    ['quoted add', 'src/新.ts', String.raw`diff --git "a/src/\346\226\260.ts" "b/src/\346\226\260.ts"
new file mode 100644
--- /dev/null
+++ "b/src/\346\226\260.ts"
@@ -0,0 +1 @@
+export const value = 2;
`, 'complete'],
    ['quoted rename', 'src/naïve.ts', String.raw`diff --git "a/src/caf\303\251.ts" "b/src/na\303\257ve.ts"
similarity index 100%
rename from "src/caf\303\251.ts"
rename to "src/na\303\257ve.ts"
`, 'incomplete'],
    ['quoted copy', 'src/cöpy.ts', String.raw`diff --git "a/src/caf\303\251.ts" "b/src/c\303\266py.ts"
similarity index 100%
copy from "src/caf\303\251.ts"
copy to "src/c\303\266py.ts"
`, 'complete'],
    ['raw ASCII copy', 'src/unique-copy.ts', `diff --git a/src/unique.ts b/src/unique-copy.ts
similarity index 100%
copy from src/unique.ts
copy to src/unique-copy.ts
`, 'complete'],
    ['mixed raw/quoted rename', 'src/quo"te.ts', String.raw`diff --git a/src/café.ts "b/src/quo\"te.ts"
similarity index 100%
rename from src/café.ts
rename to "src/quo\"te.ts"
`, 'incomplete'],
    ['mixed quoted/raw copy', 'src/cöpy.ts', String.raw`diff --git "a/src/back\\slash.ts" b/src/cöpy.ts
similarity index 100%
copy from "src/back\\slash.ts"
copy to src/cöpy.ts
`, 'complete'],
  ])('parses %s metadata without losing the destination', async (_case, file, diff, status) => {
    const report = await analyzeImpact({ root, diff, targets: target(file) });

    expect(report.changedFiles).toEqual([file]);
    expect(report.impactedTargetCount).toBe(1);
    expect(report.analysisStatus).toBe(status);
    expect(report.diagnostics.some((diagnostic) => diagnostic.code === 'renamed-file'))
      .toBe(_case === 'quoted rename' || _case === 'mixed raw/quoted rename');
  });

  it('decodes quoted markers independently of a raw header', async () => {
    const diff = String.raw`diff --git a/src/café.ts b/src/café.ts
--- "a/src/caf\303\251.ts"
+++ "b/src/caf\303\251.ts"
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`;

    const report = await analyzeImpact({ root, diff, targets: target('src/café.ts') });

    expect(report.changedFiles).toEqual(['src/café.ts']);
  });

  it('preserves the baseline-required fallback for a quoted deletion', async () => {
    rmSync(join(root, 'src/café.ts'));
    const diff = String.raw`diff --git "a/src/caf\303\251.ts" "b/src/caf\303\251.ts"
deleted file mode 100644
--- "a/src/caf\303\251.ts"
+++ /dev/null
@@ -1 +0,0 @@
-export const value = 1;
`;

    const report = await analyzeImpact({ root, diff, targets: target('src/unique.ts') });

    expect(report).toMatchObject({
      analysisStatus: 'incomplete',
      changedFiles: ['src/café.ts'],
      unresolvedChanges: [{ file: 'src/café.ts', reason: 'baseline-required' }],
    });
  });

  it.each([
    ['raw absolute header', 'diff --git a//tmp/escape.ts b//tmp/escape.ts\n'],
    ['raw traversal header', 'diff --git a/../escape.ts b/../escape.ts\n'],
    ['drive-absolute header', 'diff --git a/C:/escape.ts b/C:/escape.ts\n'],
    ['encoded absolute header', String.raw`diff --git "a/\057tmp/escape.ts" "b/\057tmp/escape.ts"
`],
    ['encoded traversal header', String.raw`diff --git "a/\056\056\057escape.ts" "b/\056\056\057escape.ts"
`],
    ['encoded backslash traversal header', String.raw`diff --git "a/\056\056\\escape.ts" "b/\056\056\\escape.ts"
`],
    ['UNC-like header', String.raw`diff --git "a/\\\\server\\share\\escape.ts" "b/\\\\server\\share\\escape.ts"
`],
    ['absolute rename metadata', `diff --git a/src/café.ts b/src/naïve.ts
rename from src/café.ts
rename to /tmp/escape.ts
`],
    ['traversing marker', `diff --git a/src/café.ts b/src/café.ts
--- a/../../escape.ts
+++ b/src/café.ts
`],
  ])('rejects %s before graph lookup', async (_case, diff) => {
    await expect(analyzeImpact({ root, diff, targets: target('src/café.ts') }))
      .rejects.toThrow(/relative|match/u);
  });

  it.each([
    ['unknown escape', String.raw`diff --git "a/src/bad\q.ts" "b/src/bad\q.ts"
`, /Git escape/u],
    ['short octal escape', String.raw`diff --git "a/src/bad\30.ts" "b/src/bad\30.ts"
`, /Git escape/u],
    ['over-range octal escape', String.raw`diff --git "a/src/bad\400.ts" "b/src/bad\400.ts"
`, /Git escape/u],
    ['invalid UTF-8 bytes', String.raw`diff --git "a/src/bad\303\050.ts" "b/src/bad\303\050.ts"
`, /UTF-8/u],
    ['NUL byte', String.raw`diff --git "a/src/bad\000.ts" "b/src/bad\000.ts"
`, /NUL/u],
    ['unterminated quote', String.raw`diff --git "a/src/bad.ts b/src/bad.ts
`, /unterminated/u],
  ])('rejects %s explicitly', async (_case, diff, error) => {
    await expect(analyzeImpact({ root, diff, targets: target('src/café.ts') }))
      .rejects.toThrow(error);
  });

  it('rejects an unpaired Unicode surrogate supplied through the Core string API', async () => {
    const invalid = String.fromCharCode(0xd800);
    const diff = `diff --git "a/src/${invalid}.ts" "b/src/${invalid}.ts"\n`;

    await expect(analyzeImpact({ root, diff, targets: target('src/café.ts') }))
      .rejects.toThrow(/UTF-8/u);
  });

  it.each([
    ['marker', `diff --git a/src/café.ts b/src/café.ts
--- a/src/other.ts
+++ b/src/café.ts
`],
    ['rename metadata', `diff --git a/src/café.ts b/src/naïve.ts
rename from src/other.ts
rename to src/naïve.ts
`],
    ['copy metadata', `diff --git a/src/unique.ts b/src/unique-copy.ts
copy from src/other.ts
copy to src/unique-copy.ts
`],
  ])('rejects %s that contradicts the header', async (_case, diff) => {
    await expect(analyzeImpact({ root, diff, targets: target('src/café.ts') }))
      .rejects.toThrow(/match/u);
  });
});
