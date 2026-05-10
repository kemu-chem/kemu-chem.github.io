import {
  createGraph, addNode, addEdge, removeNode, removeEdge,
  updateNode, updateEdge, findNode, findEdge,
  toJSON, fromJSON,
} from '../core/graph.js';
import { applyLayout } from '../core/layout.js';
import { renderSVG, downloadSVG } from '../renderers/svg.js';
import { exportPPTX } from '../renderers/pptx.js';
import { renderPanel } from './panels.js';

// ── State ─────────────────────────────────────────────────────────────────────

let graph          = createGraph();
let selection      = null;          // { type: 'node'|'edge', id }
let multiSelection = new Set();     // Set of nodeIds for multi-select
let connectMode    = false;
let connectFrom    = null;
let dragState      = null;          // { nodeId, startX, startY, dragIds, origPositions }
let panState       = null;
let viewOffset     = { x: 0, y: 0 };
let clickBlocked   = false;
let snapMode       = true;
let snapStep       = 0.25;
let gridSnap       = true;

// ── DOM ───────────────────────────────────────────────────────────────────────

const svg          = document.getElementById('editor-svg');
const statusbar    = document.getElementById('statusbar');
const titleInput   = document.getElementById('title-input');
const jsonFileInput= document.getElementById('json-file-input');
const snapStepInput= document.getElementById('snap-step');

// ── Toolbar ───────────────────────────────────────────────────────────────────

