'use strict';

// ── State ────────────────────────────────────────────────────────────────────
let cvReady = false;
let currentView = 'overlay';
let debounceTimer = null;
let imageLoaded = false;
let overlayMode = false;

// Manual count modification state (Spatial coordinate-based for 100% reproducibility)
let editMode = 'view'; // 'view' | 'add' | 'delete'
let distinguishManual = false;

// Main pipeline manual edits: { added: [{x, y, radius, id}], deleted: [{x, y}] }
let mainEdits = { added: [], deleted: [] };

// Per-condition rule manual edits: { [ruleId]: { added: [{x, y, radius, id}], deleted: [{x, y}] } }
let condEdits = {};

let _manualSeq = 0;
let _lastAutoDetectedCells = [];

function getCondEdits(ruleId) {
    if (!condEdits[ruleId]) {
        condEdits[ruleId] = { added: [], deleted: [] };
    }
    return condEdits[ruleId];
}

// Proximity matching helper using spatial Euclidean distance in image pixels
function findNearbyDeletedIndex(x, y, deletedList, tolerance) {
    const tol = tolerance || 6;
    for (let i = 0; i < deletedList.length; i++) {
        const d = deletedList[i];
        const dx = d.x - x;
        const dy = d.y - y;
        if (Math.sqrt(dx * dx + dy * dy) <= tol) return i;
    }
    return -1;
}

// Cached binary channel masks (CV_8UC1) updated every processImage() call.
// Keys: 'r' | 'g' | 'b'.  Values: cv.Mat (caller must NOT delete these).
const _chBinMats = { r: null, g: null, b: null };

// Conditional rule counter for unique IDs
let _condRuleSeq = 0;

// Cached source image (RGBA, CV_8UC4) — updated each processImage() call
let _cachedSrc = null;

// Per-condition render cache: { [ruleId]: { binMat, validCells, contours, hierarchy } }
// All cv.Mat values must be deleted when replaced or when the rule is removed.
const _condCache = {};

// ── Colour palette for conditional result boxes ───────────────────────────────
const COND_COLORS = [
    { bg: '#f0f0ff', border: '#a5b4fc', count: '#4338ca' },
    { bg: '#fefce8', border: '#fde047', count: '#854d0e' },
    { bg: '#fff0f6', border: '#f9a8d4', count: '#9d174d' },
    { bg: '#f0fdf4', border: '#86efac', count: '#166534' },
    { bg: '#fff7ed', border: '#fdba74', count: '#9a3412' },
];

// ── OpenCV lifecycle ──────────────────────────────────────────────────────────
// Public names required by onload=/onerror= attributes on the opencv script tag.
function onOpenCvReady() {
    if (cvReady) return;   // guard: onload + poll may both fire
    cvReady = true;
    const el = document.getElementById('cv-status');
    el.textContent = 'OpenCV.js ready';
    el.className = 'ready';
    document.getElementById('load-btn').disabled = false;
    if (imageLoaded) processImage();
}

function onOpenCvError() {
    const el = document.getElementById('cv-status');
    el.textContent = 'Failed to load OpenCV.js — check network connection';
    el.className = 'error';
}

// Polling fallback: handles rare cache-hit race where onload already fired
// before cell_counter.js finished executing (typically <100 ms window).
(function pollCv() {
    if (cvReady) return;
    if (typeof cv !== 'undefined' && cv.Mat) { onOpenCvReady(); return; }
    setTimeout(pollCv, 200);
})();






// ── File loading ──────────────────────────────────────────────────────────────
document.getElementById('file-input').addEventListener('change', e => {
    if (e.target.files[0]) loadImage(e.target.files[0]);
});

