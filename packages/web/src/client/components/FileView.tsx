import React, { useState, useEffect } from 'react';
import { fetchFileDetails, type FileDetails } from '../data';
import type { LightweightGraph } from '../data';

interface Props {
  data: LightweightGraph;
  cycleSet: Set<string>;
  filePath: string | null;
  onSelectFile: (f: string) => void;
}

export function FileView({ data, cycleSet, filePath, onSelectFile }: Props) {
  const [details, setDetails] = useState<FileDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filePath) { setDetails(null); return; }
    setLoading(true);
    fetchFileDetails(filePath).then(d => {
      setDetails(d);
      setLoading(false);
    });
  }, [filePath]);

  if (!filePath) {
    return <div className="file-view"><div className="empty-state">Select a file to inspect</div></div>;
  }

  const inCycle = cycleSet.has(filePath);
  // Fallback edge counts from lightweight data
  const imports = details?.imports ?? [];
  const dependents = details?.dependents ?? data.edges.filter(e => e.target === filePath).map(e => e.source);
  const exports = details?.exports ?? [];
  const node = data.nodes.find(n => n.id === filePath);
  const MAX = 500;

  return (
    <div className="file-view">
      <h2>{filePath}</h2>
      {node?.package && <span className="pill pill-blue" style={{marginRight:8}}>{node.package}</span>}
      {inCycle && <span className="pill pill-red">⚠ In circular dependency</span>}
      {loading && <span style={{color:'var(--muted)',fontSize:12,marginLeft:8}}>Loading details…</span>}

      <div className="section">
        <h3>📤 Imports ({imports.length})</h3>
        {imports.slice(0, MAX).map((imp, i) => (
          <div className="file-row" key={i} onClick={() => onSelectFile(imp.resolvedFile ?? imp.resolvedExternal ?? '')}>
            <span>{(imp.resolvedFile ?? imp.resolvedExternal ?? imp.specifier).split('/').slice(-3).join('/')}</span>
            <span>
              <span className="spec">{imp.specifier}</span>
              <span className={`kind-tag kind-${imp.kind}`}>{imp.kind}</span>
            </span>
          </div>
        ))}
        {imports.length > MAX && <div className="file-row"><span>... and {imports.length - MAX} more</span></div>}
      </div>

      <div className="section">
        <h3>📥 Dependents ({dependents.length})</h3>
        {(Array.isArray(dependents[0]) ? [] : dependents).slice(0, MAX).map((dep: any, i: number) => (
          <div className="file-row" key={i} onClick={() => onSelectFile(dep.source ?? dep)}>
            <span>{(dep.source ?? dep).split('/').slice(-3).join('/')}</span>
            <span>
              {dep.specifier && <span className="spec">{dep.specifier}</span>}
              {dep.kind && <span className={`kind-tag kind-${dep.kind}`}>{dep.kind}</span>}
            </span>
          </div>
        ))}
        {dependents.length > MAX && <div className="file-row"><span>... and {dependents.length - MAX} more</span></div>}
      </div>

      {exports.length > 0 && (
        <div className="section">
          <h3>📦 Exports ({exports.length})</h3>
          {exports.slice(0, 200).map((exp, i) => (
            <div className="file-row" key={i}>
              <span>{exp.name}</span>
              <span>
                <span className={`kind-tag ${exp.reExportFrom ? 'kind-re-export' : 'kind-static-import'}`}>{exp.kind}</span>
                {exp.reExportFrom && <span className="spec"> from {exp.reExportFrom}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
