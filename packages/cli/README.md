# @depic/cli

Command-line tool for JS/TS dependency analysis.

English | [中文](https://github.com/gxy01/depic/blob/main/packages/cli/README.zh-CN.md)

## Install

```bash
npm install @depic/cli
```

## Agent-assisted impact analysis

The official
[`depic-impact-analysis`](https://github.com/gxy01/depic/blob/main/skills/depic-impact-analysis/SKILL.md) Skill is
the recommended entry point when a user asks which pages, routes, jobs, or
monorepo packages a change may affect:

```bash
npx skills@latest add gxy01/depic --skill depic-impact-analysis
```

The Skill owns repository inspection and first-run target discovery. It proposes
framework-specific `entry` targets and workspace `package` targets, asks the
user to confirm them, and stores the shared result in `depic.config.json`. This
CLI owns reproducible execution: it reads the confirmed targets and a unified
diff, calls `@depic/core`, writes the detailed JSON report, and prints a compact
summary. Depic itself does not read Git state or invoke an AI model.

## Commands

```bash
depic --version             Print the installed CLI version
depic init [root]          Configure Git rules for .depic artifacts
depic analyze <root>       Analyze project, output JSON (--dot for Graphviz)
depic cycles <root>        Detect circular dependencies
depic dependents <file>    Show files that depend on <file>
depic stats <root>         Show dependency statistics
depic impact [root] --diff <path> [--targets <path>] --report <path> [--baseline-root <path>]
                            Report potentially impacted entries and packages
depic web <root> [output]  Generate interactive HTML visualization
depic serve <root> [port]  Start local web server with live visualization
```

Run `depic --help` for the command overview or `depic <command> --help` for
arguments and options specific to a command. The `impact` help also lists its
`depic.config.json` settings, including `impact.maxChainsPerTarget` and
`impact.maxTotalChains`.

By default, impact targets come from the shared root `depic.config.json`:

```json
{
  "impact": {
    "targets": [
      { "kind": "entry", "id": "/users", "file": "src/pages/UsersPage.tsx", "symbol": "UsersPage" },
      { "kind": "package", "id": "@acme/ui", "package": "@acme/ui" }
    ]
  }
}
```

The same config can hold `include`, `exclude`, `tsconfigPath`, `extensions`,
`symbolLevel`, `workspace`, and impact options. Explicit API or CLI options take
precedence; `--targets` remains available as a temporary or legacy override.

`impact` accepts Git's C-style quoted UTF-8 pathnames in the `diff --git`,
`---` / `+++`, rename, and copy fields, including spaces, quotes, and POSIX
backslashes. Invalid escapes/UTF-8 and absolute or traversing paths fail before
the report is written. Arbitrary non-UTF-8 Git filenames are not supported.

### Symbol-aware impact (0.1.8+)

For supported code, impact automatically traces changed declarations through
named/aliased reexports, star barrels and static namespace members. Changing
`fetchA` need not affect a page that only calls `generatedClient.fetchB()`.
The diff must match the post-change source. Unknown provenance, dynamic/escaped
namespaces, effects, structural edits and unsupported syntax retain file-level
impact. `EntryTarget.symbol` is still a label, not a per-function target filter.

The summary prints refined/file-level counts per target/change pair and fallback
reasons. JSON `symbolEvidence` includes affected and pruned decisions, with
`precision`, `affected`, `changedSymbols`, a symbol `chain` or `fallbackReason`.
Existing `dependencyChains` stay file-level. This refinement does not require
exclusions and does not change graph query semantics.

### Type contracts and semantic no-ops (0.1.9+)

Set `impact.includeTypeOnly: true` in the existing `depic.config.json` to enable
supported interface/type-alias propagation. `changedSymbols` names declarations,
not fields: two consumers of `UserConfig` still both count. Unsupported types,
merging, effects and ambiguous paths keep explicit file-level fallback.

Verified comment/format-only files print `Semantic no-op files (checked AST
equivalence): ...` and a `semantic-noop` diagnostic. They were checked, unlike
`Excluded changed files (not analyzed)`. Runtime/type changes and changed directive
comments must not disappear. This is whole-file AST comparison, not general
semantic equivalence or mixed-hunk filtering. Both features require `0.1.9` or later.

Use `0.1.10+` for unchanged top-level directive wrappers and plain-label HTTP(S)
Markdown documentation links: these no longer block supported refinement merely
because earlier declarations grow or a documentation URL changes. Directive edits
and uncertain attachments still fall back; no configuration change is needed.

### Renamed files (0.1.12+)

A renamed destination is conservatively analyzed as a file-level change using the
head checkout's dependency graph. Current consumers can therefore appear in
`impacts` even when they are unchanged in the diff. The report also emits a
`renamed-file` warning whose message identifies the old path: consumers of that old
path cannot be analyzed precisely without a baseline graph. Deleted files remain
diagnostic-only, and rename destinations are not eligible for symbol/no-op pruning.

### Oxlint control comments (0.1.13+)

Oxlint directives are protected from checked no-op pruning. Changes between
`oxlint-disable` and `oxlint-enable`, rule-list edits, additions, removals,
reordering, and range movement remain conservative file-level impact. Unchanged
range wrappers with stable attachment still allow supported symbol/type
refinement inside the wrapped file.

### Exported object members (0.1.14+)

For supported exported object literals, `changedSymbols` and symbol chains use
qualified names such as `client.fetchA`. Static dot and string-key reads can
prune consumers of unrelated members. Dynamic reads, mutation, whole-object
escape, spreads, accessors, and uncertain shapes remain file-level and expose a
`fallbackReason` in `symbolEvidence`.

### Actionable chain truncation (0.1.15+)

When chain limits are reached, compact output names every truncated target,
prints returned/known-minimum counts and the active limits, shows one proven
omitted chain, and provides copyable recovery settings. Override config for one
run with:

```bash
depic impact . --diff change.diff --report report.json \
  --max-chains-per-target 40 --max-total-chains 20000
```

### Non-source changes and graph gaps (0.1.16+)

Compact output lists ordinary documentation/artifact changes as `Non-source
changed files (outside analyzed graph)`. The JSON report records these as
`non-source-file` with `level: "info"`; they remain visible but do not propagate
through the source graph. Source-like or analysis-included paths missing from the
graph remain `unmapped-file` warnings. Classification honors effective top-level
`include`, `exclude`, and `extensions` settings. Global-impact patterns still win.

### Deleted files and baseline checkouts (0.1.17+)

A pure deletion has no node in the head graph. Materialize the pre-change tree in
a separate directory and pass it explicitly:

```bash
git worktree add --detach /tmp/depic-baseline <base-revision>
depic impact . --diff change.diff --report report.json \
  --baseline-root /tmp/depic-baseline
```

Depic builds both graphs and reports baseline-proven chains with
`analysisBasis: "baseline"` or `"mixed"`. Without a usable baseline, JSON keeps
the deletion in `changedFiles`, sets top-level `analysisStatus: "incomplete"`,
and adds `unresolvedChanges` with `status: "unknown"`, a reason, and recovery
action. CLI output starts an `INCOMPLETE impact analysis` warning. The command
still exits zero when analysis itself succeeds; CI consumers must inspect
`analysisStatus` rather than equating exit zero or an empty `impacts` array with
complete coverage.

### Ignore generated changes only

Merge this optional setting into the existing config; keep your `impact.targets`:

```json
{
  "impact": {
    "excludeChangedFiles": ["src/generated/**"]
  }
}
```

Unlike top-level `exclude`, this filters only paths from the diff, not the dependency
graph. Generated modules can still appear in chains for other changes. Patterns
are root-relative and support `*` (one segment), `**` (across segments), and `**/`
(zero or more directories); other characters are literal. Filtering applies before
global-impact rules, using the old path for deletions and new path for renames.

The summary prints `Excluded changed files (not analyzed): ...`; the JSON report
includes an `excluded-changed-files` warning with the filtered paths in `files`.
Do not interpret an excluded change as unaffected. This is an explicit trade-off
that can hide real impact, not symbol-aware barrel analysis. Version `0.1.6` and
earlier do not support it; confirm the diagnostic when using a supporting version.

## CI

Pin `@depic/cli` in the consumer project's `devDependencies`, commit the lockfile,
and run it through the package manager rather than installing it globally:

```bash
pnpm install --frozen-lockfile
pnpm exec depic impact . \
  --diff .depic/change.diff \
  --report .depic/impact-report.json
```

Run `depic init .` once in a Git repository. It configures `.gitignore` so
the entire `.depic/` runtime artifact directory stays ignored. Review and commit
the root `depic.config.json` when it should be shared with the team.

For an ephemeral job that cannot modify the manifest, invoke a pinned version with
`pnpm dlx @depic/cli@0.1.18 impact ...`.

## License

MIT