const dropZone = document.getElementById('drop_zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    if (e.dataTransfer.files[0]) loadImage(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => document.getElementById('file-input').click());

function loadImage(file) {
    const isTiff = /\.tiff?$/i.test(file.name);

    if (isTiff) {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const buffer = e.target.result;
                const ifds = UTIF.decode(buffer);
                UTIF.decodeImage(buffer, ifds[0]);
                const rgba = UTIF.toRGBA8(ifds[0]);

                const canvOrig = document.getElementById('canvas-orig');
                canvOrig.width = ifds[0].width;
                canvOrig.height = ifds[0].height;
                canvOrig.getContext('2d').putImageData(
                    new ImageData(new Uint8ClampedArray(rgba), ifds[0].width, ifds[0].height), 0, 0);

                // --- Extract scale from TIFF metadata ---
                try {
                    let umPerPx = null;
                    const ifd = ifds[0];
                    
                    if (ifd.t270) {
                        const desc = (typeof ifd.t270 === 'string') ? ifd.t270 : Array.from(ifd.t270).map(c => String.fromCharCode(c)).join('');
                        const mUnit = desc.match(/unit=([^\r\n]+)/);
                        const mPixelWidth = desc.match(/pixel_width=([0-9\.]+)/);
                        if (mUnit && mPixelWidth) {
                            const unit = mUnit[1].toLowerCase();
                            const val = parseFloat(mPixelWidth[1]);
                            if (unit === 'um' || unit === 'micron' || unit === 'microns') umPerPx = val;
                            else if (unit === 'nm') umPerPx = val / 1000;
                            else if (unit === 'mm') umPerPx = val * 1000;
                            else if (unit === 'cm') umPerPx = val * 10000;
                            else if (unit === 'inch') umPerPx = val * 25400;
                        }
                    }
                    
                    if (umPerPx === null && ifd.t282 && ifd.t282.length >= 2 && ifd.t296) {
                        const num = ifd.t282[0], den = ifd.t282[1];
                        if (num > 0) {
                            const pxlPerUnit = num / den;
                            const unit = Array.isArray(ifd.t296) ? ifd.t296[0] : ifd.t296;
                            if (unit === 3) umPerPx = 10000 / pxlPerUnit;
                            else if (unit === 2) umPerPx = 25400 / pxlPerUnit;
                        }
                    }
                    
                    if (umPerPx !== null && umPerPx > 0 && Number.isFinite(umPerPx)) {
                        document.getElementById('scale-um-per-px').value = umPerPx.toFixed(4);
                        const statusEl = document.getElementById('scale-meta-status');
                        statusEl.textContent = '✓ Metadata found';
                        statusEl.style.color = '#15803d';
                        statusEl.style.background = '#dcfce3';
                        statusEl.title = `Scale: ${umPerPx.toFixed(4)} µm/px`;
                    } else {
                        const statusEl = document.getElementById('scale-meta-status');
                        statusEl.textContent = 'No scale metadata';
                        statusEl.style.color = '#94a3b8';
                        statusEl.style.background = '#f1f5f9';
                        statusEl.title = '';
                    }
                } catch (metaErr) { console.warn('Scale metadata parse error:', metaErr); }
                // -----------------------------------------

                _afterImageLoad(file.name);
            } catch (err) {
                console.error('Error loading TIFF:', err);
                alert('Could not load TIFF image. It might be an unsupported compression format.');
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const canvOrig = document.getElementById('canvas-orig');
                canvOrig.width = img.width;
                canvOrig.height = img.height;
                canvOrig.getContext('2d').drawImage(img, 0, 0);

                const statusEl = document.getElementById('scale-meta-status');
                statusEl.textContent = 'No metadata (Not a TIFF)';
                statusEl.style.color = '#94a3b8';
                statusEl.style.background = '#f1f5f9';
                statusEl.title = '';

                _afterImageLoad(file.name);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function _afterImageLoad(filename) {
    // Switch drop zone to compact 'loaded' state (keep visible for re-drop)
    dropZone.classList.add('loaded');
    dropZone.innerHTML =
        `<span class="dz-filename">🖼️ ${filename || 'image'}</span>` +
        `<span class="dz-hint">Drop or click to replace</span>`;
    document.getElementById('canvas-area').hidden = false;
    imageLoaded = true;
    syncChannelCanvasSizes();
    if (cvReady) processImage();
    else document.getElementById('result-note').textContent = 'Waiting for OpenCV.js to finish loading…';
}

// ── Canvas helpers ────────────────────────────────────────────────────────────
function syncChannelCanvasSizes() {
    const orig = document.getElementById('canvas-orig');
    ['canvas-ch-r', 'canvas-ch-g', 'canvas-ch-b',
        'canvas-result', 'canvas-mask-r', 'canvas-mask-g', 'canvas-mask-b'].forEach(id => {
            const c = document.getElementById(id);
            c.width = orig.width;
            c.height = orig.height;
        });
}

// ── Overlay helpers ───────────────────────────────────────────────────────────
function toggleOverlay() {
    overlayMode = !overlayMode;
    const btn = document.getElementById('overlay-btn');
    const row2 = document.getElementById('canvas-row2');
    const opCtrl = document.getElementById('opacity-ctrl');
    const container = document.getElementById('overlay-container');

    btn.classList.toggle('active', overlayMode);
    opCtrl.classList.toggle('visible', overlayMode);

    if (overlayMode) {
        row2.classList.add('overlay-mode');
        container.style.position = 'relative';
        container.style.height = document.getElementById('canvas-row1').offsetHeight + 'px';
        updateOverlayOpacity();
    } else {
        row2.classList.remove('overlay-mode');
        row2.style.opacity = '';
        container.style.height = '';
        container.style.position = '';
    }
}

function updateOverlayOpacity() {
    const val = document.getElementById('opacity-slider').value;
    document.getElementById('opacity-val').textContent = val + '%';
    if (overlayMode) document.getElementById('canvas-row2').style.opacity = val / 100;
}

// ── Scheduling ────────────────────────────────────────────────────────────────
function scheduleProcess() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processImage, 100);
}

// ── Controls wiring ───────────────────────────────────────────────────────────

// Load button → open file picker
document.getElementById('load-btn').addEventListener('click', () =>
    document.getElementById('file-input').click());

// Overlay toggle & opacity slider
document.getElementById('overlay-btn').addEventListener('click', toggleOverlay);
document.getElementById('opacity-slider').addEventListener('input', updateOverlayOpacity);

// Scale bar events
document.getElementById('show-scale-bar').addEventListener('change', () => {
    _condRules.forEach(r => _rerenderCondCanvas(r.id));
});
document.getElementById('scale-um-per-px').addEventListener('input', () => {
    _condRules.forEach(r => _rerenderCondCanvas(r.id));
});
document.getElementById('scale-bar-length').addEventListener('input', function() {
    document.getElementById('scale-bar-length-val').textContent = this.value;
    _condRules.forEach(r => _rerenderCondCanvas(r.id));
});

// Add condition button
document.getElementById('cond-add-btn').addEventListener('click', addCondRule);

// Main result save button
document.getElementById('result-save-btn').addEventListener('click', () => {
    const fmt = document.getElementById('result-fmt').value;
    _saveCanvas(document.getElementById('canvas-result'), fmt, 'result');
});

// View-toggle buttons
document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;
        if (cvReady && imageLoaded) processImage();
    });
});

// Channel tabs
document.querySelectorAll('.ch-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.ch-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ch-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('ch-panel-' + tab.dataset.ch).classList.add('active');
    });
});

// Grayscale threshold
document.getElementById('thresh').addEventListener('input', function () {
    document.getElementById('thresh-val').textContent = this.value;
    scheduleProcess();
});
document.getElementById('otsu').addEventListener('change', function () {
    document.getElementById('thresh').disabled = this.checked;
    scheduleProcess();
});
['invert', 'negative', 'show-labels'].forEach(id =>
    document.getElementById(id).addEventListener('change', scheduleProcess));

// Global (Original) tab sliders
['orig-blur', 'orig-morph-open', 'orig-morph-close', 'orig-circ'].forEach(id => {
    document.getElementById(id).addEventListener('input', function () {
        const display = id === 'orig-circ' ? (this.value / 100).toFixed(2) : this.value;
        document.getElementById(id + '-val').textContent = display;
        scheduleProcess();
    });
});
['orig-min-area', 'orig-max-area'].forEach(id =>
    document.getElementById(id).addEventListener('input', scheduleProcess));

// Per-channel controls (R, G, B)
['r', 'g', 'b'].forEach(ch => {
    document.getElementById(`ch-${ch}-thresh`).addEventListener('input', function () {
        document.getElementById(`ch-${ch}-thresh-val`).textContent = this.value;
        scheduleProcess();
    });
    document.getElementById(`ch-${ch}-circ`).addEventListener('input', function () {
        document.getElementById(`ch-${ch}-circ-val`).textContent = (this.value / 100).toFixed(2);
        scheduleProcess();
    });
    document.getElementById(`ch-${ch}-otsu`).addEventListener('change', function () {
        document.getElementById(`ch-${ch}-thresh`).disabled = this.checked;
        scheduleProcess();
    });
    document.getElementById(`ch-${ch}-enabled`).addEventListener('change', function () {
        document.getElementById(`ch-${ch}-body`).classList.toggle('disabled', !this.checked);
        scheduleProcess();
    });
    document.getElementById(`ch-${ch}-invert`).addEventListener('change', scheduleProcess);
    document.getElementById(`ch-${ch}-override`).addEventListener('change', function () {
        document.getElementById(`ch-${ch}-override-body`).classList.toggle('disabled', !this.checked);
        scheduleProcess();
    });
    [`ch-${ch}-min-area`, `ch-${ch}-max-area`].forEach(id =>
        document.getElementById(id).addEventListener('input', scheduleProcess));
});

