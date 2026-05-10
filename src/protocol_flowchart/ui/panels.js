import { uid } from '../core/graph.js';

const panelEl = document.getElementById('panel-container');

// tStep: actual slider step value computed in editor (snapMode ? snapStep : 0.01)
export function renderPanel(selection, updateFn, tStep = 0.25) {
  if (!selection?.data) {
    panelEl.innerHTML = '<p class="panel-empty">Please select a node or edge</p>';
    return;
  }
  if      (selection.type === 'node')       renderNodePanel(selection.data, updateFn);
  else if (selection.type === 'multi')      renderMultiPanel(selection.data, updateFn);
  else if (selection.type === 'multi-edge') renderMultiEdgePanel(selection.data, updateFn);
  else if (selection.type === 'annot')      renderAnnotPanel(selection.data, updateFn, tStep);
  else                                      renderEdgePanel(selection.data, updateFn, tStep);
}

// ── Node panel ────────────────────────────────────────────────────────────────

function renderNodePanel(node, updateFn) {
  panelEl.innerHTML = `
    <h3 style="${H3}">Node Properties</h3>
    ${field('Label',         textarea('label', node.label))}
    ${field('Shape',           selectEl('shape', node.shape, [['none','None'],['box','Box'],['circle','Circle'],['diamond','Diamond']]))}
    ${field('Border Color',           colorEl('borderColor', node.style.borderColor))}
    ${field('Fill Color',         colorEl('fillColor',   node.style.fillColor))}
    ${field('Font Size', numberEl('fontSize', node.style.fontSize, 8, 36))}
  `;
  bind('textarea[name="label"]',      'input',  v => updateFn(node.id, { label: v }));
  bind('select[name="shape"]',        'change', v => updateFn(node.id, { shape: v }));
  bind('input[name="borderColor"]',   'input',  v => updateFn(node.id, { style: { borderColor: v } }));
  bind('input[name="fillColor"]',     'input',  v => updateFn(node.id, { style: { fillColor: v } }));
  bind('input[name="fontSize"]',      'input',  v => updateFn(node.id, { style: { fontSize: Number(v) } }));
}

// ── Multi-node panel ──────────────────────────────────────────────────────────

function renderMultiPanel(nodes, updateFn) {
  panelEl.innerHTML = `
    <h3 style="${H3}">${nodes.length} Nodes Selected</h3>
    ${field('Shape',   selectEl('shape', '', [['','(No change)'],['none','None'],['box','Box'],['circle','Circle'],['diamond','Diamond']]))}
    ${field('Border Color',   colorEl('borderColor', '#333333'))}
    ${field('Fill Color', colorEl('fillColor',   '#ffffff'))}
  `;
  const ids = nodes.map(n => n.id);
  bind('select[name="shape"]',      'change', v => { if (v) updateFn(ids, { shape: v }); });
  bind('input[name="borderColor"]', 'input',  v => updateFn(ids, { style: { borderColor: v } }));
  bind('input[name="fillColor"]',   'input',  v => updateFn(ids, { style: { fillColor: v } }));
}

// ── Multi-edge panel ─────────────────────────────────────────────────────────

function renderMultiEdgePanel(edges, updateFn) {
  const ids = edges.map(e => e.id);
  panelEl.innerHTML = `
    <h3 style="${H3}">${edges.length} Edges Selected</h3>
    ${field('Routing', radioGroup('routing',  '', [['orthogonal','Orthogonal'],['diagonal','Diagonal']]))}
    ${field('Line Type',         radioGroup('lineType', '', [['normal','Solid'],['dashed','Dashed']]))}
    ${field('Thickness',         numberEl('thickness', '', 1, 6))}
    ${field('Head Size', numberEl('headSize',  '', 4, 20))}
  `;
  bindRadio('routing',  v => updateFn(ids, { routing: v }));
  bindRadio('lineType', v => updateFn(ids, { arrowStyle: { type: v } }));
  bind('input[name="thickness"]', 'input', v => { if (v) updateFn(ids, { arrowStyle: { thickness: Number(v) } }); });
  bind('input[name="headSize"]',  'input', v => { if (v) updateFn(ids, { arrowStyle: { headSize:  Number(v) } }); });
}

// ── Annotation panel ──────────────────────────────────────────────────────────

