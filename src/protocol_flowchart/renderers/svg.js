import { findNode } from '../core/graph.js';

const PAD        = 14;   // Node shape padding
const COIL_R     = 10;   // 巻矢印 arc radius
const ANNOT_DIST = 40;   // px from edge to annotation box center

// ── Public entry point ────────────────────────────────────────────────────────

export function renderSVG(graph, opts = {}) {
  const width  = opts.width  ?? 1200;
  const height = opts.height ?? 600;

  const parts = [];
  parts.push(svgOpen(width, height));
  parts.push('<defs>');
  // Fixed annotation arrow marker (small, always present)
  parts.push('<marker id="annot-arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse"><polygon points="0 0, 6 3, 0 6" fill="#555"/></marker>');
  // Per-edge main arrow markers (size/color independent of stroke-width)
  for (const edge of graph.edges) {
    const color = edge.arrowStyle.type === 'dashed' ? '#666' : '#333';
    parts.push(arrowMarkerDef(`arrow-${edge.id}`, color, edge.arrowStyle.headSize));
  }
  parts.push('</defs>');

  for (const edge of graph.edges) {
    const from = findNode(graph, edge.fromId);
    const to   = findNode(graph, edge.toId);
    if (!from || !to) continue;
    parts.push(renderEdge(edge, from, to, `arrow-${edge.id}`));
  }

  for (const node of graph.nodes) {
    parts.push(renderNode(node));
  }

  parts.push('</svg>');
  return parts.join('\n');
}

// ── Node rendering ────────────────────────────────────────────────────────────

function renderNode(node, overrideStyle = {}) {
  const style  = { ...node.style, ...overrideStyle };
  const lines  = String(node.label || ' ').split('\n');
  const fs     = style.fontSize ?? 14;
  const lineH  = fs * 1.4;
  const textW  = Math.max(...lines.map(l => l.length)) * fs * 0.6;
  const textH  = lines.length * lineH;
  const w      = textW + PAD * 2;
  const h      = textH + PAD * 2;
  const { x, y, shape } = node;
  const fill   = style.fillColor   ?? '#ffffff';
  const stroke = style.borderColor ?? '#333333';

  const textEl = lines.map((l, i) =>
    `<tspan x="${x}" dy="${i === 0 ? -(lines.length - 1) * lineH / 2 : lineH}">${esc(l)}</tspan>`
  ).join('');
  const label = `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="${stroke}" font-family="sans-serif">${textEl}</text>`;

  if (shape === 'none') return label;

  let shapeEl = '';
  if (shape === 'box') {
    shapeEl = `<rect x="${x - w/2}" y="${y - h/2}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  } else if (shape === 'circle') {
    const r = Math.max(w, h) / 2;
    shapeEl = `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  } else if (shape === 'diamond') {
    const hw = w / 2, hh = h / 2;
    shapeEl = `<polygon points="${x},${y-hh} ${x+hw},${y} ${x},${y+hh} ${x-hw},${y}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  }
  return shapeEl + '\n' + label;
}

// ── Edge rendering ────────────────────────────────────────────────────────────

function renderEdge(edge, from, to, markerId) {
  const parts = [];
  const { thickness, headSize, type } = edge.arrowStyle;
  const dashed = type === 'dashed' ? `stroke-dasharray="${headSize * 1.5} ${headSize}"` : '';
  const color  = type === 'dashed' ? '#666' : '#333';

  const path = edge.routing === 'orthogonal'
    ? orthogonalPath(from, to)
    : diagonalPath(from, to);

  parts.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="${thickness}" ${dashed} marker-end="url(#${markerId})"/>`);

  // 巻矢印
  if (edge.annotations.coil) {
    const t         = edge.annotations.coilT    ?? 0.5;
    const side      = edge.annotations.coilSide ?? 'above';
    const cs        = edge.annotations.coilStyle ?? {};
    const r         = cs.radius    ?? COIL_R;
    const thickness = cs.thickness ?? 1.5;
    const headSize  = cs.headSize  ?? 5;
    const gap       = cs.gap       ?? 12;
    const pt = pointOnPath(edge, from, to, t);
    const pd = perpDir(pt.tx, pt.ty, side);
    parts.push(coilArrow(pt.x + pd.x * (r + gap), pt.y + pd.y * (r + gap), r, thickness, headSize));
  }

  // Perpendicular annotation items
  for (const item of (edge.annotations.items ?? [])) {
    parts.push(renderAnnotationItem(item, edge, from, to));
  }

  return parts.join('\n');
}

