import * as modeling from "@jscad/modeling";
import * as stlSerializer from "@jscad/stl-serializer";

const { measureBoundingBox } = modeling.measurements || {};
const { prepareRender, drawCommands, cameras, controls, entitiesFromSolids } = window.jscadReglRenderer || {};

const elements = {
    modelSelect: document.getElementById("model-select"),
    modelGrid: document.getElementById("model-grid"),
    modelEditor: document.getElementById("model-editor"),
    modelTitle: document.getElementById("model-title"),
    modelSubtitle: document.getElementById("model-subtitle"),
    paramList: document.getElementById("param-list"),
    paramStatus: document.getElementById("param-status"),
    viewer: document.getElementById("viewer"),
    resetView: document.getElementById("reset-view"),
    downloadStl: document.getElementById("download-stl"),
    backToSelect: document.getElementById("back-to-select"),
    errorBox: document.getElementById("error-box"),
    modelError: document.getElementById("model-error")
};

const state = {
    models: [],
    currentModel: null,
    currentModule: null,
    paramDefs: [],
    currentParams: {},
    currentSolids: []
};

let viewer = null;
let toleranceSelect = null;
let toleranceInput = null;

const baseRoot = new URL("../", window.location.href);
const modelsUrl = new URL("data/3dmodel/models.json", baseRoot).href;

const debounce = (fn, delay) => {
    let timer = null;
    return (...args) => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => fn(...args), delay);
    };
};

const scheduleRender = debounce(() => {
    renderModel(false);
}, 300);

const setStatus = (message) => {
    elements.paramStatus.textContent = message || "";
};

const showError = (message) => {
    if (elements.errorBox) {
        elements.errorBox.textContent = message;
        elements.errorBox.classList.remove("hidden");
    }
    if (elements.modelError) {
        elements.modelError.textContent = message;
        elements.modelError.classList.remove("hidden");
    }
};

const clearError = () => {
    if (elements.errorBox) {
        elements.errorBox.textContent = "";
        elements.errorBox.classList.add("hidden");
    }
    if (elements.modelError) {
        elements.modelError.textContent = "";
        elements.modelError.classList.add("hidden");
    }
};

const parseValue = (def, value) => {
    if (def.type === "int") {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : def.initial;
    }
    if (def.type === "float") {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : def.initial;
    }
    return value;
};

const ensureViewer = () => {
    if (!viewer) {
        if (!prepareRender || !cameras || !controls || !entitiesFromSolids) {
            showError("Renderer failed to load. Check the JSCAD renderer script.");
            return;
        }
        viewer = createViewer(elements.viewer);
    }
};

const buildModelCards = () => {
    elements.modelGrid.innerHTML = "";
    state.models.forEach((model) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "model-card";
        card.addEventListener("click", () => selectModel(model));

        const thumb = document.createElement("div");
        thumb.className = "model-thumb";

        const img = document.createElement("img");
        img.alt = `${model.name} thumbnail`;
        img.loading = "lazy";
        img.src = new URL(`${model.dir}/thumbnail.png`, baseRoot).href;
        img.addEventListener("error", () => {
            img.classList.add("hidden");
        });

        const fallback = document.createElement("div");
        fallback.className = "thumb-fallback";
        fallback.textContent = "3D";

        thumb.append(img, fallback);

        const body = document.createElement("div");
        body.className = "model-body";

        const title = document.createElement("div");
        title.className = "model-name";
        title.textContent = model.name;

        body.append(title);

        if (model.name_ja && model.name_ja !== model.name) {
            const subtitle = document.createElement("div");
            subtitle.className = "model-name-sub";
            subtitle.textContent = model.name_ja;
            body.append(subtitle);
        }

        card.append(thumb, body);
        elements.modelGrid.append(card);
    });
};

