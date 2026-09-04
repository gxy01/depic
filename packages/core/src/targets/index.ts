import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { extname, basename, dirname, join, relative, resolve, sep } from 'node:path';
import { parseSync } from '@swc/core';
import { parseFile } from '../parser/index.js';
import { Resolver } from '../resolver/index.js';
import type { SuggestedEntryTarget, SuggestedPackageTarget, SuggestedTarget, TargetEvidence, TargetSuggestionDiagnostic, TargetSuggestionReport, UnknownTargetSuggestion } from './types.js';
import type { ParsedFile, SourceLocation } from '../parser/index.js';
import type { AliasEntry } from '../resolver/types.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const IGNORE_DIRS = new Set(['node_modules', '.git', '.depic', 'dist', 'build', 'coverage', '.next', '.turbo']);
const FILE_ROUTE_DIRS = ['pages', 'app', 'routes'];
const BUNDLER_CONFIGS = [
  'vite.config.ts',
  'vite.config.tsx',
  'vite.config.js',
  'vite.config.mts',
  'vite.config.mjs',
  'vite.config.cts',
  'vite.config.cjs',
  'webpack.config.ts',
  'webpack.config.tsx',
  'webpack.config.js',
  'webpack.config.mts',
  'webpack.config.mjs',
  'webpack.config.cts',
  'webpack.config.cjs',
  'next.config.ts',
  'next.config.tsx',
  'next.config.js',
  'next.config.mts',
  'next.config.mjs',
  'next.config.cts',
  'next.config.cjs',
  'nuxt.config.ts',
  'nuxt.config.tsx',
  'nuxt.config.js',
  'nuxt.config.mts',
  'nuxt.config.mjs',
  'nuxt.config.cts',
  'nuxt.config.cjs',
  'rollup.config.ts',
  'rollup.config.tsx',
  'rollup.config.js',
  'rollup.config.mts',
  'rollup.config.mjs',
  'rollup.config.cts',
  'rollup.config.cjs',
  'tsup.config.ts',
  'tsup.config.tsx',
  'tsup.config.js',
  'tsup.config.mts',
  'tsup.config.mjs',
  'tsup.config.cts',
  'tsup.config.cjs',
];

interface WorkspaceSource {
  kind: 'package-json' | 'pnpm-workspace';
  file: string;
  patterns: string[];
}

interface ImportBinding {
  specifier: string;
  imported: string;
  local: string;
}

interface EntryCandidate {
  kind: 'entry';
  id: string;
  file: string;
  symbol?: string;
  source: SuggestedEntryTarget['source'];
  confidence: SuggestedEntryTarget['confidence'];
  evidence: TargetEvidence[];
  diagnostics?: string[];
}

interface PackageCandidate {
  kind: 'package';
  id: string;
  package: string;
  source: 'workspace-manifest';
  confidence: SuggestedPackageTarget['confidence'];
  evidence: TargetEvidence[];
  diagnostics?: string[];
}

interface UnknownCandidate {
  kind: 'unknown';
  id: string;
  source: UnknownTargetSuggestion['source'];
  reason: UnknownTargetSuggestion['reason'];
  file: string;
  evidence: TargetEvidence[];
  diagnostics: string[];
  aliasSource?: string;
  specifier?: string;
}

interface DiscoveryState {
  entries: EntryCandidate[];
  packages: PackageCandidate[];
  unknown: UnknownCandidate[];
  diagnostics: TargetSuggestionDiagnostic[];
}

export async function suggestTargets(root: string): Promise<TargetSuggestionReport> {
  const absoluteRoot = resolve(root);
  const workspaceSources = loadWorkspaceSources(absoluteRoot);
  const aliases = loadBundlerAliases(absoluteRoot);
  const resolver = new Resolver({
    root: absoluteRoot,
    workspace: workspaceSources.length > 0 ? {
      root: absoluteRoot,
      packagePatterns: [...new Set(workspaceSources.flatMap((item) => item.patterns))].sort(),
    } : undefined,
    aliases,
  });

  const state: DiscoveryState = {
    entries: [],
    packages: [],
    unknown: [],
    diagnostics: [],
  };

  discoverWorkspacePackages(absoluteRoot, workspaceSources, state);
  discoverFileRoutes(absoluteRoot, state);
  discoverRouteDeclarations(absoluteRoot, resolver, state);

  const targets = dedupeTargets([...state.packages, ...state.entries]);
  const unknown = dedupeUnknown(state.unknown);
  const diagnostics = sortDiagnostics(state.diagnostics);

  return {
    root: absoluteRoot,
    targets,
    unknown,
    diagnostics,
  };
}