document.getElementById('btn-add-node').addEventListener('click', () => {
  const focused = selectedNode();
  const edge    = selectedEdge();

  if (edge) {
    const from  = findNode(graph, edge.fromId);
    const to    = findNode(graph, edge.toId);
    const node  = addNode(graph, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
    const saved = { annotations: { ...edge.annotations }, routing: edge.routing, arrowStyle: { ...edge.arrowStyle } };
    removeEdge(graph, edge.id);
    tryAddEdge(edge.fromId, node.id, saved);
    tryAddEdge(node.id, edge.toId);
    setSelection({ type: 'node', id: node.id });
  } else if (focused) {
    const node = addNode(graph, { x: focused.x + graph.meta.cellW, y: focused.y });
    tryAddEdge(focused.id, node.id);
    setSelection({ type: 'node', id: node.id });
  } else {
    const node = addNode(graph, {
      x: svgWidth()  / 2 - viewOffset.x,
      y: svgHeight() / 2 - viewOffset.y,
    });
    setSelection({ type: 'node', id: node.id });
  }
  redraw();
});

document.getElementById('btn-branch-up').addEventListener('click', () => {
  const focused = selectedNode();
  if (!focused) return;
  const node = addNode(graph, { x: focused.x + graph.meta.cellW, y: focused.y - graph.meta.cellH });
  tryAddEdge(focused.id, node.id);
  setSelection({ type: 'node', id: node.id });
  redraw();
});

document.getElementById('btn-branch-down').addEventListener('click', () => {
  const focused = selectedNode();
  if (!focused) return;
  const node = addNode(graph, { x: focused.x + graph.meta.cellW, y: focused.y + graph.meta.cellH });
  tryAddEdge(focused.id, node.id);
  setSelection({ type: 'node', id: node.id });
  redraw();
});

document.getElementById('btn-connect-mode').addEventListener('click', (e) => {
  connectMode = !connectMode;
  connectFrom = null;
  e.currentTarget.classList.toggle('active', connectMode);
  svg.classList.toggle('connect-mode', connectMode);
});

document.getElementById('btn-delete').addEventListener('click', doDelete);

document.getElementById('btn-snap').addEventListener('click', (e) => {
  snapMode = !snapMode;
  e.currentTarget.classList.toggle('active', snapMode);
  redraw();
});

document.getElementById('btn-grid-snap').addEventListener('click', (e) => {
  gridSnap = !gridSnap;
  e.currentTarget.classList.toggle('active', gridSnap);
});

snapStepInput.addEventListener('input', () => {
  const v = Number(snapStepInput.value);
  if (v > 0) { snapStep = v; if (snapMode) redraw(); }
});

document.getElementById('btn-relayout').addEventListener('click', () => {
  applyLayout(graph, { forceAll: true });
  redraw();
});

document.getElementById('btn-export-svg').addEventListener('click', () => {
  downloadSVG(graph, { width: svgWidth(), height: svgHeight() });
});

document.getElementById('btn-export-pptx').addEventListener('click', async () => {
  const svgStr = renderSVG(graph, { width: 1200, height: 600 });
  await exportPPTX(svgStr, graph.meta.title || 'protocol_flowchart');
});

document.getElementById('btn-save-json').addEventListener('click', () => {
  graph.meta.title = titleInput.value;
  const blob = new Blob([toJSON(graph)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = (graph.meta.title || 'protocol_flowchart') + '.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-load-json').addEventListener('click', () => jsonFileInput.click());

jsonFileInput.addEventListener('change', () => {
  const file = jsonFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      graph = fromJSON(e.target.result);
      titleInput.value = graph.meta.title || '';
      viewOffset = { x: 0, y: 0 };
      multiSelection.clear();
      setSelection(null);
      redraw();
    } catch (err) {
      alert('JSONの読み込みに失敗しました: ' + err.message);
    }
  };
  reader.readAsText(file);
  jsonFileInput.value = '';
});

titleInput.addEventListener('input', () => { graph.meta.title = titleInput.value; });

document.addEventListener('keydown', (e) => {
  if (document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagName === 'TEXTAREA') return;
  if (e.key === 'Delete' || e.key === 'Backspace') doDelete();
  if (e.key === 'Escape') {
    connectMode = false;
    connectFrom = null;
    multiSelection.clear();
    document.getElementById('btn-connect-mode').classList.remove('active');
    svg.classList.remove('connect-mode');
    redraw();
  }
});

// ── SVG interaction ───────────────────────────────────────────────────────────

svg.addEventListener('click', (e) => {
  if (clickBlocked) return;

  const target = e.target.closest('[data-id]');

  if (connectMode) {
    if (!target) { connectFrom = null; return; }
    const { id, type } = target.dataset;
    if (type !== 'node') return;
    if (!connectFrom) { connectFrom = id; return; }
    if (connectFrom === id) { connectFrom = null; return; }
    tryAddEdge(connectFrom, id);
    connectFrom = null;
    redraw();
    return;
  }

  if (!target) {
    multiSelection.clear();
    setSelection(null);
    redraw();
    return;
  }

  const { id, type } = target.dataset;

  if (type === 'node' && e.shiftKey) {
    if (multiSelection.has(id)) {
      multiSelection.delete(id);
    } else {
      if (selection?.type === 'node') multiSelection.add(selection.id);
      multiSelection.add(id);
    }
    if (multiSelection.size <= 1) {
      setSelection(multiSelection.size === 1 ? { type: 'node', id: [...multiSelection][0] } : null);
      multiSelection.clear();
    }
    redraw();
    return;
  }

  multiSelection.clear();
  setSelection({ type, id });
  redraw();
});

svg.addEventListener('mousedown', (e) => {
  const nodeTarget = e.target.closest('[data-type="node"]');

  if (nodeTarget && !connectMode) {
    const nodeId = nodeTarget.dataset.id;
    const node   = findNode(graph, nodeId);
    if (!node) return;
    const pt = svgPoint(e);

    const dragIds = multiSelection.size >= 2 && multiSelection.has(nodeId)
      ? [...multiSelection]
      : [nodeId];
    const origPositions = new Map(
      dragIds.map(id => { const n = findNode(graph, id); return n ? [id, { x: n.x, y: n.y }] : null; })
             .filter(Boolean)
    );
    dragState = { nodeId, startX: pt.x, startY: pt.y, dragIds, origPositions };
    e.preventDefault();
  } else if (!e.target.closest('[data-id]') && !connectMode) {
    panState = { startX: e.clientX, startY: e.clientY, origX: viewOffset.x, origY: viewOffset.y, moved: false };
    svg.classList.add('panning');
    e.preventDefault();
  }
});

svg.addEventListener('mousemove', (e) => {
  if (dragState) {
    const pt = svgPoint(e);
    const dx = pt.x - dragState.startX;
    const dy = pt.y - dragState.startY;
    for (const id of dragState.dragIds) {
      const orig = dragState.origPositions.get(id);
      if (!orig) continue;
      let nx = orig.x + dx;
      let ny = orig.y + dy;
      if (gridSnap) { nx = snapGrid(nx); ny = snapGrid(ny); }
      updateNode(graph, id, { x: nx, y: ny });
    }
    redrawQuiet();
  } else if (panState) {
    viewOffset.x = panState.origX + e.clientX - panState.startX;
    viewOffset.y = panState.origY + e.clientY - panState.startY;
    panState.moved = true;
    redrawQuiet();
  }
});

svg.addEventListener('mouseup', () => {
  if (panState?.moved) {
    clickBlocked = true;
    setTimeout(() => { clickBlocked = false; }, 0);
  }
  dragState = null;
  panState  = null;
  svg.classList.remove('panning');
});

svg.addEventListener('mouseleave', () => {
  dragState = null;
  panState  = null;
  svg.classList.remove('panning');
});

// ── Rendering ─────────────────────────────────────────────────────────────────

function redraw() {
  redrawQuiet();
  const sel   = getSelectionData();
  const tStep = snapMode ? snapStep : 0.01;
  renderPanel(sel, (id, props) => {
    if (Array.isArray(id)) {
      for (const nid of id) updateNode(graph, nid, props);
      redrawQuiet();
      return;
    }
    if (selection?.type === 'node') {
      updateNode(graph, id, props);
      redrawQuiet();
    } else {
      const edge      = findEdge(graph, id);
      const prevLen   = edge?.annotations?.items?.length ?? 0;
      const prevCoil  = edge?.annotations?.coil;
      const prevSnaps = edge?.annotations?.items?.map(it => it.snap ?? true).join(',') ?? '';
      updateEdge(graph, id, props);
      const structural = (edge?.annotations?.items?.length ?? 0) !== prevLen ||
                         edge?.annotations?.coil !== prevCoil ||
                         (edge?.annotations?.items?.map(it => it.snap ?? true).join(',') ?? '') !== prevSnaps;
      if (structural) redraw();
      else redrawQuiet();
    }
  }, tStep);
  statusbar.textContent = `ノード: ${graph.nodes.length} ／ エッジ: ${graph.edges.length}`;
  scheduleSave();
}

function redrawQuiet() {
  const w = svgWidth(), h = svgHeight();
  svg.setAttribute('viewBox', `${-viewOffset.x} ${-viewOffset.y} ${w} ${h}`);
  svg.innerHTML = buildSVG(w, h);
}

function buildSVG(w, h) {
  const svgStr = renderSVG(graph, { width: w, height: h });
  const inner  = svgStr.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

  const overlays = [];

  for (const node of graph.nodes) {
    const isSelected = (selection?.type === 'node' && selection.id === node.id) ||
                       multiSelection.has(node.id);
    const selAttr    = isSelected
      ? 'stroke="var(--primary,#2563eb)" stroke-width="2" stroke-dasharray="4 2"'
      : '';
    const lines = String(node.label).split('\n');
    const fs    = node.style?.fontSize ?? 14;
    const hw    = Math.max(...lines.map(l => l.length)) * fs * 0.3 + 14;
    const hh    = lines.length * fs * 0.7 + 14;
    overlays.push(
      `<rect data-id="${node.id}" data-type="node"
         x="${node.x - hw}" y="${node.y - hh}" width="${hw * 2}" height="${hh * 2}"
         fill="transparent" ${selAttr} style="cursor:move"/>`
    );
  }

  for (const edge of graph.edges) {
    const from = findNode(graph, edge.fromId);
    const to   = findNode(graph, edge.toId);
    if (!from || !to) continue;
    const isSelected = selection?.type === 'edge' && selection.id === edge.id;
    const selAttr    = isSelected ? 'stroke="var(--primary,#2563eb)" stroke-opacity="0.35"' : '';
    const path = edge.routing === 'orthogonal'
      ? `M ${from.x} ${from.y} H ${(from.x + to.x) / 2} V ${to.y} H ${to.x}`
      : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    overlays.push(
      `<path data-id="${edge.id}" data-type="edge"
         d="${path}" fill="none" stroke="transparent" stroke-width="14"
         ${selAttr} style="cursor:pointer"/>`
    );
  }

  return inner + overlays.join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setSelection(sel) { selection = sel; }

function selectedNode() {
  if (multiSelection.size === 1) return findNode(graph, [...multiSelection][0]);
  return selection?.type === 'node' ? findNode(graph, selection.id) : null;
}
function selectedEdge() {
  return selection?.type === 'edge' ? findEdge(graph, selection.id) : null;
}
function getSelectionData() {
  if (multiSelection.size >= 2) {
    const nodes = [...multiSelection].map(id => findNode(graph, id)).filter(Boolean);
    return { type: 'multi', data: nodes };
  }
  if (!selection) return null;
  if (selection.type === 'node') return { type: 'node', data: findNode(graph, selection.id) };
  return { type: 'edge', data: findEdge(graph, selection.id) };
}

function tryAddEdge(fromId, toId, props) {
  try { addEdge(graph, fromId, toId, props); }
  catch (err) { alert(err.message); }
}

function doDelete() {
  if (multiSelection.size >= 2) {
    for (const id of [...multiSelection]) removeNode(graph, id);
    multiSelection.clear();
    setSelection(null);
    redraw();
    return;
  }
  if (!selection) return;
  if (selection.type === 'node') removeNode(graph, selection.id);
  else removeEdge(graph, selection.id);
  setSelection(null);
  redraw();
}

function svgWidth()  { return svg.clientWidth  || 1200; }
function svgHeight() { return svg.clientHeight || 600; }

const GRID = 40;
function snapGrid(v) { return Math.round(v / GRID) * GRID; }

function svgPoint(e) {
  const rect = svg.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) - viewOffset.x,
    y: (e.clientY - rect.top)  - viewOffset.y,
  };
}

// ── localStorage auto-save ───────────────────────────────────────────────────

const STORAGE_KEY = 'pfc_autosave';
let saveTimer = null;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      graph.meta.title = titleInput.value;
      localStorage.setItem(STORAGE_KEY, toJSON(graph));
    } catch (e) { /* quota exceeded */ }
  }, 800);
}

// ── Init ──────────────────────────────────────────────────────────────────────

const cached = localStorage.getItem(STORAGE_KEY);
if (cached) {
  try {
    graph = fromJSON(cached);
    titleInput.value = graph.meta.title || '';
  } catch (e) {
    addNode(graph, { label: 'Start', x: 100, y: 200 });
  }
} else {
  addNode(graph, { label: 'Start', x: 100, y: 200 });
}
redraw();
