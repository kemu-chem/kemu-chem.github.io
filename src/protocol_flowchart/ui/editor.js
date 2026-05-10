import {
  createGraph, addNode, addEdge, removeNode, removeEdge,
  updateNode, updateEdge, findNode, findEdge,
  toJSON, fromJSON,
} from '../core/graph.js';
import { applyLayout } from '../core/layout.js';
import { renderSVG, downloadSVG, borderPoint } from '../renderers/svg.js';
import { exportPPTX } from '../renderers/pptx.js';
import { renderPanel } from './panels.js';

// ── State ─────────────────────────────────────────────────────────────────────

let graph             = createGraph();
let selection         = null;         // { type: 'node'|'edge'|'annot', id, edgeId? }
let multiSelection    = new Set();    // nodeIds
let edgeMultiSel      = new Set();    // edgeIds
let hoveredNodeId     = null;
let zoom              = 1.0;
let dragState         = null;         // { startX, startY, dragIds, origPositions }
let panState          = null;
let viewOffset        = { x: 0, y: 0 };
let clickBlocked      = false;
let snapMode          = true;
let snapStep          = 0.25;
let gridSnap          = true;

// ── DOM ───────────────────────────────────────────────────────────────────────

const svg          = document.getElementById('editor-svg');
const statusbar    = document.getElementById('statusbar');
const titleInput   = document.getElementById('title-input');
const jsonFileInput= document.getElementById('json-file-input');
const snapStepInput= document.getElementById('snap-step');
const gridSizeInput= document.getElementById('grid-size');
const fontSelect   = document.getElementById('font-select');
const inlineEdit   = document.getElementById('inline-edit');

let inlineEditNodeId = null;

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
    clearAllSelections();
    setSelection({ type: 'node', id: node.id });
  } else if (focused) {
    const node = addNode(graph, { x: focused.x + graph.meta.cellW, y: focused.y });
    tryAddEdge(focused.id, node.id);
    clearAllSelections();
    setSelection({ type: 'node', id: node.id });
  } else {
    const node = addNode(graph, {
      x: svgWidth()  / 2 - viewOffset.x,
      y: svgHeight() / 2 - viewOffset.y,
    });
    clearAllSelections();
    setSelection({ type: 'node', id: node.id });
  }
  redraw();
});

document.getElementById('btn-branch-up').addEventListener('click', () => {
  const focused = selectedNode();
  if (!focused) return;
  const node = addNode(graph, { x: focused.x + graph.meta.cellW, y: focused.y - graph.meta.cellH });
  tryAddEdge(focused.id, node.id);
  clearAllSelections();
  setSelection({ type: 'node', id: node.id });
  redraw();
});

document.getElementById('btn-branch-down').addEventListener('click', () => {
  const focused = selectedNode();
  if (!focused) return;
  const node = addNode(graph, { x: focused.x + graph.meta.cellW, y: focused.y + graph.meta.cellH });
  tryAddEdge(focused.id, node.id);
  clearAllSelections();
  setSelection({ type: 'node', id: node.id });
  redraw();
});

document.getElementById('btn-connect-mode').addEventListener('click', () => {
  const ids = [...multiSelection];
  if (ids.length < 2) {
    statusbar.textContent = 'Select at least 2 nodes to connect';
    return;
  }
  const [sourceId, ...targetIds] = ids;
  for (const targetId of targetIds) tryAddEdge(sourceId, targetId);
  redraw();
});

document.getElementById('btn-select-all-nodes').addEventListener('click', () => {
  edgeMultiSel.clear();
  multiSelection.clear();
  graph.nodes.forEach(n => multiSelection.add(n.id));
  setSelection(null);
  redraw();
});

