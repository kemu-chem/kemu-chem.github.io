(() => {
    "use strict";

    const COLORS = [
        "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed",
        "#db2777", "#0891b2", "#65a30d", "#c026d3", "#ea580c"
    ];

    // Color stops for "color by position" — lets overlapping segments of a looping
    // curve (e.g. a CV sweep revisiting the same potential) be told apart. Point 0 is
    // red, the midpoint is green, the last point is blue; no stop is near-white, so the
    // line stays visible against the plot's light background (unlike a black->white ramp).
    const INDEX_GRADIENT_STOPS = [
        [255, 0, 0],   // red
        [0, 200, 0],   // green
        [0, 0, 255]    // blue
    ];
    const INDEX_GRADIENT_BUCKETS = 128; // capped stroke() calls so drag redraws stay smooth on dense curves

    function indexGradientColor(t) {
        const segCount = INDEX_GRADIENT_STOPS.length - 1;
        const scaled = Math.min(segCount - 1e-9, Math.max(0, t * segCount));
        const segIdx = Math.floor(scaled);
        const localT = scaled - segIdx;
        const [r0, g0, b0] = INDEX_GRADIENT_STOPS[segIdx];
        const [r1, g1, b1] = INDEX_GRADIENT_STOPS[segIdx + 1];
        const r = Math.round(r0 + (r1 - r0) * localT);
        const g = Math.round(g0 + (g1 - g0) * localT);
        const b = Math.round(b0 + (b1 - b0) * localT);
        return `rgb(${r},${g},${b})`;
    }

    // ======== Tangent mode framework ========
    // Each mode exposes: handleCount, createDefault(obj) -> extra fields merged into the
    // new tangent, getLineParams(tangent, obj), onDrag(point, {dataXY, canvasXY, obj, L}).
    // Adding a mode only requires a new entry here — canvas rendering, drag dispatch, and
    // CSV export all go through this interface rather than branching on mode themselves.

    // n must stay >= 1 — an n=0 window degenerates to a single point (no slope info),
    // and a negative n would flip lo/hi in the window math below. Enforced here so every
    // reader (line-param math, window markers) sees a valid value regardless of how
    // tangent.windowSize was set.
    function clampWindowSize(n) {
        return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    }

    const TANGENT_MODES = {
        "point-window": {
            label: "Point ± n",
            handleCount: 1,
            // Slope is estimated from the ±n neighbors in ORIGINAL data order (not X-sorted):
            // for a non-monotonic sweep (e.g. CV revisiting a potential) the sorted order would
            // average across unrelated branches. The line is anchored at the clicked sample
            // itself (not the window endpoints), so a noisy sample doesn't shift the tangent off
            // the point the user actually selected.
            createDefault(obj) {
                const idx = Math.floor(obj.xyData.length / 2);
                return {
                    points: [{ x: obj.xyData[idx][0], y: obj.xyData[idx][1], index: idx }],
                    windowSize: 5,
                    derivN: computeDefaultDerivN(obj.xyData.length)
                };
            },
            getLineParams(tangent, obj) {
                const xy = obj ? obj.xyData : [];
                const idx = Math.min(tangent.points[0].index, xy.length - 1);
                if (xy.length === 0) return { vertical: false, slope: 0, intercept: 0 };
                const n = clampWindowSize(tangent.windowSize);
                const lo = Math.max(0, idx - n);
                const hi = Math.min(xy.length - 1, idx + n);
                const [xLo, yLo] = xy[lo];
                const [xHi, yHi] = xy[hi];
                const [xC, yC] = xy[idx];
                if (Math.abs(xHi - xLo) < 1e-12) return { vertical: true, x: xC };
                const slope = (yHi - yLo) / (xHi - xLo);
                const intercept = yC - slope * xC;
                return { vertical: false, slope, intercept };
            },
            onDrag(point, { canvasXY, obj, L }) {
                if (!obj || obj.xyData.length === 0) return;
                let bestIdx = 0, bestDist = Infinity;
                for (let i = 0; i < obj.xyData.length; i++) {
                    const p = dataToCanvas(L, obj.xyData[i][0], obj.xyData[i][1]);
                    const dx = p.cx - canvasXY.x, dy = p.cy - canvasXY.y;
                    const d = dx * dx + dy * dy;
                    if (d < bestDist) { bestDist = d; bestIdx = i; }
                }
                point.index = bestIdx;
                point.x = obj.xyData[bestIdx][0];
                point.y = obj.xyData[bestIdx][1];
            }
        },
        "two-handle": {
            label: "2-Handle",
            handleCount: 2,
            createDefault(obj) {
                const { xMin, xMax } = dataRange(obj.xyData);
                const x1 = xMin + (xMax - xMin) * 0.3;
                const x2 = xMin + (xMax - xMin) * 0.7;
                return {
                    points: [
                        { x: x1, y: yAtX(obj.sortedXY, x1), snap: true },
                        { x: x2, y: yAtX(obj.sortedXY, x2), snap: true }
                    ]
                };
            },
            getLineParams(tangent) {
                const [p1, p2] = tangent.points;
                if (Math.abs(p2.x - p1.x) < 1e-12) {
                    return { vertical: true, x: p1.x };
                }
                const slope = (p2.y - p1.y) / (p2.x - p1.x);
                const intercept = p1.y - slope * p1.x;
                return { vertical: false, slope, intercept };
            },
            onDrag(point, { dataXY, obj }) {
                point.x = dataXY.x;
                if (point.snap && obj) {
                    const { xMin, xMax } = dataRange(obj.xyData);
                    point.x = Math.min(xMax, Math.max(xMin, dataXY.x));
                    point.y = yAtX(obj.sortedXY, point.x);
                } else {
                    point.y = dataXY.y;
                }
            }
        }
    };

    // ======== State ========
    const state = {
        plotObjects: [],   // [{ id, label, color, xyData:[[x,y],...], sortedXY, sourceFileName }]
        activeIndex: -1,
        tangents: [],       // [{ id, seq, plotObjectId, mode, color, points:[{x,y,snap}] }]
        delimiter: "auto",
        customDelimiter: "",
        nextTangentSeq: 1,
        nextObjId: 1,
        drag: null,         // { tangentId, pointIndex }
        curveDisplayMode: "line",  // "line" | "fill"
        colorByIndex: false,
        selectedTangentId: null,
        view: null,         // { xMin, xMax, yMin, yMax } | null (null = auto-fit to data)
        pan: null           // { startCx, startCy, startXMin, startXMax, startYMin, startYMax }
    };

    function activeObject() {
        return state.activeIndex >= 0 ? state.plotObjects[state.activeIndex] : null;
    }

    // ======== Curve helpers ========
    function yAtX(sortedXY, x) {
        if (!sortedXY || sortedXY.length === 0) return 0;
        if (sortedXY.length === 1) return sortedXY[0][1];
        if (x <= sortedXY[0][0]) return sortedXY[0][1];
        if (x >= sortedXY[sortedXY.length - 1][0]) return sortedXY[sortedXY.length - 1][1];
        let lo = 0, hi = sortedXY.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (sortedXY[mid][0] <= x) lo = mid; else hi = mid;
        }
        const [x0, y0] = sortedXY[lo];
        const [x1, y1] = sortedXY[hi];
        if (x1 === x0) return y0;
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }

    function dataRange(xyData) {
        let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
        for (const [x, y] of xyData) {
            if (x < xMin) xMin = x;
            if (x > xMax) xMax = x;
            if (y < yMin) yMin = y;
            if (y > yMax) yMax = y;
        }
        if (!isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1; }
        if (xMin === xMax) { xMin -= 1; xMax += 1; }
        if (yMin === yMax) { yMin -= 1; yMax += 1; }
        return { xMin, xMax, yMin, yMax };
    }

    // ======== Parsing (BOM-aware decode + delimiter-based numeric extraction) ========
    async function decodeFile(file) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let encoding = "utf-8";
        let offset = 0;
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
            encoding = "utf-16le"; offset = 2;
        } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
            encoding = "utf-16be"; offset = 2;
        } else if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
            offset = 3;
        }
        return new TextDecoder(encoding).decode(bytes.subarray(offset));
    }

    function splitLine(line, delimiter) {
        if (delimiter === "whitespace") return line.trim().split(/\s+/);
        return line.split(delimiter);
    }

    function countValidRows(text, delimiter) {
        const lines = text.split(/\r\n|\r|\n/);
        let n = 0;
        for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;
            const fields = splitLine(line, delimiter);
            if (fields.length < 2) continue;
            const x = Number(fields[0].trim());
            const y = Number(fields[1].trim());
            if (Number.isFinite(x) && Number.isFinite(y)) n++;
        }
        return n;
    }

    function resolveDelimiter(text) {
        if (state.delimiter === "auto") {
            const candidates = ["\t", ",", ";", "whitespace"];
            let best = { delim: "\t", score: -1 };
            for (const d of candidates) {
                const score = countValidRows(text, d);
                if (score > best.score) best = { delim: d, score };
            }
            return best.delim;
        }
        if (state.delimiter === "custom") return state.customDelimiter || ",";
        return state.delimiter;
    }

    function parseXYText(text) {
        const delimiter = resolveDelimiter(text);
        const lines = text.split(/\r\n|\r|\n/);
        const points = [];
        for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;
            const fields = splitLine(line, delimiter);
            if (fields.length < 2) continue;
            const x = Number(fields[0].trim());
            const y = Number(fields[1].trim());
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            points.push([x, y]);
        }
        return points;
    }

    // ======== Plot object management ========
    function loadPlotObject(xyData, label) {
        const obj = {
            id: "obj" + (state.nextObjId++),
            label,
            color: "#334155",
            xyData,
            sortedXY: [...xyData].sort((a, b) => a[0] - b[0]),
            sourceFileName: label
        };
        // MVP: UI drives a single active object; the array shape supports more later.
        state.plotObjects = [obj];
        state.activeIndex = 0;
        state.tangents = state.tangents.filter(t => t.plotObjectId === obj.id);
        if (!state.tangents.some(t => t.id === state.selectedTangentId)) state.selectedTangentId = null;
        state.view = null; // new data range renders the old zoom/pan meaningless
        renderAll();
    }

    function ensureManualObject() {
        if (activeObject()) return activeObject();
        const obj = {
            id: "obj" + (state.nextObjId++),
            label: "Manual Data",
            color: "#334155",
            xyData: [],
            sortedXY: [],
            sourceFileName: "Manual Data"
        };
        state.plotObjects = [obj];
        state.activeIndex = 0;
        return obj;
    }

    function markDataDirty() {
        const obj = activeObject();
        if (!obj) return;
        obj.sortedXY = [...obj.xyData].sort((a, b) => a[0] - b[0]);
    }

    // ======== Tangent management ========
    function addTangent(mode) {
        const obj = activeObject();
        if (!obj || obj.xyData.length === 0) return;
        const extra = TANGENT_MODES[mode].createDefault(obj);
        const seq = state.nextTangentSeq++;
        const id = "t" + seq;
        state.tangents.push({
            id,
            seq,
            label: "T" + seq,
            plotObjectId: obj.id,
            mode,
            color: COLORS[(seq - 1) % COLORS.length],
            ...extra
        });
        state.selectedTangentId = id;
        renderAll();
    }

    function removeTangent(id) {
        state.tangents = state.tangents.filter(t => t.id !== id);
        if (state.selectedTangentId === id) state.selectedTangentId = null;
        renderAll();
    }

    function getLineParams(tangent) {
        const obj = state.plotObjects.find(o => o.id === tangent.plotObjectId);
        return TANGENT_MODES[tangent.mode].getLineParams(tangent, obj);
    }

    // ======== Intersections (all pairs, regardless of owning plot object) ========
    function computeIntersections() {
        const results = [];
        const tangents = state.tangents;
        for (let i = 0; i < tangents.length; i++) {
            for (let j = i + 1; j < tangents.length; j++) {
                const a = tangents[i], b = tangents[j];
                const la = getLineParams(a), lb = getLineParams(b);
                let point = null;
                if (la.vertical && lb.vertical) {
                    point = null; // parallel (or coincident) — no unique intersection
                } else if (la.vertical) {
                    const x = la.x;
                    point = { x, y: lb.slope * x + lb.intercept };
                } else if (lb.vertical) {
                    const x = lb.x;
                    point = { x, y: la.slope * x + la.intercept };
                } else if (Math.abs(la.slope - lb.slope) < 1e-12) {
                    point = null; // parallel
                } else {
                    const x = (lb.intercept - la.intercept) / (la.slope - lb.slope);
                    const y = la.slope * x + la.intercept;
                    point = { x, y };
                }
                results.push({ a, b, point });
            }
        }
        return results;
    }

    // ======== Canvas: coordinate transforms ========
    const canvas = document.getElementById("plot-canvas");
    const ctx = canvas.getContext("2d");

    // Derivative mini-graph: N must stay >= 1 for the same reason windowSize must (see
    // clampWindowSize), and is additionally capped so the window never exceeds what the
    // dataset actually has on either side of the selected point.
    const DERIV_PX_PER_POINT = 4;

    function clampDerivN(n, datasetLength) {
        const maxN = Math.max(1, Math.floor((datasetLength - 1) / 2));
        const v = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
        return Math.min(v, maxN);
    }

    // Default N: fit as many points as the derivative panel (same width as the main plot,
    // it sits directly below) can show at ~DERIV_PX_PER_POINT each, computed once at
    // tangent-creation time — not re-derived on resize, so an existing tangent's analysis
    // window never shifts under the user without them touching the N input themselves.
    function computeDefaultDerivN(datasetLength) {
        const widthPx = canvas.getBoundingClientRect().width || 300;
        const raw = Math.floor(widthPx / (2 * DERIV_PX_PER_POINT));
        return clampDerivN(raw, datasetLength);
    }

    // Setting canvas.width/height clears the drawing buffer as a side effect, so this
    // must only run right before an actual redraw — never from hit-testing/drag code,
    // or a click that misses a handle silently wipes the canvas with nothing to repaint it.
    function resizeCanvasToDisplaySize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const w = Math.round(rect.width * dpr);
        const h = Math.round(420 * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
    }

    function autoFitRange() {
        const obj = activeObject();
        const range = obj && obj.xyData.length > 0 ? dataRange(obj.xyData) : { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
        const xPad = (range.xMax - range.xMin) * 0.04;
        const yPad = (range.yMax - range.yMin) * 0.08;
        return {
            xMin: range.xMin - xPad, xMax: range.xMax + xPad,
            yMin: range.yMin - yPad, yMax: range.yMax + yPad
        };
    }

    // state.view overrides the auto-fit range once the user zooms/pans; it's cleared
    // (back to auto-fit) when a new file loads or "Fit to data" is clicked.
    function layout() {
        const dpr = window.devicePixelRatio || 1;
        const pad = 44 * dpr;
        const padR = 16 * dpr;
        const W = canvas.width, H = canvas.height;
        const { xMin, xMax, yMin, yMax } = state.view || autoFitRange();
        return {
            dpr, W, H, pad, padR,
            plotW: W - pad - padR,
            plotH: H - 2 * pad,
            xMin, xMax, yMin, yMax
        };
    }

    function dataToCanvas(L, x, y) {
        return {
            cx: L.pad + (x - L.xMin) / (L.xMax - L.xMin) * L.plotW,
            cy: L.pad + (1 - (y - L.yMin) / (L.yMax - L.yMin)) * L.plotH
        };
    }

    function canvasToData(L, cx, cy) {
        return {
            x: L.xMin + (cx - L.pad) / L.plotW * (L.xMax - L.xMin),
            y: L.yMin + (1 - (cy - L.pad) / L.plotH) * (L.yMax - L.yMin)
        };
    }

    function canvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
    }

    // ======== Canvas: drawing ========
    function drawPlot() {
        resizeCanvasToDisplaySize();
        const L = layout();
        ctx.clearRect(0, 0, L.W, L.H);

        // Axes
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(L.pad, L.pad);
        ctx.lineTo(L.pad, L.pad + L.plotH);
        ctx.lineTo(L.pad + L.plotW, L.pad + L.plotH);
        ctx.stroke();

        // Tick labels
        ctx.fillStyle = "#94a3b8";
        ctx.font = `${11 * L.dpr}px sans-serif`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const nTicks = 5;
        for (let i = 0; i <= nTicks; i++) {
            const y = L.yMin + (L.yMax - L.yMin) * i / nTicks;
            const cy = dataToCanvas(L, 0, y).cy;
            ctx.fillText(formatTick(y), L.pad - 6 * L.dpr, cy);
            ctx.beginPath();
            ctx.moveTo(L.pad, cy);
            ctx.lineTo(L.pad + L.plotW, cy);
            ctx.strokeStyle = "#f1f5f9";
            ctx.stroke();
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        for (let i = 0; i <= nTicks; i++) {
            const x = L.xMin + (L.xMax - L.xMin) * i / nTicks;
            const cx = dataToCanvas(L, x, 0).cx;
            ctx.fillText(formatTick(x), cx, L.pad + L.plotH + 6 * L.dpr);
        }

        const obj = activeObject();
        if (!obj || obj.xyData.length === 0) {
            ctx.fillStyle = "#94a3b8";
            ctx.font = `${13 * L.dpr}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("Drop a file or add rows to begin", L.pad + L.plotW / 2, L.pad + L.plotH / 2);
            return;
        }

        // Curve — drawn in original data order, not X-sorted. Sorting by X breaks
        // non-monotonic curves (e.g. a CV sweep revisits the same potential twice per
        // cycle): connecting X-sorted points zigzags between branches and looks like a
        // solid fill. sortedXY is kept only for the tangent curve-snap interpolation.
        if (state.curveDisplayMode === "fill" && obj.xyData.length > 1) {
            const firstCx = dataToCanvas(L, obj.xyData[0][0], 0).cx;
            const lastCx = dataToCanvas(L, obj.xyData[obj.xyData.length - 1][0], 0).cx;
            const bottomCy = L.pad + L.plotH;
            ctx.beginPath();
            ctx.moveTo(firstCx, bottomCy);
            obj.xyData.forEach(p => {
                const { cx, cy } = dataToCanvas(L, p[0], p[1]);
                ctx.lineTo(cx, cy);
            });
            ctx.lineTo(lastCx, bottomCy);
            ctx.closePath();
            ctx.fillStyle = obj.color + "26";
            ctx.fill();
        }

        if (state.colorByIndex && obj.xyData.length > 1) {
            // Stroked in a handful of colored buckets (not one stroke() per point) so
            // dense curves (10k+ points) still redraw smoothly while tangent-dragging.
            const n = obj.xyData.length;
            const buckets = Math.min(INDEX_GRADIENT_BUCKETS, n - 1);
            const perBucket = Math.ceil((n - 1) / buckets);
            ctx.lineWidth = 1.5 * L.dpr;
            for (let b = 0; b < buckets; b++) {
                const startIdx = b * perBucket;
                if (startIdx >= n - 1) break;
                const endIdx = Math.min(n - 1, startIdx + perBucket);
                ctx.beginPath();
                ctx.strokeStyle = indexGradientColor(b / (buckets - 1 || 1));
                for (let i = startIdx; i <= endIdx; i++) {
                    const { cx, cy } = dataToCanvas(L, obj.xyData[i][0], obj.xyData[i][1]);
                    if (i === startIdx) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
                }
                ctx.stroke();
            }
        } else {
            ctx.beginPath();
            ctx.strokeStyle = obj.color;
            ctx.lineWidth = 1.5 * L.dpr;
            obj.xyData.forEach((p, i) => {
                const { cx, cy } = dataToCanvas(L, p[0], p[1]);
                if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
            });
            ctx.stroke();
        }

        // Tangent lines (extended across the visible plot area)
        state.tangents.forEach(t => {
            const params = getLineParams(t);
            ctx.beginPath();
            ctx.strokeStyle = t.color;
            ctx.lineWidth = 1.8 * L.dpr;
            if (params.vertical) {
                const { cx } = dataToCanvas(L, params.x, 0);
                ctx.moveTo(cx, L.pad);
                ctx.lineTo(cx, L.pad + L.plotH);
            } else {
                const y1 = params.slope * L.xMin + params.intercept;
                const y2 = params.slope * L.xMax + params.intercept;
                const p1 = dataToCanvas(L, L.xMin, y1);
                const p2 = dataToCanvas(L, L.xMax, y2);
                ctx.moveTo(p1.cx, p1.cy);
                ctx.lineTo(p2.cx, p2.cy);
            }
            ctx.stroke();

            // Point ± n mode: mark the averaging window's endpoints on the curve
            if (t.mode === "point-window") {
                const idx = t.points[0].index;
                const n = clampWindowSize(t.windowSize);
                const lo = Math.max(0, idx - n);
                const hi = Math.min(obj.xyData.length - 1, idx + n);
                [lo, hi].forEach(wi => {
                    const { cx, cy } = dataToCanvas(L, obj.xyData[wi][0], obj.xyData[wi][1]);
                    ctx.beginPath();
                    ctx.arc(cx, cy, 3.5 * L.dpr, 0, Math.PI * 2);
                    ctx.fillStyle = t.color + "80";
                    ctx.fill();
                });
            }

            // Handles
            t.points.forEach(p => {
                const { cx, cy } = dataToCanvas(L, p.x, p.y);
                ctx.beginPath();
                ctx.arc(cx, cy, 6 * L.dpr, 0, Math.PI * 2);
                ctx.fillStyle = "#fff";
                ctx.fill();
                ctx.lineWidth = 2 * L.dpr;
                ctx.strokeStyle = t.color;
                ctx.stroke();
                if (p.snap || t.mode === "point-window") {
                    ctx.beginPath();
                    ctx.arc(cx, cy, 2.2 * L.dpr, 0, Math.PI * 2);
                    ctx.fillStyle = t.color;
                    ctx.fill();
                }
            });
        });

        // Intersection markers
        computeIntersections().forEach(({ point }) => {
            if (!point) return;
            if (point.x < L.xMin || point.x > L.xMax || point.y < L.yMin || point.y > L.yMax) return;
            const { cx, cy } = dataToCanvas(L, point.x, point.y);
            ctx.beginPath();
            ctx.arc(cx, cy, 4 * L.dpr, 0, Math.PI * 2);
            ctx.fillStyle = "#111827";
            ctx.fill();
        });
    }

    function formatTick(v) {
        if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(2);
        return v.toFixed(2);
    }

    // Tangent labels are free user text inserted into an HTML attribute via innerHTML —
    // unlike the numeric fields elsewhere, this needs real escaping to stay safe/correct.
    function escapeHtml(str) {
        return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // ======== Canvas: pointer interaction ========
    function hitTestHandle(L, cx, cy) {
        const threshold = 12 * L.dpr;
        for (let i = state.tangents.length - 1; i >= 0; i--) {
            const t = state.tangents[i];
            for (let pi = 0; pi < t.points.length; pi++) {
                const p = dataToCanvas(L, t.points[pi].x, t.points[pi].y);
                const dx = cx - p.cx, dy = cy - p.cy;
                if (dx * dx + dy * dy < threshold * threshold) {
                    return { tangentId: t.id, pointIndex: pi };
                }
            }
        }
        return null;
    }

    canvas.addEventListener("pointerdown", e => {
        const L = layout();
        const { x, y } = canvasCoords(e);
        const hit = hitTestHandle(L, x, y);
        if (hit) {
            state.drag = hit;
            state.selectedTangentId = hit.tangentId;
            canvas.setPointerCapture(e.pointerId);
            renderAll();
        } else if (activeObject()) {
            // Empty-area drag pans the view; only meaningful once data is loaded.
            state.pan = {
                startCx: x, startCy: y,
                startXMin: L.xMin, startXMax: L.xMax, startYMin: L.yMin, startYMax: L.yMax
            };
            canvas.setPointerCapture(e.pointerId);
        }
    });

    canvas.addEventListener("pointermove", e => {
        const canvasXY = canvasCoords(e);
        if (state.drag) {
            const L = layout();
            const dataXY = canvasToData(L, canvasXY.x, canvasXY.y);
            const t = state.tangents.find(tg => tg.id === state.drag.tangentId);
            if (!t) return;
            const point = t.points[state.drag.pointIndex];
            const obj = state.plotObjects.find(o => o.id === t.plotObjectId);
            TANGENT_MODES[t.mode].onDrag(point, { dataXY, canvasXY, obj, L });
            renderAll();
        } else if (state.pan) {
            const p = state.pan;
            const rangeX = p.startXMax - p.startXMin;
            const rangeY = p.startYMax - p.startYMin;
            // plotW/plotH don't change with pan (only the data range does), so reading
            // them fresh here is safe even though layout() would otherwise reflect
            // whatever view is currently set mid-gesture.
            const L = layout();
            const dxData = (canvasXY.x - p.startCx) / L.plotW * rangeX;
            const dyData = (canvasXY.y - p.startCy) / L.plotH * rangeY;
            state.view = {
                xMin: p.startXMin - dxData, xMax: p.startXMax - dxData,
                yMin: p.startYMin + dyData, yMax: p.startYMax + dyData
            };
            drawPlot();
        }
    });

    function endDrag() { state.drag = null; state.pan = null; }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    // Wheel-zoom stretches the X axis only (horizontal), centered on the cursor's data
    // X position — Y stays as-is. This matches how the data is actually inspected here:
    // the dense axis that needs resolving is X (wavelength/potential/time), and leaving Y
    // untouched means zooming doesn't also rescale the curve's vertical shape underfoot.
    // { passive: false } is required for preventDefault() to stop the page from scrolling.
    const ZOOM_STEP = 0.85;
    const MIN_RANGE_FRACTION = 0.001; // vs. the full auto-fit X range, so zoom can't collapse to nothing
    canvas.addEventListener("wheel", e => {
        if (!activeObject()) return;
        e.preventDefault();
        const L = layout();
        const { x, y } = canvasCoords(e);
        const data = canvasToData(L, x, y);
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;

        const fit = autoFitRange();
        const minXRange = (fit.xMax - fit.xMin) * MIN_RANGE_FRACTION;
        const newXRange = (L.xMax - L.xMin) * factor;
        if (newXRange < minXRange) return; // already at max zoom-in

        const xRatio = (data.x - L.xMin) / (L.xMax - L.xMin);
        state.view = {
            xMin: data.x - xRatio * newXRange, xMax: data.x + (1 - xRatio) * newXRange,
            yMin: L.yMin, yMax: L.yMax
        };
        drawPlot();
    }, { passive: false });

    window.addEventListener("resize", () => drawPlot());

    // ======== Data table (virtual scroll) ========
    const ROW_H = 26;
    const scrollEl = document.getElementById("data-table-scroll");
    const spacerEl = document.getElementById("data-table-spacer");
    const viewportEl = document.getElementById("data-table-viewport");

    function renderTable() {
        const obj = activeObject();
        const rows = obj ? obj.xyData : [];
        spacerEl.style.height = (rows.length * ROW_H) + "px";

        // Row index -> tangent color, for "Point ± n" tangents only (their point is an
        // exact row index; 2-Handle points are continuous x,y and don't map to one row).
        const rowColor = new Map();
        if (obj) {
            state.tangents.forEach(t => {
                if (t.mode === "point-window" && t.plotObjectId === obj.id) {
                    rowColor.set(t.points[0].index, t.color);
                }
            });
        }

        const scrollTop = scrollEl.scrollTop;
        const visibleCount = Math.ceil(scrollEl.clientHeight / ROW_H) + 4;
        const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - 2);
        const endIdx = Math.min(rows.length, startIdx + visibleCount);

        viewportEl.style.transform = `translateY(${startIdx * ROW_H}px)`;
        viewportEl.innerHTML = "";
        for (let i = startIdx; i < endIdx; i++) {
            const row = document.createElement("div");
            row.className = "dt-row";
            const color = rowColor.get(i);
            if (color) {
                row.style.background = color + "22";
                row.style.borderLeft = `3px solid ${color}`;
            }
            row.innerHTML = `
                <div class="dt-col-idx">${i + 1}</div>
                <div class="dt-col-x"><input type="text" value="${rows[i][0]}" data-idx="${i}" data-field="0"></div>
                <div class="dt-col-y"><input type="text" value="${rows[i][1]}" data-idx="${i}" data-field="1"></div>
                <div class="dt-col-del"><button data-idx="${i}" title="Delete row">×</button></div>
            `;
            viewportEl.appendChild(row);
        }
        viewportEl.querySelectorAll("input").forEach(inp => {
            inp.addEventListener("change", () => {
                const idx = parseInt(inp.dataset.idx, 10);
                const field = parseInt(inp.dataset.field, 10);
                const v = Number(inp.value);
                if (!Number.isFinite(v) || !obj) return;
                obj.xyData[idx][field] = v;
                markDataDirty();
                renderAll();
            });
        });
        viewportEl.querySelectorAll(".dt-col-del button").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.idx, 10);
                if (!obj) return;
                obj.xyData.splice(idx, 1);
                markDataDirty();
                renderAll();
            });
        });
    }
    scrollEl.addEventListener("scroll", renderTable);

    document.getElementById("btn-add-row").addEventListener("click", () => {
        const obj = ensureManualObject();
        obj.xyData.push([0, 0]);
        markDataDirty();
        renderAll();
        scrollEl.scrollTop = obj.xyData.length * ROW_H;
    });

    // ======== Tangent list panel ========
    const tangentListEl = document.getElementById("tangent-list");

    function renderTangentList() {
        tangentListEl.innerHTML = "";
        if (state.tangents.length === 0) {
            const note = document.createElement("div");
            note.className = "empty-note";
            note.textContent = "No tangents yet.";
            tangentListEl.appendChild(note);
            return;
        }
        state.tangents.forEach(t => {
            const params = getLineParams(t);
            const eq = params.vertical
                ? `x = ${formatTick(params.x)}`
                : `y = ${formatTick(params.slope)}x + ${formatTick(params.intercept)}`;
            const modeLabel = TANGENT_MODES[t.mode].label;
            const controlsHtml = t.mode === "two-handle"
                ? `<div class="tangent-snaps">
                        ${t.points.map((p, i) => `
                            <label><input type="checkbox" class="tangent-snap-chk" data-id="${t.id}" data-pi="${i}" ${p.snap ? "checked" : ""}> Snap P${i + 1}</label>
                        `).join("")}
                    </div>`
                : `<div class="tangent-window">
                        <div class="tangent-point-info">Data index: ${t.points[0].index}</div>
                        <label>n = <input type="number" class="tangent-window-input" min="1" max="1000" step="1" value="${t.windowSize}" data-id="${t.id}"></label>
                    </div>`;
            const li = document.createElement("li");
            li.className = "tangent-item" + (t.id === state.selectedTangentId ? " selected" : "");
            li.dataset.id = t.id;
            li.innerHTML = `
                <div class="tangent-item-head">
                    <span class="tangent-swatch" style="background:${t.color}"></span>
                    <input type="text" class="tangent-label-input" value="${escapeHtml(t.label)}" data-id="${t.id}">
                    <span class="tangent-mode-badge">${modeLabel}</span>
                    <button class="btn-xs" data-id="${t.id}">×</button>
                </div>
                <div class="tangent-eq">${eq}</div>
                ${controlsHtml}
            `;
            tangentListEl.appendChild(li);
        });
        tangentListEl.querySelectorAll(".tangent-item").forEach(li => {
            li.addEventListener("click", () => {
                state.selectedTangentId = li.dataset.id;
                renderAll();
            });
        });
        tangentListEl.querySelectorAll(".tangent-label-input").forEach(inp => {
            inp.addEventListener("click", e => e.stopPropagation());
            inp.addEventListener("change", () => {
                const t = state.tangents.find(tg => tg.id === inp.dataset.id);
                if (!t) return;
                t.label = inp.value.trim() || ("T" + t.seq);
                renderAll();
            });
        });
        tangentListEl.querySelectorAll(".btn-xs").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                removeTangent(btn.dataset.id);
            });
        });
        tangentListEl.querySelectorAll(".tangent-snap-chk").forEach(chk => {
            chk.addEventListener("click", e => e.stopPropagation());
            chk.addEventListener("change", () => {
                const t = state.tangents.find(tg => tg.id === chk.dataset.id);
                if (!t) return;
                const pi = parseInt(chk.dataset.pi, 10);
                t.points[pi].snap = chk.checked;
                const obj = state.plotObjects.find(o => o.id === t.plotObjectId);
                if (chk.checked && obj) t.points[pi].y = yAtX(obj.sortedXY, t.points[pi].x);
                renderAll();
            });
        });
        tangentListEl.querySelectorAll(".tangent-window-input").forEach(inp => {
            inp.addEventListener("click", e => e.stopPropagation());
            inp.addEventListener("change", () => {
                const t = state.tangents.find(tg => tg.id === inp.dataset.id);
                if (!t) return;
                t.windowSize = clampWindowSize(parseInt(inp.value, 10));
                renderAll();
            });
        });
    }

    // ======== Intersection table panel ========
    const intersectionBody = document.getElementById("intersection-body");

    function renderIntersectionTable() {
        intersectionBody.innerHTML = "";
        const results = computeIntersections();
        if (results.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="4" class="empty-note">Add at least two tangents.</td>`;
            intersectionBody.appendChild(tr);
            return;
        }
        results.forEach(({ a, b, point }) => {
            const tr = document.createElement("tr");
            const labelA = escapeHtml(a.label), labelB = escapeHtml(b.label);
            if (point) {
                tr.innerHTML = `<td>${labelA}</td><td>${labelB}</td><td>${formatTick(point.x)}</td><td>${formatTick(point.y)}</td>`;
            } else {
                tr.innerHTML = `<td>${labelA}</td><td>${labelB}</td><td colspan="2"><span class="badge-parallel">parallel / no intersection</span></td>`;
            }
            intersectionBody.appendChild(tr);
        });
    }

    // ======== Status line ========
    function renderStatus() {
        const obj = activeObject();
        const statusEl = document.getElementById("curve-status");
        statusEl.textContent = obj ? `${obj.sourceFileName} — ${obj.xyData.length} points` : "No data loaded";
        document.getElementById("btn-add-tangent").disabled = !obj || obj.xyData.length === 0;
    }

    // ======== Derivative panel (selected "Point ± n" tangent only) ========
    const derivEmptyEl = document.getElementById("derivative-empty");
    const derivContentEl = document.getElementById("derivative-content");
    const derivCanvas = document.getElementById("derivative-canvas");
    const derivCtx = derivCanvas.getContext("2d");
    const derivNInput = document.getElementById("deriv-n-input");

    function selectedDerivTangent() {
        const t = state.tangents.find(tg => tg.id === state.selectedTangentId);
        if (!t || t.mode !== "point-window") return null;
        const obj = state.plotObjects.find(o => o.id === t.plotObjectId);
        if (!obj || obj.xyData.length < 2) return null;
        return { t, obj };
    }

    // Point-to-point derivative across [idx-N, idx+N], in original data order — same
    // rationale as the tangent's own slope: sorted-by-X order would mix unrelated
    // branches of a non-monotonic (e.g. CV) sweep.
    function getDerivSeries(t, obj) {
        const idx = Math.min(t.points[0].index, obj.xyData.length - 1);
        const N = clampDerivN(t.derivN, obj.xyData.length);
        const lo = Math.max(0, idx - N);
        const hi = Math.min(obj.xyData.length - 1, idx + N);
        const series = [];
        for (let j = lo; j < hi; j++) {
            const [x0, y0] = obj.xyData[j];
            const [x1, y1] = obj.xyData[j + 1];
            const dydx = (x1 - x0) === 0 ? null : (y1 - y0) / (x1 - x0);
            series.push({ j, midX: (x0 + x1) / 2, dydx });
        }
        return { series, N, idx, lo, hi };
    }

    function renderDerivativePanel() {
        const sel = selectedDerivTangent();
        if (!sel) {
            derivEmptyEl.hidden = false;
            derivContentEl.hidden = true;
            return;
        }
        const { t, obj } = sel;
        derivEmptyEl.hidden = true;
        derivContentEl.hidden = false;

        t.derivN = clampDerivN(t.derivN, obj.xyData.length);
        if (document.activeElement !== derivNInput) derivNInput.value = t.derivN;

        const dpr = window.devicePixelRatio || 1;
        const rect = derivCanvas.getBoundingClientRect();
        const w = Math.round(rect.width * dpr);
        const h = Math.round(100 * dpr);
        if (derivCanvas.width !== w || derivCanvas.height !== h) {
            derivCanvas.width = w;
            derivCanvas.height = h;
        }
        const W = derivCanvas.width, H = derivCanvas.height;
        derivCtx.clearRect(0, 0, W, H);

        const { series, idx, lo, hi } = getDerivSeries(t, obj);
        const validValues = series.map(s => s.dydx).filter(v => v !== null);
        if (validValues.length === 0) return;

        const padSide = 8 * dpr;
        const padTop = 8 * dpr;
        const padBottom = 16 * dpr; // room for the X-axis tick labels
        const plotW = W - 2 * padSide;
        const plotH = H - padTop - padBottom;
        let vMin = Math.min(...validValues), vMax = Math.max(...validValues);
        if (vMin === vMax) { vMin -= 1; vMax += 1; }
        const vPad = (vMax - vMin) * 0.1;
        vMin -= vPad; vMax += vPad;

        const xAt = i => padSide + (i / (series.length - 1 || 1)) * plotW;
        const yAt = v => padTop + (1 - (v - vMin) / (vMax - vMin)) * plotH;

        // Reference line: the slope actually adopted for the tangent (from the window's
        // endpoints), so the user can see how much the local derivative wobbles around it.
        const params = getLineParams(t);
        if (!params.vertical) {
            const ry = yAt(params.slope);
            derivCtx.beginPath();
            derivCtx.setLineDash([4 * dpr, 3 * dpr]);
            derivCtx.strokeStyle = "#94a3b8";
            derivCtx.lineWidth = 1 * dpr;
            derivCtx.moveTo(padSide, ry);
            derivCtx.lineTo(padSide + plotW, ry);
            derivCtx.stroke();
            derivCtx.setLineDash([]);
        }

        // Guide line + label at the selected point's own X (the window's anchor)
        const centerRatio = hi > lo ? (idx - lo) / (hi - lo) : 0.5;
        const centerCx = padSide + Math.min(1, Math.max(0, centerRatio)) * plotW;
        derivCtx.beginPath();
        derivCtx.setLineDash([3 * dpr, 3 * dpr]);
        derivCtx.strokeStyle = t.color + "80";
        derivCtx.lineWidth = 1 * dpr;
        derivCtx.moveTo(centerCx, padTop);
        derivCtx.lineTo(centerCx, padTop + plotH);
        derivCtx.stroke();
        derivCtx.setLineDash([]);
        derivCtx.fillStyle = t.color;
        derivCtx.font = `${10 * dpr}px sans-serif`;
        derivCtx.textBaseline = "top";
        derivCtx.textAlign = centerRatio > 0.7 ? "right" : "left";
        derivCtx.fillText(`x=${formatTick(obj.xyData[idx][0])}`, centerCx + (centerRatio > 0.7 ? -4 * dpr : 4 * dpr), padTop);

        // X-axis ticks at the window's start/end
        derivCtx.fillStyle = "#94a3b8";
        derivCtx.font = `${9 * dpr}px sans-serif`;
        derivCtx.textBaseline = "bottom";
        derivCtx.textAlign = "left";
        derivCtx.fillText(formatTick(obj.xyData[lo][0]), padSide, H - 2 * dpr);
        derivCtx.textAlign = "right";
        derivCtx.fillText(formatTick(obj.xyData[hi][0]), padSide + plotW, H - 2 * dpr);

        derivCtx.beginPath();
        derivCtx.strokeStyle = t.color;
        derivCtx.lineWidth = 1.5 * dpr;
        let started = false;
        series.forEach((s, i) => {
            if (s.dydx === null) { started = false; return; }
            const cx = xAt(i), cy = yAt(s.dydx);
            if (!started) { derivCtx.moveTo(cx, cy); started = true; }
            else derivCtx.lineTo(cx, cy);
        });
        derivCtx.stroke();
    }

    // ======== Master render ========
    function renderAll() {
        drawPlot();
        renderTable();
        renderTangentList();
        renderIntersectionTable();
        renderStatus();
        renderDerivativePanel();
    }

    // ======== File input / drag & drop ========
    const dropZone = document.getElementById("drop_zone");
    const fileInput = document.getElementById("file-input");

    async function handleFile(file) {
        const text = await decodeFile(file);
        const points = parseXYText(text);
        if (points.length === 0) {
            alert("No numeric X,Y rows could be parsed from this file. Check the delimiter setting.");
            return;
        }
        loadPlotObject(points, file.name);
        dropZone.classList.add("loaded");
        dropZone.innerHTML = `<span class="dz-filename">${file.name}</span><span class="dz-hint">Drop another file to replace</span>`;
    }

    dropZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
        fileInput.value = "";
    });
    ["dragenter", "dragover"].forEach(evt => {
        dropZone.addEventListener(evt, e => {
            e.preventDefault();
            dropZone.classList.add("dragging");
        });
    });
    ["dragleave", "drop"].forEach(evt => {
        dropZone.addEventListener(evt, e => {
            e.preventDefault();
            dropZone.classList.remove("dragging");
        });
    });
    dropZone.addEventListener("drop", e => {
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    // ======== Delimiter selector ========
    const delimSelect = document.getElementById("delimiter-select");
    const delimCustom = document.getElementById("delimiter-custom");
    delimSelect.addEventListener("change", () => {
        state.delimiter = delimSelect.value;
        delimCustom.hidden = delimSelect.value !== "custom";
    });
    delimCustom.addEventListener("input", () => {
        state.customDelimiter = delimCustom.value;
    });

    // ======== Curve display mode ========
    document.querySelectorAll(".mode-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            state.curveDisplayMode = btn.dataset.mode;
            document.querySelectorAll(".mode-btn").forEach(b => b.classList.toggle("active", b === btn));
            drawPlot();
        });
    });
    document.getElementById("chk-color-by-index").addEventListener("change", e => {
        state.colorByIndex = e.target.checked;
        drawPlot();
    });
    document.getElementById("btn-fit-view").addEventListener("click", () => {
        state.view = null;
        drawPlot();
    });

    // ======== Add tangent ========
    document.getElementById("btn-add-tangent").addEventListener("click", () => {
        addTangent(document.getElementById("add-tangent-mode").value);
    });

    // ======== CSV export ========
    function downloadCsv(filename, csv) {
        const blob = new Blob([csv], { type: "text/csv" });
        const link = document.createElement("a");
        link.download = filename;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    }

    // Tangent labels are free user text (unlike the numeric data elsewhere in these CSVs),
    // so they need real quoting — a comma or quote in a label would otherwise corrupt the row.
    function csvEscape(value) {
        return `"${String(value).replace(/"/g, '""')}"`;
    }

    document.getElementById("btn-save-data").addEventListener("click", () => {
        const obj = activeObject();
        if (!obj) return;
        let csv = "X,Y\n";
        obj.xyData.forEach(([x, y]) => { csv += `${x},${y}\n`; });
        downloadCsv("tangent_analyzer_data.csv", csv);
    });

    document.getElementById("btn-save-tangents").addEventListener("click", () => {
        if (state.tangents.length === 0) return;
        let csv = "Tangent,Mode,PointIndex,Point1X,Point1Y,Point1Snap,Point2X,Point2Y,Point2Snap,WindowSize,Slope,Intercept,Equation\n";
        state.tangents.forEach(t => {
            const params = getLineParams(t);
            const [p1, p2] = t.points; // p2 is undefined for single-handle modes
            const slope = params.vertical ? "Infinity" : params.slope;
            const intercept = params.vertical ? "" : params.intercept;
            const eq = params.vertical ? `x=${params.x}` : `y=${params.slope}x+${params.intercept}`;
            const p1Snap = p1.snap === undefined ? "" : p1.snap;
            const pointIndex = t.mode === "point-window" ? p1.index : "";
            csv += `${csvEscape(t.label)},${t.mode},${pointIndex},${p1.x},${p1.y},${p1Snap},${p2 ? p2.x : ""},${p2 ? p2.y : ""},${p2 ? p2.snap : ""},${t.windowSize ?? ""},${slope},${intercept},${eq}\n`;
        });
        downloadCsv("tangent_analyzer_tangents.csv", csv);
    });

    document.getElementById("btn-save-intersections").addEventListener("click", () => {
        const results = computeIntersections();
        if (results.length === 0) return;
        let csv = "TangentA,TangentB,X,Y,Parallel\n";
        results.forEach(({ a, b, point }) => {
            const labelA = csvEscape(a.label), labelB = csvEscape(b.label);
            csv += point
                ? `${labelA},${labelB},${point.x},${point.y},false\n`
                : `${labelA},${labelB},,,true\n`;
        });
        downloadCsv("tangent_analyzer_intersections.csv", csv);
    });

    // ======== Derivative panel: N input + CSV export ========
    derivNInput.addEventListener("change", () => {
        const sel = selectedDerivTangent();
        if (!sel) return;
        sel.t.derivN = clampDerivN(parseInt(derivNInput.value, 10), sel.obj.xyData.length);
        renderAll();
    });

    document.getElementById("btn-save-derivative").addEventListener("click", () => {
        const sel = selectedDerivTangent();
        if (!sel) return;
        const { t, obj } = sel;
        const { series } = getDerivSeries(t, obj);
        let csv = "Index,X,dYdX\n";
        series.forEach(s => {
            csv += `${s.j},${s.midX},${s.dydx === null ? "" : s.dydx}\n`;
        });
        downloadCsv(`tangent_analyzer_derivative_T${t.seq}.csv`, csv);
    });

    // ======== Init ========
    renderAll();

    // ======== ToolsHandbookConfig Integration ========
    const configManager = window.ToolsHandbookConfig || window.KemuConfig;
    if (configManager) {
        const getTangentState = () => ({
            delimiter: state.delimiter,
            customDelimiter: state.customDelimiter,
            curveDisplayMode: state.curveDisplayMode,
            colorByIndex: state.colorByIndex,
            addTangentMode: document.getElementById("add-tangent-mode").value
        });

        const loadTangentState = (saved) => {
            if (!saved) return;
            if (saved.delimiter !== undefined) {
                state.delimiter = saved.delimiter;
                delimSelect.value = saved.delimiter;
                delimCustom.hidden = saved.delimiter !== "custom";
            }
            if (saved.customDelimiter !== undefined) {
                state.customDelimiter = saved.customDelimiter;
                delimCustom.value = saved.customDelimiter;
            }
            if (saved.curveDisplayMode !== undefined) {
                state.curveDisplayMode = saved.curveDisplayMode;
                document.querySelectorAll(".mode-btn").forEach(b => {
                    b.classList.toggle("active", b.dataset.mode === saved.curveDisplayMode);
                });
            }
            if (saved.colorByIndex !== undefined) {
                state.colorByIndex = saved.colorByIndex;
                document.getElementById("chk-color-by-index").checked = saved.colorByIndex;
            }
            if (saved.addTangentMode !== undefined) {
                document.getElementById("add-tangent-mode").value = saved.addTangentMode;
            }
            drawPlot();
        };

        configManager.registerTool("tangent_analyzer", {
            getState: getTangentState,
            onLoad: loadTangentState
        });

        const notifyTangentState = () => {
            configManager.updateToolState("tangent_analyzer", getTangentState());
        };

        delimSelect.addEventListener("change", notifyTangentState);
        delimCustom.addEventListener("input", notifyTangentState);
        document.querySelectorAll(".mode-btn").forEach(btn => btn.addEventListener("click", notifyTangentState));
        document.getElementById("chk-color-by-index").addEventListener("change", notifyTangentState);
        document.getElementById("add-tangent-mode").addEventListener("change", notifyTangentState);
    }
})();

