import { defineConfig } from 'rolldown';

export default defineConfig([
  // @depic/core
  {
    input: 'packages/core/src/index.ts',
    output: { format: 'esm', dir: 'packages/core/dist' },
    external: ['@swc/core', /^node:/],
    platform: 'node',
  },
  // @depic/web
  {
    input: 'packages/web/src/index.ts',
    output: { format: 'esm', dir: 'packages/web/dist' },
    external: ['@depic/core', /^node:/],
    platform: 'node',
  },
  // @depic/cli
  {
    input: 'packages/cli/src/index.ts',
    output: { format: 'esm', dir: 'packages/cli/dist' },
    external: ['@depic/core', '@depic/web', /^node:/],
    platform: 'node',
  },
  // depic-vscode
  {
    input: 'packages/vscode/src/extension.ts',
    output: { format: 'cjs', dir: 'packages/vscode/dist' },
    external: ['@depic/core', '@depic/web', 'vscode', /^node:/],
    platform: 'node',
  },
]);