function loadWorkspaceSources(root: string): WorkspaceSource[] {
  const sources: WorkspaceSource[] = [];

  const packageJsonPath = join(root, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
        workspaces?: string[] | { packages?: string[] };
      };
      const patterns = Array.isArray(parsed.workspaces)
        ? parsed.workspaces
        : parsed.workspaces?.packages ?? [];
      if (patterns.length > 0) {
        sources.push({
          kind: 'package-json',
          file: 'package.json',
          patterns: patterns.filter((pattern): pattern is string => typeof pattern === 'string'),
        });
      }
    } catch {
      // ignore malformed package.json here; workspace package discovery will surface diagnostics when relevant
    }
  }

  const pnpmWorkspacePath = join(root, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWorkspacePath)) {
    const patterns = parsePnpmWorkspace(readFileSync(pnpmWorkspacePath, 'utf-8'));
    if (patterns.length > 0) {
      sources.push({
        kind: 'pnpm-workspace',
        file: 'pnpm-workspace.yaml',
        patterns,
      });
    }
  }

  return sources;
}

function parsePnpmWorkspace(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const patterns: string[] = [];
  let inPackages = false;
  let packagesIndent: number | undefined;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    if (/^packages\s*:/.test(trimmed)) {
      inPackages = true;
      packagesIndent = indent;
      continue;
    }
    if (inPackages && indent <= (packagesIndent ?? 0) && !/^-\s*/.test(trimmed)) {
      inPackages = false;
    }
    if (!inPackages) continue;

    const match = trimmed.match(/^-\s*['"]?([^'"]+)['"]?$/);
    if (match) patterns.push(match[1]);
  }

  return [...new Set(patterns)];
}

function discoverWorkspacePackages(
  root: string,
  sources: WorkspaceSource[],
  state: DiscoveryState,
): void {
  if (sources.length === 0) return;

  const manifests = collectPackageManifests(root, sources);
  const rootReal = safeRealpath(root);
  const byName = new Map<string, PackageCandidate>();

  for (const manifest of manifests) {
    const manifestRel = relativeRoot(root, manifest.file);
    const relDir = relativeRoot(root, dirname(manifest.file));
    if (!relDir || relDir === '.') continue;
    if (!matchesAnyGlob(relDir, sources.flatMap((item) => item.patterns))) continue;

    const evidence: TargetEvidence[] = [
      { kind: 'workspace-manifest', file: manifest.workspaceFile, detail: manifest.pattern },
      { kind: 'package-json', file: manifestRel },
    ];

    if (manifest.error) {
      state.diagnostics.push({
        level: 'warning',
        code: 'malformed-manifest',
        message: `Unable to read workspace package manifest ${manifestRel}: ${manifest.error}`,
        files: [manifestRel],
      });
      state.unknown.push({
        kind: 'unknown',
        id: manifestRel,
        source: 'manifest',
        reason: 'malformed-manifest',
        file: manifestRel,
        evidence,
        diagnostics: [`Unable to parse ${manifestRel}: ${manifest.error}`],
      });
      continue;
    }

    if (!manifest.name) {
      state.diagnostics.push({
        level: 'warning',
        code: 'malformed-manifest',
        message: `Workspace package ${manifestRel} does not declare a package name.`,
        files: [manifestRel],
      });
      state.unknown.push({
        kind: 'unknown',
        id: manifestRel,
        source: 'manifest',
        reason: 'malformed-manifest',
        file: manifestRel,
        evidence,
        diagnostics: [`${manifestRel} is missing a package.json name.`],
      });
      continue;
    }

    const manifestReal = safeRealpath(manifest.file);
    if (rootReal && manifestReal && !isWithinRoot(rootReal, manifestReal)) {
      state.diagnostics.push({
        level: 'warning',
        code: 'out-of-root',
        message: `Workspace package ${manifestRel} resolves outside the project root and will be ignored.`,
        files: [manifestRel],
      });
      state.unknown.push({
        kind: 'unknown',
        id: manifest.name,
        source: 'manifest',
        reason: 'out-of-root',
        file: manifestRel,
        evidence,
        diagnostics: [`${manifestRel} resolves to ${manifestReal}, outside ${root}`],
      });
      continue;
    }

    if (manifest.isSymlink) {
      state.diagnostics.push({
        level: 'warning',
        code: 'symlink',
        message: `Workspace package ${manifestRel} is a symlink and will be treated conservatively.`,
        files: [manifestRel],
      });
      state.unknown.push({
        kind: 'unknown',
        id: manifest.name,
        source: 'manifest',
        reason: 'symlink',
        file: manifestRel,
        evidence,
        diagnostics: [`${manifestRel} is a symlink.`],
      });
      continue;
    }

    const existing = byName.get(manifest.name);
    if (existing) {
      state.diagnostics.push({
        level: 'warning',
        code: 'duplicate-package-name',
        message: `Workspace package name ${manifest.name} appears more than once; keeping the first declaration.`,
        files: [existing.evidence[1]?.file ?? existing.package, manifestRel],
      });
      state.unknown.push({
        kind: 'unknown',
        id: manifest.name,
        source: 'manifest',
        reason: 'duplicate-package-name',
        file: manifestRel,
        evidence,
        diagnostics: [`Duplicate package name ${manifest.name} already discovered at ${existing.evidence[1]?.file ?? existing.package}.`],
      });
      continue;
    }

    byName.set(manifest.name, {
      kind: 'package',
      id: manifest.name,
      package: manifest.name,
      source: 'workspace-manifest',
      confidence: 'high',
      evidence,
    });
  }

  state.packages.push(...[...byName.values()].sort((a, b) => a.id.localeCompare(b.id)));
}

