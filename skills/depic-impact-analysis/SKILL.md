---
name: depic-impact-analysis
description: Identify which application entries or monorepo packages are potentially affected by a code change using Depic. Use when asked for change impact, affected pages/routes/tasks, impacted workspace packages, test scope from a unified diff, or an explainable dependency chain from a change to a consumer.
---

# Depic Impact Analysis

Use this skill to turn a unified diff into a conservative, explainable impact report. Depic reports static dependency impact, not whether a user-visible behavior definitely changed.

## Install and first-time setup

Install the published CLI before analyzing:

```bash
npm install --global @depic/cli
depic --help
```

For a project using this skill for the first time:

1. Detect whether `<root>` is a Git repository. If it is not, skip all Git and
   `.gitignore` guidance.
2. Check for `<root>/depic.config.json`. Preserve all existing keys and reuse
   `impact.targets` when present; do not overwrite it without explicit approval.
3. If the config is missing or has no targets, discover candidates as described
   below. If an old `.depic/impact-targets.json` or `depic-targets.json` exists,
   use it as migration input. Show the proposed merged `depic.config.json` and ask
   the user to confirm or correct it before writing.
4. In a Git repository, inspect `.gitignore`. If `.depic/` is not ignored,
   explain that `depic init <root>` will update `.gitignore`; include this change
   in the same setup confirmation.
5. After confirmation, run `depic init <root>` when needed and write
   `<root>/depic.config.json`. Leave legacy target files untouched unless the
   user explicitly asks to remove them.
6. In a Git repository, recommend reviewing and committing
   `depic.config.json`. Do not stage or commit it unless explicitly asked.
7. Run one analysis against a known unified diff and inspect diagnostics before
   using the report as CI or test-selection input.

## Configure impact targets

Create and maintain `impact.targets` in `depic.config.json` as a deliberate map
of the surfaces that matter to the user. Do not include every source file.

When configuring targets for the first time, discover candidates before asking
for confirmation:

- Inspect routing declarations, file-based route directories, application
  bootstrap code, CLI command registration, and task/job registration to propose
  `entry` targets.
- Inspect workspace manifests (`pnpm-workspace.yaml`, package-manager workspace
  settings, and nested `package.json` files) to propose `package` targets.
- Prioritize independently deployed, published, tested, or user-facing surfaces.
  Exclude third-party dependencies, generated files, and ordinary helpers.
- Present the candidates as JSON together with a short rationale per target.
  Ask one explicit confirmation question before creating the configuration file.

For `entry` targets:

- Identify independently invoked surfaces: routes/pages, application bootstraps,
  CLI commands, jobs, or task handlers.
- Use a stable, human-readable `id`, such as `/users`, `cli:build`, or `job:sync`.
- Set `file` to the entry module relative to the project root. Set `symbol` when
  a particular exported function, class, or component names the entry.
- Add or update entries when route declarations, command registration, task
  registration, or entry files change.

For `package` targets:

- Inspect workspace `package.json` files and use their exact `name` values.
- Add packages that are deployment units, published libraries, independently
  tested applications, or other meaningful review/test boundaries.
- Do not add third-party dependencies or every internal folder as package targets.
- Update package targets when workspace packages are added, renamed, removed, or
  when the desired validation scope changes.

Example configuration:

```json
{
  "impact": {
    "targets": [
      {
        "kind": "entry",
        "id": "/users",
        "file": "src/pages/UsersPage.tsx",
        "symbol": "UsersPage"
      },
      {
        "kind": "package",
        "id": "@acme/web",
        "package": "@acme/web"
      }
    ]
  }
}
```

## Inputs

Require a project root and a unified diff representing changes already applied to that root. Do not ask Depic to read Git state; if a diff file is not supplied, obtain or ask for the diff before running analysis.

Select one or both target types:

- `entry`: A page, route, command, job, or other independently invoked entry. Identify it as a relative file path plus an optional function/class/component name.
- `package`: A monorepo package, identified by its `package.json` `name`.

## Workflow

1. Inspect the project structure and dependency conventions before creating targets.
2. For requested entry impact, identify real entry points. Prefer route declarations, file-based routes, app bootstrap code, command registration, or task registration. Do not label every imported component or helper as an entry.
3. For requested package impact, find workspace `package.json` files and use each package's `name`. Include only packages within the requested scope.
4. Create or update `impact.targets` in `depic.config.json`. Preserve unrelated
   configuration, keep paths relative to the project root, and make IDs stable.
5. Run:

   ```bash
   depic impact <root> --diff <diff-file> --report <report-file>
   ```

6. Read the report and present the compact summary first. For every impacted target, state its impact level, changed files, and a representative dependency chain. Link or attach the JSON report when it is useful.
7. Surface diagnostics. In particular, do not claim precise results for deleted or renamed files, missing targets, or a truncated report.

Use the root `depic.config.json` by default. Use `--targets <targets-file>` only
as a temporary or legacy override. Generated diff files, reports, caches, and
temporary files belong under the fully ignored `.depic/` directory, such as
`.depic/change.diff` and `.depic/impact-report.json`. Never suggest committing
them unless the user explicitly requests a durable report artifact.

## Config format

```json
{
  "impact": {
    "targets": [
      {
        "kind": "entry",
        "id": "/users",
        "file": "src/pages/UsersPage.tsx",
        "symbol": "UsersPage"
      },
      {
        "kind": "package",
        "id": "@acme/ui",
        "package": "@acme/ui"
      }
    ]
  }
}
```

## Interpretation

- `direct`: The target itself changed or directly depends on a changed file. Pure
  re-export barrels are transparent for this classification, although they remain
  visible in the dependency chain.
- `transitive`: The target reaches a changed file through one or more intermediate modules.
- `global`: A configuration change requires validating every supplied target; no dependency chain is implied.

Chains are reported shortest-first. Treat the output as a conservative test and
review scope. `EntryTarget.symbol` identifies the target but does not enable
function-level filtering: a shared file-level aggregator can therefore produce a
possible impact even when the target uses a different export. Use a separate
semantic review when deciding whether a change truly affects behavior.
