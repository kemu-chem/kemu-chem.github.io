/**
 * TLC Plate Analysis Module
 * Browser-based Thin Layer Chromatography analysis
 * No external dependencies - Canvas API only
 */
(function () {
    "use strict";

    const MAX_IMAGE_EDGE = 1920;

    const TLC = {
        // State
        originalImageData: null,
        _rawImage: null,
        rotationDeg: 0,
        originY: null,
        frontY: null,
        spots: [],
        laneX: null,
        laneWidth: 20,
        interactionMode: "none",
        canvasWidth: 0,
        canvasHeight: 0,
        brightness: 0,
        contrast: 0,
        thresholdEnabled: false,
        thresholdValue: 128,
        undoStack: [],
        // Crop state
        cropRect: null,
        _cropStart: null,
        // Multi-plate state
        plates: [],
        activePlateIndex: -1,
        // Label settings
        labelFontSize: 13,
        labelColor: "#f97316",
        labelOrientation: "horizontal",
        labelDecimals: 3,

        // ---- Image Loading ----

        loadImage(source, canvas) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    let w = img.width;
                    let h = img.height;
                    const maxEdge = Math.max(w, h);
                    if (maxEdge > MAX_IMAGE_EDGE) {
                        const scale = MAX_IMAGE_EDGE / maxEdge;
                        w = Math.round(w * scale);
                        h = Math.round(h * scale);
                    }
                    canvas.width = w;
                    canvas.height = h;
                    this.canvasWidth = w;
                    this.canvasHeight = h;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, w, h);
                    this.originalImageData = ctx.getImageData(0, 0, w, h);
                    this._rawImage = img;
                    this.rotationDeg = 0;
                    this.resetState();
                    resolve({ width: w, height: h });
                };
                if (typeof source === "string") {
                    img.src = source;
                } else if (source instanceof Blob) {
                    img.src = URL.createObjectURL(source);
                } else if (source instanceof HTMLCanvasElement) {
                    img.src = source.toDataURL();
                }
            });
        },

        loadFromVideo(video, canvas) {
            const tmpCanvas = document.createElement("canvas");
            tmpCanvas.width = video.videoWidth;
            tmpCanvas.height = video.videoHeight;
            tmpCanvas.getContext("2d").drawImage(video, 0, 0);
            return this.loadImage(tmpCanvas, canvas);
        },

        resetState() {
            this.originY = null;
            this.frontY = null;
            this.spots = [];
            this.laneX = null;
            this.interactionMode = "none";
            this.brightness = 0;
            this.contrast = 0;
            this.thresholdEnabled = false;
            this.thresholdValue = 128;
            this.undoStack = [];
            this.plates = [];
            this.activePlateIndex = -1;
            this.cropRect = null;
            this._cropStart = null;
        },

        // ---- Undo / Delete ----

        pushUndo() {
            this.undoStack.push({
                originY: this.originY,
                frontY: this.frontY,
                spots: this.spots.map(s => ({ ...s })),
                laneX: this.laneX,
                plates: this.plates.map(p => ({
                    rect: { ...p.rect },
                    originY: p.originY,
                    frontY: p.frontY,
                    spots: p.spots.map(s => ({ ...s })),
                    laneX: p.laneX,
                    laneWidth: p.laneWidth
                })),
                activePlateIndex: this.activePlateIndex
            });
        },

        undo() {
            if (this.undoStack.length === 0) return false;
            const state = this.undoStack.pop();
            this.originY = state.originY;
            this.frontY = state.frontY;
            this.spots = state.spots;
            this.laneX = state.laneX;
            this.plates = state.plates;
            this.activePlateIndex = state.activePlateIndex;
            return true;
        },

        deleteSpot(index) {
            if (this.plates.length > 0) {
                const plate = this.getActivePlate();
                if (!plate || index < 0 || index >= plate.spots.length) return;
                this.pushUndo();
                plate.spots.splice(index, 1);
            } else {
                if (index < 0 || index >= this.spots.length) return;
                this.pushUndo();
                this.spots.splice(index, 1);
            }
        },

        // ---- Image Rotation ----

        rotateImage(canvas, degrees) {
            if (!this._rawImage) return;
            this.rotationDeg = ((this.rotationDeg + degrees) % 360 + 360) % 360;

            const img = this._rawImage;
            let srcW = img.width, srcH = img.height;
            const maxEdge = Math.max(srcW, srcH);
            if (maxEdge > MAX_IMAGE_EDGE) {
                const scale = MAX_IMAGE_EDGE / maxEdge;
                srcW = Math.round(srcW * scale);
                srcH = Math.round(srcH * scale);
            }

            const rad = this.rotationDeg * Math.PI / 180;
            const swap = (this.rotationDeg === 90 || this.rotationDeg === 270);
            const w = swap ? srcH : srcW;
            const h = swap ? srcW : srcH;

            const tmp = document.createElement("canvas");
            tmp.width = w;
            tmp.height = h;
            const tctx = tmp.getContext("2d");
            tctx.translate(w / 2, h / 2);
            tctx.rotate(rad);
            tctx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);

            canvas.width = w;
            canvas.height = h;
            this.canvasWidth = w;
            this.canvasHeight = h;
            this.originalImageData = tctx.getImageData(0, 0, w, h);

            this.originY = null;
            this.frontY = null;
            this.spots = [];
            this.laneX = null;
            this.undoStack = [];
            this.plates = [];
            this.activePlateIndex = -1;
            this.redraw(canvas);
        },

        // ---- Crop ----

        startCrop(x, y) {
            this._cropStart = { x, y };
            this.cropRect = null;
        },

        updateCrop(x, y) {
            if (!this._cropStart) return;
            const sx = this._cropStart.x, sy = this._cropStart.y;
            this.cropRect = {
                x: Math.min(sx, x),
                y: Math.min(sy, y),
                w: Math.abs(x - sx),
                h: Math.abs(y - sy)
            };
        },

        addPlate() {
            if (!this.cropRect) return false;
            const r = this.cropRect;
            if (r.w < 10 || r.h < 10) return false;
            this.pushUndo();
            this.plates.push({
                rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) },
                originY: null,
                frontY: null,
                spots: [],
                laneX: null,
                laneWidth: 20
            });
            this.activePlateIndex = this.plates.length - 1;
            this.originY = null;
            this.frontY = null;
            this.spots = [];
            this.laneX = null;
            this.cropRect = null;
            this._cropStart = null;
            return true;
        },

        selectPlate(index) {
            if (index >= 0 && index < this.plates.length) {
                this.activePlateIndex = index;
            }
        },

        deletePlate(index) {
            if (index < 0 || index >= this.plates.length) return;
            this.pushUndo();
            this.plates.splice(index, 1);
            if (this.plates.length === 0) {
                this.activePlateIndex = -1;
            } else if (this.activePlateIndex >= this.plates.length) {
                this.activePlateIndex = this.plates.length - 1;
            } else if (index < this.activePlateIndex) {
                this.activePlateIndex--;
            }
        },

        getActivePlate() {
            if (this.activePlateIndex >= 0 && this.activePlateIndex < this.plates.length) {
                return this.plates[this.activePlateIndex];
            }
            return null;
        },

        findPlateAt(x, y) {
            for (let i = this.plates.length - 1; i >= 0; i--) {
                const r = this.plates[i].rect;
                if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                    return i;
                }
            }
            return -1;
        },

        cancelCrop() {
            this.cropRect = null;
            this._cropStart = null;
        },

        // ---- CSV Export ----

        exportCSV() {
            const dec = this.labelDecimals;
            if (this.plates.length > 0) {
                let csv = "Plate,Spot,Rf,X,Y\n";
                this.plates.forEach((plate, pi) => {
                    plate.spots.forEach((s, si) => {
                        const rf = s.rf != null ? s.rf.toFixed(dec) : "";
                        csv += `${pi + 1},${si + 1},${rf},${s.x},${s.y}\n`;
                    });
                });
                return csv;
            }
            let csv = "Spot,Rf,X,Y\n";
            this.spots.forEach((s, i) => {
                const rf = s.rf != null ? s.rf.toFixed(dec) : "";
                csv += `${i + 1},${rf},${s.x},${s.y}\n`;
            });
            return csv;
        },

        // ---- Pixel Processing ----

        getGrayscaleData(imageData) {
            const data = imageData.data;
            const gray = new Uint8Array(data.length / 4);
            for (let i = 0; i < gray.length; i++) {
                const offset = i * 4;
                gray[i] = Math.round(
                    0.299 * data[offset] +
                    0.587 * data[offset + 1] +
                    0.114 * data[offset + 2]
                );
            }
            return gray;
        },

        applyAdjustments(canvas, brightness, contrast) {
            if (!this.originalImageData) return;
            const src = this.originalImageData.data;
            const ctx = canvas.getContext("2d");
            const out = ctx.createImageData(this.canvasWidth, this.canvasHeight);
            const dst = out.data;

            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

            for (let i = 0; i < src.length; i += 4) {
                dst[i] = this._clamp(factor * (src[i] - 128) + 128 + brightness);
                dst[i + 1] = this._clamp(factor * (src[i + 1] - 128) + 128 + brightness);
                dst[i + 2] = this._clamp(factor * (src[i + 2] - 128) + 128 + brightness);
                dst[i + 3] = src[i + 3];
            }
            ctx.putImageData(out, 0, 0);
        },

        applyThreshold(canvas, threshold) {
            if (!this.originalImageData) return;
            const gray = this.getGrayscaleData(this.originalImageData);
            const ctx = canvas.getContext("2d");
            const out = ctx.createImageData(this.canvasWidth, this.canvasHeight);
            const dst = out.data;

            for (let i = 0; i < gray.length; i++) {
                const v = gray[i] >= threshold ? 255 : 0;
                const offset = i * 4;
                dst[offset] = v;
                dst[offset + 1] = v;
                dst[offset + 2] = v;
                dst[offset + 3] = 255;
            }
            ctx.putImageData(out, 0, 0);
        },

        _clamp(val) {
            return Math.max(0, Math.min(255, Math.round(val)));
        },

        // ---- Rf Calculation ----

        calculateRf(originY, frontY, spotY) {
            if (originY === frontY) return null;
            const rf = (originY - spotY) / (originY - frontY);
            return Math.round(rf * 1000) / 1000;
        },

        // ---- Intensity Profile ----

        getIntensityProfile(canvas, laneX, laneWidth, startY, endY) {
            if (!this.originalImageData) return [];
            const imgData = this._getCurrentImageData(canvas);
            const gray = this.getGrayscaleData(imgData);
            const w = this.canvasWidth;
            const halfW = Math.floor(laneWidth / 2);
            const x0 = Math.max(0, laneX - halfW);
            const x1 = Math.min(w - 1, laneX + halfW);
            const span = x1 - x0 + 1;

            const yMin = Math.min(startY, endY);
            const yMax = Math.max(startY, endY);
            const range = yMax - yMin;
            const profile = [];

            for (let y = yMin; y <= yMax; y++) {
                let sum = 0;
                for (let x = x0; x <= x1; x++) {
                    sum += gray[y * w + x];
                }
                profile.push({
                    y: y,
                    distance: range > 0 ? (yMax - y) / range : 0,
                    intensity: sum / span
                });
            }
            return profile;
        },

        _getCurrentImageData(canvas) {
            if (this.thresholdEnabled) {
                const gray = this.getGrayscaleData(this.originalImageData);
                const out = new ImageData(this.canvasWidth, this.canvasHeight);
                for (let i = 0; i < gray.length; i++) {
                    const v = gray[i] >= this.thresholdValue ? 255 : 0;
                    const off = i * 4;
                    out.data[off] = v;
                    out.data[off + 1] = v;
                    out.data[off + 2] = v;
                    out.data[off + 3] = 255;
                }
                return out;
            }
            if (this.brightness !== 0 || this.contrast !== 0) {
                const src = this.originalImageData.data;
                const out = new ImageData(this.canvasWidth, this.canvasHeight);
                const dst = out.data;
                const factor = (259 * (this.contrast + 255)) / (255 * (259 - this.contrast));
                for (let i = 0; i < src.length; i += 4) {
                    dst[i] = this._clamp(factor * (src[i] - 128) + 128 + this.brightness);
                    dst[i + 1] = this._clamp(factor * (src[i + 1] - 128) + 128 + this.brightness);
                    dst[i + 2] = this._clamp(factor * (src[i + 2] - 128) + 128 + this.brightness);
                    dst[i + 3] = src[i + 3];
                }
                return out;
            }
            return this.originalImageData;
        },

        // ---- Chart Drawing ----

        drawIntensityChart(chartCanvas, profileData, spots) {
            const ctx = chartCanvas.getContext("2d");
            const W = chartCanvas.width;
            const H = chartCanvas.height;
            const pad = { top: 20, right: 20, bottom: 40, left: 50 };
            const plotW = W - pad.left - pad.right;
            const plotH = H - pad.top - pad.bottom;

            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, W, H);

            // Axes
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pad.left, pad.top);
            ctx.lineTo(pad.left, pad.top + plotH);
            ctx.lineTo(pad.left + plotW, pad.top + plotH);
            ctx.stroke();

            // Labels
            ctx.fillStyle = "#333";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Rf", pad.left + plotW / 2, H - 5);
            ctx.save();
            ctx.translate(12, pad.top + plotH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText("Intensity", 0, 0);
            ctx.restore();

            if (!profileData || profileData.length === 0) return;

            // Gridlines
            ctx.strokeStyle = "#e2e8f0";
            ctx.setLineDash([4, 4]);
            for (let rf = 0.25; rf < 1; rf += 0.25) {
                const x = pad.left + rf * plotW;
                ctx.beginPath();
                ctx.moveTo(x, pad.top);
                ctx.lineTo(x, pad.top + plotH);
                ctx.stroke();
                ctx.fillStyle = "#999";
                ctx.fillText(rf.toFixed(2), x, pad.top + plotH + 15);
            }
            // 0 and 1 labels
            ctx.fillText("0", pad.left, pad.top + plotH + 15);
            ctx.fillText("1", pad.left + plotW, pad.top + plotH + 15);
            ctx.setLineDash([]);

            // Y-axis labels
            ctx.textAlign = "right";
            for (let v = 0; v <= 255; v += 64) {
                const y = pad.top + plotH - (v / 255) * plotH;
                ctx.fillText(v.toString(), pad.left - 5, y + 4);
            }

            // Profile line
            ctx.strokeStyle = "#2563eb";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < profileData.length; i++) {
                const d = profileData[i];
                const x = pad.left + d.distance * plotW;
                const y = pad.top + plotH - (d.intensity / 255) * plotH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Spot markers
            if (spots && spots.length > 0) {
                ctx.strokeStyle = "#ef4444";
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1;
                spots.forEach((s) => {
                    if (s.rf == null) return;
                    const x = pad.left + s.rf * plotW;
                    ctx.beginPath();
                    ctx.moveTo(x, pad.top);
                    ctx.lineTo(x, pad.top + plotH);
                    ctx.stroke();
                    ctx.fillStyle = "#ef4444";
                    ctx.fillText("Rf=" + s.rf.toFixed(3), x + 3, pad.top + 12);
                });
                ctx.setLineDash([]);
            }
        },

        // ---- Annotation Drawing ----

        redraw(canvas) {
            if (!this.originalImageData) return;
            const ctx = canvas.getContext("2d");

            // Re-apply image processing
            if (this.thresholdEnabled) {
                this.applyThreshold(canvas, this.thresholdValue);
            } else {
                this.applyAdjustments(canvas, this.brightness, this.contrast);
            }

            if (this.plates.length > 0) {
                // Multi-plate mode: draw per-plate annotations
                this.plates.forEach((plate, i) => {
                    const r = plate.rect;
                    const isActive = i === this.activePlateIndex;

                    // Plate rectangle border
                    ctx.save();
                    ctx.strokeStyle = isActive ? "#06b6d4" : "#94a3b8";
                    ctx.lineWidth = isActive ? 3 : 1.5;
                    ctx.strokeRect(r.x, r.y, r.w, r.h);
                    ctx.fillStyle = isActive ? "#06b6d4" : "#94a3b8";
                    ctx.font = "bold 14px sans-serif";
                    ctx.fillText("Plate " + (i + 1), r.x + 4, r.y - 4);
                    ctx.restore();

                    if (plate.originY !== null) {
                        this._drawHLine(ctx, plate.originY, "#22c55e", "Origin", r);
                    }
                    if (plate.frontY !== null) {
                        this._drawHLine(ctx, plate.frontY, "#ef4444", "Front", r);
                    }
                    plate.spots.forEach((s, j) => {
                        this._drawSpot(ctx, s, j + 1, r);
                    });
                    if (plate.laneX !== null) {
                        this._drawVLine(ctx, plate.laneX, "#8b5cf6", "Lane", r);
                    }
                });
            } else {
                // Flat mode: draw annotations on full image
                if (this.originY !== null) {
                    this._drawHLine(ctx, this.originY, "#22c55e", "Origin", null);
                }
                if (this.frontY !== null) {
                    this._drawHLine(ctx, this.frontY, "#ef4444", "Front", null);
                }
                this.spots.forEach((s, i) => {
                    this._drawSpot(ctx, s, i + 1, null);
                });
                if (this.laneX !== null) {
                    this._drawVLine(ctx, this.laneX, "#8b5cf6", "Lane", null);
                }
            }

            // Crop overlay (in-progress rectangle)
            if (this.cropRect) {
                const r = this.cropRect;
                ctx.save();
                ctx.fillStyle = "rgba(0,0,0,0.45)";
                ctx.fillRect(0, 0, this.canvasWidth, r.y);
                ctx.fillRect(0, r.y + r.h, this.canvasWidth, this.canvasHeight - r.y - r.h);
                ctx.fillRect(0, r.y, r.x, r.h);
                ctx.fillRect(r.x + r.w, r.y, this.canvasWidth - r.x - r.w, r.h);
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.strokeRect(r.x, r.y, r.w, r.h);
                ctx.setLineDash([]);
                ctx.restore();
            }
        },

        _drawHLine(ctx, y, color, label, bounds) {
            const x0 = bounds ? bounds.x : 0;
            const x1 = bounds ? bounds.x + bounds.w : this.canvasWidth;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.moveTo(x0, y);
            ctx.lineTo(x1, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = color;
            ctx.font = "bold 14px sans-serif";
            ctx.fillText(label, x0 + 5, y - 5);
            ctx.restore();
        },

        _drawVLine(ctx, x, color, label, bounds) {
            const y0 = bounds ? bounds.y : 0;
            const y1 = bounds ? bounds.y + bounds.h : this.canvasHeight;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(x, y0);
            ctx.lineTo(x, y1);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = color;
            ctx.font = "bold 14px sans-serif";
            ctx.fillText(label, x + 5, y0 + 15);
            ctx.restore();
        },

        _drawSpot(ctx, spot, num, bounds) {
            const x = spot.x;
            const y = spot.y;
            const rf = spot.rf;
            const color = this.labelColor;
            const fontSize = this.labelFontSize;
            const decimals = this.labelDecimals;
            const vertical = this.labelOrientation === "vertical";

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, 2 * Math.PI);
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.font = `bold ${fontSize}px sans-serif`;
            const labelStr = rf != null ? `#${num} Rf=${rf.toFixed(decimals)}` : `#${num}`;

            const rightEdge = bounds ? bounds.x + bounds.w : this.canvasWidth;
            const leftEdge = bounds ? bounds.x : 0;
            const labelWidth = ctx.measureText(labelStr).width;

            const dx = spot.labelDx || 0;
            const dy = spot.labelDy || 0;
            const renderX = x + dx;
            const renderY = y + dy;

            if (dx !== 0 || dy !== 0) {
                ctx.save();
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.5;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(renderX, renderY);
                ctx.stroke();
                ctx.restore();
            }

            if (vertical) {
                const topEdge = bounds ? bounds.y : 0;
                // if it goes too far up, draw it downwards
                if (renderY - 14 - labelWidth < topEdge) {
                    ctx.translate(renderX, renderY + 14);
                    ctx.rotate(Math.PI / 2);
                    ctx.fillText(labelStr, 0, 0);
                    spot._hitRect = { x: renderX - fontSize / 2, y: renderY + 14, w: fontSize, h: labelWidth };
                } else {
                    ctx.translate(renderX, renderY - 14);
                    ctx.rotate(-Math.PI / 2);
                    ctx.fillText(labelStr, 0, 0);
                    spot._hitRect = { x: renderX - fontSize / 2, y: renderY - 14 - labelWidth, w: fontSize, h: labelWidth };
                }
            } else {
                // If it goes too far right, flip it to the left side
                if (renderX + 14 + labelWidth > rightEdge && renderX - 14 - labelWidth >= leftEdge) {
                    ctx.textAlign = "right";
                    ctx.fillText(labelStr, renderX - 14, renderY + 4);
                    spot._hitRect = { x: renderX - 14 - labelWidth, y: renderY + 4 - fontSize, w: labelWidth, h: fontSize };
                } else {
                    ctx.textAlign = "left";
                    ctx.fillText(labelStr, renderX + 14, renderY + 4);
                    spot._hitRect = { x: renderX + 14, y: renderY + 4 - fontSize, w: labelWidth, h: fontSize };
                }
            }

            if (spot._hitRect) {
                spot._hitRect.x -= 10;
                spot._hitRect.y -= 10;
                spot._hitRect.w += 20;
                spot._hitRect.h += 20;
            }
            ctx.restore();
        },

        hitTestLabel(x, y) {
            const checkSpots = (spots) => {
                for (let si = spots.length - 1; si >= 0; si--) {
                    const s = spots[si];
                    if (s._hitRect && x >= s._hitRect.x && x <= s._hitRect.x + s._hitRect.w && y >= s._hitRect.y && y <= s._hitRect.y + s._hitRect.h) {
                        return s;
                    }
                }
                return null;
            };

            if (this.plates.length > 0) {
                for (let pi = this.plates.length - 1; pi >= 0; pi--) {
                    const hit = checkSpots(this.plates[pi].spots);
                    if (hit) return hit;
                }
            } else {
                return checkSpots(this.spots);
            }
            return null;
        },

        hitTestSpot(x, y) {
            const hitRadius = 15; // easier to click than exactly 10
            const checkSpots = (spots, plateRef = null) => {
                for (let si = spots.length - 1; si >= 0; si--) {
                    const s = spots[si];
                    const dx = x - s.x;
                    const dy = y - s.y;
                    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                        s._plateRef = plateRef;
                        return s;
                    }
                }
                return null;
            };

            if (this.plates.length > 0) {
                for (let pi = this.plates.length - 1; pi >= 0; pi--) {
                    const plate = this.plates[pi];
                    const hit = checkSpots(plate.spots, plate);
                    if (hit) return hit;
                }
            } else {
                return checkSpots(this.spots);
            }
            return null;
        },

        // ---- Canvas Coordinate Helper ----

        getCanvasCoords(canvas, event) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: Math.round((event.clientX - rect.left) * scaleX),
                y: Math.round((event.clientY - rect.top) * scaleY)
            };
        }
    };

    window.TLCAnalysis = TLC;
})();
