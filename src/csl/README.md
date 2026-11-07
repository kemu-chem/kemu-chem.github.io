# Bundled CSL files (RefConverter "CSL (beta)" engine)

Third-party files, kept unmodified. Used by `src/csl_engine.js`.

| Path | Source | License |
|---|---|---|
| `citeproc_commonjs.js` | npm `citeproc` 2.4.63 (citeproc-js by Frank Bennett), via cdn.jsdelivr.net | CPAL 1.0 or AGPL 3.0 — see `LICENSE-citeproc-js.txt` |
| `styles/*.csl` | https://github.com/citation-style-language/styles (master, fetched 2026-11-07) | CC BY-SA 3.0 (stated in each file) |
| `locales/locales-en-US.xml` | https://github.com/citation-style-language/locales (master, fetched 2026-11-07) | CC BY-SA 3.0 |

Bundled styles: american-chemical-society, the-chemical-society-of-japan (parent of the BCSJ /
Chem. Lett. dependent styles), angewandte-chemie, royal-society-of-chemistry, nature, science,
american-physics-society, american-institute-of-physics, ieee, apa, chicago-author-date,
harvard-cite-them-right.

To add a style: download the *independent* `.csl` file into `styles/` (dependent styles only point
to a parent; bundle the parent instead) and add an entry to `STYLES` in `src/csl_engine.js`.