// ── Parameter readers ─────────────────────────────────────────────────────────
function getChParam(ch) {
    const override = document.getElementById(`ch-${ch}-override`).checked;
    const gMinArea = parseFloat(document.getElementById('orig-min-area').value) || 1;
    const gMaxArea = parseFloat(document.getElementById('orig-max-area').value) || Infinity;
    const gMinCirc = parseInt(document.getElementById('orig-circ').value) / 100;
    return {
        enabled: document.getElementById(`ch-${ch}-enabled`).checked,
        thresh: parseInt(document.getElementById(`ch-${ch}-thresh`).value),
        useOtsu: document.getElementById(`ch-${ch}-otsu`).checked,
        invert: document.getElementById(`ch-${ch}-invert`).checked,
        minArea: override ? (parseFloat(document.getElementById(`ch-${ch}-min-area`).value) || 1) : gMinArea,
        maxArea: override ? (parseFloat(document.getElementById(`ch-${ch}-max-area`).value) || Infinity) : gMaxArea,
        minCirc: override ? (parseInt(document.getElementById(`ch-${ch}-circ`).value) / 100) : gMinCirc,
    };
}

// ── Conditional Count — UI ────────────────────────────────────────────────────

/**
 * A "term" in the rule expression is:
 *   { op: 'AND'|'OR'|'NOT', ch: 'r'|'g'|'b' }
 * The first term has no operator (op is ignored on index 0).
 *
 * Each rule row rendered in the DOM looks like:
 *   [Channel ▾]  [AND▾] [Channel ▾]  [AND▾] [Channel ▾]  [× Remove]  [+ Term]
 *
 * Internally we store rules as an array of term descriptor arrays.
 */
const _condRules = [];   // Array of { id, terms: [{op,ch},...] }

function addCondRule() {
    const id = ++_condRuleSeq;
    const rule = {
        id, terms: [{ op: 'AND', ch: 'r' }, { op: 'AND', ch: 'g' }],
        view: 'cells', showLabels: false, overlayOpacity: 0
    };
    _condRules.push(rule);
    _renderCondRules();
    scheduleProcess();
}

function removeCondRule(id) {
    const idx = _condRules.findIndex(r => r.id === id);
    if (idx !== -1) _condRules.splice(idx, 1);
    _clearCondCache(id);   // clean up cached Mats for this rule
    _renderCondRules();
    scheduleProcess();
}

function _clearCondCache(id) {
    const ids = id !== undefined ? [id] : Object.keys(_condCache).map(Number);
    ids.forEach(k => {
        const c = _condCache[k];
        if (!c) return;
        if (c.binMat) c.binMat.delete();
        if (c.contours) c.contours.delete();
        if (c.hierarchy) c.hierarchy.delete();
        delete _condCache[k];
    });
}

function _addCondTerm(ruleId) {
    const rule = _condRules.find(r => r.id === ruleId);
    if (!rule || rule.terms.length >= 3) return;
    rule.terms.push({ op: 'AND', ch: 'b' });
    _renderCondRules();
    scheduleProcess();
}

function _removeCondTerm(ruleId, termIdx) {
    const rule = _condRules.find(r => r.id === ruleId);
    if (!rule || rule.terms.length <= 2) return;
    rule.terms.splice(termIdx, 1);
    _renderCondRules();
    scheduleProcess();
}

function _onCondChange(ruleId, termIdx, field, value) {
    const rule = _condRules.find(r => r.id === ruleId);
    if (!rule) return;
    rule.terms[termIdx][field] = value;
    // Update op badge class
    if (field === 'op') {
        const badge = document.getElementById(`cond-badge-${ruleId}-${termIdx}`);
        if (badge) {
            badge.className = 'cond-op-badge ' + value.toLowerCase();
            badge.textContent = value;
        }
    }
    scheduleProcess();
}

const CH_LABEL = { r: 'R (Red)', g: 'G (Green)', b: 'B (Blue)' };
const OPS = ['AND', 'OR', 'NOT'];

function _renderCondRules() {
    const container = document.getElementById('cond-rules');
    container.innerHTML = '';

    _condRules.forEach(rule => {
        // Outer row: two columns side-by-side
        const row = document.createElement('div');
        row.className = 'cond-rule';
        row.id = `cond-rule-${rule.id}`;

        // ── Left: rule definition ──────────────────────────────────────
        const def = document.createElement('div');
        def.className = 'cond-rule-def';

        rule.terms.forEach((term, ti) => {
            if (ti > 0) {
                const opSel = document.createElement('select');
                opSel.title = 'Logical operator';
                opSel.style.minWidth = '62px';
                OPS.forEach(op => {
                    const opt = document.createElement('option');
                    opt.value = op; opt.textContent = op;
                    if (op === term.op) opt.selected = true;
                    opSel.appendChild(opt);
                });
                opSel.addEventListener('change', e => _onCondChange(rule.id, ti, 'op', e.target.value));
                def.appendChild(opSel);
            }

            const chSel = document.createElement('select');
            chSel.title = 'Channel';
            ['r', 'g', 'b'].forEach(ch => {
                const opt = document.createElement('option');
                opt.value = ch; opt.textContent = CH_LABEL[ch];
                if (ch === term.ch) opt.selected = true;
                chSel.appendChild(opt);
            });
            chSel.style.color = term.ch === 'r' ? '#dc2626' : term.ch === 'g' ? '#16a34a' : '#2563eb';
            chSel.addEventListener('change', e => {
                e.target.style.color = e.target.value === 'r' ? '#dc2626' : e.target.value === 'g' ? '#16a34a' : '#2563eb';
                _onCondChange(rule.id, ti, 'ch', e.target.value);
            });
            def.appendChild(chSel);

            if (ti > 0 && rule.terms.length > 2) {
                const rmTerm = document.createElement('button');
                rmTerm.textContent = '−'; rmTerm.title = 'Remove this channel';
                rmTerm.style.cssText = 'padding:1px 6px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:3px;cursor:pointer;font-size:11px;';
                rmTerm.addEventListener('click', () => _removeCondTerm(rule.id, ti));
                def.appendChild(rmTerm);
            }
        });

        if (rule.terms.length < 3) {
            const addTerm = document.createElement('button');
            addTerm.textContent = '＋'; addTerm.title = 'Add channel';
            addTerm.style.cssText = 'padding:1px 7px;border:1px solid #6366f1;background:#f0f0ff;color:#4338ca;border-radius:3px;cursor:pointer;font-size:11px;';
            addTerm.addEventListener('click', () => _addCondTerm(rule.id));
            def.appendChild(addTerm);
        }

        const rmBtn = document.createElement('button');
        rmBtn.className = 'cond-remove-btn';
        rmBtn.textContent = '✕';
        rmBtn.title = 'Remove condition';
        rmBtn.addEventListener('click', () => removeCondRule(rule.id));
        def.appendChild(rmBtn);

        row.appendChild(def);

        // ── Right: canvas placeholder (filled by _updateCondResults) ───
        const wrap = document.createElement('div');
        wrap.className = 'cond-rule-canvas-wrap';
        wrap.id = `cond-canvas-wrap-${rule.id}`;
        row.appendChild(wrap);

        container.appendChild(row);
    });
}

