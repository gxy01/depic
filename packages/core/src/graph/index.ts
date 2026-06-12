import type {
  FileNode,
  ExternalNode,
  Edge,
  GraphStats,
  DependencyGraphJSON,
} from './types.js';

export class DependencyGraph {
  private fileNodes = new Map<string, FileNode>();
  private externalNodes = new Map<string, ExternalNode>();
  private edgeList: Edge[] = [];

  // 缓存：邻接表（source → target[]）
  private adjOut = new Map<string, string[]>();
  private adjIn = new Map<string, string[]>();

  // 环检测缓存
  private cyclesCache: string[][] | null = null;
  private cyclesDirty = true;

  addFileNode(node: FileNode): void {
    this.fileNodes.set(node.id, node);
  }

  addExternalNode(node: ExternalNode): void {
    this.externalNodes.set(node.id, node);
  }

  addEdge(edge: Edge): void {
    this.edgeList.push(edge);
    this.cyclesDirty = true;
    // 更新邻接表
    if (!this.adjOut.has(edge.source)) {
      this.adjOut.set(edge.source, []);
    }
    this.adjOut.get(edge.source)!.push(edge.target);
    if (!this.adjIn.has(edge.target)) {
      this.adjIn.set(edge.target, []);
    }
    this.adjIn.get(edge.target)!.push(edge.source);
  }

  // ─── 节点查询 ───────────────────────────────────────────────

  getFileNode(path: string): FileNode | undefined {
    return this.fileNodes.get(path);
  }

  getSymbolNode(id: string): import('./types').SymbolNode | undefined {
    // 从 FileNode 的 exports 中查找
    for (const file of this.fileNodes.values()) {
      for (const exp of file.exports) {
        const symbolId = `${file.id}#${exp.name}`;
        if (symbolId === id) {
          return { kind: 'symbol', id, file: file.id, name: exp.name };
        }
      }
    }
    return undefined;
  }

  getExternalNode(name: string): ExternalNode | undefined {
    return this.externalNodes.get(name);
  }

  // ─── 依赖查询 ───────────────────────────────────────────────

  getDependencies(file: string): Edge[] {
    return this.edgeList.filter((e) => e.source === file);
  }

  getDependents(file: string): Edge[] {
    return this.edgeList.filter((e) => e.target === file);
  }

  getDependencyChain(fromFile: string, toFile: string): string[][] {
    const results: string[][] = [];
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (current: string): void => {
      if (visited.has(current)) return;
      // 允许到达目标节点（即使已经访问过其后续节点，但目标可以重复出现在不同路径中）
      if (current === toFile) {
        results.push([...path, current]);
        return;
      }
      visited.add(current);
      path.push(current);
      const neighbors = this.adjOut.get(current) ?? [];
      for (const next of neighbors) {
        dfs(next);
      }
      path.pop();
      visited.delete(current);
    };

    dfs(fromFile);
    return results;
  }

  // ─── 图算法 ─────────────────────────────────────────────────

  getCircularDependencies(): string[][] {
    if (!this.cyclesDirty && this.cyclesCache) return this.cyclesCache;

    const cycles: string[][] = [];
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const parent = new Map<string, string>();

    // 初始化所有节点为白色
    for (const nodeId of this.fileNodes.keys()) {
      color.set(nodeId, WHITE);
    }

    const dfs = (node: string): void => {
      color.set(node, GRAY);
      const neighbors = this.adjOut.get(node) ?? [];
      for (const next of neighbors) {
        // 只检查文件节点间的环
        if (!this.fileNodes.has(next)) continue;

        const nextColor = color.get(next) ?? WHITE;
        if (nextColor === GRAY) {
          // 找到了环：回溯 parent 链
          const cycle: string[] = [next];
          let cur = node;
          while (cur !== next) {
            cycle.push(cur);
            cur = parent.get(cur) ?? '';
            if (!cur) break;
          }
          cycle.push(next);
          cycle.reverse();
          cycles.push(cycle);
        } else if (nextColor === WHITE) {
          parent.set(next, node);
          dfs(next);
        }
      }
      color.set(node, BLACK);
    };

    for (const nodeId of this.fileNodes.keys()) {
      if ((color.get(nodeId) ?? WHITE) === WHITE) {
        dfs(nodeId);
      }
    }

    this.cyclesCache = cycles;
    this.cyclesDirty = false;
    return cycles;
  }

