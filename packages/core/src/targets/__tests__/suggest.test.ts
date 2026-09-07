import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { suggestTargets } from '../index.js';

describe('suggestTargets', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'depic-targets-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('discovers workspace packages from package.json and pnpm-workspace.yaml', async () => {
    mkdirSync(join(root, 'packages', 'core'), { recursive: true });
    mkdirSync(join(root, 'apps', 'web'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      workspaces: ['packages/*', 'apps/*'],
    }));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - apps/*\n');
    writeFileSync(join(root, 'packages/core/package.json'), JSON.stringify({ name: '@fixture/core' }));
    writeFileSync(join(root, 'apps/web/package.json'), JSON.stringify({ name: '@fixture/web' }));

    const report = await suggestTargets(root);

    expect(report.targets.filter((item) => item.kind === 'package').map((item) => item.id)).toEqual([
      '@fixture/core',
      '@fixture/web',
    ]);
    expect(report.schemaVersion).toBe(1);
    expect(report.state.config.existingState).toBe('missing');
    expect(report.state.ignore.hasDepicRule).toBe(false);
    expect(report.unknown).toEqual([]);
  });

  it('discovers file routes and statically resolved lazy route entries', async () => {
    mkdirSync(join(root, 'src', 'app', 'blog'), { recursive: true });
    mkdirSync(join(root, 'src', 'features'), { recursive: true });
    writeFileSync(
      join(root, 'vite.config.ts'),
      `export default { resolve: { alias: { '@': './src' } } };`,
    );
    writeFileSync(join(root, 'src/app/page.tsx'), 'export const Page = () => null;');
    writeFileSync(join(root, 'src/app/blog/page.tsx'), 'export const BlogPage = () => null;');
    writeFileSync(join(root, 'src/features/LazyPage.tsx'), 'export const LazyPage = () => null;');
    writeFileSync(
      join(root, 'src/routes.tsx'),
      `export const routes = [{ path: '/lazy', lazy: () => import('@/features/LazyPage') }];`,
    );

    const report = await suggestTargets(root);
    const normalized = report.targets
      .filter((item): item is Extract<typeof item, { kind: 'entry' }> => item.kind === 'entry')
      .map((item) => ({ id: item.id, file: item.file }))
      .sort((a, b) => a.id.localeCompare(b.id) || a.file.localeCompare(b.file));

    expect(normalized).toContainEqual({ id: '/', file: 'src/app/page.tsx' });
    expect(normalized).toContainEqual({ id: '/blog', file: 'src/app/blog/page.tsx' });
    expect(normalized).toContainEqual({ id: '/lazy', file: 'src/features/LazyPage.tsx' });
    expect(normalized).not.toContainEqual({ id: '/HomePage', file: 'src/app/page.tsx' });
    expect(JSON.stringify(report)).toBe(JSON.stringify(await suggestTargets(root)));
  });

  it('returns unknown when a route alias cannot be resolved', async () => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(
      join(root, 'src/routes.tsx'),
      `export const routes = [{ path: '/missing', lazy: () => import('@/missing/Page') }];`,
    );

    const report = await suggestTargets(root);

    expect(report.unknown).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: '/missing',
        reason: expect.stringMatching(/unresolved-alias|dynamic-import|resolution-failed|non-static-path/),
        specifier: '@/missing/Page',
        recovery: expect.objectContaining({
          action: expect.any(String),
        }),
      }),
    ]));
  });

  it('records config and gitignore proposal state deterministically', async () => {
    writeFileSync(join(root, 'depic.config.json'), JSON.stringify({
      impact: { targets: [{ kind: 'entry', id: '/', file: 'src/app/page.tsx' }] },
    }));
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
    const report = await suggestTargets(root);

    expect(report.state.config.existingState).toBe('present');
    expect(report.state.config.existingPath).toBe('depic.config.json');
    expect(report.state.ignore).toEqual({ hasDepicRule: false });
    expect(report.state.config.mergedConfig).toMatchObject({
      impact: {
        targets: expect.arrayContaining([
          expect.objectContaining({ kind: 'entry', id: '/' }),
        ]),
      },
    });
  });

  it('omits gitignore proposal details when the root is not a Git repository', async () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      workspaces: ['packages/*'],
    }));
    mkdirSync(join(root, 'packages', 'alpha'), { recursive: true });
    writeFileSync(join(root, 'packages', 'alpha', 'package.json'), JSON.stringify({ name: '@fixture/alpha' }));

    const report = await suggestTargets(root);

    expect(report.state.git.isRepo).toBe(false);
    expect(report.state.ignore).toEqual({ hasDepicRule: false });
  });

  it('reports JSX route declarations with dynamic path unknowns and suppresses duplicate file-route entries', async () => {
    mkdirSync(join(root, 'src', 'pages'), { recursive: true });
    writeFileSync(join(root, 'src/pages/HomePage.tsx'), 'export const HomePage = () => null;');
    writeFileSync(join(root, 'src/pages/SettingsPage.tsx'), 'export const SettingsPage = () => null;');
    writeFileSync(join(root, 'src/routes.tsx'), `
      import { HomePage } from './pages/HomePage';
      import { SettingsPage } from './pages/SettingsPage';
      const pathExpr = makeRoutePath();
      export const routes = [
        <Route path="/" element={<HomePage />} />,
        <Route path="/settings" element={<SettingsPage />} />,
        <Route path={pathExpr} element={<HomePage />} />,
      ];
    `);

    const report = await suggestTargets(root);
    const entryIds = report.targets
      .filter((item): item is Extract<typeof item, { kind: 'entry' }> => item.kind === 'entry')
      .map((item) => item.id)
      .sort();

    expect(entryIds).toEqual(['/', '/settings']);
    expect(report.unknown).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: 'non-static-path',
        expression: expect.stringContaining('pathExpr'),
        recovery: expect.objectContaining({ action: 'convert-route-path-to-static-string' }),
      }),
    ]));
    expect(entryIds).not.toContain('/HomePage');
    expect(entryIds).not.toContain('/SettingsPage');
  });

  it('adds structured recovery details for malformed, unnamed, and duplicate workspace manifests', async () => {
    mkdirSync(join(root, 'packages', 'broken'), { recursive: true });
    mkdirSync(join(root, 'packages', 'unnamed'), { recursive: true });
    mkdirSync(join(root, 'packages', 'dup-a'), { recursive: true });
    mkdirSync(join(root, 'packages', 'dup-b'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      workspaces: ['packages/*'],
    }));
    writeFileSync(join(root, 'packages', 'broken', 'package.json'), '{ invalid');
    writeFileSync(join(root, 'packages', 'unnamed', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(join(root, 'packages', 'dup-a', 'package.json'), JSON.stringify({ name: '@fixture/dup' }));
    writeFileSync(join(root, 'packages', 'dup-b', 'package.json'), JSON.stringify({ name: '@fixture/dup' }));

    const report = await suggestTargets(root);

    expect(report.unknown).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: 'malformed-manifest',
        recovery: expect.objectContaining({ action: 'fix-workspace-manifest' }),
      }),
      expect.objectContaining({
        reason: 'malformed-manifest',
        recovery: expect.objectContaining({ action: 'add-workspace-package-name' }),
      }),
      expect.objectContaining({
        reason: 'duplicate-package-name',
        recovery: expect.objectContaining({ action: 'dedupe-workspace-package-names' }),
      }),
    ]));
  });
});
