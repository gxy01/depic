import React, { useMemo, useState, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { DependencyGraphJSON } from '../data';

interface Props {
  data: DependencyGraphJSON;
  cycleSet: Set<string>;
  search: string;
  onSelectFile: (f: string) => void;
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

export function TreeView({ data, cycleSet, search, onSelectFile }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Auto-expand first level
    const init = new Set<string>();
    const fileIds = new Set(data.nodes.filter(n => n.kind === 'file').map(n => n.id));
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

    // Root files = no dependents within data
    const roots = data.nodes
      .filter(n => n.kind === 'file' && !hasDependents.has(n.id))
      .map(n => n.id)
      .slice(0, 200);

    if (roots.length === 0) {
      // All files have dependents (or no files), pick first 10
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

    for (const r of roots) {
      walk(r, 0, new Set());
    }

    // Filter by search
    if (search) {
      return rows.filter(r => r.file.toLowerCase().includes(search.toLowerCase()));
    }
    return rows;
  }, [data, expanded, search]);

  const rowRenderer = useCallback((index: number) => {
    const row = flatRows[index];
    const padLeft = 8 + row.depth * 20;
    return (
      <div
        className="tree-row"
        style={{ paddingLeft: padLeft }}
        key={row.file + '@' + index}
      >
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
        totalCount={flatRows.length}
        itemContent={rowRenderer}
        computeItemKey={(i) => flatRows[i]?.file + '@' + flatRows[i]?.depth + '@' + i}
        style={{ height: '100%' }}
      />
    </div>
  );
}
