# @depic/cli

Command-line tool for JS/TS dependency analysis.

English | [中文](./README.zh-CN.md)

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
depic web <root> [output]  Generate interactive HTML visualization
depic serve <root> [port]  Start local web server with live visualization
```

## License

MIT
