# Depic contributor guide

## Project overview

Depic is a pnpm TypeScript monorepo for analyzing JavaScript/TypeScript module
dependencies. `@depic/core` is the source of truth: it parses source with SWC,
resolves module specifiers, and builds a dependency graph. All other packages
consume its public API.

| Package | Responsibility |
| --- | --- |
| `packages/core` (`@depic/core`) | Parser, resolver, graph algorithms, and `analyze()` |
| `packages/cli` (`@depic/cli`) | Command-line presentation and file output |
| `packages/web` (`@depic/web`) | HTML generation, HTTP server, and React/Sigma client |
| `packages/vscode` (`depic-vscode`) | VS Code commands, webview integration, and in-memory graph cache |

Keep dependency direction one-way: adapters (`cli`, `web`, `vscode`) may depend
on `core`; `core` must not depend on UI, CLI, VS Code, or network concerns.

## Toolchain and commands

- Use the repository's pinned package manager: `pnpm@10.11.0`.
- Install dependencies with `pnpm install`.
- Run all tests with `pnpm test:run`; run a package suite with
  `pnpm --filter @depic/core test:run` (substitute the appropriate package).
- Validate types with `pnpm typecheck`.
- Lint source with `pnpm lint`; use `pnpm lint:fix` only for intended fixes.
- Build the distributable packages with `pnpm build`.
- Build the standalone Web client when changing `packages/web/src/client` with
  `pnpm --filter @depic/web build-client`.

For a focused change, run that package's tests and typecheck. Before handing off
a cross-package change, run `pnpm test:run`, `pnpm typecheck`, and `pnpm lint`.
Changes involving generated distribution files should also be checked with
`pnpm build`.

## TypeScript conventions

- The project uses strict TypeScript, ESM, and `moduleResolution: "bundler"`.
- In runtime source, use `.js` extensions for relative ESM import/export
  specifiers (for example, `./graph/index.js`). Keep existing test import style
  when adding tests.
- Prefer `node:` built-in module specifiers and `import type` for type-only
  imports.
- Keep public exports explicit in each package's `src/index.ts`; update them
  whenever a public API is added or changed.
- Follow the existing formatting: two-space indentation, single quotes,
  semicolons, and trailing commas in multiline literals.
- `oxlint` forbids `require()` imports. Use ESM imports instead.

## Implementation guidance

### Core analysis behavior

- Preserve absolute file paths for graph file-node IDs and package names for
  external-node IDs.
- Treat a bare specifier as an external dependency unless the resolver proves it
  is a workspace/internal file. Do not silently turn unresolved dependencies into
  file nodes.
- Keep import metadata (`kind`, `specifier`, symbols, type-only status, and
  source location) intact from parser through graph output.
- New syntax support should include parser fixtures and focused tests under
  `packages/core/src/parser/__tests__/`; resolver behavior belongs in
  `packages/core/src/resolver/__tests__/`; graph behavior belongs in
  `packages/core/src/graph/__tests__/`.
- Avoid introducing package-specific behavior into `core`. Add adapter behavior
  in CLI, Web, or VS Code instead.

### Adapter behavior

- CLI commands should format or serialize core results; avoid duplicating
  analysis, resolution, or graph algorithms.
- The Web server/generator must continue to produce a self-contained HTML view.
  React client code lives only in `packages/web/src/client`.
- Keep VS Code extension code compatible with the declared VS Code engine and
  invalidate its in-memory graph cache when relevant workspace files change.
- `packages/web/dist-client/index.html` is a tracked built asset. Change the
  client source first, then regenerate it with `build-client`; do not hand-edit
  the generated HTML.

## Testing expectations

- Use Vitest and place tests beside the relevant unit of behavior under
  `src/**/__tests__/` (Web uses `src/__tests__/`). Name files `*.test.ts`.
- Prefer small temporary fixture projects (`mkdtempSync` plus source files) for
  resolution and end-to-end analysis cases; clean them up in `afterEach` or the
  test itself.
- When changing graph semantics, cover both the graph API result and serialized
  output if consumers rely on it.
- Preserve the core integration invariant that this repository analyzes without
  circular dependencies, unless an intentional architecture change updates that
  expectation and its tests.

## Documentation and generated output

- Update the relevant English and Chinese README files when a user-facing CLI
  command, public API, or package behavior changes.
- Record material architectural decisions in `docs/adr/`.
- Do not edit ignored `dist/` directories by hand. They are build output.
- `spec.md` describes intended product scope; reconcile it with implemented
  behavior instead of treating undocumented assumptions as requirements.