// ── Conditional Count — computation ──────────────────────────────────────────

/**
 * Given a rule (array of {op,ch} terms) and the per-channel binary Mats,
 * returns a NEW CV_8UC1 binary Mat representing the composed mask.
 * Caller is responsible for deleting the returned Mat.
 */
function _composeCondMask(terms) {
    // Start with the first channel's binary mask (clone so we can modify)
    let result = _chBinMats[terms[0].ch].clone();

    for (let i = 1; i < terms.length; i++) {
        const { op, ch } = terms[i];
        const rhs = _chBinMats[ch];
        const tmp = new cv.Mat();

        if (op === 'AND') {
            cv.bitwise_and(result, rhs, tmp);
        } else if (op === 'OR') {
            cv.bitwise_or(result, rhs, tmp);
        } else {  // NOT: result AND NOT(rhs)
            const notRhs = new cv.Mat();
            cv.bitwise_not(rhs, notRhs);
            cv.bitwise_and(result, notRhs, tmp);
            notRhs.delete();
        }

        result.delete();
        result = tmp;
    }
    return result;
}

/** Build a human-readable expression string for a rule */
function _ruleExpr(terms) {
    return terms.map((t, i) => (i === 0 ? '' : ` ${t.op} `) + t.ch.toUpperCase()).join('');
}

/**
 * Analyse a binary mask: find contours, apply area/circularity filter.
 * Returns { validCells, contours, hierarchy } — CALLER MUST DELETE contours and hierarchy.
 */
function _analyzeCondMask(binMat) {
    const minArea = parseFloat(document.getElementById('orig-min-area').value) || 1;
    const maxArea = parseFloat(document.getElementById('orig-max-area').value) || Infinity;
    const minCirc = parseInt(document.getElementById('orig-circ').value) / 100;

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const validCells = [];
    for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        const area = cv.contourArea(c);
        if (area < minArea || area > maxArea) continue;
        const perim = cv.arcLength(c, true);
        const circ = perim > 0 ? (4 * Math.PI * area) / (perim * perim) : 0;
        if (circ < minCirc) continue;
        const m = cv.moments(c);
        if (m.m00 === 0) continue;
        validCells.push({
            index: i,
            cx: Math.round(m.m10 / m.m00),
            cy: Math.round(m.m01 / m.m00),
            radius: Math.max(4, Math.round(Math.sqrt(area / Math.PI)))
        });
    }
    return { validCells, contours, hierarchy };
}

/** Save a canvas as PNG or JPEG download */
function _saveCanvas(canvasEl, fmt, filename) {
    if (!canvasEl || !canvasEl.width) return;
    const mime = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = fmt === 'jpeg' ? 'jpg' : 'png';
    const a = document.createElement('a');
    a.href = canvasEl.toDataURL(mime, 0.95);
    a.download = (filename || 'result') + '.' + ext;
    a.click();
}

/** Render a conditional result canvas from cached data */
function _rerenderCondCanvas(ruleId) {
    const rule = _condRules.find(r => r.id === ruleId);
    const cache = _condCache[ruleId];
    if (!rule || !cache || !_cachedSrc) return;

    const canvasId = `cond-canvas-${ruleId}`;
    const canvasEl = document.getElementById(canvasId);
    if (!canvasEl) return;

    // Ensure canvas is sized to match image
    canvasEl.width = _cachedSrc.cols;
    canvasEl.height = _cachedSrc.rows;

    const ruleEdits = getCondEdits(ruleId);
    const activeCells = [];
    const deletedCells = [];

    cache.validCells.forEach(cell => {
        if (findNearbyDeletedIndex(cell.cx, cell.cy, ruleEdits.deleted, cell.radius) !== -1) {
            deletedCells.push(cell);
        } else {
            activeCells.push(cell);
        }
    });

    let displayMat = null;
    try {
        if (rule.view === 'mask') {
            displayMat = new cv.Mat();
            cv.cvtColor(cache.binMat, displayMat, cv.COLOR_GRAY2RGBA);
            activeCells.forEach(cell =>
                cv.drawContours(displayMat, cache.contours, cell.index,
                    new cv.Scalar(255, 60, 60, 255), 2));
            ruleEdits.added.forEach(cell => {
                cv.circle(displayMat, new cv.Point(cell.x, cell.y), cell.radius || 8, new cv.Scalar(255, 165, 0, 255), 2);
            });
        } else {
            displayMat = _cachedSrc.clone();

            if (!distinguishManual) {
                const allActive = [
                    ...activeCells.map(c => ({ cx: c.cx, cy: c.cy, radius: c.radius })),
                    ...ruleEdits.added.map(c => ({ cx: c.x, cy: c.y, radius: c.radius || 8 }))
                ];
                allActive.forEach(cell => {
                    cv.circle(displayMat, new cv.Point(cell.cx, cell.cy), cell.radius, new cv.Scalar(0, 220, 80, 255), 2);
                    cv.circle(displayMat, new cv.Point(cell.cx, cell.cy), 3, new cv.Scalar(255, 50, 50, 255), -1);
                });
                if (rule.showLabels) {
                    allActive.forEach((cell, n) =>
                        cv.putText(displayMat, String(n + 1),
                            new cv.Point(cell.cx + cell.radius + 3, cell.cy - cell.radius - 3),
                            cv.FONT_HERSHEY_SIMPLEX, 0.45, new cv.Scalar(255, 255, 0, 255), 1));
                }
            } else {
                activeCells.forEach((cell, n) => {
                    cv.circle(displayMat, new cv.Point(cell.cx, cell.cy), cell.radius, new cv.Scalar(0, 220, 80, 255), 2);
                    cv.circle(displayMat, new cv.Point(cell.cx, cell.cy), 3, new cv.Scalar(255, 50, 50, 255), -1);
                    if (rule.showLabels) {
                        cv.putText(displayMat, String(n + 1),
                            new cv.Point(cell.cx + cell.radius + 3, cell.cy - cell.radius - 3),
                            cv.FONT_HERSHEY_SIMPLEX, 0.45, new cv.Scalar(255, 255, 0, 255), 1);
                    }
                });

                ruleEdits.added.forEach((cell, idx) => {
                    const r = cell.radius || 8;
                    cv.circle(displayMat, new cv.Point(cell.x, cell.y), r, new cv.Scalar(255, 165, 0, 255), 2);
                    cv.circle(displayMat, new cv.Point(cell.x, cell.y), 3, new cv.Scalar(255, 165, 0, 255), -1);
                    if (rule.showLabels) {
                        cv.putText(displayMat, `+${idx + 1}`,
                            new cv.Point(cell.x + r + 3, cell.y - r - 3),
                            cv.FONT_HERSHEY_SIMPLEX, 0.45, new cv.Scalar(255, 165, 0, 255), 1);
                    }
                });

                deletedCells.forEach(cell => {
                    const r = cell.radius;
                    cv.circle(displayMat, new cv.Point(cell.cx, cell.cy), r, new cv.Scalar(239, 68, 68, 180), 1);
                    cv.line(displayMat, new cv.Point(cell.cx - r, cell.cy - r), new cv.Point(cell.cx + r, cell.cy + r), new cv.Scalar(239, 68, 68, 255), 2);
                    cv.line(displayMat, new cv.Point(cell.cx - r, cell.cy + r), new cv.Point(cell.cx + r, cell.cy - r), new cv.Scalar(239, 68, 68, 255), 2);
                });
            }
        }

        // Blend original image overlay
        if (rule.overlayOpacity > 0) {
            const blended = new cv.Mat();
            cv.addWeighted(displayMat, 1.0 - rule.overlayOpacity,
                _cachedSrc, rule.overlayOpacity, 0, blended);
            displayMat.delete();
            displayMat = blended;
        }

        // --- Draw scale bar (Bottom Left) ---
        if (document.getElementById('show-scale-bar').checked) {
            const umPerPx = parseFloat(document.getElementById('scale-um-per-px').value);
            const scaleUm = parseInt(document.getElementById('scale-bar-length').value);
            if (umPerPx > 0 && scaleUm > 0) {
                const scalePx = Math.round(scaleUm / umPerPx);
                if (scalePx > 0 && scalePx < displayMat.cols) {
                    const barHeight = Math.max(4, Math.round(displayMat.rows * 0.015));
                    const padding = 15;
                    const pt1 = new cv.Point(padding, displayMat.rows - padding - barHeight);
                    const pt2 = new cv.Point(padding + scalePx, displayMat.rows - padding);
                    
                    cv.rectangle(displayMat, new cv.Point(pt1.x - 2, pt1.y - 2), new cv.Point(pt2.x + 2, pt2.y + 2), new cv.Scalar(0, 0, 0, 255), -1);
                    cv.rectangle(displayMat, pt1, pt2, new cv.Scalar(255, 255, 255, 255), -1);
                    
                    const textStr = scaleUm + " um";
                    const fontScale = Math.max(0.4, barHeight / 20.0);
                    const thickness = Math.max(1, Math.round(fontScale * 1.5));
                    const textY = pt1.y - Math.max(4, Math.round(displayMat.rows * 0.01));
                    
                    cv.putText(displayMat, textStr, new cv.Point(padding, textY), cv.FONT_HERSHEY_SIMPLEX, fontScale, new cv.Scalar(0, 0, 0, 255), thickness + 2);
                    cv.putText(displayMat, textStr, new cv.Point(padding, textY), cv.FONT_HERSHEY_SIMPLEX, fontScale, new cv.Scalar(255, 255, 255, 255), thickness);
                }
            }
        }
        // ------------------------------------

        cv.imshow(canvasId, displayMat);
    } finally {
        if (displayMat) displayMat.delete();
    }
}

