(function () {
    "use strict";

    var LANG_LABELS = { en: "English", ja: "日本語" };
    var STORAGE_KEY = "labtools_handbook_manual_lang";
    var SECURITY_NOTE = {
        en: "🔒 Everything you load into this tool (images, spectra, numbers, files) is processed entirely in your browser and is never uploaded to a server.",
        ja: "🔒 このツールに読み込んだデータ(画像・スペクトル・数値・ファイル)はすべてブラウザ内で処理され、サーバーに送信されることはありません。"
    };

    function highlight(selector) {
        var el = document.querySelector(selector);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("manual-highlight");
        setTimeout(function () { el.classList.remove("manual-highlight"); }, 2400);
    }

    function pickInitialLang(available) {
        var saved = null;
        try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { }
        if (saved && available.indexOf(saved) !== -1) return saved;

        var nav = (navigator.language || "en").toLowerCase();
        for (var i = 0; i < available.length; i++) {
            if (nav.indexOf(available[i]) === 0) return available[i];
        }
        return available.indexOf("en") !== -1 ? "en" : available[0];
    }

    function build(content) {
        var available = Object.keys(content);
        if (!available.length) return;
        var lang = pickInitialLang(available);

        var fab = document.createElement("button");
        fab.type = "button";
        fab.className = "manual-fab";
        fab.title = "Help / ヘルプ";
        fab.setAttribute("aria-label", "Help / ヘルプ");
        fab.textContent = "?";

        var dialog = document.createElement("dialog");
        dialog.className = "manual-dialog";
        dialog.innerHTML =
            '<div class="manual-header">' +
            '<h2 class="manual-title"></h2>' +
            '<div class="manual-langs"></div>' +
            '<button type="button" class="manual-close" aria-label="Close">&times;</button>' +
            "</div>" +
            '<div class="manual-body"></div>';

        document.body.appendChild(fab);
        document.body.appendChild(dialog);

        var titleEl = dialog.querySelector(".manual-title");
        var bodyEl = dialog.querySelector(".manual-body");
        var langsEl = dialog.querySelector(".manual-langs");
        var closeBtn = dialog.querySelector(".manual-close");

        function render() {
            var entry = content[lang] || {};
            titleEl.textContent = entry.title || "";
            var note = SECURITY_NOTE[lang] || SECURITY_NOTE.en;
            bodyEl.innerHTML = (entry.body || "") +
                '<div class="manual-security-note">' + note + "</div>";
            var buttons = langsEl.querySelectorAll("button");
            for (var i = 0; i < buttons.length; i++) {
                var match = buttons[i].getAttribute("data-lang") === lang;
                buttons[i].classList.toggle("active", match);
            }
        }

        available.forEach(function (code) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "manual-lang-btn";
            btn.setAttribute("data-lang", code);
            btn.textContent = LANG_LABELS[code] || code.toUpperCase();
            btn.addEventListener("click", function () {
                lang = code;
                try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { }
                render();
            });
            langsEl.appendChild(btn);
        });

        fab.addEventListener("click", function () { dialog.showModal(); });
        closeBtn.addEventListener("click", function () { dialog.close(); });
        dialog.addEventListener("click", function (e) {
            if (e.target === dialog) dialog.close();
        });
        bodyEl.addEventListener("click", function (e) {
            var trigger = e.target.closest && e.target.closest("[data-manual-target]");
            if (!trigger) return;
            e.preventDefault();
            var selector = trigger.getAttribute("data-manual-target");
            dialog.close();
            highlight(selector);
        });

        render();
    }

    document.addEventListener("DOMContentLoaded", function () {
        if (window.MANUAL_CONTENT) build(window.MANUAL_CONTENT);
    });
})();
