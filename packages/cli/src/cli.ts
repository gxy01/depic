#!/usr/bin/env node
import { runAnalyze, runCycles, runDependents, runStats, runWeb, runServe } from './index';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<void> {
  switch (command) {
    case 'analyze': {
      const root = resolve(args[1] ?? '.');
      const dot = args.includes('--dot');
      process.stdout.write((await runAnalyze(root, dot)) + '\n');
      break;
    }
    case 'cycles': {
      const root = resolve(args[1] ?? '.');
      process.stdout.write((await runCycles(root)) + '\n');
      break;
    }
    case 'dependents': {
      const file = resolve(args[1] ?? '.');
      const root = resolve(args[2] ?? '.');
      process.stdout.write((await runDependents(file, root)) + '\n');
      break;
    }
    case 'stats': {
      const root = resolve(args[1] ?? '.');
      process.stdout.write((await runStats(root)) + '\n');
      break;
    }
    case 'web': {
      const root = resolve(args[1] ?? '.');
      const output = args[2];
      process.stdout.write((await runWeb(root, output)) + '\n');
      break;
    }
    case 'serve': {
      const root = resolve(args[1] ?? '.');
      const port = parseInt(args[2]) || 3000;
      process.stdout.write((await runServe(root, port)) + '\n');
      // keep process alive
      await new Promise(() => {});
      break;
    }
    default:
      process.stderr.write(`depic — JS/TS dependency analysis

Usage:
  depic analyze <root>       Analyze project, output JSON (--dot for DOT)
  depic cycles <root>        Detect circular dependencies
  depic dependents <file> [root]  Show files that depend on <file>
  depic stats <root>         Show dependency statistics
  depic web <root> [output]  Generate interactive HTML visualization
  depic serve <root> [port]  Start local web server with live visualization
`);
      process.exit(1);
  }
}

main().catch((err: Error) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