  /**
   * 符号溯源：从 fromFile 追踪 symbolName 的原始定义文件。
   * 返回文件链 [fromFile, ..., originFile] 或 undefined。
   */
  resolveSymbol(fromFile: string, symbolName: string): string[] | undefined {
    const chain: string[] = [fromFile];
    const visited = new Set<string>();
    visited.add(fromFile);

    let currentFile = fromFile;

    while (true) {
      const node = this.fileNodes.get(currentFile);
      if (!node) return undefined;

      // 检查符号是否在当前文件本地定义
      const localExport = node.exports.find(
        (e) => e.name === symbolName && !e.reExportFrom,
      );
      if (localExport) {
        // 本地定义：到达终点
        break;
      }

      // 查找下一步：import 或 re-export
      let nextFile: string | undefined;

      // 1. 从 import 查找
      for (const imp of node.imports) {
        if (
          imp.resolvedFile &&
          imp.symbols.some((s) => s.local === symbolName || s.imported === symbolName)
        ) {
          nextFile = imp.resolvedFile;
          break;
        }
      }

      // 2. 从 re-export 边查找（不含 import 时）
      if (!nextFile) {
        const reExportEdge = this.edgeList.find(
          (e) =>
            e.source === currentFile &&
            e.kind === 're-export' &&
            this.fileNodes.has(e.target),
        );
        if (reExportEdge) {
          // 检查目标文件是否有该符号的导出
          const targetNode = this.fileNodes.get(reExportEdge.target);
          if (
            targetNode?.exports.some(
              (e) => e.name === symbolName || e.name === '*',
            )
          ) {
            nextFile = reExportEdge.target;
          }
        }
      }

      if (!nextFile || visited.has(nextFile)) break;
      visited.add(nextFile);
      chain.push(nextFile);
      currentFile = nextFile;
    }

    // 最后检查是否真正到达了定义该符号的文件
    const lastNode = this.fileNodes.get(chain[chain.length - 1]);
    const definedHere = lastNode?.exports.some(
      (e) => e.name === symbolName && !e.reExportFrom,
    );
    if (!definedHere) {
      // 可能通过 export * 间接导出，检查链条中是否有 re-export *
      const hasStarReExport = chain.some((f) => {
        const n = this.fileNodes.get(f);
        return n?.exports.some(
          (e) => e.name === '*' && e.reExportFrom,
        );
      });
      if (!hasStarReExport) return undefined;
    }

    return chain;
  }

  hasCycle(path: string): boolean {
    const cycles = this.getCircularDependencies();
    // 缓存结果避免重复计算
    // 简单实现：直接检查每个环是否包含该文件
    for (const cycle of cycles) {
      if (cycle.includes(path)) return true;
    }
    return false;
  }

  getTransitiveDependencies(file: string): Set<string> {
    const result = new Set<string>();
    const visited = new Set<string>();
    const queue = [file];
    visited.add(file);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this.adjOut.get(current) ?? [];
      for (const next of neighbors) {
        // 只追文件节点的传递依赖（外部节点也算？spec 里没说）
        if (!visited.has(next)) {
          visited.add(next);
          if (this.fileNodes.has(next)) {
            result.add(next);
            queue.push(next);
          }
        }
      }
    }

    return result;
  }

  // ─── 遍历 ──────────────────────────────────────────────────

  files(): FileNode[] {
    return [...this.fileNodes.values()];
  }

  externalModules(): ExternalNode[] {
    return [...this.externalNodes.values()];
  }

  edges(): Edge[] {
    return this.edgeList;
  }

  // ─── 统计 ──────────────────────────────────────────────────

  stats(): GraphStats {
    const internalEdges = this.edgeList.filter(
      (e) => this.fileNodes.has(e.target),
    );
    return {
      fileCount: this.fileNodes.size,
      externalCount: this.externalNodes.size,
      edgeCount: this.edgeList.length,
      internalEdgeCount: internalEdges.length,
      externalEdgeCount: this.edgeList.length - internalEdges.length,
    };
  }

  // ─── 导出 ──────────────────────────────────────────────────

  toJSON(): DependencyGraphJSON {
    return {
      nodes: [...this.fileNodes.values(), ...this.externalNodes.values()],
      edges: this.edgeList,
    };
  }

  toDot(): string {
    const lines: string[] = ['digraph deps {'];
    for (const node of this.fileNodes.values()) {
      const label = node.id.split('/').slice(-2).join('/');
      lines.push(`  "${node.id}" [label="${label}"];`);
    }
    for (const node of this.externalNodes.values()) {
      lines.push(
        `  "${node.id}" [label="${node.id}", shape=box, style=dashed];`,
      );
    }
    for (const edge of this.edgeList) {
      lines.push(`  "${edge.source}" -> "${edge.target}";`);
    }
    lines.push('}');
    return lines.join('\n');
  }
}