interface PackageManifest {
  file: string;
  workspaceFile: string;
  pattern: string;
  name?: string;
  error?: string;
  isSymlink: boolean;
}

function collectPackageManifests(root: string, sources: WorkspaceSource[]): PackageManifest[] {
  const result: PackageManifest[] = [];
  const patterns = sources.flatMap((item) => item.patterns);
  if (patterns.length === 0) return result;

  const manifests = walkPackageJsonFiles(root);
  for (const manifest of manifests) {
    const relDir = relativeRoot(root, dirname(manifest));
    if (!matchesAnyGlob(relDir, patterns)) continue;

    const workspaceFile = sources.find((item) => item.patterns.some((pattern) => matchesAnyGlob(relDir, [pattern])))?.file ?? 'package.json';
    const isSymlink = safeLstat(manifest)?.isSymbolicLink() ?? false;
    try {
      const raw = readFileSync(manifest, 'utf-8');
      const parsed = JSON.parse(raw) as { name?: string };
      result.push({
        file: manifest,
        workspaceFile,
        pattern: relDir,
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        isSymlink,
      });
    } catch (error) {
      result.push({
        file: manifest,
        workspaceFile,
        pattern: relDir,
        error: error instanceof Error ? error.message : String(error),
        isSymlink,
      });
    }
  }

  return result;
}

function walkPackageJsonFiles(root: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && entry.name === 'package.json') {
        results.push(full);
      }
    }
  }

  walk(root);
  return results.sort();
}

function discoverFileRoutes(
  root: string,
  state: DiscoveryState,
): void {
  const files = walkSourceFiles(root);
  for (const file of files) {
    const route = deriveFileRoute(root, file);
    if (!route) continue;
    if (!isSafePathWithinRoot(root, file, state)) continue;

    let parsed: ParsedFile;
    try {
      parsed = parseFile(readFileSync(file, 'utf-8'), file);
    } catch {
      continue;
    }

    const symbol = inferRouteSymbol(file, parsed);
    const evidence: TargetEvidence[] = [
      { kind: 'file-route', file: relativeRoot(root, file), detail: route.kind },
    ];
    state.entries.push({
      kind: 'entry',
      id: route.id,
      file: relativeRoot(root, file),
      ...(symbol ? { symbol } : {}),
      source: 'file-route',
      confidence: 'high',
      evidence,
    });
  }
}

function deriveFileRoute(root: string, file: string): { id: string; kind: string } | null {
  const rel = relativeRoot(root, file);
  const parts = rel.split('/');
  const fileName = parts.at(-1) ?? '';
  const ext = extname(fileName);
  const base = fileName.slice(0, fileName.length - ext.length);
  const routeDirIndex = parts.findIndex((part) => FILE_ROUTE_DIRS.includes(part));
  if (routeDirIndex < 0) return null;

  const dirName = parts[routeDirIndex];
  const suffix = parts.slice(routeDirIndex + 1);
  if (dirName === 'app' && !['page', 'route', 'index'].includes(base)) return null;
  if (dirName === 'routes' && !['page', 'route', 'index'].includes(base) && !rel.includes('/pages/')) return null;
  if (dirName === 'pages') {
    if (base.startsWith('_')) return null;
    return { id: normalizeRouteId(fileRouteIdFromParts(suffix)), kind: 'pages' };
  }

  const routeParts = suffix.slice(0, -1);
  if (base !== 'page' && base !== 'route' && base !== 'index') {
    return null;
  }
  return { id: normalizeRouteId(fileRouteIdFromParts(routeParts)), kind: dirName };
}

function fileRouteIdFromParts(parts: string[]): string {
  const clean = parts
    .filter(Boolean)
    .map((part) => part.replace(/\.[^.]+$/, ''))
    .filter((part, index, list) => !(index === list.length - 1 && ['page', 'route', 'index'].includes(part)));
  if (clean.length === 0) return '/';
  const last = clean.at(-1);
  if (last === 'index') clean.pop();
  const finalPath = clean.join('/');
  return finalPath ? `/${finalPath}` : '/';
}

function inferRouteSymbol(file: string, parsed: ParsedFile): string | undefined {
  const stem = basename(file).replace(/\.[^.]+$/, '');
  const named = parsed.exports.find((item) => item.name === stem);
  if (named) return named.name;
  const defaultExport = parsed.exports.find((item) => item.kind === 'default');
  if (defaultExport) return 'default';
  return parsed.exports.find((item) => item.kind === 'named')?.name;
}

