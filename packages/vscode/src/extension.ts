import * as vscode from 'vscode';
import { analyze, type DependencyGraph } from '@depic/core';
import { generateHtmlFromGraph } from '@depic/web';
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFileDetailsResponse } from './webview-message.js';

let outputChannel: vscode.OutputChannel;
let extContext: vscode.ExtensionContext;

/** 缓存的图实例，按 workspace root 索引 */
const graphCache = new Map<string, { graph: DependencyGraph; timestamp: number }>();

/** 获取或构建缓存的分析结果 */
async function getCachedGraph(root: string): Promise<DependencyGraph> {
  const cached = graphCache.get(root);
  if (cached) return cached.graph;

  ensureGitignore(root);
  const graph = await analyze({ root });
  graphCache.set(root, { graph, timestamp: Date.now() });
  return graph;
}

/** 使指定 workspace 的缓存失效 */
function invalidateCache(root: string): void {
  graphCache.delete(root);
}

/** 使所有缓存失效 */
function invalidateAllCaches(): void {
  graphCache.clear();
}

export function activate(context: vscode.ExtensionContext): void {
  extContext = context;
  outputChannel = vscode.window.createOutputChannel('Depic');

  // 监听文件变化，自动失效缓存
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/*.{ts,tsx,js,jsx,json}',
    false, // ignoreCreateEvents
    false, // ignoreChangeEvents
    false, // ignoreDeleteEvents
  );
  watcher.onDidChange((uri) => {
    const root = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
    if (root) invalidateCache(root);
  });
  watcher.onDidCreate((uri) => {
    const root = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
    if (root) invalidateCache(root);
  });
  watcher.onDidDelete((uri) => {
    const root = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
    if (root) invalidateCache(root);
  });

  context.subscriptions.push(watcher);

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('depic.analyze', showGraph),
    vscode.commands.registerCommand('depic.cycles', checkCycles),
    vscode.commands.registerCommand('depic.dependents', showDependents),
    vscode.commands.registerCommand('depic.stats', showStats),
    vscode.commands.registerCommand('depic.refresh', async () => {
      invalidateAllCaches();
      vscode.window.showInformationMessage('Depic cache cleared. Next command will re-analyze.');
    }),
  );
}

export function deactivate(): void {
  outputChannel?.dispose();
  graphCache.clear();
}

/** 确保 .depic/ 在 .gitignore 中 */
function ensureGitignore(root: string): void {
  try {
    const gitignorePath = join(root, '.gitignore');
    const pattern = '.depic/';
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8');
      if (content.split('\n').some((line: string) => line.trim() === pattern)) return;
      appendFileSync(gitignorePath, `\n${pattern}\n`);
    } else {
      writeFileSync(gitignorePath, `${pattern}\n`);
    }
  } catch {
    // 非关键操作，忽略错误
  }
}

async function getRoot(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return undefined;
  }
  return folders[0].uri.fsPath;
}

async function showGraph(): Promise<void> {
  const root = await getRoot();
  if (!root) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Analyzing dependencies…' },
    async () => {
      const graph = await getCachedGraph(root);
      const html = generateHtmlFromGraph(graph, root.split('/').pop() ?? root);

      const panel = vscode.window.createWebviewPanel(
        'depicGraph',
        'Dependency Graph',
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      // Handle file detail requests from webview
      panel.webview.onDidReceiveMessage((msg) => {
        const response = createFileDetailsResponse(graph, msg);
        if (response) panel.webview.postMessage(response);
      });
      panel.webview.html = html;
    },
  );
}

async function checkCycles(): Promise<void> {
  const root = await getRoot();
  if (!root) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Checking for circular dependencies…' },
    async () => {
      const graph = await getCachedGraph(root);
      const cycles = graph.getCircularDependencies();

      outputChannel.clear();
      outputChannel.show();

      if (cycles.length === 0) {
        outputChannel.appendLine('✅ No circular dependencies found.');
        vscode.window.showInformationMessage('No circular dependencies found.');
      } else {
        outputChannel.appendLine(`⚠ Found ${cycles.length} circular dependenc${cycles.length > 1 ? 'ies' : 'y'}:\n`);
        for (let i = 0; i < cycles.length; i++) {
          outputChannel.appendLine(`  Cycle ${i + 1}:`);
          outputChannel.appendLine(`    ${cycles[i].join(' → ')}`);
          outputChannel.appendLine('');
        }
        vscode.window.showWarningMessage(`Found ${cycles.length} circular dependenc${cycles.length > 1 ? 'ies' : 'y'}.`);
      }
    },
  );
}

async function showDependents(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor.');
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Finding dependents…' },
    async () => {
      const graph = await getCachedGraph(root);
      const dependents = graph.getDependents(filePath);

      outputChannel.clear();
      outputChannel.show();

      if (dependents.length === 0) {
        outputChannel.appendLine(`No files depend on ${filePath}.`);
      } else {
        outputChannel.appendLine(`Files that depend on ${filePath}:\n`);
        for (const dep of dependents) {
          outputChannel.appendLine(`  ${dep.source} (${dep.kind}: ${dep.specifier})`);
        }
        outputChannel.appendLine(`\nTotal: ${dependents.length} file(s).`);
      }
    },
  );
}

async function showStats(): Promise<void> {
  const root = await getRoot();
  if (!root) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Computing statistics…' },
    async () => {
      const graph = await getCachedGraph(root);
      const stats = graph.stats();

      outputChannel.clear();
      outputChannel.show();

      outputChannel.appendLine('📊 Dependency Statistics\n');
      outputChannel.appendLine(`  Files:            ${stats.fileCount}`);
      outputChannel.appendLine(`  External modules: ${stats.externalCount}`);
      outputChannel.appendLine(`  Total edges:      ${stats.edgeCount}`);
      outputChannel.appendLine(`  Internal edges:   ${stats.internalEdgeCount}`);
      outputChannel.appendLine(`  External edges:   ${stats.externalEdgeCount}`);

      vscode.window.showInformationMessage(
        `${stats.fileCount} files, ${stats.edgeCount} edges, ${stats.externalCount} external modules.`,
      );
    },
  );
}
