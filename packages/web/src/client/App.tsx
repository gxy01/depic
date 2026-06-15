import React, { useState, useMemo, useRef, useCallback } from 'react';
import { getData, detectCycles, getPackageNames } from './data';
import type { DependencyGraphJSON } from './data';
import { Toolbar } from './components/Toolbar';
import { GraphView } from './components/GraphView';
import { TreeView } from './components/TreeView';
import { FileView } from './components/FileView';

type Tab = 'graph' | 'tree' | 'file';

export default function App() {
  const data = useMemo(() => getData(), []);
  const cycleSet = useMemo(() => detectCycles(data), [data]);
  const pkgNames = useMemo(() => getPackageNames(data), [data]);

  const [tab, setTab] = useState<Tab>('graph');
  const [search, setSearch] = useState('');
  const [currentPkg, setCurrentPkg] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const scrollToFileRef = useRef<((f: string) => void) | null>(null);

  const fileNames = useMemo(
    () => data.nodes.filter(n => n.kind === 'file').map(n => ({ id: n.id, pkg: n.package ?? '' })),
    [data],
  );

  const filteredData: DependencyGraphJSON = useMemo(() => {
    if (!currentPkg) return data;
    const pkgFileIds = new Set(
      data.nodes.filter(n => n.kind === 'file' && n.package === currentPkg).map(n => n.id),
    );
    const visibleNodes = data.nodes.filter(
      n => !currentPkg || n.kind === 'external' || n.package === currentPkg || pkgFileIds.has(n.id),
    );
    const visibleEdges = data.edges.filter(
      e => pkgFileIds.has(e.source) || pkgFileIds.has(e.target),
    );
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [data, currentPkg]);

  const handleSelectFile = useCallback((file: string) => {
    setSelectedFile(file);
    setTab('file');
  }, []);

  const handleSearchSelect = useCallback((file: string) => {
    setSearch('');
    setTab('tree');
    // Defer scroll until tree renders
    requestAnimationFrame(() => scrollToFileRef.current?.(file));
  }, []);

  return (
    <div className="app">
      <Toolbar
        tab={tab}
        onTabChange={setTab}
        search={search}
        onSearchChange={setSearch}
        currentPkg={currentPkg}
        onPkgChange={setCurrentPkg}
        pkgNames={pkgNames}
        data={filteredData}
        cycleCount={cycleSet.size}
        fileNames={fileNames}
        onSearchSelect={handleSearchSelect}
      />
      <div className="content">
        {tab === 'graph' && (
          <GraphView
            data={filteredData}
            cycleSet={cycleSet}
            search={search}
            currentPkg={currentPkg}
            onSelectFile={handleSelectFile}
          />
        )}
        {tab === 'tree' && (
          <TreeView
            data={filteredData}
            cycleSet={cycleSet}
            search={search}
            onSelectFile={handleSelectFile}
            scrollToFileRef={scrollToFileRef}
          />
        )}
        {tab === 'file' && (
          <FileView
            data={data}
            cycleSet={cycleSet}
            filePath={selectedFile}
            onSelectFile={handleSelectFile}
          />
        )}
      </div>
    </div>
  );
}