function discoverRouteDeclarations(
  root: string,
  resolver: Resolver,
  state: DiscoveryState,
): void {
  const files = walkSourceFiles(root);
  for (const file of files) {
    const source = readFileSync(file, 'utf-8');
    const parsed = parseFile(source, file);
    const imports = new Map<string, ImportBinding>();
    for (const imp of parsed.imports) {
      for (const symbol of imp.symbols) {
        imports.set(symbol.local, {
          specifier: imp.specifier,
          imported: symbol.imported,
          local: symbol.local,
        });
      }
    }

    let ast: any;
    try {
      ast = parseSync(source, {
        syntax: file.endsWith('.tsx') || file.endsWith('.jsx') ? 'typescript' : 'typescript',
        tsx: file.endsWith('.tsx') || file.endsWith('.jsx'),
        dynamicImport: true,
        decorators: true,
      });
    } catch {
      continue;
    }

    const processed = new WeakSet<object>();
    walkAst(ast, (node) => {
      if (node.type === 'ObjectExpression') {
        if (processed.has(node)) return;
        if (!looksLikeRouteObject(node)) return;
        collectRouteObject(node, undefined, file, root, resolver, imports, state, processed);
      }
      if (node.type === 'JSXOpeningElement') {
        if (processed.has(node)) return;
        if (!looksLikeRouteJsx(node)) return;
        collectRouteJsx(node, file, root, resolver, imports, state, processed);
      }
    });
  }
}

function collectRouteObject(
  node: any,
  parentPath: string | undefined,
  file: string,
  root: string,
  resolver: Resolver,
  imports: Map<string, ImportBinding>,
  state: DiscoveryState,
  processed: WeakSet<object>,
): void {
  processed.add(node);
  const props = objectProperties(node);
  const ownPath = readPathProp(props);
  const indexRoute = readBooleanProp(props, 'index') === true;
  const routePath = ownPath !== undefined
    ? joinRouteId(parentPath, ownPath)
    : indexRoute
      ? normalizeRouteId(parentPath ?? '/')
      : parentPath;

  const resolved = resolveRouteComponent(props, file, root, resolver, imports);
  if (routePath && resolved?.target) {
    state.entries.push({
      kind: 'entry',
      id: routePath,
      file: resolved.target.file,
      ...(resolved.target.symbol ? { symbol: resolved.target.symbol } : {}),
      source: 'route-declaration',
      confidence: resolved.confidence,
      evidence: [
        { kind: 'route-declaration', file: relativeRoot(root, file), detail: 'object-route', loc: resolved.loc },
        ...resolved.evidence,
      ],
    });
  } else if (routePath && resolved?.unknown) {
    state.unknown.push({
      kind: 'unknown',
      id: routePath,
      source: 'route-declaration',
      reason: resolved.unknown.reason,
      file: relativeRoot(root, file),
      evidence: [
        { kind: 'route-declaration', file: relativeRoot(root, file), detail: 'object-route', loc: resolved.loc },
        ...resolved.evidence,
      ],
      diagnostics: resolved.unknown.diagnostics,
      aliasSource: resolved.unknown.aliasSource,
      specifier: resolved.unknown.specifier,
    });
    state.diagnostics.push({
      level: 'warning',
      code: resolved.unknown.reason === 'unresolved-alias' ? 'unresolved-alias' : 'unknown-route',
      message: resolved.unknown.diagnostics[0] ?? `Unable to resolve route ${routePath}.`,
      files: [relativeRoot(root, file)],
    });
  } else if (routePath && !resolved) {
    state.unknown.push({
      kind: 'unknown',
      id: routePath,
      source: 'route-declaration',
      reason: 'missing-component',
      file: relativeRoot(root, file),
      evidence: [{ kind: 'route-declaration', file: relativeRoot(root, file), detail: 'object-route' }],
      diagnostics: ['Route path was found but no static component binding could be proven.'],
    });
  }

  const children = props.get('children');
  if (children) {
    for (const child of iterateRouteChildren(children)) {
      if (child.type === 'ObjectExpression' && !processed.has(child)) {
        collectRouteObject(child, routePath, file, root, resolver, imports, state, processed);
      } else if (child.type === 'JSXElement') {
        const opening = child.openingElement;
        if (!processed.has(opening) && looksLikeRouteJsx(opening)) {
          collectRouteJsx(opening, file, root, resolver, imports, state, processed, routePath);
        }
      }
    }
  }
}

