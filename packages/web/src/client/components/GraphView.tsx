import React, { useEffect, useRef, useState, useCallback } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import type { LightweightGraph } from '../data';

interface Props {
  data: LightweightGraph;
  cycleSet: Set<string>;
  search: string;
  currentPkg: string;
  onSelectFile: (f: string) => void;
}

export function GraphView({ data, cycleSet, onSelectFile }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);

  const nodeInfo = hoverNode
    ? {
        label: hoverNode.split('/').slice(-4).join('/'),
        imports: data.edges.filter(e => e.source === hoverNode).length,
        dependents: data.edges.filter(e => e.target === hoverNode).length,
        inCycle: cycleSet.has(hoverNode),
      }
    : null;

  useEffect(() => {
    if (!containerRef.current) return;

    const g = new Graph({ multi: true });
    const fileIds = new Set(data.nodes.filter(n => n.kind === 'file').map(n => n.id));

    for (const n of data.nodes) {
      if (n.kind === 'file') {
        const deps = data.edges.filter(e => e.target === n.id).length;
        g.addNode(n.id, {
          label: n.id.split('/').slice(-2).join('/'),
          size: Math.min(15, 3 + Math.log2(1 + deps)),
          color: cycleSet.has(n.id) ? '#f85149' : '#58a6ff',
          x: Math.random() * 10,
          y: Math.random() * 10,
        });
      } else {
        g.addNode(n.id, {
          label: n.id,
          size: 8,
          color: '#d2991d',
          x: Math.random() * 10,
          y: Math.random() * 10,
        });
      }
    }

    for (const e of data.edges) {
      if (g.hasNode(e.source) && g.hasNode(e.target)) {
        g.addEdge(e.source, e.target, { color: '#30363d55', size: 1 });
      }
    }

    graphRef.current = g;

    const sigma = new Sigma(g, containerRef.current, {
      renderEdgeLabels: false,
      enableEdgeEvents: true,
      minCameraRatio: 0.05,
      maxCameraRatio: 10,
      defaultNodeLabelColor: '#c9d1d9',
    });

    sigma.on('enterNode', ({ node }) => setHoverNode(node));
    sigma.on('leaveNode', () => setHoverNode(null));
    sigma.on('clickNode', ({ node }) => {
      if (fileIds.has(node)) onSelectFile(node);
    });

    sigmaRef.current = sigma;

    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [data, cycleSet, onSelectFile]);

  return (
    <div className="graph-container" ref={containerRef}>
      {nodeInfo && (
        <div className="hover-panel">
          <div className="path">{nodeInfo.label}</div>
          <div className="row">
            <span>📤 Imports: {nodeInfo.imports}</span>
            <span>📥 Dependents: {nodeInfo.dependents}</span>
            {nodeInfo.inCycle && <span className="pill pill-red">In cycle</span>}
          </div>
        </div>
      )}
    </div>
  );
}