/** Update view option and re-render (no full reprocess needed) */
function _setCondView(ruleId, view) {
    const rule = _condRules.find(r => r.id === ruleId);
    if (!rule) return;
    rule.view = view;
    document.querySelectorAll(`#cond-result-${ruleId} .cond-view-btn`).forEach(b =>
        b.classList.toggle('active', b.dataset.view === view));
    _rerenderCondCanvas(ruleId);
}

function _setCondLabels(ruleId, checked) {
    const rule = _condRules.find(r => r.id === ruleId);
    if (!rule) return;
    rule.showLabels = checked;
    _rerenderCondCanvas(ruleId);
}

function _setCondOverlay(ruleId, opacity) {
    const rule = _condRules.find(r => r.id === ruleId);
    if (!rule) return;
    rule.overlayOpacity = opacity;
    const valEl = document.getElementById(`cond-ovl-val-${ruleId}`);
    if (valEl) valEl.textContent = Math.round(opacity * 100) + '%';
    _rerenderCondCanvas(ruleId);
}

/** Update the inline canvas panels inside each condition rule row */
function _updateCondResults() {
    if (!_chBinMats.r || !_chBinMats.g || !_chBinMats.b || !_cachedSrc) return;

    _condRules.forEach((rule, ridx) => {
        const wrap = document.getElementById(`cond-canvas-wrap-${rule.id}`);
        if (!wrap) return;   // rule row not rendered yet

        let composed = null;
        try {
            composed = _composeCondMask(rule.terms);
            const analysis = _analyzeCondMask(composed);

            _clearCondCache(rule.id);
            _condCache[rule.id] = {
                binMat: composed,
                validCells: analysis.validCells,
                contours: analysis.contours,
                hierarchy: analysis.hierarchy,
            };
            composed = null;

            const ruleEdits = getCondEdits(rule.id);
            const activeAutoCells = analysis.validCells.filter(cell =>
                findNearbyDeletedIndex(cell.cx, cell.cy, ruleEdits.deleted, cell.radius) === -1
            );
            const deletedAutoCells = analysis.validCells.filter(cell =>
                findNearbyDeletedIndex(cell.cx, cell.cy, ruleEdits.deleted, cell.radius) !== -1
            );

            const totalCount = activeAutoCells.length + ruleEdits.added.length;
            const countStr = distinguishManual && (ruleEdits.added.length > 0 || deletedAutoCells.length > 0)
                ? `${totalCount} <span style="font-size:11px;font-weight:normal;color:#64748b;">(Auto: ${activeAutoCells.length}, +${ruleEdits.added.length}, -${deletedAutoCells.length})</span>`
                : `${totalCount}`;

            const col = COND_COLORS[ridx % COND_COLORS.length];
            const expr = _ruleExpr(rule.terms);

            // Build/update inner HTML of the canvas wrap
            wrap.innerHTML = `
                <div class="cond-inline-top">
                    <span class="cond-inline-count" style="color:${col.count}">${countStr}</span>
                    <span class="cond-inline-label">cells</span>
                    <div class="cond-view-toggle">
                        <button class="cond-view-btn${rule.view === 'cells' ? ' active' : ''}" data-view="cells">Cells</button>
                        <button class="cond-view-btn${rule.view === 'mask' ? ' active' : ''}" data-view="mask" >Mask</button>
                    </div>
                    <label class="cond-label-toggle"><input type="checkbox" ${rule.showLabels ? 'checked' : ''}> Num</label>
                    <button class="cond-reset-btn" style="padding:2px 6px;font-size:10px;border:1px solid #cbd5e1;border-radius:3px;background:white;cursor:pointer;color:#64748b;">🔄 Reset</button>
                    <div class="cond-overlay-ctrl">
                        <span class="cond-overlay-lbl">Orig</span>
                        <input type="range" class="cond-ovl-slider" min="0" max="100"
                               value="${Math.round((rule.overlayOpacity || 0) * 100)}">
                        <span class="cond-overlay-val" id="cond-ovl-val-${rule.id}">${Math.round((rule.overlayOpacity || 0) * 100)}%</span>
                    </div>
                    <div class="cond-save-row">
                        <select class="cond-fmt-sel"><option value="png">PNG</option><option value="jpeg">JPEG</option></select>
                        <button class="cond-save-btn">⬇</button>
                    </div>
                </div>
                <canvas id="cond-canvas-${rule.id}" class="cond-canvas"></canvas>`;

            wrap.querySelectorAll('.cond-view-btn').forEach(btn =>
                btn.addEventListener('click', () => _setCondView(rule.id, btn.dataset.view)));
            wrap.querySelector('.cond-label-toggle input').addEventListener('change', e =>
                _setCondLabels(rule.id, e.target.checked));
            wrap.querySelector('.cond-ovl-slider').addEventListener('input', e =>
                _setCondOverlay(rule.id, e.target.value / 100));
            wrap.querySelector('.cond-reset-btn').addEventListener('click', () => {
                ruleEdits.added = [];
                ruleEdits.deleted = [];
                _updateCondResults();
            });
            wrap.querySelector('.cond-save-btn').addEventListener('click', () => {
                const fmt = wrap.querySelector('.cond-fmt-sel').value;
                _saveCanvas(document.getElementById(`cond-canvas-${rule.id}`),
                    fmt, `cond_${expr.replace(/ /g, '_')}`);
            });

            // Canvas click handler for per-rule manual edits
            const condCanvas = document.getElementById(`cond-canvas-${rule.id}`);
            if (condCanvas) {
                if (editMode === 'add') condCanvas.style.cursor = 'crosshair';
                else if (editMode === 'delete') condCanvas.style.cursor = 'pointer';
                else condCanvas.style.cursor = 'default';

                condCanvas.addEventListener('click', e => {
                    if (editMode === 'view') return;
                    const rect = condCanvas.getBoundingClientRect();
                    if (!rect.width || !rect.height) return;
                    const scaleX = condCanvas.width / rect.width;
                    const scaleY = condCanvas.height / rect.height;
                    const imgX = Math.round((e.clientX - rect.left) * scaleX);
                    const imgY = Math.round((e.clientY - rect.top) * scaleY);

                    if (editMode === 'add') {
                        ruleEdits.added.push({ x: imgX, y: imgY, radius: 8, id: ++_manualSeq });
                        _updateCondResults();
                    } else if (editMode === 'delete') {
                        // Check ruleEdits.added
                        let foundIdx = -1;
                        for (let i = ruleEdits.added.length - 1; i >= 0; i--) {
                            const c = ruleEdits.added[i];
                            const dx = c.x - imgX, dy = c.y - imgY;
                            if (Math.sqrt(dx * dx + dy * dy) <= (c.radius || 8) + 6) {
                                foundIdx = i;
                                break;
                            }
                        }
                        if (foundIdx !== -1) {
                            ruleEdits.added.splice(foundIdx, 1);
                            _updateCondResults();
                            return;
                        }

                        // Check analysis.validCells
                        let foundCell = null;
                        for (let i = 0; i < analysis.validCells.length; i++) {
                            const c = analysis.validCells[i];
                            const dx = c.cx - imgX, dy = c.cy - imgY;
                            if (Math.sqrt(dx * dx + dy * dy) <= c.radius + 6) {
                                foundCell = c;
                                break;
                            }
                        }

                        if (foundCell) {
                            const delIdx = findNearbyDeletedIndex(foundCell.cx, foundCell.cy, ruleEdits.deleted, foundCell.radius);
                            if (delIdx !== -1) {
                                ruleEdits.deleted.splice(delIdx, 1); // un-delete
                            } else {
                                ruleEdits.deleted.push({ x: foundCell.cx, y: foundCell.cy });
                            }
                            _updateCondResults();
                        }
                    }
                });
            }

        } catch (e) {
            console.warn('Conditional count error:', e);
            if (composed) composed.delete();
            return;
        }
        _rerenderCondCanvas(rule.id);
    });
}