function collectRouteJsx(
  node: any,
  file: string,
  root: string,
  resolver: Resolver,
  imports: Map<string, ImportBinding>,
  state: DiscoveryState,
  processed: WeakSet<object>,
  parentPath?: string,
): void {
  processed.add(node);
  const attrs = jsxAttributes(node);
  const ownPath = readJsxPath(attrs);
  const routePath = ownPath !== undefined
    ? joinRouteId(parentPath, ownPath)
    : parentPath;
  const resolved = resolveRouteComponent(attrs, file, root, resolver, imports);
  if (routePath && resolved?.target) {
    state.entries.push({
      kind: 'entry',
      id: routePath,
      file: resolved.target.file,
      ...(resolved.target.symbol ? { symbol: resolved.target.symbol } : {}),
      source: 'route-declaration',
      confidence: resolved.confidence,
      evidence: [
        { kind: 'route-declaration', file: relativeRoot(root, file), detail: 'jsx-route', loc: resolved.loc },
        ...resolved.evidence,
      ],
    });
  } else if (routePath && resolved?.unknown) {
    state.unknown.push({
      kind: 'unknown',
      id: routePath,
      source: 'route-declaration',
      reason: resolved.unknown.reason,
      file: relativeRoot(root, file),
      evidence: [
        { kind: 'route-declaration', file: relativeRoot(root, file), detail: 'jsx-route', loc: resolved.loc },
        ...resolved.evidence,
      ],
      diagnostics: resolved.unknown.diagnostics,
      aliasSource: resolved.unknown.aliasSource,
      specifier: resolved.unknown.specifier,
    });
    state.diagnostics.push({
      level: 'warning',
      code: resolved.unknown.reason === 'unresolved-alias' ? 'unresolved-alias' : 'unknown-route',
      message: resolved.unknown.diagnostics[0] ?? `Unable to resolve route ${routePath}.`,
      files: [relativeRoot(root, file)],
    });
  }
}

interface ResolvedRouteComponent {
  target?: { file: string; symbol?: string };
  unknown?: {
    reason: UnknownTargetSuggestion['reason'];
    diagnostics: string[];
    aliasSource?: string;
    specifier?: string;
  };
  confidence: SuggestedEntryTarget['confidence'];
  evidence: TargetEvidence[];
  loc?: SourceLocation;
}

function resolveRouteComponent(
  props: Map<string, any>,
  file: string,
  root: string,
  resolver: Resolver,
  imports: Map<string, ImportBinding>,
): ResolvedRouteComponent | undefined {
  const lazy = props.get('lazy');
  const lazySpecifier = extractDynamicImportSpecifier(lazy);
  if (lazySpecifier) {
    const resolved = resolver.resolve(lazySpecifier, file);
    const evidence: TargetEvidence[] = [{
      kind: 'lazy-import',
      file: relativeRoot(root, file),
      specifier: lazySpecifier,
      ...(resolved.kind === 'file' || resolved.kind === 'internal' ? { resolved: relativeRoot(root, resolved.path) } : {}),
    }];
    if (resolved.kind === 'file' || resolved.kind === 'internal') {
      return {
        target: {
          file: relativeRoot(root, resolved.path),
          symbol: inferTargetSymbol(resolved.path),
        },
        confidence: 'high',
        evidence,
      };
    }
    return {
      unknown: {
        reason: resolverLooksLikeAlias(lazySpecifier) ? 'unresolved-alias' : 'dynamic-import',
        diagnostics: [`Unable to resolve lazy import ${lazySpecifier} from ${relativeRoot(root, file)}.`],
        aliasSource: inferAliasSource(lazySpecifier),
        specifier: lazySpecifier,
      },
      confidence: 'low',
      evidence,
    };
  }

  const componentExpr = props.get('Component') ?? props.get('component') ?? props.get('element');
  const component = extractComponentBinding(componentExpr);
  if (!component) return undefined;

  if (component.kind === 'local') {
    const binding = imports.get(component.name);
    if (binding) {
      const resolved = resolver.resolve(binding.specifier, file);
      const evidence: TargetEvidence[] = [{
        kind: 'component-binding',
        file: relativeRoot(root, file),
        detail: component.name,
        specifier: binding.specifier,
        ...(resolved.kind === 'file' || resolved.kind === 'internal' ? { resolved: relativeRoot(root, resolved.path) } : {}),
      }];
      if (resolved.kind === 'file' || resolved.kind === 'internal') {
        return {
          target: {
            file: relativeRoot(root, resolved.path),
            symbol: binding.imported === 'default' ? 'default' : binding.local,
          },
          confidence: 'high',
          evidence,
        };
      }
      return {
        unknown: {
          reason: resolverLooksLikeAlias(binding.specifier) ? 'unresolved-alias' : 'missing-component',
          diagnostics: [`Unable to resolve component binding ${component.name} from ${relativeRoot(root, file)}.`],
          aliasSource: inferAliasSource(binding.specifier),
          specifier: binding.specifier,
        },
        confidence: 'low',
        evidence,
      };
    }

    const evidence: TargetEvidence[] = [{ kind: 'component-binding', file: relativeRoot(root, file), detail: component.name }];
    return {
      target: {
        file: relativeRoot(root, file),
        symbol: component.name,
      },
      confidence: 'medium',
      evidence,
    };
  }

  const binding = imports.get(component.name);
  if (!binding) {
    return {
      unknown: {
        reason: 'missing-component',
        diagnostics: [`Component ${component.name} is not imported in ${relativeRoot(root, file)}.`],
      },
      confidence: 'low',
      evidence: [{ kind: 'component-binding', file: relativeRoot(root, file), detail: component.name }],
    };
  }
  const resolved = resolver.resolve(binding.specifier, file);
  const evidence: TargetEvidence[] = [{
    kind: 'component-binding',
    file: relativeRoot(root, file),
    detail: component.name,
    specifier: binding.specifier,
    ...(resolved.kind === 'file' || resolved.kind === 'internal' ? { resolved: relativeRoot(root, resolved.path) } : {}),
  }];
  if (resolved.kind === 'file' || resolved.kind === 'internal') {
    return {
      target: {
        file: relativeRoot(root, resolved.path),
        symbol: binding.imported === 'default' ? 'default' : binding.local,
      },
      confidence: 'high',
      evidence,
    };
  }
  return {
    unknown: {
      reason: resolverLooksLikeAlias(binding.specifier) ? 'unresolved-alias' : 'missing-component',
      diagnostics: [`Unable to resolve component binding ${component.name} from ${relativeRoot(root, file)}.`],
      aliasSource: inferAliasSource(binding.specifier),
      specifier: binding.specifier,
    },
    confidence: 'low',
    evidence,
  };
}