function renderAnnotPanel(item, updateFn, tStep) {
  const itemStep = (item.snap ?? true) ? tStep : 0.01;
  panelEl.innerHTML = `
    <h3 style="${H3}">Annotation Properties</h3>
    ${field('Label',     textarea('a-label', item.label, 3))}
    ${field('Side',       radioGroup('a-side', item.side, [['above','Above (Left)'],['below','Below (Right)']]))}
    ${field('Position t',     rangeEl('a-t', item.t, itemStep))}
    ${field('Snap t', checkboxEl('a-snap', item.snap ?? true))}
    ${field('Shape',       selectEl('a-shape', item.shape, [['none','None'],['box','Box']]))}
    ${field('Distance',       numberEl('a-dist', item.dist ?? 40, 10, 200))}
    ${field('Show Arrow',   checkboxEl('a-arrow', item.showArrow ?? true))}
    ${field('Arrow Gap', numberEl('a-gap', item.arrowGap ?? 2, 0, 40))}
  `;
  const labelEl = panelEl.querySelector('textarea[name="a-label"]');
  if (labelEl) labelEl.addEventListener('input', () => updateFn(item.id, { label: labelEl.value }));
  bindRadio('a-side', v => updateFn(item.id, { side: v }));
  const tEl = panelEl.querySelector('input[name="a-t"]');
  if (tEl) {
    const tSpan = tEl.nextElementSibling;
    tEl.addEventListener('input', () => {
      if (tSpan) tSpan.textContent = Number(tEl.value).toFixed(2);
      updateFn(item.id, { t: Number(tEl.value) });
    });
  }
  bind('input[name="a-snap"]',  'change', v => updateFn(item.id, { snap:      v === 'true' }), true);
  bind('select[name="a-shape"]','change', v => updateFn(item.id, { shape:     v }));
  bind('input[name="a-dist"]',  'input',  v => updateFn(item.id, { dist:      Number(v) }));
  bind('input[name="a-arrow"]', 'change', v => updateFn(item.id, { showArrow: v === 'true' }), true);
  bind('input[name="a-gap"]',   'input',  v => updateFn(item.id, { arrowGap:  Number(v) }));
}

// ── Edge panel ────────────────────────────────────────────────────────────────

function renderEdgePanel(edge, updateFn, tStep) {
  const items = edge.annotations.items ?? [];

  panelEl.innerHTML = `
    <h3 style="${H3}">Edge Properties</h3>

    ${field('Coil Arrow (Reflux/Stir)', checkboxEl('coil', edge.annotations.coil))}
    ${edge.annotations.coil ? `
      ${field('Position t',       rangeEl('coilT', edge.annotations.coilT ?? 0.5, tStep))}
      ${field('Side',         radioGroup('coilSide', edge.annotations.coilSide ?? 'above', [['above','Above (Left)'],['below','Below (Right)']]))}
      ${field('Line Thickness',     numberEl('coilThickness', edge.annotations.coilStyle?.thickness ?? 1.5, 0.5, 6, 0.5))}
      ${field('Head Size',   numberEl('coilHeadSize',  edge.annotations.coilStyle?.headSize  ?? 5,   2,  20))}
      ${field('Coil Diameter',     numberEl('coilRadius',    edge.annotations.coilStyle?.radius    ?? 10,  5,  40))}
      ${field('Distance from Edge', numberEl('coilGap',     edge.annotations.coilStyle?.gap       ?? 12,  0,  60))}
    ` : ''}
    ${field('Routing', radioGroup('routing', edge.routing, [['orthogonal','Orthogonal'],['diagonal','Diagonal']]))}
    ${field('Line Type',         radioGroup('lineType', edge.arrowStyle.type, [['normal','Solid'],['dashed','Dashed']]))}
    ${field('Thickness',         numberEl('thickness', edge.arrowStyle.thickness, 1, 6))}
    ${field('Head Size', numberEl('headSize',  edge.arrowStyle.headSize,  4, 20))}

    <div style="margin:14px 0 6px;border-top:1px solid #e2e8f0;padding-top:12px;">
      <h4 style="font-size:11px;font-weight:600;color:#64748b;letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px;">Vertical Annotations</h4>
      <div id="annot-list">${items.map((it, i) => annotItemHTML(it, i, tStep)).join('')}</div>
      <button id="btn-add-annot" style="${BTN_STYLE}margin-top:6px;width:100%;">+ Add Annotation</button>
    </div>
  `;

  // Coil checkbox
  bind('input[name="coil"]', 'change', v => updateFn(edge.id, { annotations: { coil: v === 'true' } }), true);
  if (edge.annotations.coil) {
    const coilTEl = panelEl.querySelector('input[name="coilT"]');
    if (coilTEl) {
      const coilTSpan = coilTEl.nextElementSibling;
      coilTEl.addEventListener('input', () => {
        if (coilTSpan) coilTSpan.textContent = Number(coilTEl.value).toFixed(2);
        updateFn(edge.id, { annotations: { coilT: Number(coilTEl.value) } });
      });
    }
    bindRadio('coilSide', v => updateFn(edge.id, { annotations: { coilSide: v } }));
    bind('input[name="coilThickness"]', 'input', v => updateFn(edge.id, { annotations: { coilStyle: { thickness: Number(v) } } }));
    bind('input[name="coilHeadSize"]',  'input', v => updateFn(edge.id, { annotations: { coilStyle: { headSize:  Number(v) } } }));
    bind('input[name="coilRadius"]',    'input', v => updateFn(edge.id, { annotations: { coilStyle: { radius:    Number(v) } } }));
    bind('input[name="coilGap"]',       'input', v => updateFn(edge.id, { annotations: { coilStyle: { gap:       Number(v) } } }));
  }

  bindRadio('routing',  v => updateFn(edge.id, { routing: v }));
  bindRadio('lineType', v => updateFn(edge.id, { arrowStyle: { type: v } }));
  bind('input[name="thickness"]', 'input', v => updateFn(edge.id, { arrowStyle: { thickness: Number(v) } }));
  bind('input[name="headSize"]',  'input', v => updateFn(edge.id, { arrowStyle: { headSize: Number(v) } }));

  wireAnnotItems(edge, updateFn);

  document.getElementById('btn-add-annot').addEventListener('click', () => {
    const newItem = { id: uid(), side: 'above', t: 0.5, label: '', shape: 'none', dist: 40, showArrow: true, snap: true, arrowGap: 2 };
    updateFn(edge.id, { annotations: { items: [...items, newItem] } });
  });
}