const buildParamUI = (defs) => {
    elements.paramList.innerHTML = "";
    state.paramDefs = defs;
    state.currentParams = {};
    toleranceSelect = null;
    toleranceInput = null;

    defs.forEach((def) => {
        const row = document.createElement("div");
        row.className = "param-row";

        const label = document.createElement("label");
        label.textContent = def.caption || def.name;
        row.append(label);

        if (def.name === "tolerance") {
            const block = document.createElement("div");
            block.className = "tolerance-block";

            toleranceSelect = document.createElement("select");
            const presets = [
                { label: "PLA (0.10 mm)", value: "0.10" },
                { label: "PETG (0.15 mm)", value: "0.15" },
                { label: "ABS/ASA (0.20 mm)", value: "0.20" },
                { label: "Custom", value: "custom" }
            ];
            presets.forEach((preset) => {
                const option = document.createElement("option");
                option.value = preset.value;
                option.textContent = preset.label;
                toleranceSelect.append(option);
            });

            toleranceInput = document.createElement("input");
            toleranceInput.type = "number";
            toleranceInput.min = def.min ?? "0.05";
            toleranceInput.max = def.max ?? "0.30";
            toleranceInput.step = def.step ?? "0.05";

            const initialValue = def.initial ?? 0.1;
            toleranceInput.value = initialValue;
            state.currentParams[def.name] = initialValue;

            const presetMatch = presets.find((preset) => Number.parseFloat(preset.value) === Number(initialValue));
            toleranceSelect.value = presetMatch ? presetMatch.value : "custom";

            toleranceSelect.addEventListener("change", () => {
                if (toleranceSelect.value !== "custom") {
                    toleranceInput.value = toleranceSelect.value;
                    state.currentParams[def.name] = Number.parseFloat(toleranceSelect.value);
                    scheduleRender();
                }
            });

            toleranceInput.addEventListener("input", () => {
                const value = Number.parseFloat(toleranceInput.value);
                if (!Number.isFinite(value)) {
                    return;
                }
                state.currentParams[def.name] = value;
                const match = presets.find((preset) => Number.parseFloat(preset.value) === value);
                toleranceSelect.value = match ? match.value : "custom";
                scheduleRender();
            });

            block.append(toleranceSelect, toleranceInput);
            row.append(block);
        } else if (def.type === "choice") {
            const select = document.createElement("select");
            const values = def.values || def.choices || [];
            const captions = def.captions || values;

            values.forEach((value, index) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = captions[index] ?? value;
                select.append(option);
            });

            const initialValue = def.initial ?? values[0];
            select.value = initialValue;
            state.currentParams[def.name] = initialValue;

            select.addEventListener("change", () => {
                state.currentParams[def.name] = select.value;
                scheduleRender();
            });

            row.append(select);
        } else {
            const input = document.createElement("input");
            input.type = "number";
            if (def.min !== undefined) {
                input.min = def.min;
            }
            if (def.max !== undefined) {
                input.max = def.max;
            }
            input.step = def.step ?? (def.type === "int" ? 1 : 0.1);
            const initialValue = def.initial ?? 0;
            input.value = initialValue;
            state.currentParams[def.name] = initialValue;

            input.addEventListener("input", () => {
                const parsed = parseValue(def, input.value);
                if (Number.isFinite(parsed)) {
                    state.currentParams[def.name] = parsed;
                    scheduleRender();
                }
            });

            row.append(input);
        }

        elements.paramList.append(row);
    });
};

const selectModel = async (model) => {
    state.currentModel = model;
    clearError();
    elements.modelSelect.classList.add("hidden");
    elements.modelEditor.classList.remove("hidden");

    ensureViewer();
    viewer.resize();

    elements.modelTitle.textContent = model.name;
    elements.modelSubtitle.textContent = model.name_ja && model.name_ja !== model.name ? model.name_ja : "";

    elements.downloadStl.disabled = true;

    try {
        const moduleUrl = new URL(`${model.dir}/model.js`, baseRoot);
        moduleUrl.searchParams.set("v", String(Date.now()));
        state.currentModule = await import(moduleUrl.href);
        if (!state.currentModule.main || !state.currentModule.getParameterDefinitions) {
            throw new Error("Model module is missing exports.");
        }
        buildParamUI(state.currentModule.getParameterDefinitions());
        renderModel(true);
    } catch (err) {
        showError(`Failed to load model: ${err.message}`);
    }
};