function extractDynamicImportSpecifier(expr: any): string | undefined {
  if (!expr || typeof expr !== 'object') return undefined;
  if (expr.type === 'CallExpression' && expr.callee?.type === 'Import') {
    const arg = expr.arguments?.[0]?.expression;
    return stringLiteralValue(arg);
  }
  if (expr.type === 'ArrowFunctionExpression' || expr.type === 'FunctionExpression') {
    return walkForDynamicImport(expr.body);
  }
  if (expr.type === 'ParenthesisExpression') {
    return extractDynamicImportSpecifier(expr.expression);
  }
  return undefined;
}

function walkForDynamicImport(node: any): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = walkForDynamicImport(item);
      if (found) return found;
    }
    return undefined;
  }
  if (node.type === 'CallExpression' && node.callee?.type === 'Import') {
    return stringLiteralValue(node.arguments?.[0]?.expression);
  }
  for (const value of Object.values(node)) {
    const found = walkForDynamicImport(value);
    if (found) return found;
  }
  return undefined;
}

function extractComponentBinding(expr: any): { kind: 'local'; name: string } | undefined {
  if (!expr || typeof expr !== 'object') return undefined;
  if (expr.type === 'JSXExpressionContainer') {
    return extractComponentBinding(expr.expression);
  }
  if (expr.type === 'Identifier' && typeof expr.value === 'string') {
    return { kind: 'local', name: expr.value };
  }
  if (expr.type === 'JSXElement') {
    const name = expr.openingElement?.name;
    if (name?.type === 'JSXIdentifier' && typeof name.name === 'string') {
      return { kind: 'local', name: name.name };
    }
  }
  return undefined;
}

function loadBundlerAliases(root: string): AliasEntry[] {
  const aliases: AliasEntry[] = [];
  for (const fileName of BUNDLER_CONFIGS) {
    const file = join(root, fileName);
    if (!existsSync(file)) continue;
    try {
      const source = readFileSync(file, 'utf-8');
      const parsed = parseSync(source, {
        syntax: file.endsWith('.tsx') || file.endsWith('.jsx') ? 'typescript' : 'typescript',
        tsx: file.endsWith('.tsx') || file.endsWith('.jsx'),
        dynamicImport: true,
        decorators: true,
      }) as any;
      walkAst(parsed, (node) => {
        if (node.type !== 'ObjectExpression') return;
        const props = objectProperties(node);
        const aliasProp = props.get('alias');
        if (!aliasProp) return;
        aliases.push(...extractAliasesFromNode(aliasProp));
      });
    } catch {
      // ignore malformed configs, conservative resolver will fall back
    }
  }
  return dedupeAliases(aliases);
}

function extractAliasesFromNode(node: any): AliasEntry[] {
  const aliases: AliasEntry[] = [];
  if (!node || typeof node !== 'object') return aliases;
  if (node.type === 'ObjectExpression') {
    const props = objectProperties(node);
    for (const [find, value] of props) {
      const replacement = stringLiteralValue(value);
      if (replacement) aliases.push({ find, replacement });
    }
    return aliases;
  }
  if (node.type === 'ArrayExpression') {
    for (const element of node.elements ?? []) {
      const expr = element?.expression ?? element;
      if (!expr || typeof expr !== 'object' || expr.type !== 'ObjectExpression') continue;
      const props = objectProperties(expr);
      const find = stringLiteralValue(props.get('find'));
      const replacement = stringLiteralValue(props.get('replacement'));
      if (find && replacement) aliases.push({ find, replacement });
    }
  }
  return aliases;
}

