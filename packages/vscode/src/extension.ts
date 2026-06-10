import * as vscode from 'vscode';
import { analyze } from '@depic/core';
import { generateHtmlFromGraph } from '@depic/web';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Depic');

  context.subscriptions.push(
    vscode.commands.registerCommand('depic.analyze', showGraph),
    vscode.commands.registerCommand('depic.cycles', checkCycles),
    vscode.commands.registerCommand('depic.dependents', showDependents),
    vscode.commands.registerCommand('depic.stats', showStats),
  );
}

export function deactivate(): void {
  outputChannel?.dispose();
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
      const graph = await analyze({ root });
      const html = generateHtmlFromGraph(graph, root.split('/').pop() ?? root);

      const panel = vscode.window.createWebviewPanel(
        'depicGraph',
        'Dependency Graph',
        vscode.ViewColumn.Beside,
        { enableScripts: true },
      );
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
      const graph = await analyze({ root });
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
      const graph = await analyze({ root });
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
      const graph = await analyze({ root });
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
