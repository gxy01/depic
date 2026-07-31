#!/usr/bin/env node
import { runAnalyze, runCycles, runDependents, runStats, runWeb, runServe, runInit, runImpact } from './index.js';
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
    case 'init': {
      const root = resolve(args[1] ?? '.');
      process.stdout.write(runInit(root) + '\n');
      break;
    }
    case 'impact': {
      const getOption = (name: string): string | undefined => {
        const index = args.indexOf(name);
        return index >= 0 ? args[index + 1] : undefined;
      };
      const diff = getOption('--diff');
      const targets = getOption('--targets');
      const report = getOption('--report');
      if (!diff || !report) {
        throw new Error('impact requires --diff <path> and --report <path>.');
      }
      process.stdout.write((await runImpact(
        resolve(args[1]?.startsWith('--') ? '.' : args[1] ?? '.'),
        resolve(diff),
        targets ? resolve(targets) : undefined,
        resolve(report),
      )) + '\n');
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
  depic init [root]          Configure Git rules for .depic artifacts
  depic analyze <root>       Analyze project, output JSON (--dot for DOT)
  depic cycles <root>        Detect circular dependencies
  depic dependents <file> [root]  Show files that depend on <file>
  depic stats <root>         Show dependency statistics
  depic impact [root] --diff <path> [--targets <path>] --report <path>
                              Report potentially impacted entries and packages
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