const renderModel = (fitView) => {
    if (!state.currentModule) {
        return;
    }

    clearError();
    setStatus("Rendering...");

    try {
        const solids = state.currentModule.main({ ...state.currentParams });
        const normalized = Array.isArray(solids) ? solids : [solids];
        state.currentSolids = normalized.filter((item) => item);
        if (state.currentSolids.length === 0) {
            throw new Error("Model returned no geometry.");
        }
        viewer.setSolids(state.currentSolids);
        if (fitView) {
            viewer.fitToSolids(state.currentSolids);
        }
        elements.downloadStl.disabled = false;
        setStatus("");
    } catch (err) {
        elements.downloadStl.disabled = true;
        showError(`Render error: ${err.message}`);
        setStatus("");
    }
};

const downloadStl = () => {
    if (!state.currentSolids.length) {
        return;
    }

    const data = stlSerializer.serialize({ binary: true }, state.currentSolids);
    const blob = Array.isArray(data) ? new Blob(data, { type: "model/stl" }) : new Blob([data], { type: "model/stl" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${state.currentModel?.id || "model"}.stl`;
    link.click();

    setTimeout(() => {
        URL.revokeObjectURL(link.href);
    }, 2000);
};

const backToSelection = () => {
    elements.modelEditor.classList.add("hidden");
    elements.modelSelect.classList.remove("hidden");
};

const createViewer = (container) => {
    container.style.touchAction = "none";

    const perspectiveCamera = cameras.perspective;
    const orbitControls = controls.orbit;

    const stateView = {
        camera: { ...perspectiveCamera.defaults },
        controls: { ...orbitControls.defaults },
        rotateDelta: [0, 0],
        panDelta: [0, 0],
        zoomDelta: 0,
        pointerDown: false,
        updateView: true
    };

    if (!stateView.camera.position) {
        stateView.camera.position = [0, 0, 100];
    }
    if (!stateView.camera.target) {
        stateView.camera.target = [0, 0, 0];
    }
    stateView.controls = {
        ...stateView.controls,
        position: stateView.controls.position || [...stateView.camera.position],
        target: stateView.controls.target || [...stateView.camera.target]
    };

    const ensureCameraVectors = () => {
        if (!stateView.camera.position || stateView.camera.position.length !== 3) {
            stateView.camera.position = [0, 0, 100];
        }
        if (!stateView.camera.target || stateView.camera.target.length !== 3) {
            stateView.camera.target = [0, 0, 0];
        }
        if (!stateView.controls.position || stateView.controls.position.length !== 3) {
            stateView.controls.position = [...stateView.camera.position];
        }
        if (!stateView.controls.target || stateView.controls.target.length !== 3) {
            stateView.controls.target = [...stateView.camera.target];
        }
    };

    const renderer = prepareRender({
        glOptions: {
            container
        }
    });

    const renderOptions = {
        camera: stateView.camera,
        drawCommands: {
            drawAxis: drawCommands.drawAxis,
            drawGrid: drawCommands.drawGrid,
            drawLines: drawCommands.drawLines,
            drawMesh: drawCommands.drawMesh
        },
        entities: []
    };

    const gridOptions = {
        visuals: {
            drawCmd: "drawGrid",
            show: true
        },
        size: [200, 200],
        ticks: [25, 5]
    };

    const axisOptions = {
        visuals: {
            drawCmd: "drawAxis",
            show: true
        },
        size: 60
    };

    const updateEntities = (solids) => {
        const safeSolids = Array.isArray(solids) ? solids.filter((item) => item) : [];
        const entities = safeSolids.length ? entitiesFromSolids({}, safeSolids) : [];
        renderOptions.entities = [gridOptions, axisOptions, ...entities];
        stateView.updateView = true;
    };

    const doControls = () => {
        if (stateView.rotateDelta[0] || stateView.rotateDelta[1]) {
            const updated = orbitControls.rotate({
                controls: stateView.controls,
                camera: stateView.camera,
                speed: 0.002
            }, stateView.rotateDelta);
            stateView.controls = { ...stateView.controls, ...updated.controls };
            stateView.rotateDelta = [0, 0];
            stateView.updateView = true;
        }

        if (stateView.panDelta[0] || stateView.panDelta[1]) {
            const updated = orbitControls.pan({
                controls: stateView.controls,
                camera: stateView.camera,
                speed: 1
            }, stateView.panDelta);
            stateView.controls = { ...stateView.controls, ...updated.controls };
            stateView.panDelta = [0, 0];
            stateView.camera.position = updated.camera.position;
            stateView.camera.target = updated.camera.target;
            stateView.updateView = true;
        }

        if (stateView.zoomDelta) {
            const updated = orbitControls.zoom({
                controls: stateView.controls,
                camera: stateView.camera,
                speed: 0.08
            }, stateView.zoomDelta);
            stateView.controls = { ...stateView.controls, ...updated.controls };
            stateView.zoomDelta = 0;
            stateView.updateView = true;
        }
    };

    const updateLoop = () => {
        ensureCameraVectors();
        doControls();

        if (stateView.updateView) {
            const updates = orbitControls.update({
                controls: stateView.controls,
                camera: stateView.camera
            });
            stateView.controls = { ...stateView.controls, ...updates.controls };
            stateView.camera.position = updates.camera.position;
            stateView.camera.target = updates.camera.target;
            ensureCameraVectors();
            perspectiveCamera.update(stateView.camera);
            renderer(renderOptions);
            stateView.updateView = stateView.controls.changed;
        }

        requestAnimationFrame(updateLoop);
    };

    let lastX = 0;
    let lastY = 0;

    const onMove = (event) => {
        if (!stateView.pointerDown) {
            return;
        }
        const dx = lastX - event.pageX;
        const dy = event.pageY - lastY;
        const shiftKey = event.shiftKey || (event.touches && event.touches.length > 2);
        if (shiftKey) {
            stateView.panDelta[0] += dx;
            stateView.panDelta[1] += dy;
        } else {
            stateView.rotateDelta[0] -= dx;
            stateView.rotateDelta[1] -= dy;
        }
        lastX = event.pageX;
        lastY = event.pageY;
        event.preventDefault();
    };

    const onDown = (event) => {
        stateView.pointerDown = true;
        lastX = event.pageX;
        lastY = event.pageY;
        container.setPointerCapture(event.pointerId);
    };

    const onUp = (event) => {
        stateView.pointerDown = false;
        container.releasePointerCapture(event.pointerId);
    };

    const onWheel = (event) => {
        stateView.zoomDelta += event.deltaY;
        event.preventDefault();
    };

    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerdown", onDown);
    container.addEventListener("pointerup", onUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    const resize = () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (!width || !height) {
            return;
        }
        perspectiveCamera.setProjection(stateView.camera, stateView.camera, { width, height });
        perspectiveCamera.update(stateView.camera, stateView.camera);
        stateView.updateView = true;
    };

    const fitToSolids = (solids) => {
        if (!solids || !solids.length) return;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const solid of solids) {
            const bounds = measureBoundingBox(solid);
            if (!bounds) continue;
            const [[x0, y0, z0], [x1, y1, z1]] = bounds;
            if (x0 < minX) minX = x0;
            if (y0 < minY) minY = y0;
            if (z0 < minZ) minZ = z0;
            if (x1 > maxX) maxX = x1;
            if (y1 > maxY) maxY = y1;
            if (z1 > maxZ) maxZ = z1;
        }
        if (!isFinite(minX)) return;
        const center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
        const size = [maxX - minX, maxY - minY, maxZ - minZ];
        const radius = Math.max(...size, 1) * 1.4;
        stateView.camera.position = [center[0] + radius, center[1] + radius, center[2] + radius];
        stateView.camera.target = center;
        stateView.controls = { ...stateView.controls, target: center, position: stateView.camera.position };
        perspectiveCamera.update(stateView.camera);
        stateView.updateView = true;
    };

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(container);

    resize();

    updateLoop();

    return {
        setSolids: updateEntities,
        fitToSolids,
        resize
    };
};

const init = async () => {
    try {
        const response = await fetch(modelsUrl);
        if (!response.ok) {
            throw new Error("Failed to fetch models list.");
        }
        state.models = await response.json();
        buildModelCards();
    } catch (err) {
        showError(`Failed to load models: ${err.message}`);
    }
};

init();

elements.downloadStl.addEventListener("click", downloadStl);

elements.backToSelect.addEventListener("click", backToSelection);

elements.resetView.addEventListener("click", () => {
    if (!state.currentSolids.length) {
        return;
    }
    ensureViewer();
    viewer.fitToSolids(state.currentSolids);
});