function dedupeAliases(aliases: AliasEntry[]): AliasEntry[] {
  const byKey = new Map<string, AliasEntry>();
  for (const alias of aliases) {
    if (!alias.find || !alias.replacement) continue;
    byKey.set(`${alias.find}=>${alias.replacement}`, alias);
  }
  return [...byKey.values()].sort((a, b) => a.find.localeCompare(b.find) || a.replacement.localeCompare(b.replacement));
}

function walkSourceFiles(root: string): string[] {
  const files: string[] = [];
  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
        files.push(full);
      }
    }
  }
  walk(root);
  return files.sort();
}

function walkAst(node: any, visit: (node: any) => void, seen = new WeakSet<object>()): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkAst(item, visit, seen);
    return;
  }
  if (seen.has(node)) return;
  seen.add(node);
  if (typeof node.type === 'string') visit(node);
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') walkAst(value, visit, seen);
  }
}

function looksLikeRouteObject(node: any): boolean {
  const props = objectProperties(node);
  return props.has('path')
    || props.has('Component')
    || props.has('component')
    || props.has('element')
    || props.has('lazy')
    || props.has('children')
    || props.has('routes')
    || readBooleanProp(props, 'index') === true;
}

function looksLikeRouteJsx(node: any): boolean {
  const name = jsxName(node.name);
  if (name && name.endsWith('Route')) return true;
  const attrs = jsxAttributes(node);
  return attrs.has('path') && (attrs.has('element') || attrs.has('Component') || attrs.has('component') || attrs.has('lazy'));
}

function objectProperties(node: any): Map<string, any> {
  const props = new Map<string, any>();
  for (const prop of node.properties ?? []) {
    if (!prop || typeof prop !== 'object') continue;
    if (!('key' in prop) || !('value' in prop)) continue;
    const key = propertyName(prop.key);
    if (key) props.set(key, prop.value);
  }
  return props;
}

function jsxAttributes(node: any): Map<string, any> {
  const attrs = new Map<string, any>();
  for (const attr of node.attributes ?? []) {
    if (!attr || typeof attr !== 'object') continue;
    if (attr.type !== 'JSXAttribute') continue;
    const key = jsxName(attr.name);
    if (!key) continue;
    attrs.set(key, attr.value);
  }
  return attrs;
}

function propertyName(node: any): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === 'Identifier' && typeof node.value === 'string') return node.value;
  if (node.type === 'StringLiteral' && typeof node.value === 'string') return node.value;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return undefined;
}

function jsxName(node: any): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === 'JSXIdentifier' && typeof node.name === 'string') return node.name;
  if (node.type === 'Identifier' && typeof node.name === 'string') return node.name;
  return undefined;
}

function readPathProp(props: Map<string, any>): string | undefined {
  const path = stringLiteralValue(props.get('path'));
  if (path !== undefined) return path;
  return undefined;
}

function readJsxPath(attrs: Map<string, any>): string | undefined {
  const value = attrs.get('path');
  return stringLiteralValue(value);
}

function readBooleanProp(props: Map<string, any>, name: string): boolean | undefined {
  const value = props.get(name);
  if (!value) return undefined;
  if (value.type === 'BooleanLiteral') return Boolean(value.value);
  if (value.type === 'Identifier' && value.value === 'true') return true;
  return undefined;
}

function stringLiteralValue(node: any): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === 'StringLiteral' && typeof node.value === 'string') return node.value;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'JSXExpressionContainer') return stringLiteralValue(node.expression);
  return undefined;
}

function iterateRouteChildren(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  if (node.type === 'ArrayExpression') {
    return node.elements
      .map((element: any) => element?.expression ?? element)
      .filter(Boolean);
  }
  if (node.type === 'JSXElement') {
    return node.children ?? [];
  }
  return [node];
}

function joinRouteId(parentPath: string | undefined, childPath: string): string {
  if (!parentPath) return normalizeRouteId(childPath);
  if (!childPath) return normalizeRouteId(parentPath);
  if (childPath.startsWith('/')) return normalizeRouteId(childPath);
  return normalizeRouteId(`${parentPath.replace(/\/+$/u, '')}/${childPath}`);
}

function normalizeRouteId(value: string): string {
  const cleaned = value.trim().replace(/\/+/gu, '/');
  if (!cleaned) return '/';
  const prefixed = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  if (prefixed.length > 1 && prefixed.endsWith('/')) return prefixed.slice(0, -1);
  return prefixed;
}

function inferTargetSymbol(file: string): string | undefined {
  const stem = basename(file).replace(/\.[^.]+$/, '');
  if (!stem) return undefined;
  if (stem === 'index' || stem === 'page' || stem === 'route') return 'default';
  return stem[0].toUpperCase() === stem[0] ? stem : undefined;
}

function resolverLooksLikeAlias(specifier: string): boolean {
  return specifier.startsWith('@') || specifier.startsWith('~') || specifier.startsWith('#');
}