function annotItemHTML(item, idx, tStep) {
  const itemStep = (item.snap ?? true) ? tStep : 0.01;
  return `
  <div data-annot-id="${item.id}" style="border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin-bottom:8px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:11px;font-weight:600;color:#94a3b8;">Annotation ${idx + 1}</span>
      <button data-del-annot="${item.id}" style="font-size:11px;color:#dc2626;background:none;border:none;cursor:pointer;padding:2px 4px;">Delete</button>
    </div>
    ${field('Label',     textarea(`annot-label-${item.id}`, item.label, 2))}
    ${field('Side',       radioGroup(`annot-side-${item.id}`, item.side, [['above','Above (Left)'],['below','Below (Right)']]))}
    ${field('Position t',     rangeEl(`annot-t-${item.id}`, item.t, itemStep))}
    ${field('Snap t', checkboxEl(`annot-snap-${item.id}`, item.snap ?? true))}
    ${field('Shape',       selectEl(`annot-shape-${item.id}`, item.shape, [['none','None'],['box','Box']]))}
    ${field('Distance',       numberEl(`annot-dist-${item.id}`, item.dist ?? 40, 10, 200))}
    ${field('Show Arrow',   checkboxEl(`annot-arrow-${item.id}`, item.showArrow ?? true))}
    ${field('Arrow Gap', numberEl(`annot-gap-${item.id}`, item.arrowGap ?? 2, 0, 40))}
  </div>`;
}

