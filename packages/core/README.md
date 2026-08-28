# @depic/core

Core engine for JS/TS dependency analysis. Parses source files with SWC, resolves module specifiers, and builds a dependency graph.

English | [中文](https://github.com/gxy01/depic/blob/main/packages/core/README.zh-CN.md)

## Features

- **Parser** — Extract `import`/`export`/`require` via SWC AST, supports 15+ syntax forms
- **Resolver** — Resolve specifiers: relative paths, tsconfig paths (with nested support), node_modules, monorepo workspace packages
- **Graph** — Directed graph with cycle detection, transitive deps, dependency chains, symbol tracing (re-export / export * resolution)
- **Monorepo** — Auto-detect package boundaries from `package.json`, include/exclude glob patterns
- **Symbol-level** — Optional `symbolLevel` analysis with `resolveSymbol()` for origin tracing
- **Impact analysis** — Map a unified diff to entries or monorepo packages and return potentially affected targets with dependency chains

## Install

```bash
npm install @depic/core
```

## Usage

```ts
import { analyze } from '@depic/core';

const graph = await analyze({ root: '/path/to/project' });

// Circular dependencies
graph.getCircularDependencies();

// Who depends on a file
graph.getDependents('/path/to/file.ts');

// Find all paths between two files
graph.getDependencyChain('a.ts', 'b.ts');

// Trace symbol to original definition
graph.resolveSymbol('index.ts', 'formatDate');

// Statistics
graph.stats(); // { fileCount, edgeCount, externalCount, ... }

// Export
graph.toJSON();
graph.toDot();
```

### Change impact analysis

Provide the post-change workspace, a unified diff, and impact targets. An `entry`
target is supplied by framework-specific tooling or the official
[`depic-impact-analysis`](https://github.com/gxy01/depic/blob/main/skills/depic-impact-analysis/SKILL.md) Agent
Skill; a `package` target uses the monorepo package name already discovered by
Depic. Store shared targets under `impact.targets` in the root
`depic.config.json`.

The Skill is an upstream adapter: it uses AI to inspect framework conventions and
ask the user to confirm meaningful targets. `@depic/core` remains deterministic
and framework-independent; it computes reachability and dependency chains from
the confirmed target nodes.

```ts
import { analyzeImpact } from '@depic/core';

const report = await analyzeImpact({
  root: '/path/to/project',
  diff: diffText,
});

// [{ target, impact: 'direct' | 'transitive' | 'global', dependencyChains, ... }]
report.impacts;
```

`EntryTarget.file` is relative to `root`. Type-only imports are excluded by default;
pass `includeTypeOnly: true` for type-contract analysis. Configuration changes such
as `package.json` are reported as global impact. Dependency chains are shortest-first,
and pure re-export barrels do not turn a direct impact into a transitive one. See
the repository
[`IMPACT-ANALYSIS-FEATURES.md`](../../docs/IMPACT-ANALYSIS-FEATURES.md) for the
complete contract.

Since `0.1.8`, `analyzeImpact()` automatically refines supported runtime paths by
checking diff hunks against the current source, mapping edits to declarations,
and tracing references through named/aliased reexports, `export *`, and static
namespace members (including string-literal access). Private helpers are traced.
`report.symbolEvidence` records each candidate target/change pair, including
pruned targets: `precision`, `affected`, `changedSymbols`, a symbol `chain` when
affected, or `fallbackReason` for retained file-level results.

This is a bounded, conservative subset, not general JS data-flow analysis.
Dynamic/escaped namespaces, ambiguous/cyclic exports, effects, unsupported syntax
(including classes and complex initializers), stale/missing hunks, structural
edits and budget exhaustion fall back. Own-file/package changes stay direct;
type-contract analysis in `0.1.8` stays file-level. `EntryTarget.symbol` remains a label:
all declarations in an entry are roots. `dependencyChains` and graph APIs remain
file-level; use `symbolEvidence.chain` for symbol provenance. No new config is
required, and `excludeChangedFiles` remains an independent explicit opt-out.

#### Type contracts and checked no-ops (0.1.9+)

With `includeTypeOnly: true`, supported interfaces/type aliases, annotations and
type imports/reexports participate in declaration-level refinement. A change to
`UserConfig` can spare consumers of another type in the same file, but all users
of `UserConfig` still count: this is not field-level analysis. Indexed, conditional,
mapped/import types, merging/name collisions, effects and ambiguous provenance
retain file-level fallback. Type/runtime edge changes are preserved. The default
`includeTypeOnly: false` is unchanged.

For modified, non-global files, checked old/new runtime **and type** AST equality
can omit an entire comment/format-only file, including an own-entry/package file.
`diagnostics` records `semantic-noop` with its paths; these paths are absent from
`changedFiles`, but graph nodes remain. This differs from configured exclusions:
the file was checked, not skipped. Literal spelling and directive/unknown-markup
comments are protected. Changed/moved directives, parse uncertainty, stale hunks,
mixed meaningful edits and unsupported cases remain conservative. Global config
rules still win. AST equivalence is not a universal proof about source-reading
tools or runtime reflection; no per-hunk semantic filtering is performed.

These additions require `0.1.9` or later.

`analyze()` and `analyzeImpact()` both load `depic.config.json`. The file accepts
`include`, `exclude`, `tsconfigPath`, `extensions`, `symbolLevel`, `workspace`,
and an `impact` object. Explicit API options override configured values.

To intentionally skip generated changes without deleting graph nodes, pass
`excludeChangedFiles: ['src/generated/**']` to `analyzeImpact()`, or set
`impact.excludeChangedFiles` in `depic.config.json`. The API list replaces the
configured list; `[]` disables configured exclusions. Paths are relative to `root`;
`*` matches within a path segment, `**` crosses segments, and `**/` also matches
zero directories. Other characters are literal. Optional `./` and Windows separators
are normalized. This option is not supported in `0.1.6` or earlier.

Filtering happens before global-change classification and affects only diff paths,
not discovery or traversal. `diagnostics` contains an `excluded-changed-files`
warning with sorted, unique `files`; these files are absent from `changedFiles`.
Even a zero-impact report with this warning means **not analyzed**, not unaffected.
This is an explicit opt-out, not symbol-level precision or automatic detection of
generated-code churn.

## API

### `analyze(options): Promise<DependencyGraph>`

| Option | Type | Default | Description |
|---|---|---|---|
| `root` | `string` | required | Project root directory |
| `include` | `string[]` | `['**/*.{ts,tsx,js,jsx}']` | File glob patterns |
| `exclude` | `string[]` | `[]` | Exclude glob patterns |
| `tsconfigPath` | `string` | auto | Path to tsconfig.json |
| `extensions` | `string[]` | `['.ts','.tsx','.js','.jsx']` | Extension order |
| `symbolLevel` | `boolean` | `false` | Enable symbol analysis |
| `workspace` | `WorkspaceConfig` | - | Monorepo workspace config |

### `DependencyGraph`

| Method | Description |
|---|---|
| `getFileNode(path)` | Get file node by path |
| `getExternalNode(name)` | Get external dependency node |
| `getSymbolNode(id)` | Get symbol node (`file#name`) |
| `getDependencies(file)` | Edges from this file |
| `getDependents(file)` | Edges to this file |
| `getDependencyChain(from, to)` | All paths between two files |
| `getCircularDependencies()` | Detect all cycles |
| `getTransitiveDependencies(file)` | All reachable files (BFS) |
| `hasCycle(path)` | Check if file is in a cycle |
| `resolveSymbol(file, name)` | Trace symbol across re-exports |
| `files()` / `externalModules()` / `edges()` | Iterate nodes and edges |
| `stats()` / `toJSON()` / `toDot()` | Export and statistics |

## License

MIT
