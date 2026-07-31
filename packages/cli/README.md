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
npx skills add gxy01/depic --skill depic-impact-analysis
```

The Skill owns repository inspection and first-run target discovery. It proposes
framework-specific `entry` targets and workspace `package` targets, asks the
user to confirm them, and stores the shared result in `depic.config.json`. This
CLI owns reproducible execution: it reads the confirmed targets and a unified
diff, calls `@depic/core`, writes the detailed JSON report, and prints a compact
summary. Depic itself does not read Git state or invoke an AI model.

## Commands

```bash
depic init [root]          Configure Git rules for .depic artifacts
depic analyze <root>       Analyze project, output JSON (--dot for Graphviz)
depic cycles <root>        Detect circular dependencies
depic dependents <file>    Show files that depend on <file>
depic stats <root>         Show dependency statistics
depic impact [root] --diff <path> [--targets <path>] --report <path>
                            Report potentially impacted entries and packages
depic web <root> [output]  Generate interactive HTML visualization
depic serve <root> [port]  Start local web server with live visualization
```

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
`pnpm dlx @depic/cli@0.1.5 impact ...`.

## License

MIT
