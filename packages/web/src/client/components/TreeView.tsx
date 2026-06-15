import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { DependencyGraphJSON } from '../data';

interface Props {
  data: DependencyGraphJSON;
  cycleSet: Set<string>;
  search: string;
  onSelectFile: (f: string) => void;
  scrollToFileRef: React.MutableRefObject<((f: string) => void) | null>;
}

interface FlatRow {
  file: string;
  depth: number;
  name: string;
  path: string;
  hasChildren: boolean;
  isExpanded: boolean;
  isCycle: boolean;
  isExternal: boolean;
}

export function TreeView({ data, cycleSet, search, onSelectFile, scrollToFileRef }: Props) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    const hasDependents = new Set(data.edges.map(e => e.target));
    const roots = data.nodes.filter(n => n.kind === 'file' && !hasDependents.has(n.id)).map(n => n.id).slice(0, 15);
    for (const r of roots) {
      init.add(r);
      const deps = data.edges.filter(e => e.source === r).slice(0, 3);
      for (const d of deps) init.add(d.target);
    }
    return init;
  });

  const toggle = useCallback((file: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file); else next.add(file);
      return next;
    });
  }, []);

  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];
    const fileIds = new Set(data.nodes.filter(n => n.kind === 'file').map(n => n.id));
    const hasDependents = new Set(data.edges.map(e => e.target));

    const roots = data.nodes
      .filter(n => n.kind === 'file' && !hasDependents.has(n.id))
      .map(n => n.id)
      .slice(0, 200);

    if (roots.length === 0) {
      const first = data.nodes.filter(n => n.kind === 'file').slice(0, 10).map(n => n.id);
      roots.push(...first);
    }

    const seen = new Set<string>();
    function walk(file: string, depth: number, ancestry: Set<string>) {
      if (depth > 6 || seen.has(file)) return;
      seen.add(file);
      const node = data.nodes.find(n => n.id === file);
      const children = data.edges.filter(e => e.source === file);
      const hasChildren = children.length > 0;
      const isExpanded = expanded.has(file);
      const isCycle = ancestry.has(file);
      const newAncestry = new Set(ancestry);
      newAncestry.add(file);

      rows.push({
        file,
        depth,
        name: file.split('/').pop()!,
        path: file.split('/').slice(-3).join('/'),
        hasChildren,
        isExpanded,
        isCycle,
        isExternal: node?.kind === 'external',
      });

      if (isExpanded && hasChildren && !isCycle) {
        for (const child of children.slice(0, 50)) {
          const childFile = child.target;
          if (fileIds.has(childFile)) {
            walk(childFile, depth + 1, newAncestry);
          }
        }
      }
    }

    for (const r of roots) walk(r, 0, new Set());

    // Filter or highlight by search
    if (search) {
      const q = search.toLowerCase();
      return rows.filter(r => r.file.toLowerCase().includes(q));
    }
    return rows;
  }, [data, expanded, search]);

  // Expose scrollToFile
  const rowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    flatRows.forEach((r, i) => map.set(r.file, i));
    return map;
  }, [flatRows]);

  useEffect(() => {
    scrollToFileRef.current = (file: string) => {
      // Expand ancestors to make the file visible in the tree
      const ancestors = findAncestors(file, data);
      setExpanded(prev => {
        const next = new Set(prev);
        for (const a of ancestors) next.add(a);
        return next;
      });
      // Scroll after a frame to let the tree re-render
      requestAnimationFrame(() => {
        const idx = rowIndexMap.get(file);
        if (idx !== undefined && virtuosoRef.current) {
          virtuosoRef.current.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' });
        }
      });
    };
  }, [rowIndexMap, data, scrollToFileRef]);

  const rowRenderer = useCallback((index: number) => {
    const row = flatRows[index];
    if (!row) return null;
    const padLeft = 8 + row.depth * 20;
    return (
      <div className="tree-row" style={{ paddingLeft: padLeft }}>
        <span className="toggle" onClick={() => toggle(row.file)}>
          {row.hasChildren ? (row.isExpanded ? '▼' : '▶') : ' '}
        </span>
        <span className="name" onClick={() => onSelectFile(row.file)}>{row.name}</span>
        {row.isExternal && <span className="tag tag-ext">ext</span>}
        {row.isCycle && <span className="tag tag-cycle">cycle</span>}
        <span className="spec">{row.path}</span>
      </div>
    );
  }, [flatRows, toggle, onSelectFile]);

  return (
    <div className="tree-container">
      <Virtuoso
        ref={virtuosoRef}
        totalCount={flatRows.length}
        itemContent={rowRenderer}
        computeItemKey={(i) => flatRows[i]?.file + '@' + flatRows[i]?.depth + '@' + i}
        style={{ height: '100%' }}
      />
    </div>
  );
}

/** Walk up edges to find all ancestors of a file */
function findAncestors(file: string, data: DependencyGraphJSON): string[] {
  const ancestors: string[] = [];
  const visited = new Set<string>();
  const queue = [file];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const incoming = data.edges.filter(e => e.target === cur);
    for (const e of incoming) {
      if (!visited.has(e.source)) {
        visited.add(e.source);
        ancestors.push(e.source);
        queue.push(e.source);
      }
    }
  }
  return ancestors;
}