// ── Core image processing ─────────────────────────────────────────────────────
function processImage() {
    const canvOrig = document.getElementById('canvas-orig');
    if (!cvReady || !imageLoaded || !canvOrig.width) return;

    // Read global parameters
    const blurVal = parseInt(document.getElementById('orig-blur').value);
    const threshVal = parseInt(document.getElementById('thresh').value);
    const useOtsu = document.getElementById('otsu').checked;
    const invert = document.getElementById('invert').checked;
    const isNegative = document.getElementById('negative').checked;
    const openIter = parseInt(document.getElementById('orig-morph-open').value);
    const closeIter = parseInt(document.getElementById('orig-morph-close').value);
    const minArea = parseFloat(document.getElementById('orig-min-area').value) || 1;
    const maxArea = parseFloat(document.getElementById('orig-max-area').value) || Infinity;
    const minCirc = parseInt(document.getElementById('orig-circ').value) / 100;
    const showLabels = document.getElementById('show-labels').checked;

    // Mat declarations
    let src = null, gray = null, blurred = null, binary = null;
    let contours = null, hierarchy = null, displayMat = null, kernel = null;
    let chR = null, chG = null, chB = null, chA = null, chVec = null;
    let chRdisp = null, chGdisp = null, chBdisp = null;
    let maskRdisp = null, maskGdisp = null, maskBdisp = null;

    try {
        src = cv.imread(canvOrig);

        // Cache source image for conditional result re-rendering
        if (_cachedSrc) { _cachedSrc.delete(); _cachedSrc = null; }

        // Optional negative
        if (isNegative) {
            const temp = new cv.Mat();
            cv.cvtColor(src, temp, cv.COLOR_RGBA2RGB);
            cv.bitwise_not(temp, temp);
            cv.cvtColor(temp, src, cv.COLOR_RGB2RGBA);
            temp.delete();
        }

        _cachedSrc = src.clone();  // keep a copy for conditional canvas rendering

        // ── Channel split ─────────────────────────────────────────────────
        chVec = new cv.MatVector();
        cv.split(src, chVec);
        chR = chVec.get(0);
        chG = chVec.get(1);
        chB = chVec.get(2);
        chA = chVec.get(3);

        // Helper: single-channel → tinted RGBA
        function channelToRGBA(ch, r, g, b) {
            const rgba = new cv.Mat();
            const zeros = cv.Mat.zeros(ch.rows, ch.cols, cv.CV_8UC1);
            const channels = new cv.MatVector();
            channels.push_back(r ? ch : zeros);
            channels.push_back(g ? ch : zeros);
            channels.push_back(b ? ch : zeros);
            const alpha = new cv.Mat(ch.rows, ch.cols, cv.CV_8UC1, new cv.Scalar(255));
            channels.push_back(alpha);
            cv.merge(channels, rgba);
            zeros.delete(); alpha.delete(); channels.delete();
            return rgba;
        }

        chRdisp = channelToRGBA(chR, true, false, false);
        chGdisp = channelToRGBA(chG, false, true, false);
        chBdisp = channelToRGBA(chB, false, false, true);
        cv.imshow('canvas-ch-r', chRdisp);
        cv.imshow('canvas-ch-g', chGdisp);
        cv.imshow('canvas-ch-b', chBdisp);

        // ── Per-channel binary masks (stored for conditional count) ────────
        const ksize = blurVal % 2 === 0 ? blurVal + 1 : blurVal;

        /**
         * Returns a NEW CV_8UC1 binary Mat (thresholded).
         * When channel is disabled, returns an all-zero Mat.
         * The RGBA display Mat is generated separately.
         */
        function buildBinMask(ch, p) {
            if (!p.enabled) return cv.Mat.zeros(ch.rows, ch.cols, cv.CV_8UC1);
            const blr = new cv.Mat();
            const bin = new cv.Mat();
            cv.GaussianBlur(ch, blr, new cv.Size(ksize, ksize), 0);
            let ttype = p.invert ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY;
            if (p.useOtsu) ttype |= cv.THRESH_OTSU;
            cv.threshold(blr, bin, p.useOtsu ? 0 : p.thresh, 255, ttype);
            blr.delete();
            return bin;  // CV_8UC1
        }

        const pR = getChParam('r'), pG = getChParam('g'), pB = getChParam('b');

        // Free previous cache before replacing
        ['r', 'g', 'b'].forEach(k => { if (_chBinMats[k]) { _chBinMats[k].delete(); _chBinMats[k] = null; } });
        _chBinMats.r = buildBinMask(chR, pR);
        _chBinMats.g = buildBinMask(chG, pG);
        _chBinMats.b = buildBinMask(chB, pB);

        // Tinted RGBA display versions
        maskRdisp = channelToRGBA(_chBinMats.r, true, false, false);
        maskGdisp = channelToRGBA(_chBinMats.g, false, true, false);
        maskBdisp = channelToRGBA(_chBinMats.b, false, false, true);
        cv.imshow('canvas-mask-r', maskRdisp);
        cv.imshow('canvas-mask-g', maskGdisp);
        cv.imshow('canvas-mask-b', maskBdisp);

        // ── Grayscale detection pipeline ──────────────────────────────────
        gray = new cv.Mat();
        blurred = new cv.Mat();
        binary = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(ksize, ksize), 0);

        let threshType = invert ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY;
        if (useOtsu) threshType |= cv.THRESH_OTSU;
        const computedThresh = cv.threshold(blurred, binary, useOtsu ? 0 : threshVal, 255, threshType);

        if (useOtsu) {
            document.getElementById('thresh').value = Math.round(computedThresh);
            document.getElementById('thresh-val').textContent = Math.round(computedThresh);
        }

        kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
        if (openIter > 0) cv.morphologyEx(binary, binary, cv.MORPH_OPEN, kernel, new cv.Point(-1, -1), openIter);
        if (closeIter > 0) cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), closeIter);

        contours = new cv.MatVector();
        hierarchy = new cv.Mat();
        cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        // Filter by area and circularity
        const validCells = [];
        for (let i = 0; i < contours.size(); i++) {
            const c = contours.get(i);
            const area = cv.contourArea(c);
            if (area < minArea || area > maxArea) continue;
            const perim = cv.arcLength(c, true);
            const circ = perim > 0 ? (4 * Math.PI * area) / (perim * perim) : 0;
            if (circ < minCirc) continue;
            const m = cv.moments(c);
            if (m.m00 === 0) continue;
            validCells.push({
                index: i,
                cx: Math.round(m.m10 / m.m00),
                cy: Math.round(m.m01 / m.m00),
                radius: Math.max(4, Math.round(Math.sqrt(area / Math.PI)))
            });
        }

        _lastAutoDetectedCells = validCells;

        // Spatial coordinate proximity check for deleted auto cells
        const activeAutoCells = [];
        const deletedAutoCells = [];

        validCells.forEach(cell => {
            if (findNearbyDeletedIndex(cell.cx, cell.cy, mainEdits.deleted, cell.radius) !== -1) {
                deletedAutoCells.push(cell);
            } else {
                activeAutoCells.push(cell);
            }
        });

        // Build result canvas
        if (currentView === 'thresh') {
            displayMat = new cv.Mat();
            cv.cvtColor(binary, displayMat, cv.COLOR_GRAY2RGBA);
            activeAutoCells.forEach(cell =>
                cv.drawContours(displayMat, contours, cell.index, new cv.Scalar(255, 60, 60, 255), 2));
            mainEdits.added.forEach(cell => {
                cv.circle(displayMat, new cv.Point(cell.x, cell.y), cell.radius || 8, new cv.Scalar(255, 165, 0, 255), 2);
            });
        } else {
            displayMat = src.clone();

            if (!distinguishManual) {
                // Standard mode: no distinction (all active cells look identical)
                const allActive = [
                    ...activeAutoCells.map(c => ({ cx: c.cx, cy: c.cy, radius: c.radius })),
                    ...mainEdits.added.map(c => ({ cx: c.x, cy: c.y, radius: c.radius || 8 }))
                ];

                allActive.forEach(cell => {
                    cv.circle(displayMat, new cv.Point(cell.cx, cell.cy), cell.radius, new cv.Scalar(0, 220, 80, 255), 2);
                    cv.circle(displayMat, new cv.Point(cell.cx, cell.cy), 3, new cv.Scalar(255, 50, 50, 255), -1);
                });

                if (showLabels) {
                    allActive.forEach((cell, n) =>
                        cv.putText(displayMat, String(n + 1),
                            new cv.Point(cell.cx + cell.radius + 3, cell.cy - cell.radius - 3),
                            cv.FONT_HERSHEY_SIMPLEX, 0.45, new cv.Scalar(255, 255, 0, 255), 1));
                }
            } else {
                // Distinguish mode: highlight manual additions in orange and deleted cells in red
                activeAutoCells.forEach((cell, n) => {
                    cv.circle(displayMat, new cv.Point(cell.cx, cell.cy), cell.radius, new cv.Scalar(0, 220, 80, 255), 2);
                    cv.circle(displayMat, new cv.Point(cell.cx, cell.cy), 3, new cv.Scalar(255, 50, 50, 255), -1);
                    if (showLabels) {
                        cv.putText(displayMat, String(n + 1),
                            new cv.Point(cell.cx + cell.radius + 3, cell.cy - cell.radius - 3),
                            cv.FONT_HERSHEY_SIMPLEX, 0.45, new cv.Scalar(255, 255, 0, 255), 1);
                    }
                });

                // Manual additions in Orange
                mainEdits.added.forEach((cell, idx) => {
                    const r = cell.radius || 8;
                    cv.circle(displayMat, new cv.Point(cell.x, cell.y), r, new cv.Scalar(255, 165, 0, 255), 2);
                    cv.circle(displayMat, new cv.Point(cell.x, cell.y), 3, new cv.Scalar(255, 165, 0, 255), -1);
                    if (showLabels) {
                        cv.putText(displayMat, `+${idx + 1}`,
                            new cv.Point(cell.x + r + 3, cell.y - r - 3),
                            cv.FONT_HERSHEY_SIMPLEX, 0.45, new cv.Scalar(255, 165, 0, 255), 1);
                    }
                });

                // Deleted auto cells in Red cross mark
                deletedAutoCells.forEach(cell => {
                    const r = cell.radius;
                    cv.circle(displayMat, new cv.Point(cell.cx, cell.cy), r, new cv.Scalar(239, 68, 68, 180), 1);
                    cv.line(displayMat, new cv.Point(cell.cx - r, cell.cy - r), new cv.Point(cell.cx + r, cell.cy + r), new cv.Scalar(239, 68, 68, 255), 2);
                    cv.line(displayMat, new cv.Point(cell.cx - r, cell.cy + r), new cv.Point(cell.cx + r, cell.cy - r), new cv.Scalar(239, 68, 68, 255), 2);
                });
            }
        }

        cv.imshow('canvas-result', displayMat);

        // Re-adjust overlay height after repaint
        if (overlayMode) {
            document.getElementById('overlay-container').style.height =
                document.getElementById('canvas-row1').offsetHeight + 'px';
        }

        const totalCount = activeAutoCells.length + mainEdits.added.length;
        const countDisplay = distinguishManual
            ? `${totalCount} (Auto: ${activeAutoCells.length}, +${mainEdits.added.length} manual, -${deletedAutoCells.length} deleted)`
            : `${totalCount}`;

        document.getElementById('result-count').textContent = countDisplay;
        document.getElementById('result-note').textContent =
            `${contours.size()} total contours; ${contours.size() - validCells.length} filtered out`;

        // ── Update conditional count results ──────────────────────────────
        _updateCondResults();

    } catch (err) {
        console.error('Processing error:', err);
        document.getElementById('result-note').textContent = 'Error: ' + err.message;
    } finally {
        [src, gray, blurred, binary, kernel, contours, hierarchy, displayMat,
            chR, chG, chB, chA, chVec, chRdisp, chGdisp, chBdisp,
            maskRdisp, maskGdisp, maskBdisp]
            .forEach(m => { if (m) m.delete(); });
        // Note: _chBinMats.r/g/b are intentionally NOT deleted here —
        // they persist across calls for use by _updateCondResults().
    }
}

