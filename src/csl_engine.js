// RefConverter CSL (beta) engine: thin wrapper around citeproc-js (src/csl/citeproc_commonjs.js).
// - Styles are bundled in src/csl/styles (Citation Style Language project, CC BY-SA 3.0).
// - citeproc-js is loaded lazily, only when a CSL style is first used.
// - Every CSL variable is wrapped in <span class="cit-ELEMENT"> (variableWrapper) so the
//   Detail panel's per-element bold/italic overrides work exactly as for the legacy styles.
window.RefCSL = (function () {
    const BASE = 'src/csl/';

    // value in #style_select = 'csl:' + id ; abbr: style prints abbreviated journal titles
    const STYLES = [
        { id: 'american-chemical-society', label: 'ACS', abbr: true },
        { id: 'the-chemical-society-of-japan', label: 'BCSJ / Chem. Lett. (CSJ)', abbr: true },
        { id: 'angewandte-chemie', label: 'Angewandte Chemie', abbr: true },
        { id: 'royal-society-of-chemistry', label: 'RSC', abbr: true },
        { id: 'nature', label: 'Nature', abbr: true },
        { id: 'science', label: 'Science', abbr: true },
        { id: 'american-physics-society', label: 'APS (Phys. Rev.)', abbr: true },
        { id: 'american-institute-of-physics', label: 'AIP', abbr: true },
        { id: 'ieee', label: 'IEEE', abbr: true },
        { id: 'apa', label: 'APA 7th', abbr: false },
        { id: 'chicago-author-date', label: 'Chicago (author-date)', abbr: false },
        { id: 'harvard-cite-them-right', label: 'Harvard (Cite Them Right)', abbr: false }
    ];
    const STYLE_IDS = STYLES.map(s => s.id);

    // CSL variable -> Detail panel element id (unlisted variables keep their CSL name)
    const ELEMENT_OF = {
        'author': 'author', 'title': 'title', 'container-title': 'journal', 'issued': 'year',
        'volume': 'volume', 'issue': 'issue', 'page': 'pages', 'page-first': 'pages',
        'DOI': 'doi', 'URL': 'doi', 'publisher': 'publisher', 'citation-number': 'num'
    };

    const textCache = {};
    let citeprocPromise = null;

    function fetchText(path) {
        if (!textCache[path]) {
            textCache[path] = fetch(path).then(r => {
                if (!r.ok) throw new Error('Failed to load ' + path + ' (' + r.status + ')');
                return r.text();
            }).catch(e => { delete textCache[path]; throw e; });
        }
        return textCache[path];
    }

    function loadCiteproc() {
        if (window.CSL && window.CSL.Engine) return Promise.resolve();
        if (!citeprocPromise) {
            citeprocPromise = new Promise((resolve, reject) => {
                // citeproc_commonjs.js ends with `module.exports = CSL`: provide a throwaway `module`.
                const hadModule = Object.prototype.hasOwnProperty.call(window, 'module');
                if (!hadModule) window.module = { exports: {} };
                const s = document.createElement('script');
                s.src = BASE + 'citeproc_commonjs.js';
                s.onload = () => {
                    if (!hadModule) delete window.module;
                    if (window.CSL && window.CSL.Engine) resolve();
                    else { citeprocPromise = null; reject(new Error('citeproc-js did not initialise')); }
                };
                s.onerror = () => {
                    if (!hadModule) delete window.module;
                    citeprocPromise = null;
                    reject(new Error('Failed to load citeproc-js'));
                };
                document.head.appendChild(s);
            });
        }
        return citeprocPromise;
    }

    // Max Authors: force et-al on every cs:name (bibliography names come from macros too)
    function applyMaxAuthors(styleXml, maxAuthors) {
        if (!(maxAuthors >= 1)) return styleXml;
        const doc = new DOMParser().parseFromString(styleXml, 'application/xml');
        doc.querySelectorAll('name').forEach(n => {
            n.setAttribute('et-al-min', String(maxAuthors + 1));
            n.setAttribute('et-al-use-first', String(maxAuthors));
        });
        return new XMLSerializer().serializeToString(doc);
    }

    // Flatten citeproc's left-margin / right-inline layout into inline HTML (pastes cleanly),
    // or drop the reference numbers entirely when showNumbers is false.
    function postProcess(entryHtml, showNumbers) {
        const box = document.createElement('div');
        box.innerHTML = entryHtml;
        const entry = box.querySelector('.csl-entry') || box;
        const margin = entry.querySelector('.csl-left-margin');
        const right = entry.querySelector('.csl-right-inline');
        if (margin) {
            if (showNumbers) {
                const num = document.createElement('span');
                num.className = 'csl-num';
                num.innerHTML = margin.innerHTML;
                margin.replaceWith(num, document.createTextNode(' '));
            } else {
                margin.remove();
            }
        } else if (!showNumbers) {
            // inline numbers (e.g. AIP: <sup>1</sup>)
            entry.querySelectorAll('span.cit-num').forEach(sp => {
                const parent = sp.parentElement;
                sp.remove();
                if (parent && parent !== entry && !parent.textContent.trim()) parent.remove();
            });
        }
        if (right) right.replaceWith(...right.childNodes);
        // citeproc wraps the variable OUTSIDE the style's formatting (<span cit-x><i>..</i></span>).
        // Lift the formatting outside (<i><span cit-x>..</span></i>) to match the legacy output,
        // so an override on the span beats the inherited style (main_style.css forces
        // `i { font-style: italic !important }`, which an inline style on <i> itself cannot beat).
        entry.querySelectorAll('span[class^="cit-"]').forEach(sp => {
            let child;
            while (sp.childNodes.length === 1 && (child = sp.firstChild).nodeType === 1
                   && /^(I|B|EM|STRONG|SUP|SUB)$/.test(child.tagName)) {
                sp.replaceWith(child);
                while (child.firstChild) sp.appendChild(child.firstChild);
                child.appendChild(sp);
            }
        });
        // trim leading whitespace left behind by removed numbers
        while (entry.firstChild && entry.firstChild.nodeType === 3 && !entry.firstChild.textContent.trim()) {
            entry.firstChild.remove();
        }
        if (entry.firstChild && entry.firstChild.nodeType === 3) {
            entry.firstChild.textContent = entry.firstChild.textContent.replace(/^\s+/, '');
        }
        return '<div class="citation-item csl-entry">' + entry.innerHTML.trim() + '</div>';
    }

    // styleId: bundled style id; itemsJson: CSL-JSON array string; optsJson: {maxAuthors, showNumbers}
    async function render(styleId, itemsJson, optsJson) {
        if (!STYLE_IDS.includes(styleId)) throw new Error('Unknown CSL style: ' + styleId);
        const items = JSON.parse(itemsJson);
        const opts = optsJson ? JSON.parse(optsJson) : {};
        const [, styleXml, localeXml] = await Promise.all([
            loadCiteproc(),
            fetchText(BASE + 'styles/' + styleId + '.csl'),
            fetchText(BASE + 'locales/locales-en-US.xml')
        ]);
        const byId = {};
        items.forEach(it => { byId[it.id] = it; });
        const sys = {
            retrieveLocale: () => localeXml,
            retrieveItem: id => byId[id],
            variableWrapper: (params, pre, str, post) => {
                const v = (params.variableNames || [])[0] || '';
                const el = ELEMENT_OF[v] || v.replace(/[^a-zA-Z0-9-]/g, '');
                return pre + '<span class="cit-' + el + '">' + str + '</span>' + post;
            }
        };
        const engine = new window.CSL.Engine(sys, applyMaxAuthors(styleXml, opts.maxAuthors), 'en-US', true);
        engine.updateItems(items.map(it => it.id));
        const bib = engine.makeBibliography();
        if (!bib) return '';
        const showNumbers = opts.showNumbers !== false;
        return bib[1].map(h => postProcess(h, showNumbers)).join('');
    }

    // Fill the "CSL (beta)" optgroup of #style_select (synchronously, before state restore)
    function populateSelect() {
        const group = document.getElementById('csl_style_group');
        if (!group) return;
        STYLES.forEach(s => {
            const o = document.createElement('option');
            o.value = 'csl:' + s.id;
            o.textContent = s.label + ' [CSL]';
            group.appendChild(o);
        });
    }
    populateSelect();

    return {
        STYLES,
        render,
        isCsl: v => typeof v === 'string' && v.startsWith('csl:'),
        needsAbbr: v => STYLES.some(s => s.abbr && 'csl:' + s.id === v)
    };
})();
