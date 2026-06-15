import React from 'react';
import type { DependencyGraphJSON } from '../data';

interface Props {
  data: DependencyGraphJSON;
  cycleSet: Set<string>;
  filePath: string | null;
  onSelectFile: (f: string) => void;
}

export function FileView({ data, cycleSet, filePath, onSelectFile }: Props) {
  if (!filePath) {
    return <div className="file-view"><div className="empty-state">Select a file to inspect</div></div>;
  }

  const node = data.nodes.find(n => n.id === filePath);
  const imports = data.edges.filter(e => e.source === filePath);
  const dependents = data.edges.filter(e => e.target === filePath);
  const inCycle = cycleSet.has(filePath);
  const MAX = 500;

  return (
    <div className="file-view">
      <h2>{filePath}</h2>
      {inCycle && <span className="pill pill-red" style={{marginTop:8}}>⚠ In circular dependency</span>}

      <div className="section">
        <h3>📤 Imports ({imports.length})</h3>
        {imports.slice(0, MAX).map((e, i) => (
          <div className="file-row" key={i} onClick={() => onSelectFile(e.target)}>
            <span>{e.target.split('/').slice(-3).join('/')}</span>
            <span>
              <span className="spec">{e.specifier}</span>
              <span className={`kind-tag kind-${e.kind}`}>{e.kind}</span>
            </span>
          </div>
        ))}
        {imports.length > MAX && <div className="file-row"><span>... and {imports.length - MAX} more</span></div>}
      </div>

      <div className="section">
        <h3>📥 Dependents ({dependents.length})</h3>
        {dependents.slice(0, MAX).map((e, i) => (
          <div className="file-row" key={i} onClick={() => onSelectFile(e.source)}>
            <span>{e.source.split('/').slice(-3).join('/')}</span>
            <span>
              <span className="spec">{e.specifier}</span>
              <span className={`kind-tag kind-${e.kind}`}>{e.kind}</span>
            </span>
          </div>
        ))}
        {dependents.length > MAX && <div className="file-row"><span>... and {dependents.length - MAX} more</span></div>}
      </div>

      {node && node.exports && node.exports.length > 0 && (
        <div className="section">
          <h3>📦 Exports ({node.exports.length})</h3>
          {node.exports.slice(0, 200).map((exp, i) => (
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