// ── Manual Edit Event Handling ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    // Mode switcher buttons
    document.querySelectorAll(".edit-mode-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".edit-mode-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            editMode = btn.dataset.editMode;

            const resCanvas = document.getElementById("canvas-result");
            if (resCanvas) {
                if (editMode === "add") resCanvas.style.cursor = "crosshair";
                else if (editMode === "delete") resCanvas.style.cursor = "pointer";
                else resCanvas.style.cursor = "default";
            }
        });
    });

    // Distinguish checkbox
    const chkDist = document.getElementById("distinguish-manual");
    if (chkDist) {
        chkDist.addEventListener("change", e => {
            distinguishManual = e.target.checked;
            if (imageLoaded) processImage();
        });
    }

    // Reset button
    const btnReset = document.getElementById("reset-manual-btn");
    if (btnReset) {
        btnReset.addEventListener("click", () => {
            if (mainEdits.added.length === 0 && mainEdits.deleted.length === 0) return;
            mainEdits = { added: [], deleted: [] };
            if (imageLoaded) processImage();
        });
    }

    // Canvas click listener for Main Manual Add / Delete
    const resultCanvas = document.getElementById("canvas-result");
    if (resultCanvas) {
        resultCanvas.addEventListener("click", e => {
            if (editMode === "view" || !imageLoaded) return;

            const rect = resultCanvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const scaleX = resultCanvas.width / rect.width;
            const scaleY = resultCanvas.height / rect.height;
            const imgX = Math.round((e.clientX - rect.left) * scaleX);
            const imgY = Math.round((e.clientY - rect.top) * scaleY);

            if (editMode === "add") {
                mainEdits.added.push({
                    x: imgX,
                    y: imgY,
                    radius: 8,
                    id: ++_manualSeq
                });
                processImage();
            } else if (editMode === "delete") {
                // Check mainEdits.added
                let foundManualIdx = -1;
                for (let i = mainEdits.added.length - 1; i >= 0; i--) {
                    const c = mainEdits.added[i];
                    const dx = c.x - imgX, dy = c.y - imgY;
                    if (Math.sqrt(dx * dx + dy * dy) <= (c.radius || 8) + 6) {
                        foundManualIdx = i;
                        break;
                    }
                }

                if (foundManualIdx !== -1) {
                    mainEdits.added.splice(foundManualIdx, 1);
                    processImage();
                    return;
                }

                // Check _lastAutoDetectedCells
                let foundAutoCell = null;
                for (let i = 0; i < _lastAutoDetectedCells.length; i++) {
                    const c = _lastAutoDetectedCells[i];
                    const dx = c.cx - imgX, dy = c.cy - imgY;
                    if (Math.sqrt(dx * dx + dy * dy) <= c.radius + 6) {
                        foundAutoCell = c;
                        break;
                    }
                }

                if (foundAutoCell) {
                    const delIdx = findNearbyDeletedIndex(foundAutoCell.cx, foundAutoCell.cy, mainEdits.deleted, foundAutoCell.radius);
                    if (delIdx !== -1) {
                        mainEdits.deleted.splice(delIdx, 1); // un-delete
                    } else {
                        mainEdits.deleted.push({ x: foundAutoCell.cx, y: foundAutoCell.cy });
                    }
                    processImage();
                }
            }
        });
    }

    // Register state lifecycle with ToolsHandbookConfig for 100% reproducible JSON persistence
    const configManager = window.ToolsHandbookConfig || window.KemuConfig;
    if (configManager) {
        configManager.registerTool("cell_counter", {
            getState: function () {
                return {
                    distinguishManual: distinguishManual,
                    mainEdits: mainEdits,
                    condEdits: condEdits
                };
            },
            onLoad: function (saved) {
                if (saved) {
                    if (typeof saved.distinguishManual === "boolean") {
                        distinguishManual = saved.distinguishManual;
                        const chkDist = document.getElementById("distinguish-manual");
                        if (chkDist) chkDist.checked = distinguishManual;
                    }
                    if (saved.mainEdits) mainEdits = saved.mainEdits;
                    if (saved.condEdits) condEdits = saved.condEdits;
                    if (imageLoaded) processImage();
                }
            }
        });
    }
});

