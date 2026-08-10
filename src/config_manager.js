(function () {
    "use strict";

    var STORAGE_KEY = "kemu_handbook_config";
    var SCHEMA_VERSION = "1.0.0";
    var APP_ID = "kemu_handbook";

    var registry = {};
    var saveTimer = null;
    var activeDialogEl = null;

    var defaultConfig = {
        meta: {
            app: APP_ID,
            version: SCHEMA_VERSION,
            exported_at: null
        },
        global: {
            theme: "auto",
            auto_save: true,
            language: "en"
        },
        tools: {}
    };

    function loadFromStorage() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return JSON.parse(JSON.stringify(defaultConfig));
            var parsed = JSON.parse(raw);
            if (parsed && parsed.meta && parsed.meta.app === APP_ID) {
                return Object.assign({}, defaultConfig, parsed, {
                    global: Object.assign({}, defaultConfig.global, parsed.global || {}),
                    tools: Object.assign({}, defaultConfig.tools, parsed.tools || {})
                });
            }
        } catch (e) {
            console.warn("[KemuConfig] Failed to load config from storage:", e);
        }
        return JSON.parse(JSON.stringify(defaultConfig));
    }

    var currentConfig = loadFromStorage();

    function saveToStorage() {
        if (!currentConfig.global.auto_save) return;
        try {
            Object.keys(registry).forEach(function (toolId) {
                if (registry[toolId].getState) {
                    currentConfig.tools[toolId] = registry[toolId].getState();
                }
            });
            currentConfig.meta.exported_at = new Date().toISOString();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentConfig));
        } catch (e) {
            console.error("[KemuConfig] Failed to save config to storage:", e);
        }
    }

    function scheduleSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            saveToStorage();
        }, 500);
    }

    function applyGlobalTheme(theme) {
        var mode = theme || "auto";
        if (mode === "auto") {
            mode = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
        }
        document.documentElement.setAttribute("data-theme", mode);
    }

    if (window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
            if (currentConfig.global.theme === "auto") {
                applyGlobalTheme("auto");
            }
        });
    }

    function exportJSON(activeToolId) {
        saveToStorage();
        var exportData = JSON.parse(JSON.stringify(currentConfig));
        exportData.meta.exported_at = new Date().toISOString();

        var jsonStr = JSON.stringify(exportData, null, 2);
        var blob = new Blob([jsonStr], { type: "application/json" });
        var url = URL.createObjectURL(blob);

        var dateStr = new Date().toISOString().slice(0, 10);
        var filename = "labtool_handbook_settings_" + (activeToolId ? activeToolId + "_" : "") + dateStr + ".json";

        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importJSON(file, callback) {
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var parsed = JSON.parse(e.target.result);
                if (!parsed || !parsed.meta || parsed.meta.app !== APP_ID) {
                    alert("Invalid configuration file. Please select a valid Kemu Handbook config JSON file.");
                    return;
                }
                currentConfig = Object.assign({}, defaultConfig, parsed, {
                    global: Object.assign({}, defaultConfig.global, parsed.global || {}),
                    tools: Object.assign({}, defaultConfig.tools, parsed.tools || {})
                });
                saveToStorage();

                Object.keys(registry).forEach(function (toolId) {
                    if (registry[toolId].onLoad && currentConfig.tools[toolId]) {
                        registry[toolId].onLoad(currentConfig.tools[toolId]);
                    }
                });

                applyGlobalTheme(currentConfig.global.theme);
                if (callback) callback(true);
                alert("Configuration successfully imported.");
            } catch (err) {
                alert("Failed to parse JSON file: " + err.message);
                if (callback) callback(false);
            }
        };
        reader.readAsText(file);
    }

    function resetAllState() {
        if (!confirm("Are you sure you want to reset all cached state and settings to default?")) return;
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) { }
        currentConfig = JSON.parse(JSON.stringify(defaultConfig));

        Object.keys(registry).forEach(function (toolId) {
            if (registry[toolId].onLoad) {
                registry[toolId].onLoad({});
            }
        });
        applyGlobalTheme("auto");
        alert("Settings reset to default.");
    }

    function openDialog() {
        if (!activeDialogEl) return;
        var themeSelect = activeDialogEl.querySelector("#kemu-config-theme");
        var autosaveCheck = activeDialogEl.querySelector("#kemu-config-autosave");
        if (themeSelect) themeSelect.value = currentConfig.global.theme || "auto";
        if (autosaveCheck) autosaveCheck.checked = currentConfig.global.auto_save !== false;
        activeDialogEl.showModal();
    }

    function closeDialog() {
        if (activeDialogEl && activeDialogEl.open) {
            activeDialogEl.close();
        }
    }

    // UI Construction (Manual FAB & Dialog style, English UI)
    function buildUI() {
        if (document.querySelector(".config-fab")) return;

        var fab = document.createElement("button");
        fab.type = "button";
        fab.className = "config-fab";
        fab.title = "Settings";
        fab.setAttribute("aria-label", "Settings");
        fab.innerHTML = "⚙️";

        var dialog = document.createElement("dialog");
        dialog.className = "config-dialog";
        dialog.innerHTML =
            '<div class="config-header">' +
            '<h2 class="config-title">⚙️ Settings & Data Management</h2>' +
            '<button type="button" class="config-close" aria-label="Close">&times;</button>' +
            '</div>' +
            '<div class="config-body">' +
            '<div class="config-section">' +
            '<h3>General Settings</h3>' +
            '<div class="config-row">' +
            '<label for="kemu-config-theme">Theme:</label>' +
            '<select id="kemu-config-theme" class="config-select">' +
            '<option value="auto">Auto (System preference)</option>' +
            '<option value="light">Light Mode</option>' +
            '<option value="dark">Dark Mode</option>' +
            '</select>' +
            '</div>' +
            '<div class="config-row">' +
            '<label><input type="checkbox" id="kemu-config-autosave"> Auto-save input parameters to cache</label>' +
            '</div>' +
            '</div>' +
            '<div class="config-section">' +
            '<h3>Import & Export (JSON)</h3>' +
            '<p class="config-desc">Save or restore your input parameters and options as a configuration JSON file (excluding binary images or raw datasets).</p>' +
            '<div class="config-actions">' +
            '<button type="button" id="kemu-config-export" class="config-btn config-btn-primary">💾 Export JSON</button>' +
            '<label class="config-btn config-btn-secondary">📁 Import JSON' +
            '<input type="file" id="kemu-config-import" accept=".json" style="display:none;">' +
            '</label>' +
            '<button type="button" id="kemu-config-reset" class="config-btn config-btn-danger">🔄 Reset to Default</button>' +
            '</div>' +
            '</div>' +
            '</div>';

        document.body.appendChild(fab);
        document.body.appendChild(dialog);
        activeDialogEl = dialog;

        var closeBtn = dialog.querySelector(".config-close");
        var themeSelect = dialog.querySelector("#kemu-config-theme");
        var autosaveCheck = dialog.querySelector("#kemu-config-autosave");
        var exportBtn = dialog.querySelector("#kemu-config-export");
        var importInput = dialog.querySelector("#kemu-config-import");
        var resetBtn = dialog.querySelector("#kemu-config-reset");

        themeSelect.value = currentConfig.global.theme || "auto";
        autosaveCheck.checked = currentConfig.global.auto_save !== false;

        fab.addEventListener("click", openDialog);
        closeBtn.addEventListener("click", closeDialog);
        dialog.addEventListener("click", function (e) {
            if (e.target === dialog) closeDialog();
        });

        document.querySelectorAll(".config-open-btn").forEach(function (btn) {
            btn.addEventListener("click", openDialog);
        });

        themeSelect.addEventListener("change", function () {
            currentConfig.global.theme = themeSelect.value;
            applyGlobalTheme(themeSelect.value);
            scheduleSave();
        });

        autosaveCheck.addEventListener("change", function () {
            currentConfig.global.auto_save = autosaveCheck.checked;
            scheduleSave();
        });

        exportBtn.addEventListener("click", function () {
            var activeToolId = Object.keys(registry)[0] || null;
            exportJSON(activeToolId);
        });

        importInput.addEventListener("change", function (e) {
            if (e.target.files && e.target.files[0]) {
                importJSON(e.target.files[0], function () {
                    closeDialog();
                });
                importInput.value = "";
            }
        });

        resetBtn.addEventListener("click", function () {
            resetAllState();
            themeSelect.value = "auto";
            autosaveCheck.checked = true;
        });

        applyGlobalTheme(currentConfig.global.theme);
    }

    // Public API
    window.KemuConfig = {
        registerTool: function (toolId, options) {
            registry[toolId] = options || {};
            var savedState = currentConfig.tools[toolId] || null;
            if (savedState && options.onLoad) {
                try {
                    options.onLoad(savedState);
                } catch (e) {
                    console.error("[KemuConfig] Error loading state for tool " + toolId + ":", e);
                }
            }
            return savedState;
        },

        updateToolState: function (toolId, state) {
            currentConfig.tools[toolId] = state;
            scheduleSave();
        },

        getToolState: function (toolId) {
            return currentConfig.tools[toolId] || null;
        },

        openDialog: openDialog,
        closeDialog: closeDialog,
        exportJSON: exportJSON,
        importJSON: importJSON,
        resetAllState: resetAllState
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildUI);
    } else {
        buildUI();
    }
})();