document.getElementById('btn-select-all-edges').addEventListener('click', () => {
  multiSelection.clear();
  edgeMultiSel.clear();
  graph.edges.forEach(e => edgeMultiSel.add(e.id));
  setSelection(null);
  redraw();
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

gridSizeInput.addEventListener('input', () => {
  const v = Number(gridSizeInput.value);
  if (v > 0) gridSize = v;
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
      fontSelect.value = graph.meta.fontFamily ?? 'sans-serif';
      viewOffset = { x: 0, y: 0 };
      clearAllSelections();
      redraw();
    } catch (err) {
      alert('Failed to load JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
  jsonFileInput.value = '';
});

titleInput.addEventListener('input', () => { graph.meta.title = titleInput.value; });

fontSelect.addEventListener('change', () => {
  graph.meta.fontFamily = fontSelect.value;
  redrawQuiet();
});;

document.addEventListener('keydown', (e) => {
  if (document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagName === 'TEXTAREA') return;
  if (e.key === 'Delete' || e.key === 'Backspace') doDelete();
  if (e.key === 'Escape') {
    clearAllSelections();
    redraw();
  }
});

// ── SVG interaction ───────────────────────────────────────────────────────────

svg.addEventListener('click', (e) => {
  if (clickBlocked) return;

  // Hover-action triangle click
  const actionEl = e.target.closest('.hover-action');
  if (actionEl) {
    const { action, nodeId } = actionEl.dataset;
    const node = findNode(graph, nodeId);
    if (!node) return;
    let newNode;
    if (action === 'extend') {
      newNode = addNode(graph, { x: node.x + graph.meta.cellW, y: node.y });
    } else if (action === 'branch-up') {
      newNode = addNode(graph, { x: node.x + graph.meta.cellW, y: node.y - graph.meta.cellH });
    } else if (action === 'branch-down') {
      newNode = addNode(graph, { x: node.x + graph.meta.cellW, y: node.y + graph.meta.cellH });
    }
    if (newNode) { tryAddEdge(node.id, newNode.id); clearAllSelections(); setSelection({ type: 'node', id: newNode.id }); }
    redraw();
    return;
  }

  const target = e.target.closest('[data-id]');

  if (!target) {
    clearAllSelections();
    redraw();
    return;
  }

  const { id, type } = target.dataset;

  // Annotation click
  if (type === 'annot') {
    clearAllSelections();
    setSelection({ type: 'annot', id, edgeId: target.dataset.edgeId });
    redraw();
    return;
  }

  // Node shift-click (multi-select nodes)
  if (type === 'node' && e.shiftKey) {
    edgeMultiSel.clear();
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

  // Edge shift-click (multi-select edges)
  if (type === 'edge' && e.shiftKey) {
    multiSelection.clear();
    if (edgeMultiSel.has(id)) {
      edgeMultiSel.delete(id);
    } else {
      if (selection?.type === 'edge') edgeMultiSel.add(selection.id);
      edgeMultiSel.add(id);
    }
    if (edgeMultiSel.size <= 1) {
      setSelection(edgeMultiSel.size === 1 ? { type: 'edge', id: [...edgeMultiSel][0] } : null);
      edgeMultiSel.clear();
    }
    redraw();
    return;
  }

  // Regular click
  clearAllSelections();
  setSelection({ type, id });
  redraw();
});

svg.addEventListener('mousedown', (e) => {
  const nodeTarget = e.target.closest('[data-type="node"]');

  if (nodeTarget) {
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
    dragState = { startX: pt.x, startY: pt.y, dragIds, origPositions };
    hoveredNodeId = null;
    e.preventDefault();
  } else if (!e.target.closest('[data-id]')) {
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
    viewOffset.x = panState.origX + (e.clientX - panState.startX) / zoom;
    viewOffset.y = panState.origY + (e.clientY - panState.startY) / zoom;
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

svg.addEventListener('dblclick', (e) => {
  const nodeEl = e.target.closest('[data-type="node"]');
  if (!nodeEl) return;
  const node = findNode(graph, nodeEl.dataset.id);
  if (!node) return;
  e.preventDefault();
  clearAllSelections();
  setSelection({ type: 'node', id: node.id });
  showInlineEdit(node);
});

inlineEdit.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.stopPropagation(); hideInlineEdit(false); }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); hideInlineEdit(true); }
});

inlineEdit.addEventListener('blur', () => hideInlineEdit(true));

svg.addEventListener('mouseover', (e) => {
  if (dragState || panState) return;
  if (e.target.closest('#hover-actions')) return;
  const nodeEl = e.target.closest('[data-type="node"]');
  const newId  = nodeEl?.dataset.id ?? null;
  if (newId !== hoveredNodeId) {
    hoveredNodeId = newId;
    updateHoverActions();
  }
});

svg.addEventListener('mouseleave', () => {
  dragState = null;
  panState  = null;
  svg.classList.remove('panning');
  if (hoveredNodeId) { hoveredNodeId = null; updateHoverActions(); }
});

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    // Ctrl+wheel or trackpad pinch → pan
    viewOffset.x -= e.deltaX / zoom;
    viewOffset.y -= e.deltaY / zoom;
  } else {
    // Plain wheel or trackpad scroll → zoom toward cursor
    const factor  = Math.pow(0.999, e.deltaY);
    const newZoom = Math.min(8, Math.max(0.1, zoom * factor));
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    viewOffset.x += px * (1 / newZoom - 1 / zoom);
    viewOffset.y += py * (1 / newZoom - 1 / zoom);
    zoom = newZoom;
  }
  redrawQuiet();
}, { passive: false });

// ── Rendering ─────────────────────────────────────────────────────────────────

