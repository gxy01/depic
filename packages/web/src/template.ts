export function renderHtml(graphJson: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Dependency Graph</title>
<script src="https://unpkg.com/sigma@2.4.0/build/sigma.min.js"><\/script>
<script src="https://unpkg.com/graphology@0.25.4/dist/graphology.umd.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#c9d1d9;--muted:#8b949e;--accent:#58a6ff;--red:#f85149;--orange:#d2991d;--green:#3fb950}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);overflow:hidden;height:100vh;display:flex;flex-direction:column}
#toolbar{display:flex;align-items:center;gap:12px;padding:8px 16px;background:var(--surface);border-bottom:1px solid var(--border);z-index:10;flex-shrink:0}
#toolbar h1{font-size:15px;font-weight:600;white-space:nowrap}
#search{flex:1;max-width:320px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;outline:none}
#search:focus{border-color:var(--accent)}
#tabs{display:flex;gap:0;margin-right:auto}
.tab{padding:6px 14px;font-size:13px;border:1px solid var(--border);background:var(--bg);color:var(--muted);cursor:pointer;border-radius:0}
.tab:first-child{border-radius:6px 0 0 6px}
.tab:last-child{border-radius:0 6px 6px 0}
.tab.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.tab:hover:not(.active){color:var(--text)}
#stats{font-size:12px;color:var(--muted);white-space:nowrap}
.pill{padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;margin-left:4px}
.pill-red{background:#f8514922;color:var(--red)}
.pill-green{background:#3fb95022;color:var(--green)}
.pill-orange{background:#d2991d22;color:var(--orange)}
#content{flex:1;position:relative;overflow:hidden}

/* Graph view */
#graph-view{width:100%;height:100%;position:absolute;top:0;left:0}
#graph-view.hidden{display:none}
#graph-container{width:100%;height:100%}
.hover-panel{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 16px;font-size:13px;display:none;max-width:600px;z-index:5}
.hover-panel .path{color:var(--accent);font-family:monospace;font-size:12px}
.hover-panel .row{display:flex;gap:20px;margin-top:4px}
.hover-panel .row span{font-size:12px;color:var(--muted)}

/* Tree view */
#tree-view{width:100%;height:100%;position:absolute;top:0;left:0;overflow-y:auto;overflow-x:hidden;display:none}
#tree-view.active{display:block}
.tree-node{padding:3px 0;font-family:monospace;font-size:12px;cursor:pointer;white-space:nowrap}
.tree-node:hover{background:var(--surface)}
.tree-node.depth-0{padding-left:8px}
.tree-node.depth-1{padding-left:28px}
.tree-node.depth-2{padding-left:48px}
.tree-node.depth-3{padding-left:68px}
.tree-node.depth-4{padding-left:88px}
.tree-node.depth-5{padding-left:108px}
.tree-node .toggle{display:inline-block;width:14px;text-align:center;color:var(--muted);cursor:pointer}
.tree-node .name{color:var(--accent)}
.tree-node .spec{color:var(--muted);margin-left:8px}
.tree-node .cycle-link{color:var(--orange);margin-left:8px;cursor:pointer;text-decoration:underline}
.tree-node .external-tag{color:var(--orange);margin-left:4px;font-size:10px;background:#d2991d22;padding:1px 4px;border-radius:3px}
.tree-node .cycle-tag{color:var(--red);margin-left:4px;font-size:10px;background:#f8514922;padding:1px 4px;border-radius:3px}
.tree-header{padding:12px 16px;font-size:13px;color:var(--muted);border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg);z-index:2}

/* File view */
#file-view{width:100%;height:100%;position:absolute;top:0;left:0;overflow-y:auto;display:none}
#file-view.active{display:block}
.file-section{margin:16px}
.file-section h3{font-size:14px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border)}
.file-section .file-path{font-size:20px;font-family:monospace;color:var(--accent);word-break:break-all}
.file-item{padding:6px 12px;font-family:monospace;font-size:12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
.file-item:hover{background:var(--surface)}
.file-item .spec{color:var(--muted)}
.file-item .kind{font-size:10px;padding:1px 6px;border-radius:3px;margin-left:8px}
.kind-static{background:#58a6ff22;color:var(--accent)}
.kind-dynamic{background:#d2991d22;color:var(--orange)}
.kind-reexport{background:#3fb95022;color:var(--green)}
.kind-css{background:#d2991d22;color:var(--orange)}
.kind-asset{background:#8b949e22;color:var(--muted)}
.kind-external{background:var(--orange);color:#fff}

/* Legend */
.legend{display:flex;gap:12px;font-size:11px;align-items:center}
.legend .dot{width:8px;height:8px;border-radius:50%}
</style>
</head>
<body>
<div id="toolbar">
  <h1>📊 ${escapeHtml(title)}</h1>
  <div id="tabs">
    <button class="tab active" data-view="graph">Graph</button>
    <button class="tab" data-view="tree">Tree</button>
    <button class="tab" data-view="file">File</button>
  </div>
  <input id="search" type="text" placeholder="Search files…">
  <div class="legend">
    <span><span class="dot" style="background:#58a6ff"></span>File</span>
    <span><span class="dot" style="background:var(--orange)"></span>External</span>
    <span><span class="dot" style="background:var(--red)"></span>In cycle</span>
  </div>
  <div id="stats"></div>
</div>
<div id="content">
  <div id="graph-view"><div id="graph-container"></div></div>
  <div id="tree-view"></div>
  <div id="file-view"></div>
  <div class="hover-panel" id="hover-panel"></div>
</div>

<script>
function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
const RAW = ${graphJson};
// Build graphology graph
const G = new graphology.Graph({multi: true});
const cycleSet = new Set();

// Detect cycles
(function buildCycles() {
  const adj = new Map();
  for (const n of RAW.nodes) { if (n.kind==='file') adj.set(n.id, []); }
  for (const e of RAW.edges) {
    if (adj.has(e.source) && adj.has(e.target)) adj.get(e.source).push(e.target);
  }
  const WHITE=0,GRAY=1,BLACK=2;
  const color=new Map();
  for (const k of adj.keys()) color.set(k,WHITE);
  function dfs(u) {
    color.set(u,GRAY);
    for (const v of (adj.get(u)||[])) {
      if ((color.get(v)||WHITE)===GRAY) { cycleSet.add(u); cycleSet.add(v); }
      else if (color.get(v)===WHITE) dfs(v);
    }
    color.set(u,BLACK);
  }
  for (const k of adj.keys()) { if (color.get(k)===WHITE) dfs(k); }
})();

// Populate graphology
for (const n of RAW.nodes) {
  if (n.kind === 'file') {
    const name = n.id.split('/').slice(-2).join('/');
    const inCycle = cycleSet.has(n.id);
    G.addNode(n.id, {
      label: name,
      size: Math.min(15, 3 + Math.log2(1 + (RAW.edges.filter(e => e.target===n.id).length))),
      color: inCycle ? '#f85149' : '#58a6ff',
      x: Math.random()*10, y: Math.random()*10,
    });
  } else {
    G.addNode(n.id, {
      label: n.id,
      size: 8,
      color: '#d2991d',
      x: Math.random()*10, y: Math.random()*10,
    });
  }
}
for (const e of RAW.edges) {
  if (!G.hasNode(e.source) || !G.hasNode(e.target)) continue;
  G.addEdge(e.source, e.target, { color: '#30363d', size: 1 });
}

// ─── Graph View (Sigma.js) ───────────────────────────────────
let sigmaInstance = null;
function initGraph() {
  if (sigmaInstance) { sigmaInstance.kill(); sigmaInstance = null; }
  sigmaInstance = new Sigma(G, document.getElementById('graph-container'), {
    renderEdgeLabels: false,
    enableEdgeEvents: true,
    minCameraRatio: 0.05,
    maxCameraRatio: 10,
    labelRenderer: (node, data) => data.label,
    defaultNodeLabelColor: '#c9d1d9',
  });

  // Hover → highlight
  sigmaInstance.on('enterNode', ({node}) => {
    const panel = document.getElementById('hover-panel');
    const fileNode = RAW.nodes.find(n => n.id===node);
    if (!fileNode) return;
    const deps = RAW.edges.filter(e => e.source===node).length;
    const depees = RAW.edges.filter(e => e.target===node).length;
    const inCycle = cycleSet.has(node);
    panel.innerHTML = '<div class="path">' + node.split('/').slice(-4).join('/') + '</div>' +
      '<div class="row"><span>📤 Imports: ' + deps + '</span><span>📥 Dependents: ' + depees + '</span>' +
      (inCycle ? '<span class="pill pill-red">In cycle</span>' : '') + '</div>';
    panel.style.display = 'block';
  });
  sigmaInstance.on('leaveNode', () => {
    document.getElementById('hover-panel').style.display = 'none';
  });

  // Click → switch to File view
  sigmaInstance.on('clickNode', ({node}) => {
    showFileView(node);
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-view="file"]').classList.add('active');
  });
}

// ─── Tree View ────────────────────────────────────────────────
let treeExpanded = new Set();
function buildTree(rootFile, depth, ancestry) {
  if (depth > 8) return '';
  if (ancestry.has(rootFile)) {
    const firstIdx = [...ancestry].indexOf(rootFile);
    return '<span class="cycle-link" data-file="' + escapeHtml(rootFile) + '">↩ cycle back to depth ' + firstIdx + '</span>';
  }
  const node = RAW.nodes.find(n => n.id===rootFile);
  const edges = RAW.edges.filter(e => e.source===rootFile);
  const isExternal = node && node.kind==='external';
  const newAncestry = new Set(ancestry);
  newAncestry.add(rootFile);
  const name = rootFile.split('/').pop();
  const path = rootFile.split('/').slice(-3).join('/');
  const hasChildren = edges.length > 0;
  const isExpanded = treeExpanded.has(rootFile);
  const inCycle = cycleSet.has(rootFile);
  let html = '<div class="tree-node depth-' + depth + '" data-file="' + escapeHtml(rootFile) + '">';
  html += '<span class="toggle" data-expand="' + escapeHtml(rootFile) + '">' + (hasChildren ? (isExpanded ? '▼' : '▶') : ' ') + '</span>';
  html += '<span class="name" data-file="' + escapeHtml(rootFile) + '">' + escapeHtml(name) + '</span>';
  if (isExternal) html += '<span class="external-tag">ext</span>';
  if (inCycle) html += '<span class="cycle-tag">cycle</span>';
  html += '<span class="spec">' + escapeHtml(path) + '</span>';
  html += '</div>';
  if (isExpanded && hasChildren) {
    for (const e of edges) {
      const childFile = e.target;
      html += buildTree(childFile, depth + 1, newAncestry);
    }
  }
  return html;
}
function renderTree(rootFiles) {
  const container = document.getElementById('tree-view');
  let html = '<div class="tree-header">Click ▶ to expand. Click file name to inspect. <span class="cycle-link">↩ cycle</span> to navigate back.</div>';
  for (const f of rootFiles) {
    html += buildTree(f, 0, new Set());
  }
  container.innerHTML = html;
  // Bind events
  container.querySelectorAll('.toggle').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const f = el.dataset.expand;
      if (treeExpanded.has(f)) treeExpanded.delete(f); else treeExpanded.add(f);
      renderTree(rootFiles);
    });
  });
  container.querySelectorAll('.name').forEach(el => {
    el.addEventListener('click', () => showFileView(el.dataset.file));
  });
  container.querySelectorAll('.cycle-link').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const f = el.dataset.file;
      document.getElementById('search').value = f.split('/').pop();
      const target = document.querySelector('.tree-node[data-file="' + CSS.escape(f) + '"]');
      if (target) target.scrollIntoView({behavior:'smooth',block:'center'});
    });
  });
}
function initTree() {
  // Root files = files with no dependents (entry points)
  const allFiles = RAW.nodes.filter(n => n.kind==='file').map(n => n.id);
  const hasDependents = new Set(RAW.edges.map(e => e.target));
  const roots = allFiles.filter(f => !hasDependents.has(f));
  if (roots.length === 0) roots.push(...allFiles.slice(0, 1));
  if (roots.length > 100) roots.length = 100; // Cap initial roots
  treeExpanded.clear();
  // Auto-expand first 2 levels
  for (const r of roots.slice(0, 10)) {
    treeExpanded.add(r);
    const deps = RAW.edges.filter(e => e.source===r);
    for (const d of deps.slice(0, 5)) treeExpanded.add(d.target);
  }
  renderTree(roots);
}

// ─── File View ────────────────────────────────────────────────
function showFileView(filePath) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-view="file"]').classList.add('active');
  document.getElementById('graph-view').classList.add('hidden');
  document.getElementById('tree-view').classList.remove('active');
  document.getElementById('file-view').classList.add('active');

  const node = RAW.nodes.find(n => n.id===filePath);
  const imports = RAW.edges.filter(e => e.source===filePath);
  const dependents = RAW.edges.filter(e => e.target===filePath);

  let html = '<div class="file-section">';
  html += '<div class="file-path">' + escapeHtml(filePath) + '</div>';
  const inCycle = cycleSet.has(filePath);
  if (inCycle) html += '<span class="pill pill-red" style="margin-top:8px">⚠ In circular dependency</span>';
  html += '</div>';

  // Imports
  html += '<div class="file-section"><h3>📤 Imports (' + imports.length + ')</h3>';
  for (const e of imports.slice(0, 200)) {
    const isExt = RAW.nodes.find(n => n.id===e.target)?.kind === 'external';
    html += '<div class="file-item" data-file="' + escapeHtml(e.target) + '">';
    html += '<span>' + escapeHtml(e.target.split('/').slice(-3).join('/')) + '</span>';
    html += '<span><span class="spec">' + escapeHtml(e.specifier) + '</span>';
    html += '<span class="kind kind-' + e.kind + '">' + e.kind + '</span>';
    if (isExt) html += '<span class="kind kind-external">ext</span>';
    html += '</span></div>';
  }
  if (imports.length > 200) html += '<div class="file-item"><span>... and ' + (imports.length - 200) + ' more</span></div>';
  html += '</div>';

  // Dependents
  html += '<div class="file-section"><h3>📥 Dependents (' + dependents.length + ')</h3>';
  for (const e of dependents.slice(0, 200)) {
    html += '<div class="file-item" data-file="' + escapeHtml(e.source) + '">';
    html += '<span>' + escapeHtml(e.source.split('/').slice(-3).join('/')) + '</span>';
    html += '<span><span class="spec">' + escapeHtml(e.specifier) + '</span>';
    html += '<span class="kind kind-' + e.kind + '">' + e.kind + '</span>';
    html += '</span></div>';
  }
  if (dependents.length > 200) html += '<div class="file-item"><span>... and ' + (dependents.length - 200) + ' more</span></div>';
  html += '</div>';

  // Exports
  if (node && node.exports && node.exports.length > 0) {
    html += '<div class="file-section"><h3>📦 Exports (' + node.exports.length + ')</h3>';
    for (const exp of node.exports.slice(0, 100)) {
      html += '<div class="file-item"><span>' + escapeHtml(exp.name) + '</span>';
      html += '<span><span class="kind kind-' + (exp.reExportFrom ? 'reexport' : 'static') + '">' + exp.kind + '</span>';
      if (exp.reExportFrom) html += '<span class="spec"> re-exports from ' + escapeHtml(exp.reExportFrom) + '</span>';
      html += '</span></div>';
    }
    html += '</div>';
  }

  const container = document.getElementById('file-view');
  container.innerHTML = html;

  // Click on file items to navigate
  container.querySelectorAll('.file-item[data-file]').forEach(el => {
    el.addEventListener('click', () => showFileView(el.dataset.file));
    el.style.cursor = 'pointer';
  });
}

