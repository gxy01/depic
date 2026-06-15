import React, { useState, useMemo } from 'react';
import { Command } from 'cmdk';
import type { LightweightGraph } from '../data';

interface FileName { id: string; pkg: string; }

interface Props {
  tab: string;
  onTabChange: (t: 'graph' | 'tree' | 'file') => void;
  search: string;
  onSearchChange: (s: string) => void;
  currentPkg: string;
  onPkgChange: (p: string) => void;
  pkgNames: string[];
  data: LightweightGraph;
  cycleCount: number;
  fileNames: FileName[];
  onSearchSelect: (f: string) => void;
}

export function Toolbar({ tab, onTabChange, currentPkg, onPkgChange, pkgNames, data, cycleCount, fileNames, onSearchSelect }: Props) {
  const [open, setOpen] = useState(false);

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
        <Command label="Search files">
          <Command.Input
            placeholder="Search files…"
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
          />
          <Command.List style={{
            position:'absolute',top:'100%',left:0,right:0,
            background:'var(--surface)',border:'1px solid var(--border)',
            borderRadius:'6px',maxHeight:300,overflowY:'auto',zIndex:100,
            marginTop:4,boxShadow:'0 4px 12px rgba(0,0,0,.4)',padding:4,
            display: open ? 'block' : 'none',
          }}>
            <Command.Empty style={{padding:12,textAlign:'center',color:'var(--muted)',fontSize:12}}>
              No files found
            </Command.Empty>
            {fileNames.map(f => (
                <Command.Item
                  key={f.id}
                  value={f.id}
                  onSelect={() => { onSearchSelect(f.id); setOpen(false); }}
                  style={{
                    display:'flex',alignItems:'center',gap:8,padding:'6px 10px',
                    cursor:'pointer',fontSize:12,borderRadius:4,
                  }}
                >
                  <span style={{color:'var(--accent)',fontFamily:'monospace',fontWeight:600,whiteSpace:'nowrap'}}>
                    {f.id.split('/').pop()}
                  </span>
                  <span style={{color:'var(--muted)',fontFamily:'monospace',fontSize:11,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {f.id.split('/').slice(-3).join('/')}
                  </span>
                  {f.pkg && (
                    <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'#58a6ff22',color:'var(--accent)',whiteSpace:'nowrap'}}>
                      {f.pkg}
                    </span>
                  )}
                </Command.Item>
              ))}
          </Command.List>
        </Command>
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