function inferAliasSource(specifier: string): string | undefined {
  if (specifier.startsWith('@')) return 'tsconfig/jsconfig or bundler alias';
  if (specifier.startsWith('~')) return 'bundler alias';
  return undefined;
}

function isSafePathWithinRoot(root: string, file: string, state: DiscoveryState): boolean {
  const rootReal = safeRealpath(root);
  const fileReal = safeRealpath(file);
  if (!rootReal || !fileReal) return true;
  if (!isWithinRoot(rootReal, fileReal)) {
    state.diagnostics.push({
      level: 'warning',
      code: 'out-of-root',
      message: `Path ${relativeRoot(root, file)} resolves outside the project root and will be ignored.`,
      files: [relativeRoot(root, file)],
    });
    state.unknown.push({
      kind: 'unknown',
      id: relativeRoot(root, file),
      source: 'file-route',
      reason: 'out-of-root',
      file: relativeRoot(root, file),
      evidence: [{ kind: 'file-route', file: relativeRoot(root, file), detail: 'realpath' }],
      diagnostics: [`${fileReal} is outside ${rootReal}.`],
    });
    return false;
  }
  if (safeLstat(file)?.isSymbolicLink()) {
    state.diagnostics.push({
      level: 'warning',
      code: 'symlink',
      message: `Path ${relativeRoot(root, file)} is a symlink and will be ignored.`,
      files: [relativeRoot(root, file)],
    });
    state.unknown.push({
      kind: 'unknown',
      id: relativeRoot(root, file),
      source: 'file-route',
      reason: 'symlink',
      file: relativeRoot(root, file),
      evidence: [{ kind: 'file-route', file: relativeRoot(root, file), detail: 'symlink' }],
      diagnostics: [`${relativeRoot(root, file)} is a symlink.`],
    });
    return false;
  }
  return true;
}

function safeRealpath(file: string): string | undefined {
  try {
    return realpathSync(file);
  } catch {
    return undefined;
  }
}

function safeLstat(file: string) {
  try {
    return lstatSync(file);
  } catch {
    return undefined;
  }
}

function isWithinRoot(root: string, file: string): boolean {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  return file === root || file.startsWith(normalizedRoot);
}

function relativeRoot(root: string, file: string): string {
  const rel = relative(root, file);
  return rel ? rel.split(sep).join('/') : '.';
}

function matchesAnyGlob(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegex(pattern).test(value));
}

function globToRegex(pattern: string): RegExp {
  let regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<STARSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<STARSTAR>>/g, '.*')
    .replace(/\{([^}]+)\}/g, (_match, group: string) =>
      `(${group.split(',').map((item) => item.trim()).join('|')})`,
    );
  regex = `${regex}$`;
  return new RegExp(regex);
}

function dedupeTargets(targets: SuggestedTarget[]): SuggestedTarget[] {
  const byKey = new Map<string, SuggestedTarget>();
  for (const target of targets) {
    const key = target.kind === 'entry'
      ? `entry:${target.id}:${target.file}:${target.symbol ?? ''}`
      : `package:${target.id}:${target.package}`;
    if (!byKey.has(key)) byKey.set(key, target);
  }
  return [...byKey.values()].sort(compareTargets);
}

function compareTargets(a: SuggestedTarget, b: SuggestedTarget): number {
  const kindOrder = a.kind.localeCompare(b.kind);
  if (kindOrder !== 0) return kindOrder;
  if (a.kind === 'entry' && b.kind === 'entry') {
    return a.id.localeCompare(b.id) || a.file.localeCompare(b.file) || (a.symbol ?? '').localeCompare(b.symbol ?? '');
  }
  if (a.kind === 'package' && b.kind === 'package') {
    return a.id.localeCompare(b.id) || a.package.localeCompare(b.package);
  }
  return 0;
}

function dedupeUnknown(unknown: UnknownCandidate[]): UnknownTargetSuggestion[] {
  const byKey = new Map<string, UnknownCandidate>();
  for (const item of unknown) {
    const key = `${item.kind}:${item.id}:${item.file}:${item.reason}:${item.specifier ?? ''}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()]
    .sort((a, b) => a.id.localeCompare(b.id) || a.file.localeCompare(b.file))
    .map((item) => ({
      kind: 'unknown' as const,
      id: item.id,
      source: item.source,
      reason: item.reason,
      confidence: 'low' as const,
      file: item.file,
      evidence: item.evidence,
      diagnostics: item.diagnostics,
      ...(item.aliasSource ? { aliasSource: item.aliasSource } : {}),
      ...(item.specifier ? { specifier: item.specifier } : {}),
    }));
}

function sortDiagnostics(diagnostics: TargetSuggestionDiagnostic[]): TargetSuggestionDiagnostic[] {
  return [...diagnostics].sort((a, b) => a.code.localeCompare(b.code) || a.message.localeCompare(b.message));
}