// ── Annotation item rendering ─────────────────────────────────────────────────

function renderAnnotationItem(item, edge, from, to) {
  const edgePt = pointOnPath(edge, from, to, item.t ?? 0.5);
  const pd     = perpDir(edgePt.tx, edgePt.ty, item.side ?? 'above');
  const dist = item.dist ?? ANNOT_DIST;
  const cx   = edgePt.x + pd.x * dist;
  const cy   = edgePt.y + pd.y * dist;

  const proxy = {
    label: item.label || ' ',
    shape: item.shape ?? 'none',
    style: { borderColor: '#444', fillColor: '#f8f8f8', fontSize: 12 },
    x: cx, y: cy,
  };

  const showArrow = item.showArrow ?? true;
  const arrowLine = showArrow
    ? (() => {
        const bp = borderPoint(proxy, edgePt.x, edgePt.y);
        return `<line x1="${bp.x.toFixed(1)}" y1="${bp.y.toFixed(1)}" x2="${edgePt.x.toFixed(1)}" y2="${edgePt.y.toFixed(1)}" stroke="#555" stroke-width="1.5" marker-end="url(#annot-arrow)"/>`;
      })()
    : '';

  return renderNode(proxy) + (arrowLine ? '\n' + arrowLine : '');
}

// ── Path position & geometry ──────────────────────────────────────────────────

// Returns { x, y, tx, ty } — position and unnormalized tangent at t ∈ [0,1].
function pointOnPath(edge, from, to, t) {
  if (edge.routing === 'diagonal') {
    const s  = borderPoint(from, to.x, to.y);
    const e  = borderPoint(to, from.x, from.y);
    const tx = e.x - s.x, ty = e.y - s.y;
    return { x: s.x + t * tx, y: s.y + t * ty, tx, ty };
  }

  // orthogonal: 3 segments M sx sy H midX V ey H ex
  const s    = borderPoint(from, to.x, from.y);
  const e    = borderPoint(to, s.x, to.y);
  const midX = (s.x + e.x) / 2;
  const segs = [
    { x0: s.x,  y0: s.y,  x1: midX, y1: s.y,  tx: midX - s.x, ty: 0 },
    { x0: midX, y0: s.y,  x1: midX, y1: e.y,  tx: 0, ty: e.y - s.y },
    { x0: midX, y0: e.y,  x1: e.x,  y1: e.y,  tx: e.x - midX, ty: 0 },
  ];
  const lens  = segs.map(seg => Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0));
  const total = lens.reduce((a, b) => a + b, 0);
  if (total === 0) return { x: s.x, y: s.y, tx: 1, ty: 0 };

  let dist = t * total;
  for (let i = 0; i < segs.length; i++) {
    if (dist <= lens[i] + 1e-9 || i === segs.length - 1) {
      const frac = lens[i] === 0 ? 0 : Math.min(dist / lens[i], 1);
      const seg  = segs[i];
      return {
        x: seg.x0 + frac * (seg.x1 - seg.x0),
        y: seg.y0 + frac * (seg.y1 - seg.y0),
        tx: seg.tx, ty: seg.ty,
      };
    }
    dist -= lens[i];
  }
}

