# @depic/cli

Command-line tool for JS/TS dependency analysis.

English | [中文](https://github.com/gxy01/depic/blob/main/packages/cli/README.zh-CN.md)

## Install

```bash
npm install @depic/cli
```

## Commands

```bash
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