// ─── Tab Switching ────────────────────────────────────────────
let currentView = 'graph';
function switchView(view) {
  currentView = view;
  document.getElementById('graph-view').classList.toggle('hidden', view !== 'graph');
  document.getElementById('tree-view').classList.toggle('active', view === 'tree');
  document.getElementById('file-view').classList.toggle('active', view === 'file');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  if (view === 'graph' && !sigmaInstance) initGraph();
  if (view === 'tree' && document.getElementById('tree-view').children.length === 0) initTree();
}
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});

// ─── Search ───────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  if (currentView === 'tree') {
    document.querySelectorAll('#tree-view .tree-node').forEach(el => {
      el.style.display = q ? (el.textContent.toLowerCase().includes(q) ? '' : 'none') : '';
    });
  } else if (currentView === 'graph' && sigmaInstance) {
    G.forEachNode((node, attrs) => {
      const match = node.toLowerCase().includes(q);
      G.setNodeAttribute(node, 'hidden', q && !match);
    });
  } else if (currentView === 'file') {
    // Search handled by file view content
  }
  if (currentView === 'graph' && q && sigmaInstance) {
    const matching = RAW.nodes.find(n => n.id.toLowerCase().includes(q));
    if (matching) {
      sigmaInstance.getCamera().animate({x:G.getNodeAttribute(matching.id,'x')||0,y:G.getNodeAttribute(matching.id,'y')||0,ratio:0.5}, {duration:500});
    }
  }
});

// ─── Init ──────────────────────────────────────────────────────
document.getElementById('stats').innerHTML =
  '<span class="pill pill-green">' + RAW.nodes.length + ' nodes</span>' +
  '<span class="pill">' + RAW.edges.length + ' edges</span>' +
  (cycleSet.size > 0 ? '<span class="pill pill-red">' + cycleSet.size + ' in cycles</span>' : '');
<\/script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
