import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { AnalyzeOptions } from './types.js';
import type { ImpactTarget } from './impact/types.js';

export const DEPIC_CONFIG_FILE = 'depic.config.json';

export interface DepicImpactConfig {
  targets?: ImpactTarget[];
  globalImpactPatterns?: string[];
  /** Root-relative globs excluded from the input diff, not from graph discovery. */
  excludeChangedFiles?: string[];
  includeTypeOnly?: boolean;
  maxChainsPerTarget?: number;
  maxTotalChains?: number;
}

export interface DepicConfig extends Omit<AnalyzeOptions, 'root'> {
  impact?: DepicImpactConfig;
}

export function loadDepicConfig(root: string): DepicConfig | undefined {
  const configPath = join(resolve(root), DEPIC_CONFIG_FILE);
  if (!existsSync(configPath)) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to parse ${DEPIC_CONFIG_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${DEPIC_CONFIG_FILE} must contain a JSON object.`);
  }
  return parsed as DepicConfig;
}

export function applyDepicConfig(options: AnalyzeOptions): AnalyzeOptions {
  const root = resolve(options.root);
  const config = loadDepicConfig(root);
  const tsconfigPath = options.tsconfigPath ?? config?.tsconfigPath;
  const workspace = options.workspace ?? config?.workspace;

  return {
    root,
    include: options.include ?? config?.include,
    exclude: options.exclude ?? config?.exclude,
    tsconfigPath: tsconfigPath
      ? isAbsolute(tsconfigPath) ? tsconfigPath : resolve(root, tsconfigPath)
      : undefined,
    extensions: options.extensions ?? config?.extensions,
    symbolLevel: options.symbolLevel ?? config?.symbolLevel,
    workspace: workspace
      ? {
          ...workspace,
          root: workspace.root
            ? isAbsolute(workspace.root) ? workspace.root : resolve(root, workspace.root)
            : undefined,
        }
      : undefined,
  };
}