function wireAnnotItems(edge, updateFn) {
  const getItems = () => [...(edge.annotations.items ?? [])];

  const updateItem = (id, patch) => {
    const items = getItems().map(it => it.id === id ? { ...it, ...patch } : it);
    updateFn(edge.id, { annotations: { items } });
  };

  for (const item of (edge.annotations.items ?? [])) {
    const id = item.id;

    const labelEl = panelEl.querySelector(`textarea[name="annot-label-${id}"]`);
    if (labelEl) labelEl.addEventListener('input', () => updateItem(id, { label: labelEl.value }));

    panelEl.querySelectorAll(`input[name="annot-side-${id}"]`).forEach(el => {
      el.addEventListener('change', () => { if (el.checked) updateItem(id, { side: el.value }); });
    });

    const tEl = panelEl.querySelector(`input[name="annot-t-${id}"]`);
    if (tEl) {
      const tSpan = tEl.nextElementSibling;
      tEl.addEventListener('input', () => {
        if (tSpan) tSpan.textContent = Number(tEl.value).toFixed(2);
        updateItem(id, { t: Number(tEl.value) });
      });
    }

    const snapEl = panelEl.querySelector(`input[name="annot-snap-${id}"]`);
    if (snapEl) snapEl.addEventListener('change', () => updateItem(id, { snap: snapEl.checked }));

    const distEl = panelEl.querySelector(`input[name="annot-dist-${id}"]`);
    if (distEl) distEl.addEventListener('input', () => updateItem(id, { dist: Number(distEl.value) }));

    const shapeEl = panelEl.querySelector(`select[name="annot-shape-${id}"]`);
    if (shapeEl) shapeEl.addEventListener('change', () => updateItem(id, { shape: shapeEl.value }));

    const arrowEl = panelEl.querySelector(`input[name="annot-arrow-${id}"]`);
    if (arrowEl) arrowEl.addEventListener('change', () => updateItem(id, { showArrow: arrowEl.checked }));

    const gapEl = panelEl.querySelector(`input[name="annot-gap-${id}"]`);
    if (gapEl) gapEl.addEventListener('input', () => updateItem(id, { arrowGap: Number(gapEl.value) }));

    const delBtn = panelEl.querySelector(`[data-del-annot="${id}"]`);
    if (delBtn) delBtn.addEventListener('click', () => {
      updateFn(edge.id, { annotations: { items: getItems().filter(it => it.id !== id) } });
    });
  }
}

// ── Element builders ──────────────────────────────────────────────────────────

const H3       = 'font-size:13px;font-weight:600;color:#334155;margin-bottom:12px;';
const BTN_STYLE= 'padding:5px 10px;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;background:white;cursor:pointer;color:#334155;';
const INPUT_S  = 'width:100%;padding:5px 7px;border:1px solid #e2e8f0;border-radius:4px;font-size:13px;box-sizing:border-box;';
const LABEL_S  = 'display:block;font-size:11px;color:#64748b;margin-bottom:3px;';

function field(label, control) {
  return `<div style="margin-bottom:9px;"><label style="${LABEL_S}">${label}</label>${control}</div>`;
}
function textarea(name, value, rows = 3) {
  return `<textarea name="${name}" rows="${rows}" style="${INPUT_S}resize:vertical;">${esc(value)}</textarea>`;
}
function selectEl(name, value, options) {
  const opts = options.map(([v, l]) => `<option value="${v}"${v===value?' selected':''}>${l}</option>`).join('');
  return `<select name="${name}" style="${INPUT_S}">${opts}</select>`;
}
function colorEl(name, value) {
  return `<input type="color" name="${name}" value="${value}" style="width:100%;height:32px;border:1px solid #e2e8f0;border-radius:4px;cursor:pointer;">`;
}
function numberEl(name, value, min, max, step = 1) {
  return `<input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}" style="${INPUT_S}">`;
}
function checkboxEl(name, checked) {
  return `<input type="checkbox" name="${name}" value="true" ${checked?'checked':''} style="width:16px;height:16px;cursor:pointer;">`;
}
function radioGroup(name, value, options) {
  return options.map(([v, l]) =>
    `<label style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:13px;cursor:pointer;">
      <input type="radio" name="${name}" value="${v}" ${v===value?'checked':''}> ${l}
    </label>`
  ).join('');
}
function rangeEl(name, value, step) {
  const display = Number(value).toFixed(2);
  return `<div style="display:flex;align-items:center;gap:8px;">
    <input type="range" name="${name}" value="${value}" min="0" max="1" step="${step}" style="flex:1;">
    <span style="font-size:12px;color:#64748b;width:32px;text-align:right;">${display}</span>
  </div>`;
}

// ── Binding helpers ───────────────────────────────────────────────────────────

function bind(selector, event, fn, isChecked = false) {
  const el = panelEl.querySelector(selector);
  if (!el) return;
  el.addEventListener(event, () => fn(isChecked ? String(el.checked) : el.value));
}
function bindRadio(name, fn) {
  panelEl.querySelectorAll(`input[name="${name}"]`).forEach(el => {
    el.addEventListener('change', () => { if (el.checked) fn(el.value); });
  });
}
function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
