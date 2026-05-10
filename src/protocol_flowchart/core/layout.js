import { topologicalSort, edgesFrom, edgesTo, findNode } from './graph.js';

// Assigns initial (x, y) to every node based on a logical grid.
// col = topological depth (longest path from any source).
// row = branch offset from the main path (0 = main, ±1, ±2 = branches).
// Existing x/y are overwritten only when forceAll is true (default).
export function applyLayout(graph, { forceAll = true } = {}) {
  if (graph.nodes.length === 0) return;

  const { cellW, cellH } = graph.meta;
  const colMap = assignColumns(graph);
  const rowMap = assignRows(graph, colMap);

  const maxRow = Math.max(...rowMap.values());
  const minRow = Math.min(...rowMap.values());
  const centerY = ((maxRow + minRow) / 2) * cellH;

  for (const node of graph.nodes) {
    if (!forceAll && node.x !== 0 && node.y !== 0) continue;
    const col = colMap.get(node.id) ?? 0;
    const row = rowMap.get(node.id) ?? 0;
    node.x = col * cellW + cellW * 0.5;
    node.y = row * cellH - centerY + cellH * 0.5;
  }
}

// ── Column assignment: longest path from any source ───────────────────────────

function assignColumns(graph) {
  const order  = topologicalSort(graph);
  const colMap = new Map(order.map(id => [id, 0]));

  for (const id of order) {
    const col = colMap.get(id);
    for (const edge of edgesFrom(graph, id)) {
      const next = colMap.get(edge.toId) ?? 0;
      if (col + 1 > next) colMap.set(edge.toId, col + 1);
    }
  }
  return colMap;
}

// ── Row assignment ─────────────────────────────────────────────────────────────
// Main path (longest col-span from each source) gets row 0.
// Each branch fan-out gets an offset away from sibling rows already taken.

function assignRows(graph, colMap) {
  const rowMap = new Map();

  // Find all source nodes (no incoming edges)
  const sources = graph.nodes.filter(n => edgesTo(graph, n.id).length === 0);
  if (sources.length === 0) {
    graph.nodes.forEach(n => rowMap.set(n.id, 0));
    return rowMap;
  }

  // Walk the graph in topological order, assigning rows greedily.
  // A node inherits the row of the parent with the largest column (latest arrival).
  const order = topologicalSort(graph);

  // Start all sources at row 0, stacked if multiple.
  let sourceRow = 0;
  for (const src of sources) {
    rowMap.set(src.id, sourceRow);
    sourceRow++;
  }

  for (const id of order) {
    if (rowMap.has(id)) continue; // already placed (source or already visited)

    const parents = edgesTo(graph, id).map(e => e.fromId);
    // Choose the parent with the highest column as "primary"
    const primary = parents.reduce((best, pid) => {
      return (colMap.get(pid) ?? 0) >= (colMap.get(best) ?? 0) ? pid : best;
    });

    const baseRow = rowMap.get(primary) ?? 0;

    // Siblings: other children of the primary parent that already have rows
    const siblings = edgesFrom(graph, primary)
      .map(e => e.toId)
      .filter(sid => sid !== id && rowMap.has(sid))
      .map(sid => rowMap.get(sid));

    const takenRows = new Set([...rowMap.values(), ...siblings]);
    const row = firstFreeRow(baseRow, takenRows);
    rowMap.set(id, row);
  }

  return rowMap;
}

function firstFreeRow(preferred, taken) {
  if (!taken.has(preferred)) return preferred;
  for (let delta = 1; delta < 100; delta++) {
    if (!taken.has(preferred + delta)) return preferred + delta;
    if (!taken.has(preferred - delta)) return preferred - delta;
  }
  return preferred;
}
