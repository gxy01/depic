# Depic

A JavaScript/TypeScript dependency analysis toolkit powered by SWC. Parse source code into module dependency graphs, with circular dependency detection, topological sorting, and interactive visualization.

## Architecture

```
┌──────────────────────────────┐
│           CLI                │  Command-line interface
├──────────────────────────────┤
│         VS Code              │  IDE integration
├──────────────────────────────┤
│         Web UI / API         │  Interactive visualization
├──────────────────────────────┤
│                              │
│           core               │  Core engine
│   ┌─────┐ ┌──────┐ ┌──────┐ │
│   │parser│ │resolv│ │graph │ │
│   └─────┘ └──────┘ └──────┘ │
│                              │
└──────────────────────────────┘
```

## Packages

| Package | Description | npm |
|---|---|---|
| `@depic/core` | Core engine: parsing, resolution, graph operations | `npm i @depic/core` |
| `@depic/cli` | Command-line tool | `npm i @depic/cli` |
| `@depic/web` | Interactive web UI & server | `npm i @depic/web` |
| `depic-vscode` | VS Code extension | VS Code Marketplace |

## Development

```bash
pnpm install   # Install dependencies
pnpm build     # Build all packages
pnpm test      # Run tests
pnpm typecheck # Type-check
```

## Tech Stack

**TypeScript** · **SWC** · **Vitest** · **pnpm** monorepo
