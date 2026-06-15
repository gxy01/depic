import React from 'react';
import type { DependencyGraphJSON } from '../data';

interface Props {
  tab: string;
  onTabChange: (t: 'graph' | 'tree' | 'file') => void;
  search: string;
  onSearchChange: (s: string) => void;
  currentPkg: string;
  onPkgChange: (p: string) => void;
  pkgNames: string[];
  data: DependencyGraphJSON;
  cycleCount: number;
}

export function Toolbar({ tab, onTabChange, search, onSearchChange, currentPkg, onPkgChange, pkgNames, data, cycleCount }: Props) {
  const fileCount = data.nodes.filter(n => n.kind === 'file').length;
  const extCount = data.nodes.filter(n => n.kind === 'external').length;
  const edgeCount = data.edges.length;

  return (
    <div className="toolbar">
      <h1>📊 depic</h1>
      <div className="tabs">
        {(['graph', 'tree', 'file'] as const).map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => onTabChange(t)}>
            {t === 'graph' ? 'Graph' : t === 'tree' ? 'Tree' : 'File'}
          </button>
        ))}
      </div>
      <select className="pkg-select" value={currentPkg} onChange={e => onPkgChange(e.target.value)}>
        <option value="">All packages</option>
        {pkgNames.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <input className="search-input" type="text" placeholder="Search files…" value={search} onChange={e => onSearchChange(e.target.value)} />
      <div className="stats">
        <span className="pill pill-green">{fileCount} files</span>
        <span className="pill pill-blue">{edgeCount} edges</span>
        {extCount > 0 && <span className="pill pill-orange">{extCount} ext</span>}
        {cycleCount > 0 && <span className="pill pill-red">{cycleCount} cycles</span>}
      </div>
      <div className="legend">
        <span><span className="legend-dot" style={{background:'#58a6ff'}} />File</span>
        <span><span className="legend-dot" style={{background:'var(--orange)'}} />External</span>
        <span><span className="legend-dot" style={{background:'var(--red)'}} />Cycle</span>
      </div>
    </div>
  );
}
