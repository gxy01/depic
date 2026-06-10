export function renderHtml(graphJson: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Dependency Graph</title>
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"><\/script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; }
#toolbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 10;
  background: #1a1a2e; color: #eee; padding: 8px 16px;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
#toolbar h1 { font-size: 16px; font-weight: 600; white-space: nowrap; }
#search { padding: 4px 10px; border-radius: 4px; border: 1px solid #444; background: #16213e; color: #eee; width: 200px; }
#search::placeholder { color: #888; }
#toolbar button { padding: 4px 12px; border-radius: 4px; border: 1px solid #444; background: #0f3460; color: #eee; cursor: pointer; font-size: 13px; }
#toolbar button:hover { background: #1a4a8a; }
#stats { font-size: 12px; color: #aaa; margin-left: auto; }
#container { width: 100vw; height: calc(100vh - 40px); margin-top: 40px; background: #0a0a1a; }
.legend { display: flex; gap: 16px; font-size: 12px; }
.legend span { display: flex; align-items: center; gap: 4px; }
.legend .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
</style>
</head>
<body>
<div id="toolbar">
  <h1>📊 ${escapeHtml(title)}</h1>
  <input id="search" type="text" placeholder="Search files…" oninput="filterNodes()">
  <button onclick="resetView()">Reset</button>
  <button onclick="togglePhysics()">🔧 Physics</button>
  <div class="legend">
    <span><span class="dot" style="background:#5b9bd5"></span>File</span>
    <span><span class="dot" style="background:#e8913a"></span>External</span>
  </div>
  <div id="stats"></div>
</div>
<div id="container"></div>
<script>
const data = ${graphJson};

// Build vis-network nodes & edges
const nodes = new vis.DataSet(
  data.nodes.map(n => ({
    id: n.id,
    label: n.kind === 'external' ? n.id : n.id.split('/').slice(-2).join('/'),
    group: n.kind,
    title: n.id,
    shape: n.kind === 'external' ? 'box' : 'dot',
    color: n.kind === 'external'
      ? { background: '#e8913a', border: '#c07a2a' }
      : { background: '#5b9bd5', border: '#3a7ab5' },
    font: { size: 11, color: '#ccc' },
    size: n.kind === 'external' ? 14 : 10,
  }))
);

const edges = new vis.DataSet(
  data.edges.map((e, i) => ({
    id: i,
    from: e.source,
    to: e.target,
    arrows: 'to',
    color: { color: '#444', highlight: '#888' },
    title: e.specifier + ' (' + e.kind + ')',
    width: 1,
  }))
);

const container = document.getElementById('container');
const network = new vis.Network(container, { nodes, edges }, {
  physics: {
    forceAtlas2Based: {
      gravitationalConstant: -30,
      centralGravity: 0.005,
      springLength: 120,
      springConstant: 0.08,
    },
    maxVelocity: 20,
    solver: 'forceAtlas2Based',
    stabilization: { iterations: 200 },
  },
  interaction: {
    hover: true,
    tooltipDelay: 200,
    zoomView: true,
    dragView: true,
  },
  nodes: { borderWidth: 1.5 },
  edges: { smooth: { type: 'continuous' } },
  groups: {
    file: { color: { background: '#5b9bd5', border: '#3a7ab5' } },
    external: { color: { background: '#e8913a', border: '#c07a2a' }, shape: 'box' },
  },
});

// Stats
document.getElementById('stats').textContent =
  data.nodes.length + ' nodes · ' + data.edges.length + ' edges';

// Click handler: highlight connected nodes
let selectedNode = null;
network.on('click', function(params) {
  if (params.nodes.length > 0) {
    const nodeId = params.nodes[0];
    const connected = network.getConnectedNodes(nodeId);
    const allNodes = nodes.getIds();
    const greyedOut = allNodes.filter(id => id !== nodeId && !connected.includes(id));
    nodes.update(greyedOut.map(id => ({ id, opacity: 0.15 })));
    nodes.update(connected.map(id => ({ id, opacity: 1.0 })));
    nodes.update({ id: nodeId, opacity: 1.0 });
    selectedNode = nodeId;
  } else {
    if (selectedNode) {
      nodes.update(nodes.getIds().map(id => ({ id, opacity: 1.0 })));
      selectedNode = null;
    }
  }
});

// Search / filter
window.filterNodes = function() {
  const query = document.getElementById('search').value.toLowerCase();
  if (!query) {
    nodes.update(nodes.getIds().map(id => ({ id, opacity: 1.0, hidden: false })));
    edges.update(edges.getIds().map(id => ({ id, hidden: false })));
    return;
  }
  const matching = nodes.get().filter(n => n.id.toLowerCase().includes(query)).map(n => n.id);
  const matchingSet = new Set(matching);
  nodes.update(nodes.getIds().map(id => ({
    id, hidden: !matchingSet.has(id), opacity: matchingSet.has(id) ? 1.0 : 0.05
  })));
  edges.update(edges.getIds().map(e => ({
    id: e.id, hidden: !matchingSet.has(e.from) || !matchingSet.has(e.to)
  })));
};

window.resetView = function() {
  nodes.update(nodes.getIds().map(id => ({ id, opacity: 1.0, hidden: false })));
  edges.update(edges.getIds().map(id => ({ id, hidden: false })));
  document.getElementById('search').value = '';
  selectedNode = null;
  network.fit({ animation: { duration: 500 } });
};

window.togglePhysics = function() {
  const enabled = !network.physics.options.enabled;
  network.setOptions({ physics: { enabled } });
};
<\/script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
