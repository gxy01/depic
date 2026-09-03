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

Git-generated pathname fields are decoded consistently across `diff --git`,
`---` / `+++`, and rename/copy metadata. This includes Git's C-style quoted
UTF-8 octal bytes, spaces, quotes, and POSIX backslashes. Malformed escapes,
invalid UTF-8, absolute paths, and `..` traversal are rejected before graph or
filesystem lookup; arbitrary non-UTF-8 Git filenames are not supported.

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

From `0.1.10` (Issue #25), unchanged top-level directive wrappers are
attached to declaration boundaries instead of absolute code offsets, so growing
a type does not by itself invalidate refinement. Directive text/order, neighboring
declarations and adjacent whitespace remain protected; next-line/unknown comments
also retain physical-line placement, and nested/uncertain attachments stay strict.
Plain-label HTTP(S) Markdown links in documentation can change without blocking a
checked no-op; unknown markup and directive-bearing comments remain protected.
Diff reconstruction preserves unchanged EOF newlines. These fixes require `0.1.10` or later.

From `0.1.12` (Issue #27), a renamed file's destination is treated as a conservative
file-level change in the head dependency graph. It can therefore produce normal
`changedFiles`, `impacts`, and dependency-chain evidence for current consumers.
The `renamed-file` diagnostic names the destination and includes the old path in
its message because consumers that still reference the old module require a
baseline dependency graph. Deleted files remain diagnostic-only. Rename
destinations are not symbol-refined or checked as semantic no-ops.

From `0.1.13` (Issue #31), Oxlint control comments are protected directives.
Adding, removing, changing, reordering, or moving them prevents `semantic-noop`
pruning and retains conservative impact. Unchanged `oxlint-disable` /
`oxlint-enable` range wrappers use stable declaration-boundary attachment, so
supported symbol and type refinement remains available when the wrapped code
changes without altering the directive range.

From `0.1.14` (Issue #33), safe exported object literals and their static member
reads are modeled as qualified symbols such as `client.fetchA`. A change to one
member can therefore prune consumers of an unrelated member. Static string-key
reads are supported. Dynamic/computed reads, mutation, whole-object escape,
spreads, accessors, unsupported member values, and shape changes retain explicit
file-level fallback.

From `0.1.15` (Issue #34), `chain-limit-reached` is emitted once per truncated
target with structured `chainLimit` details: returned and known-minimum counts,
active per-target/report limits, the limiting scope, one proven omitted chain,
and copyable CLI/config recovery settings. A truncated `TargetImpact` also
exposes `knownMinimumPathCount`. Report-wide exhaustion no longer silently drops
a target once an omitted chain has been proven.

From `0.1.16` (Issue #35), absent changed files are classified against the
effective discovery configuration. Files matched by `include` (and not
`exclude`), or recognized by default/configured source `extensions`, retain the
prominent `unmapped-file` warning. Other documentation/artifact paths produce an
informational `non-source-file` diagnostic. Both remain in the JSON report; the
latter is not an implicit ignore or proof of no impact.

From `0.1.17` (Issue #40), `ImpactOptions.baselineRoot` points to a pre-change
checkout. Depic builds a second graph and uses its reverse dependencies for
deleted paths, including targets that exist only in the baseline. Baseline-proven
impacts expose `analysisBasis: "baseline"` (or `"mixed"` with head evidence).
Without usable evidence, `analysisStatus` is `"incomplete"`, the deleted path
remains in `changedFiles`, and `unresolvedChanges` provides a stable reason and
recovery action. The baseline path is runtime input, not shared config.

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
