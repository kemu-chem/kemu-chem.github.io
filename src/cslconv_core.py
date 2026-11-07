"""
CSL-JSON conversion for RefConverter's CSL (beta) engine.

Converts the BibTeX-like entry dicts produced by BibTeXProcessor / RISProcessor /
DOIProcessor into CSL-JSON items that citeproc-js (src/csl/) formats.
The legacy formatters in bibcite_core.py are not touched by this module.
"""

import json
import re
from typing import Dict, List, Optional

from src.bibcite_core import BibTeXProcessor

# BibTeX entry type -> CSL item type
TYPE_MAP = {
    "article": "article-journal",
    "book": "book",
    "booklet": "book",
    "incollection": "chapter",
    "inbook": "chapter",
    "inproceedings": "paper-conference",
    "conference": "paper-conference",
    "phdthesis": "thesis",
    "mastersthesis": "thesis",
    "techreport": "report",
    "manual": "report",
    "unpublished": "manuscript",
    "online": "webpage",
    "misc": "document",
}

THESIS_GENRE = {"phdthesis": "Ph.D. Thesis", "mastersthesis": "M.S. Thesis"}


def _names(raw: str) -> List[Dict]:
    """'Family, Given and Given Family' -> [{'family','given'}], dropping BibTeX 'others'."""
    out = []
    for a in BibTeXProcessor.parse_authors(raw or ""):
        family = a.get("family", "").strip()
        if not family or family.lower() == "others":
            continue
        name = {"family": family}
        if a.get("given"):
            name["given"] = a["given"]
        out.append(name)
    return out


def entry_to_csl(entry: Dict, item_id: str, abbr: Optional[Dict] = None,
                 show_doi: bool = True, omit_title: bool = False) -> Dict:
    """One BibTeX-like dict -> one CSL-JSON item.

    abbr: lowercase full journal name -> abbreviation (None = Abbrev. Journal off).
          The abbreviation goes to container-title-short, so styles that ask for the
          short form use it and styles that print full names keep the full title.
    omit_title: drops the article title only (book / chapter titles are kept).
    """
    clean = BibTeXProcessor.clean_latex
    etype = entry.get("ENTRYTYPE", "article").lower()
    ctype = TYPE_MAP.get(etype, "document")
    item = {"id": item_id, "type": ctype}

    authors = _names(entry.get("author", ""))
    if authors:
        item["author"] = authors
    editors = _names(entry.get("editor", ""))
    if editors:
        item["editor"] = editors

    title = clean(entry.get("title", ""))
    if title and not (omit_title and ctype == "article-journal"):
        item["title"] = title

    container = clean(entry.get("journal", "")) or clean(entry.get("booktitle", ""))
    if container:
        item["container-title"] = container
        if abbr is not None:
            short = abbr.get(container.lower().strip())
            if short:
                item["container-title-short"] = short

    m = re.search(r"\d{4}", entry.get("year", "") or "")
    if m:
        item["issued"] = {"date-parts": [[int(m.group())]]}

    simple = {
        "volume": "volume",
        "number": "issue",
        "edition": "edition",
        "chapter": "chapter-number",
        "isbn": "ISBN",
    }
    for src, dst in simple.items():
        v = (entry.get(src, "") or "").strip()
        if v:
            item[dst] = v

    pages = (entry.get("pages", "") or "").strip()
    if pages:
        item["page"] = re.sub(r"\s*[–—]+\s*|\s*-{1,3}\s*", "-", pages)

    publisher = clean(entry.get("publisher", "")) or clean(entry.get("school", "")) \
        or clean(entry.get("institution", ""))
    if publisher:
        item["publisher"] = publisher
    place = clean(entry.get("address", ""))
    if place:
        item["publisher-place"] = place

    if etype in THESIS_GENRE:
        item["genre"] = THESIS_GENRE[etype]

    doi = (entry.get("doi", "") or "").strip()
    if show_doi and doi:
        item["DOI"] = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", doi, flags=re.IGNORECASE)

    return item


def entries_to_csl_json(entries: List[Dict], abbr: Optional[Dict] = None,
                        show_doi: bool = True, omit_title: bool = False) -> str:
    """List of entries (already reordered / author-swapped by the caller) -> CSL-JSON string."""
    items = [entry_to_csl(e, f"item{i}", abbr=abbr, show_doi=show_doi, omit_title=omit_title)
             for i, e in enumerate(entries, 1)]
    return json.dumps(items, ensure_ascii=False)
