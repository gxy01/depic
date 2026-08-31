#!/usr/bin/env node
import { runAnalyze, runCycles, runDependents, runStats, runWeb, runServe, runInit, runImpact } from './index.js';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const usage = `depic — JS/TS dependency analysis

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

Options:
  -h, --help                Show help for depic or a subcommand
  -V, --version             Show the installed CLI version
`;

const commandUsage: Record<string, string> = {
  init: `Usage: depic init [root]

Configure Git ignore rules for Depic runtime artifacts under .depic/.

Arguments:
  root                        Project root (default: current directory)

Options:
  -h, --help                  Show this help
`,
  analyze: `Usage: depic analyze [root] [--dot]

Analyze a project and print its dependency graph.

Arguments:
  root                        Project root (default: current directory)

Options:
  --dot                       Output Graphviz DOT instead of JSON
  -h, --help                  Show this help
`,
  cycles: `Usage: depic cycles [root]

Detect circular dependencies in a project.

Arguments:
  root                        Project root (default: current directory)

Options:
  -h, --help                  Show this help
`,
  dependents: `Usage: depic dependents <file> [root]

Show files that depend on a source file.

Arguments:
  file                        Source file to inspect
  root                        Project root (default: current directory)

Options:
  -h, --help                  Show this help
`,
  stats: `Usage: depic stats [root]

Print dependency statistics as JSON.

Arguments:
  root                        Project root (default: current directory)

Options:
  -h, --help                  Show this help
`,
  impact: `Usage: depic impact [root] --diff <path> [--targets <path>] --report <path>

Report potentially impacted entries and workspace packages.

Arguments:
  root                        Project root (default: current directory)

Options:
  --diff <path>               Unified diff to analyze (required)
  --targets <path>            JSON target file; overrides configured targets
  --report <path>             Output path for the JSON report (required)
  -h, --help                  Show this help

Configuration (depic.config.json):
  impact.targets              Shared entry/package targets
  impact.includeTypeOnly      Include supported type-only propagation
  impact.excludeChangedFiles  Ignore matching changed files before analysis
  impact.globalImpactPatterns Treat matching changes as global impact
  impact.maxChainsPerTarget   Maximum dependency chains reported per target
  impact.maxTotalChains       Maximum dependency chains reported overall
`,
  web: `Usage: depic web [root] [output]

Generate an interactive HTML dependency visualization.

Arguments:
  root                        Project root (default: current directory)
  output                      Output HTML path

Options:
  -h, --help                  Show this help
`,
  serve: `Usage: depic serve [root] [port]

Start a local server with a live dependency visualization.

Arguments:
  root                        Project root (default: current directory)
  port                        HTTP port (default: 3000)

Options:
  -h, --help                  Show this help
`,
};

const cliVersion = (JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string }).version;

type WriteOutput = (value: string) => void;

export async function runCli(
  args: string[] = process.argv.slice(2),
  writeStdout: WriteOutput = (value) => process.stdout.write(value),
  writeStderr: WriteOutput = (value) => process.stderr.write(value),
): Promise<number> {
  const command = args[0];

  if (command === '--version' || command === '-V') {
    writeStdout(`${cliVersion}\n`);
    return 0;
  }

  if (command === '--help' || command === '-h') {
    writeStdout(usage);
    return 0;
  }

  if (command && args.slice(1).some((arg) => arg === '--help' || arg === '-h')) {
    const subcommandUsage = commandUsage[command];
    if (subcommandUsage) {
      writeStdout(subcommandUsage);
      return 0;
    }
  }

  switch (command) {
    case 'analyze': {
      const root = resolve(args[1] ?? '.');
      const dot = args.includes('--dot');
      writeStdout((await runAnalyze(root, dot)) + '\n');
      break;
    }
    case 'cycles': {
      const root = resolve(args[1] ?? '.');
      writeStdout((await runCycles(root)) + '\n');
      break;
    }
    case 'dependents': {
      const file = resolve(args[1] ?? '.');
      const root = resolve(args[2] ?? '.');
      writeStdout((await runDependents(file, root)) + '\n');
      break;
    }
    case 'stats': {
      const root = resolve(args[1] ?? '.');
      writeStdout((await runStats(root)) + '\n');
      break;
    }
    case 'web': {
      const root = resolve(args[1] ?? '.');
      const output = args[2];
      writeStdout((await runWeb(root, output)) + '\n');
      break;
    }
    case 'init': {
      const root = resolve(args[1] ?? '.');
      writeStdout(runInit(root) + '\n');
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
      writeStdout((await runImpact(
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
      writeStdout((await runServe(root, port)) + '\n');
      // keep process alive
      await new Promise(() => {});
      break;
    }
    default:
      writeStderr(usage);
      return 1;
  }

  return 0;
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((err: Error) => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exitCode = 1;
  });
}