function redraw() {
  redrawQuiet();
  const sel   = getSelectionData();
  const tStep = snapMode ? snapStep : 0.01;

  renderPanel(sel, (id, props) => {
    // Multi-node or multi-edge batch update
    if (Array.isArray(id)) {
      if (sel.type === 'multi') {
        for (const nid of id) updateNode(graph, nid, props);
      } else {
        for (const eid of id) updateEdge(graph, eid, props);
      }
      redrawQuiet();
      return;
    }

    if (selection?.type === 'node') {
      updateNode(graph, id, props);
      redrawQuiet();
    } else if (selection?.type === 'annot') {
      // id = itemId, props = item patch
      const edge = findEdge(graph, selection.edgeId);
      if (!edge) return;
      const items = edge.annotations.items.map(it => it.id === id ? { ...it, ...props } : it);
      updateEdge(graph, edge.id, { annotations: { items } });
      // Re-render panel when snap changes to update slider step
      if (props.snap !== undefined) redraw();
      else redrawQuiet();
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

  statusbar.textContent = `Nodes: ${graph.nodes.length} / Edges: ${graph.edges.length} | Zoom: ${Math.round(zoom * 100)}%`;
  scheduleSave();
}

function redrawQuiet() {
  const w = svgWidth(), h = svgHeight();
  svg.setAttribute('viewBox', `${-viewOffset.x} ${-viewOffset.y} ${w / zoom} ${h / zoom}`);
  svg.innerHTML = buildSVG(w, h);
  updateHoverActions();
}

function buildSVG(w, h) {
  const svgStr = renderSVG(graph, { width: w, height: h });
  const inner  = svgStr.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

  const overlays = [];

  for (const node of graph.nodes) {
    const isSelected = (selection?.type === 'node' && selection.id === node.id) ||
                       multiSelection.has(node.id);
    const selAttr = isSelected
      ? 'stroke="var(--primary,#2563eb)" stroke-width="2" stroke-dasharray="4 2"'
      : '';
    const labelStr = String(node.label || '');
    const isEmpty  = !labelStr.trim();
    const lines = isEmpty ? [] : labelStr.split('\n');
    const fs    = node.style?.fontSize ?? 14;
    const hw    = isEmpty ? 8 : Math.max(...lines.map(l => l.length)) * fs * 0.3 + 14;
    const hh    = isEmpty ? 8 : lines.length * fs * 0.7 + 14;
    overlays.push(
      `<rect data-id="${node.id}" data-type="node"
         x="${node.x - hw}" y="${node.y - hh}" width="${hw * 2}" height="${hh * 2}"
         fill="rgba(0,0,0,0)" pointer-events="all" ${selAttr} style="cursor:move"/>`
    );
  }

  for (const edge of graph.edges) {
    const from = findNode(graph, edge.fromId);
    const to   = findNode(graph, edge.toId);
    if (!from || !to) continue;
    const isSelected = (selection?.type === 'edge' && selection.id === edge.id) ||
                       edgeMultiSel.has(edge.id);
    const edgeStroke = isSelected ? 'var(--primary,#2563eb)' : 'transparent';
    const edgeOpacity = isSelected ? '0.45' : '1';
    let path;
    if (edge.routing === 'orthogonal') {
      const s = borderPoint(from, to.x, from.y);
      const e = borderPoint(to, s.x, to.y);
      const m = (s.x + e.x) / 2;
      path = `M ${s.x} ${s.y} H ${m} V ${e.y} H ${e.x}`;
    } else {
      const s = borderPoint(from, to.x, to.y);
      const e = borderPoint(to, from.x, from.y);
      path = `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
    }
    overlays.push(
      `<path data-id="${edge.id}" data-type="edge"
         d="${path}" fill="none" stroke="${edgeStroke}" stroke-opacity="${edgeOpacity}" stroke-width="14" pointer-events="stroke"
         style="cursor:pointer"/>`
    );
  }

  // Wrap inner content so it doesn't intercept pointer events
  return `<g pointer-events="none">${inner}</g>` + overlays.join('\n') +
         '\n<g id="hover-actions" pointer-events="all"></g>';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clearAllSelections() {
  multiSelection.clear();
  edgeMultiSel.clear();
  setSelection(null);
}

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
  if (edgeMultiSel.size >= 2) {
    const edges = [...edgeMultiSel].map(id => findEdge(graph, id)).filter(Boolean);
    return { type: 'multi-edge', data: edges };
  }
  if (!selection) return null;
  if (selection.type === 'annot') {
    const edge = findEdge(graph, selection.edgeId);
    const item = edge?.annotations?.items?.find(it => it.id === selection.id);
    return item ? { type: 'annot', data: item, edgeId: selection.edgeId } : null;
  }
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
    clearAllSelections();
    redraw();
    return;
  }
  if (edgeMultiSel.size >= 2) {
    for (const id of [...edgeMultiSel]) removeEdge(graph, id);
    clearAllSelections();
    redraw();
    return;
  }
  if (!selection) return;
  if (selection.type === 'node') {
    removeNode(graph, selection.id);
  } else if (selection.type === 'edge') {
    removeEdge(graph, selection.id);
  } else if (selection.type === 'annot') {
    const edge = findEdge(graph, selection.edgeId);
    if (edge) {
      const items = edge.annotations.items.filter(it => it.id !== selection.id);
      updateEdge(graph, edge.id, { annotations: { items } });
    }
  }
  clearAllSelections();
  redraw();
}

function svgWidth()  { return svg.clientWidth  || 1200; }
function svgHeight() { return svg.clientHeight || 600; }

let gridSize = 40;
function snapGrid(v) { return Math.round(v / gridSize) * gridSize; }

function showInlineEdit(node) {
  inlineEditNodeId = node.id;
  const rect = svg.getBoundingClientRect();
  const sx   = rect.left + (node.x + viewOffset.x) * zoom;
  const sy   = rect.top  + (node.y + viewOffset.y) * zoom;
  const { hw, hh } = nodeHW(node);
  const fs   = node.style?.fontSize ?? 14;

  inlineEdit.value             = node.label;
  inlineEdit.style.left        = `${sx - Math.max(hw, 40) * zoom}px`;
  inlineEdit.style.top         = `${sy - Math.max(hh, 15) * zoom}px`;
  inlineEdit.style.width       = `${Math.max(hw * 2, 80) * zoom}px`;
  inlineEdit.style.height      = `${Math.max(hh * 2, 30) * zoom}px`;
  inlineEdit.style.fontSize    = `${fs * zoom}px`;
  inlineEdit.style.fontFamily  = graph.meta.fontFamily ?? 'sans-serif';
  inlineEdit.style.display     = 'block';
  inlineEdit.focus();
  inlineEdit.select();
}

function hideInlineEdit(apply) {
  if (!inlineEditNodeId) return;
  if (apply) {
    updateNode(graph, inlineEditNodeId, { label: inlineEdit.value });
    redraw();
  }
  inlineEdit.style.display = 'none';
  inlineEditNodeId = null;
}

function nodeHW(node) {
  const label = String(node.label || '');
  if (!label.trim()) return { hw: 8, hh: 8 };
  const lines = label.split('\n');
  const fs = node.style?.fontSize ?? 14;
  return {
    hw: Math.max(...lines.map(l => l.length)) * fs * 0.3 + 14,
    hh: lines.length * fs * 0.7 + 14,
  };
}

function updateHoverActions() {
  const g = document.getElementById('hover-actions');
  if (!g) return;
  if (!hoveredNodeId) { g.innerHTML = ''; return; }
  const node = findNode(graph, hoveredNodeId);
  if (!node) { g.innerHTML = ''; return; }
  const { hw } = nodeHW(node);
  const cx = node.x + hw + 14;
  const s = 8, sp = 22;
  const tri = (action, pts) =>
    `<polygon class="hover-action" data-action="${action}" data-node-id="${hoveredNodeId}" points="${pts}"/>`;
  // Transparent bridge rect: fills the gap between node overlay edge and triangles
  const bridgeX = node.x + hw;
  const bridgeY = node.y - sp - s;
  const bridge  = `<rect x="${bridgeX}" y="${bridgeY}" width="${cx + s - bridgeX + 4}" height="${(sp + s) * 2}" fill="rgba(0,0,0,0)" pointer-events="all"/>`;
  g.innerHTML = [
    bridge,
    tri('branch-up',   `${cx},${node.y - sp - s} ${cx - s},${node.y - sp + s} ${cx + s},${node.y - sp + s}`),
    tri('extend',      `${cx - s},${node.y - s} ${cx - s},${node.y + s} ${cx + s},${node.y}`),
    tri('branch-down', `${cx},${node.y + sp + s} ${cx - s},${node.y + sp - s} ${cx + s},${node.y + sp - s}`),
  ].join('\n');
}

function svgPoint(e) {
  const rect = svg.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / zoom - viewOffset.x,
    y: (e.clientY - rect.top)  / zoom - viewOffset.y,
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
    fontSelect.value = graph.meta.fontFamily ?? 'sans-serif';
  } catch (e) {
    addNode(graph, { label: 'Start', x: 100, y: 200 });
  }
} else {
  addNode(graph, { label: 'Start', x: 100, y: 200 });
}
redraw();
