# ADR 002: Use one root project configuration

## Status

Accepted

## Context

Impact targets were initially stored beside generated diffs and reports under
`.depic/`. This mixed shareable project configuration with disposable runtime
artifacts and required fragile `.gitignore` exceptions.

Depic analysis options were also available only through API arguments, so CLI,
Web, VS Code, and impact analysis had no shared project-level source.

## Decision

- Use root `depic.config.json` as the single project configuration.
- Put analysis options at the top level and impact-specific options, including
  `targets`, under `impact`.
- Resolve relative configuration paths from the project root.
- Let explicit API and CLI values override configured values.
- Keep `--targets` as a temporary and legacy override.
- Reserve `.depic/` for generated diffs, reports, caches, and temporary files;
  ignore the directory as a whole.

## Consequences

Teams can review and commit one stable configuration while freely deleting or
ignoring all runtime artifacts. Existing target arrays continue to work through
`--targets`, and the impact-analysis skill can migrate them into the root config
without deleting the source automatically.