// Normalized perpendicular to tangent (tx,ty).
// 'above' = left of travel direction; 'below' = right.
function perpDir(tx, ty, side) {
  const raw = side === 'above' ? { x: -ty, y: tx } : { x: ty, y: -tx };
  const len = Math.hypot(raw.x, raw.y);
  if (len === 0) return { x: 0, y: side === 'above' ? -1 : 1 };
  return { x: raw.x / len, y: raw.y / len };
}

// ── Node geometry helpers ─────────────────────────────────────────────────────

function nodeDims(node) {
  const lines = String(node.label || ' ').split('\n');
  const fs    = node.style?.fontSize ?? 14;
  const w     = Math.max(...lines.map(l => l.length)) * fs * 0.6 + PAD * 2;
  const h     = lines.length * fs * 1.4 + PAD * 2;
  return { w, h };
}

export function borderPoint(node, tx, ty) {
  const { x, y, shape } = node;
  const { w, h } = nodeDims(node);
  const dx = tx - x, dy = ty - y;
  if (dx === 0 && dy === 0) return { x, y };

  if (shape === 'circle') {
    const r = Math.max(w, h) / 2, len = Math.hypot(dx, dy);
    return { x: x + r * dx / len, y: y + r * dy / len };
  }
  if (shape === 'diamond') {
    const hw = w / 2, hh = h / 2;
    const t  = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    return { x: x + t * dx, y: y + t * dy };
  }
  // box or none
  const hw = w / 2, hh = h / 2;
  if (Math.abs(dy) * hw < Math.abs(dx) * hh) {
    const t = (dx > 0 ? hw : -hw) / dx;
    return { x: x + t * dx, y: y + t * dy };
  }
  const t = (dy > 0 ? hh : -hh) / dy;
  return { x: x + t * dx, y: y + t * dy };
}

// ── Path generators ───────────────────────────────────────────────────────────

function orthogonalPath(from, to) {
  const s = borderPoint(from, to.x, from.y);
  const e = borderPoint(to, s.x, to.y);
  const m = (s.x + e.x) / 2;
  return `M ${s.x} ${s.y} H ${m} V ${e.y} H ${e.x}`;
}

function diagonalPath(from, to) {
  const s = borderPoint(from, to.x, to.y);
  const e = borderPoint(to, from.x, from.y);
  return `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
}

// ── 巻矢印 ────────────────────────────────────────────────────────────────────

function coilArrow(cx, cy, r, thickness, headSize) {
  const startAngle = -80  * Math.PI / 180;
  const endAngle   = -100 * Math.PI / 180;
  const sx = cx + r * Math.cos(startAngle), sy = cy + r * Math.sin(startAngle);
  const ex = cx + r * Math.cos(endAngle),   ey = cy + r * Math.sin(endAngle);
  const ta = endAngle + Math.PI / 2;
  const ax1 = ex + headSize * Math.cos(ta - 0.5), ay1 = ey + headSize * Math.sin(ta - 0.5);
  const ax2 = ex + headSize * Math.cos(ta + 0.5), ay2 = ey + headSize * Math.sin(ta + 0.5);
  return [
    `<path d="M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}" fill="none" stroke="#333" stroke-width="${thickness}"/>`,
    `<polygon points="${ex.toFixed(2)},${ey.toFixed(2)} ${ax1.toFixed(2)},${ay1.toFixed(2)} ${ax2.toFixed(2)},${ay2.toFixed(2)}" fill="#333"/>`,
  ].join('\n');
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

function arrowMarkerDef(id, color, size) {
  return `<marker id="${id}" markerWidth="${size}" markerHeight="${size}" refX="${size}" refY="${size/2}" orient="auto" markerUnits="userSpaceOnUse"><polygon points="0 0, ${size} ${size/2}, 0 ${size}" fill="${color}"/></marker>`;
}

function svgOpen(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── SVG download ──────────────────────────────────────────────────────────────

export function downloadSVG(graph, opts = {}) {
  const svg  = renderSVG(graph, opts);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = (graph.meta.title || 'protocol_flowchart') + '.svg';
  a.click();
  URL.revokeObjectURL(url);
}
