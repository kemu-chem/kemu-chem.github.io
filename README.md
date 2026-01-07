# RefConverter - Simple & Fast Reference Generator

Convert BibTeX, RIS, and DOI to formatted references with multiple citation styles.

## Features

- **Multiple Input Formats**: BibTeX, RIS, and DOI list
- **Multiple Citation Styles**: ACS, APA (7th), Harvard, Vancouver, Angewandte, RSC, Nature, IEEE, ISO 690
- **Simple & Fast**: Drag & drop files or paste content directly
- **No Server Storage**: All processing happens in your browser
- **Automatic Conversion**: Real-time formatting as you type
- **Customizable Options**:
  - Sort by appearance, author, or year
  - Limit number of authors
  - Omit titles
  - Reverse first and last author names

## Usage

1. Open https://kemu-chem.github.io/kemu_handbook/index.html
2. Drop a `.bib`, `.ris`, or `.txt` file, or paste content directly
3. Select your preferred citation style and options
4. Copy the formatted references

## Supported Formats

### BibTeX
```bibtex
@article{example2024,
  author = {Smith, John and Doe, Jane},
  title = {Example Article},
  journal = {Journal Name},
  year = {2024}
}
```

### RIS
```
TY  - JOUR
AU  - Smith, John
AU  - Doe, Jane
TI  - Example Article
JO  - Journal Name
PY  - 2024
ER  -
```

### DOI List
```
10.1002/anie.202201234
https://doi.org/10.1038/s41586-023-12345-6
doi.org/10.1126/science.abc1234
```

## Author

kemu-chem

## Version

RefConverter v1.0.1
