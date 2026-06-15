import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { DependencyGraphJSON } from '../data';

interface FileName { id: string; pkg: string; }

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
  fileNames: FileName[];
  onSearchSelect: (f: string) => void;
}

export function Toolbar({ tab, onTabChange, search, onSearchChange, currentPkg, onPkgChange, pkgNames, data, cycleCount, fileNames, onSearchSelect }: Props) {
  const [focus, setFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return fileNames.filter(f => f.id.toLowerCase().includes(q)).slice(0, 20);
  }, [search, fileNames]);

  const showDropdown = focus && search.length > 0 && matches.length > 0;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setFocus(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

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
      <div style={{position:'relative',flex:1,maxWidth:320}}>
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          placeholder="Search files…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          onFocus={() => setFocus(true)}
          style={{width:'100%'}}
        />
        {showDropdown && (
          <div ref={dropdownRef} className="search-dropdown">
            {matches.map(f => (
              <div
                key={f.id}
                className="search-dropdown-item"
                onMouseDown={e => { e.preventDefault(); onSearchSelect(f.id); setFocus(false); }}
              >
                <span className="name">{f.id.split('/').pop()}</span>
                <span className="path">{f.id.split('/').slice(-3).join('/')}</span>
                {f.pkg && <span className="tag-pkg">{f.pkg}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
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
