# Kemu Handbook — Browser-Based Tools for Researchers

A collection of lightweight, privacy-focused web tools designed for chemists and experimental scientists. All processing runs entirely in the browser — no server uploads, no accounts, no installation required.

**Live site**: https://kemu-chem.github.io/kemu_handbook/

## Tools

### RefConverter

Convert bibliographic data into formatted references for manuscripts and reports.

- **Input formats**: BibTeX (`.bib`), RIS (`.ris`), DOI list (plain text)
- **Citation styles**: ACS, APA 7th, Harvard, Vancouver, Angewandte Chemie, RSC, Nature, IEEE, ISO 690
- **Features**: Drag-and-drop file import, real-time formatting, author limit control, sorting by appearance/author/year, title omission option
- **Use case**: Preparing reference lists for journal submissions, thesis writing, and lab reports

### TLC Analysis

Quantitative analysis of thin-layer chromatography plate images.

- **Rf value calculation**: Automatic spot detection with adjustable thresholds
- **Intensity profiling**: Lane-based intensity plots for semi-quantitative comparison
- **Contrast enhancement**: Image processing filters to improve spot visibility
- **Use case**: Documenting reaction progress, comparing fraction purity, and generating publication-quality TLC figures

### Cell Counter

Automated cell counting from microscopy images using computer vision.

- **Detection pipeline**: Threshold segmentation, morphological operations, and blob filtering powered by OpenCV.js
- **Adjustable parameters**: Threshold, minimum/maximum cell area, circularity filters
- **Use case**: Counting cells in brightfield or fluorescence microscopy images without commercial software

### NMR Impurity Finder

Interactive visual identifier for common impurity peaks in NMR spectra.

- **Solvent support**: 12 deuterated solvents (CDCl3, CD2Cl2, (CD3)2SO, (CD3)2CO, CD3CN, CD3OD, D2O, C6D6, C6D5Cl, THF-d8, Toluene-d8, TFE-d3)
- **Nucleus support**: 1H NMR (13C and 19F data structure ready for future expansion)
- **Interactive spectrum**: SVG-based visualization with chemical shift axis (ppm), compound labels, and multiplicity data
- **Search**: Filter by chemical shift value or compound name
- **Touch-optimized**: Pinch-to-zoom and pan gestures for mobile/tablet use
- **Dark mode**: Automatic OS preference detection with manual toggle
- **Data source**: Fulmer, G. R. et al. *Organometallics* **2010**, *29* (9), 2176-2179. [DOI: 10.1021/om100106e](https://doi.org/10.1021/om100106e)

## Design Principles

- **Client-side only**: No data leaves the browser. Suitable for handling unpublished results and proprietary data.
- **Single-file architecture**: Each tool is a self-contained HTML file with inline CSS/JS for easy deployment and offline use.
- **Mobile-first**: Responsive layouts tested on iOS and Android devices.
- **Accessible**: Keyboard navigation, semantic HTML, and high-contrast color schemes.

## Project Structure

```
index.html                  # Portal page
bib2ref.html                # RefConverter
SimpleTLCAnalysis.html      # TLC Analysis
cell_counter.html           # Cell Counter
NMRImpurityFinder.html      # NMR Impurity Finder
main_style.css              # Shared styles
data/json/hnmr/             # 1H NMR impurity shift data (JSON, per solvent)
```

## Local Usage

No build step required. Open `index.html` in any modern browser, or navigate directly to a specific tool's HTML file. For NMR Impurity Finder, a local HTTP server is needed to load JSON data files:

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .
```

Then open `http://localhost:8000/` in your browser.

## Author

kemu-chem

## License

All rights reserved.
