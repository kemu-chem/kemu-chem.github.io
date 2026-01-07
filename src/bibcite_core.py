#!/usr/bin/env python3
"""
BibCite Core - Citation formatting logic
"""

import bibtexparser
from bibtexparser.bparser import BibTexParser
from bibtexparser.customization import convert_to_unicode
import re
from typing import List, Dict
from enum import Enum


class SortOrder(Enum):
    AUTHOR_ASC = "Author (A-Z)"
    AUTHOR_DESC = "Author (Z-A)"
    YEAR_ASC = "Year (Old→New)"
    YEAR_DESC = "Year (New→Old)"
    APPEARANCE = "Order of Appearance"


class RTFBuilder:
    """RTF formatting helper"""
    
    HEADER = r"{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0\fnil\fcharset0 Times New Roman;}}\viewkind4\uc1\pard\f0\fs24 "
    FOOTER = r"}"
    
    @staticmethod
    def escape(text: str) -> str:
        if not text:
            return ""
        text = text.replace("\\", "\\\\")
        text = text.replace("{", "\\{")
        text = text.replace("}", "\\}")
        result = []
        for char in text:
            if ord(char) > 127:
                result.append(f"\\u{ord(char)}?")
            else:
                result.append(char)
        return "".join(result)
    
    @staticmethod
    def italic(text: str) -> str:
        return f"{{\\i {RTFBuilder.escape(text)}}}"
    
    @staticmethod
    def bold(text: str) -> str:
        return f"{{\\b {RTFBuilder.escape(text)}}}"
    
    @staticmethod
    def superscript(text: str) -> str:
        return f"{{\\super {RTFBuilder.escape(text)}}}"
    
    @staticmethod
    def newline() -> str:
        return "\\par "
    
    @staticmethod
    def build_document(content: str) -> str:
        return f"{RTFBuilder.HEADER}{content}{RTFBuilder.FOOTER}"


class BibTeXProcessor:
    """BibTeX parsing and text cleaning"""
    
    @staticmethod
    def parse_bibtex(bibtex_string: str) -> List[Dict]:
        parser = BibTexParser(common_strings=True)
        parser.customization = convert_to_unicode
        try:
            bib_database = bibtexparser.loads(bibtex_string, parser=parser)
            return bib_database.entries
        except Exception as e:
            raise ValueError(f"BibTeX parsing error: {str(e)}")
    
    @staticmethod
    def clean_latex(text: str) -> str:
        if not text:
            return ""
        text = re.sub(r'\\textit\{([^}]*)\}', r'\1', text)
        text = re.sub(r'\\textbf\{([^}]*)\}', r'\1', text)
        text = re.sub(r'\\emph\{([^}]*)\}', r'\1', text)
        text = re.sub(r'\{\\em\s+([^}]*)\}', r'\1', text)
        text = re.sub(r'\{([^}]*)\}', r'\1', text)
        text = text.replace("\\&", "&")
        text = text.replace("~", " ")
        text = text.replace("--", "-")
        text = text.replace("---", "-")
        accent_map = {
            r"\'e": "é", r"\'a": "á", r"\'i": "í", r"\'o": "ó", r"\'u": "ú",
            r"\`e": "è", r"\`a": "à", r"\"o": "ö", r"\"u": "ü", r"\"a": "ä",
            r"\~n": "ñ", r"\c{c}": "ç", r"\ss": "ß"
        }
        for latex, char in accent_map.items():
            text = text.replace(latex, char)
        return text.strip()
    
    @staticmethod
    def parse_authors(author_string: str) -> List[Dict]:
        if not author_string:
            return []
        author_string = BibTeXProcessor.clean_latex(author_string)
        authors = []
        author_parts = re.split(r'\s+and\s+', author_string, flags=re.IGNORECASE)
        for author in author_parts:
            author = author.strip()
            if not author:
                continue
            if ',' in author:
                parts = author.split(',', 1)
                family = parts[0].strip()
                given = parts[1].strip() if len(parts) > 1 else ""
            else:
                parts = author.split()
                if len(parts) == 1:
                    family = parts[0]
                    given = ""
                else:
                    family = parts[-1]
                    given = " ".join(parts[:-1])
            authors.append({"family": family, "given": given})
        return authors


class AuthorFormatter:
    """Author name formatting for various styles"""
    
    @staticmethod
    def initials(given: str, separator: str = " ", trailing: str = ".") -> str:
        if not given:
            return ""
        parts = [n[0] + trailing for n in given.split() if n]
        return separator.join(parts)
    
    @staticmethod
    def acs(authors: List[Dict], max_n: int = 10, reverse_authors: bool = False) -> str:
        """ACS: Family, G. I.; Family, G. I."""
        if not authors:
            return ""
        fmt = []
        for a in authors[:max_n]:
            init = AuthorFormatter.initials(a.get("given", ""), " ", ".")
            fam = a.get("family", "")
            fmt.append(f"{fam}, {init}" if init else fam)
        if reverse_authors and len(fmt) >= 2:
            fmt[0], fmt[-1] = fmt[-1], fmt[0]
        if len(authors) > max_n:
            return "; ".join(fmt) + "; et al."
        return "; ".join(fmt)
    
    @staticmethod
    def apa(authors: List[Dict], max_n: int = 7, reverse_authors: bool = False) -> str:
        """APA: Family, G. I., & Family, G. I."""
        if not authors:
            return ""
        fmt = []
        for a in authors[:max_n]:
            init = AuthorFormatter.initials(a.get("given", ""), " ", ".")
            fam = a.get("family", "")
            fmt.append(f"{fam}, {init}" if init else fam)
        if reverse_authors and len(fmt) >= 2:
            fmt[0], fmt[-1] = fmt[-1], fmt[0]
        if len(authors) > max_n:
            return ", ".join(fmt[:6]) + ", ... " + fmt[-1]
        elif len(fmt) == 1:
            return fmt[0]
        elif len(fmt) == 2:
            return f"{fmt[0]} & {fmt[1]}"
        else:
            return ", ".join(fmt[:-1]) + ", & " + fmt[-1]
    
    @staticmethod
    def vancouver(authors: List[Dict], max_n: int = 6, reverse_authors: bool = False) -> str:
        """Vancouver: Family GI, Family GI"""
        if not authors:
            return ""
        fmt = []
        for a in authors[:max_n]:
            init = AuthorFormatter.initials(a.get("given", ""), "", "")
            fam = a.get("family", "")
            fmt.append(f"{fam} {init}" if init else fam)
        if reverse_authors and len(fmt) >= 2:
            fmt[0], fmt[-1] = fmt[-1], fmt[0]
        if len(authors) > max_n:
            return ", ".join(fmt) + ", et al."
        return ", ".join(fmt)
    
    @staticmethod
    def nature(authors: List[Dict], max_n: int = 5, reverse_authors: bool = False) -> str:
        """Nature: Family, G. I. & Family, G. I."""
        if not authors:
            return ""
        fmt = []
        for a in authors[:max_n]:
            init = AuthorFormatter.initials(a.get("given", ""), " ", ".")
            fam = a.get("family", "")
            fmt.append(f"{fam}, {init}" if init else fam)
        if reverse_authors and len(fmt) >= 2:
            fmt[0], fmt[-1] = fmt[-1], fmt[0]
        if len(authors) > max_n:
            return ", ".join(fmt) + " et al."
        elif len(fmt) == 1:
            return fmt[0]
        elif len(fmt) == 2:
            return f"{fmt[0]} & {fmt[1]}"
        else:
            return ", ".join(fmt[:-1]) + " & " + fmt[-1]
    
    @staticmethod
    def ieee(authors: List[Dict], max_n: int = 6, reverse_authors: bool = False) -> str:
        """IEEE: G. I. Family, G. I. Family, and G. I. Family"""
        if not authors:
            return ""
        fmt = []
        for a in authors[:max_n]:
            init = AuthorFormatter.initials(a.get("given", ""), " ", ".")
            fam = a.get("family", "")
            fmt.append(f"{init} {fam}" if init else fam)
        if reverse_authors and len(fmt) >= 2:
            fmt[0], fmt[-1] = fmt[-1], fmt[0]
        if len(authors) > max_n:
            return ", ".join(fmt) + ", et al."
        elif len(fmt) == 1:
            return fmt[0]
        elif len(fmt) == 2:
            return f"{fmt[0]} and {fmt[1]}"
        else:
            return ", ".join(fmt[:-1]) + ", and " + fmt[-1]
    
    @staticmethod
    def iso690(authors: List[Dict], max_n: int = 3, reverse_authors: bool = False) -> str:
        """ISO 690: FAMILY, Given"""
        if not authors:
            return ""
        fmt = []
        for a in authors[:max_n]:
            given = a.get("given", "")
            fam = a.get("family", "").upper()
            fmt.append(f"{fam}, {given}" if given else fam)
        if reverse_authors and len(fmt) >= 2:
            fmt[0], fmt[-1] = fmt[-1], fmt[0]
        if len(authors) > max_n:
            return ", ".join(fmt) + ", et al."
        return ", ".join(fmt)
    
    @staticmethod
    def harvard(authors: List[Dict], max_n: int = 3, reverse_authors: bool = False) -> str:
        """Harvard: Family, G.I., Family, G.I. and Family, G.I."""
        if not authors:
            return ""
        fmt = []
        for a in authors[:max_n]:
            # Harvard uses initials without spaces: G.I.
            given = a.get("given", "")
            if given:
                init = "".join([n[0] + "." for n in given.split() if n])
            else:
                init = ""
            fam = a.get("family", "")
            fmt.append(f"{fam}, {init}" if init else fam)
        if reverse_authors and len(fmt) >= 2:
            fmt[0], fmt[-1] = fmt[-1], fmt[0]
        if len(authors) > max_n:
            return ", ".join(fmt) + " et al."
        elif len(fmt) == 1:
            return fmt[0]
        elif len(fmt) == 2:
            return f"{fmt[0]} and {fmt[1]}"
        else:
            return ", ".join(fmt[:-1]) + " and " + fmt[-1]


class CitationFormatter:
    """Format citations in various journal styles"""
    
    @staticmethod
    def _get_fields(entry: Dict) -> Dict:
        """Extract and clean common fields"""
        return {
            'authors': BibTeXProcessor.parse_authors(entry.get("author", "")),
            'title': BibTeXProcessor.clean_latex(entry.get("title", "")),
            'journal': BibTeXProcessor.clean_latex(entry.get("journal", "")),
            'year': entry.get("year", ""),
            'volume': entry.get("volume", ""),
            'issue': entry.get("number", ""),
            'pages': entry.get("pages", "").replace("--", "–"),
            'doi': entry.get("doi", ""),
            'publisher': BibTeXProcessor.clean_latex(entry.get("publisher", "")),
            'address': BibTeXProcessor.clean_latex(entry.get("address", "")),
            'entry_type': entry.get("ENTRYTYPE", "article").lower(),
        }
        
    
    @staticmethod
    def format_acs(entry: Dict, idx: int = 0, max_n: int = None, omit_title: bool = False, reverse_authors: bool = False) -> tuple:
        """ACS style"""
        f = CitationFormatter._get_fields(entry)
        auth = AuthorFormatter.acs(f['authors'], max_n=max_n, reverse_authors=reverse_authors) if max_n is not None else AuthorFormatter.acs(f['authors'], reverse_authors=reverse_authors)

        if f['entry_type'] == "article":
            if omit_title:
                plain = f"{auth} {f['journal']} {f['year']}, {f['volume']}, {f['pages']}."
                if f['doi']:
                    plain += f" DOI: {f['doi']}"
                rtf = (RTFBuilder.escape(f"{auth} ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(f" {f['year']}, ") +
                       (RTFBuilder.italic(f['volume']) if f['volume'] else "") +
                       RTFBuilder.escape(f", {f['pages']}." if f['pages'] else "."))
                if f['doi']:
                    rtf += RTFBuilder.escape(f" DOI: {f['doi']}")
            else:
                plain = f"{auth} {f['title']}. {f['journal']} {f['year']}, {f['volume']}, {f['pages']}."
                if f['doi']:
                    plain += f" DOI: {f['doi']}"
                rtf = (RTFBuilder.escape(f"{auth} {f['title']}. ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(f" {f['year']}, ") +
                       (RTFBuilder.italic(f['volume']) if f['volume'] else "") +
                       RTFBuilder.escape(f", {f['pages']}." if f['pages'] else "."))
                if f['doi']:
                    rtf += RTFBuilder.escape(f" DOI: {f['doi']}")
        elif f['entry_type'] == "book":
            if omit_title:
                plain = f"{auth} {f['publisher']}: {f['address']}, {f['year']}."
                rtf = RTFBuilder.escape(plain)
            else:
                plain = f"{auth} {f['title']}; {f['publisher']}: {f['address']}, {f['year']}."
                rtf = (RTFBuilder.escape(f"{auth} ") +
                       RTFBuilder.italic(f['title']) +
                       RTFBuilder.escape(f"; {f['publisher']}: {f['address']}, {f['year']}."))
        else:
            if omit_title:
                plain = f"{auth} {f['year']}."
            else:
                plain = f"{auth} {f['title']}. {f['year']}."
            rtf = RTFBuilder.escape(plain)
        return plain.strip(), rtf.strip()
    
    @staticmethod
    def format_apa(entry: Dict, idx: int = 0, max_n: int = None, omit_title: bool = False, reverse_authors: bool = False) -> tuple:
        """APA 7th style"""
        f = CitationFormatter._get_fields(entry)
        auth = AuthorFormatter.apa(f['authors'], max_n=max_n, reverse_authors=reverse_authors) if max_n is not None else AuthorFormatter.apa(f['authors'], reverse_authors=reverse_authors)
        vol_issue = f"{f['volume']}({f['issue']})" if f['issue'] else f['volume']

        if f['entry_type'] == "article":
            if omit_title:
                plain = f"{auth} ({f['year']}). {f['journal']}, {vol_issue}, {f['pages']}."
                if f['doi']:
                    plain += f" https://doi.org/{f['doi']}"
                rtf = (RTFBuilder.escape(f"{auth} ({f['year']}). ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(", ") +
                       (RTFBuilder.italic(vol_issue) if vol_issue else "") +
                       RTFBuilder.escape(f", {f['pages']}." if f['pages'] else "."))
                if f['doi']:
                    rtf += RTFBuilder.escape(f" https://doi.org/{f['doi']}")
            else:
                plain = f"{auth} ({f['year']}). {f['title']}. {f['journal']}, {vol_issue}, {f['pages']}."
                if f['doi']:
                    plain += f" https://doi.org/{f['doi']}"
                rtf = (RTFBuilder.escape(f"{auth} ({f['year']}). {f['title']}. ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(", ") +
                       (RTFBuilder.italic(vol_issue) if vol_issue else "") +
                       RTFBuilder.escape(f", {f['pages']}." if f['pages'] else "."))
                if f['doi']:
                    rtf += RTFBuilder.escape(f" https://doi.org/{f['doi']}")
        elif f['entry_type'] == "book":
            if omit_title:
                plain = f"{auth} ({f['year']}). {f['publisher']}."
                rtf = RTFBuilder.escape(plain)
            else:
                plain = f"{auth} ({f['year']}). {f['title']}. {f['publisher']}."
                rtf = (RTFBuilder.escape(f"{auth} ({f['year']}). ") +
                       RTFBuilder.italic(f['title']) +
                       RTFBuilder.escape(f". {f['publisher']}."))
        else:
            if omit_title:
                plain = f"{auth} ({f['year']})."
            else:
                plain = f"{auth} ({f['year']}). {f['title']}."
            rtf = RTFBuilder.escape(plain)
        return plain.strip(), rtf.strip()
    
    @staticmethod
    def format_vancouver(entry: Dict, idx: int = 1, max_n: int = None, omit_title: bool = False, reverse_authors: bool = False) -> tuple:
        """Vancouver style"""
        f = CitationFormatter._get_fields(entry)
        auth = AuthorFormatter.vancouver(f['authors'], max_n=max_n, reverse_authors=reverse_authors) if max_n is not None else AuthorFormatter.vancouver(f['authors'], reverse_authors=reverse_authors)
        pages = f['pages'].replace("–", "-")
        vol_issue = f"{f['volume']}({f['issue']})" if f['issue'] else f['volume']

        if f['entry_type'] == "article":
            if omit_title:
                plain = f"{idx}. {auth}. {f['journal']}. {f['year']};{vol_issue}:{pages}."
                rtf = (RTFBuilder.escape(f"{idx}. {auth}. ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(f". {f['year']};{vol_issue}:{pages}."))
            else:
                plain = f"{idx}. {auth}. {f['title']}. {f['journal']}. {f['year']};{vol_issue}:{pages}."
                rtf = (RTFBuilder.escape(f"{idx}. {auth}. {f['title']}. ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(f". {f['year']};{vol_issue}:{pages}."))
        else:
            if omit_title:
                plain = f"{idx}. {auth}. {f['year']}."
            else:
                plain = f"{idx}. {auth}. {f['title']}. {f['year']}."
            rtf = RTFBuilder.escape(plain)
        return plain.strip(), rtf.strip()
    
    @staticmethod
    def format_angewandte(entry: Dict, idx: int = 0, max_n: int = None, omit_title: bool = False, reverse_authors: bool = False) -> tuple:
        """Angewandte Chemie style"""
        f = CitationFormatter._get_fields(entry)
        auth = AuthorFormatter.nature(f['authors'], max_n=max_n, reverse_authors=reverse_authors) if max_n is not None else AuthorFormatter.nature(f['authors'], reverse_authors=reverse_authors)

        if f['entry_type'] == "article":
            plain = f"{auth}, {f['journal']} {f['year']}, {f['volume']}, {f['pages']}."
            if f['doi']:
                plain += f" DOI: {f['doi']}"
            rtf = (RTFBuilder.escape(f"{auth}, ") +
                   RTFBuilder.italic(f['journal']) +
                   RTFBuilder.escape(f" {f['year']}, ") +
                   RTFBuilder.italic(f['volume']) +
                   RTFBuilder.escape(f", {f['pages']}."))
            if f['doi']:
                rtf += RTFBuilder.escape(f" DOI: {f['doi']}")
        elif f['entry_type'] == "book":
            if omit_title:
                plain = f"{auth}, {f['publisher']}, {f['address']}, {f['year']}."
                rtf = RTFBuilder.escape(plain)
            else:
                plain = f"{auth}, {f['title']}, {f['publisher']}, {f['address']}, {f['year']}."
                rtf = (RTFBuilder.escape(f"{auth}, ") +
                       RTFBuilder.italic(f['title']) +
                       RTFBuilder.escape(f", {f['publisher']}, {f['address']}, {f['year']}."))
        else:
            if omit_title:
                plain = f"{auth}, {f['year']}."
            else:
                plain = f"{auth}, {f['title']}, {f['year']}."
            rtf = RTFBuilder.escape(plain)
        return plain.strip(), rtf.strip()
    
    @staticmethod
    def format_rsc(entry: Dict, idx: int = 0, max_n: int = None, omit_title: bool = False, reverse_authors: bool = False) -> tuple:
        """RSC style"""
        f = CitationFormatter._get_fields(entry)
        auth = AuthorFormatter.nature(f['authors'], max_n=max_n, reverse_authors=reverse_authors) if max_n is not None else AuthorFormatter.nature(f['authors'], reverse_authors=reverse_authors)

        if f['entry_type'] == "article":
            plain = f"{auth}, {f['journal']}, {f['year']}, {f['volume']}, {f['pages']}."
            if f['doi']:
                plain += f" DOI: {f['doi']}"
            rtf = (RTFBuilder.escape(f"{auth}, ") +
                   RTFBuilder.italic(f['journal']) +
                   RTFBuilder.escape(f", {f['year']}, ") +
                   RTFBuilder.bold(f['volume']) +
                   RTFBuilder.escape(f", {f['pages']}."))
            if f['doi']:
                rtf += RTFBuilder.escape(f" DOI: {f['doi']}")
        elif f['entry_type'] == "book":
            if omit_title:
                plain = f"{auth}, {f['publisher']}, {f['year']}."
                rtf = RTFBuilder.escape(plain)
            else:
                plain = f"{auth}, {f['title']}, {f['publisher']}, {f['year']}."
                rtf = (RTFBuilder.escape(f"{auth}, ") +
                       RTFBuilder.italic(f['title']) +
                       RTFBuilder.escape(f", {f['publisher']}, {f['year']}."))
        else:
            if omit_title:
                plain = f"{auth}, {f['year']}."
            else:
                plain = f"{auth}, {f['title']}, {f['year']}."
            rtf = RTFBuilder.escape(plain)
        return plain.strip(), rtf.strip()
    
    @staticmethod
    def format_aoa(entry: Dict, idx: int = 0, max_n: int = None, omit_title: bool = False, reverse_authors: bool = False) -> tuple:
        """AoA (Accounts of Chemical Research) style"""
        f = CitationFormatter._get_fields(entry)
        auth = AuthorFormatter.acs(f['authors'], max_n=max_n, reverse_authors=reverse_authors) if max_n is not None else AuthorFormatter.acs(f['authors'], reverse_authors=reverse_authors)

        if f['entry_type'] == "article":
            if omit_title:
                plain = f"{auth} {f['journal']} {f['year']}, {f['volume']}, {f['pages']}."
                if f['doi']:
                    plain += f" https://doi.org/{f['doi']}"
                rtf = (RTFBuilder.escape(f"{auth} ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(" ") +
                       RTFBuilder.bold(f['year']) +
                       RTFBuilder.escape(", ") +
                       RTFBuilder.italic(f['volume']) +
                       RTFBuilder.escape(f", {f['pages']}."))
                if f['doi']:
                    rtf += RTFBuilder.escape(f" https://doi.org/{f['doi']}")
            else:
                plain = f"{auth} {f['title']}. {f['journal']} {f['year']}, {f['volume']}, {f['pages']}."
                if f['doi']:
                    plain += f" https://doi.org/{f['doi']}"
                rtf = (RTFBuilder.escape(f"{auth} {f['title']}. ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(" ") +
                       RTFBuilder.bold(f['year']) +
                       RTFBuilder.escape(", ") +
                       RTFBuilder.italic(f['volume']) +
                       RTFBuilder.escape(f", {f['pages']}."))
                if f['doi']:
                    rtf += RTFBuilder.escape(f" https://doi.org/{f['doi']}")
        else:
            if omit_title:
                plain = f"{auth} {f['year']}."
            else:
                plain = f"{auth} {f['title']}. {f['year']}."
            rtf = RTFBuilder.escape(plain)
        return plain.strip(), rtf.strip()
    
    @staticmethod
    def format_nature(entry: Dict, idx: int = 1, max_n: int = None, omit_title: bool = False, reverse_authors: bool = False) -> tuple:
        """Nature style"""
        f = CitationFormatter._get_fields(entry)
        auth = AuthorFormatter.nature(f['authors'], max_n=max_n, reverse_authors=reverse_authors) if max_n is not None else AuthorFormatter.nature(f['authors'], reverse_authors=reverse_authors)

        if f['entry_type'] == "article":
            if omit_title:
                plain = f"{idx}. {auth} {f['journal']} {f['volume']}, {f['pages']} ({f['year']})."
                if f['doi']:
                    plain += f" https://doi.org/{f['doi']}"
                rtf = (RTFBuilder.escape(f"{idx}. {auth} ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(" ") +
                       RTFBuilder.bold(f['volume']) +
                       RTFBuilder.escape(f", {f['pages']} ({f['year']})."))
                if f['doi']:
                    rtf += RTFBuilder.escape(f" https://doi.org/{f['doi']}")
            else:
                plain = f"{idx}. {auth} {f['title']}. {f['journal']} {f['volume']}, {f['pages']} ({f['year']})."
                if f['doi']:
                    plain += f" https://doi.org/{f['doi']}"
                rtf = (RTFBuilder.escape(f"{idx}. {auth} {f['title']}. ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(" ") +
                       RTFBuilder.bold(f['volume']) +
                       RTFBuilder.escape(f", {f['pages']} ({f['year']})."))
                if f['doi']:
                    rtf += RTFBuilder.escape(f" https://doi.org/{f['doi']}")
        elif f['entry_type'] == "book":
            if omit_title:
                plain = f"{idx}. {auth} ({f['publisher']}, {f['year']})."
                rtf = RTFBuilder.escape(plain)
            else:
                plain = f"{idx}. {auth} {f['title']} ({f['publisher']}, {f['year']})."
                rtf = (RTFBuilder.escape(f"{idx}. {auth} ") +
                       RTFBuilder.italic(f['title']) +
                       RTFBuilder.escape(f" ({f['publisher']}, {f['year']})."))
        else:
            if omit_title:
                plain = f"{idx}. {auth} ({f['year']})."
            else:
                plain = f"{idx}. {auth} {f['title']} ({f['year']})."
            rtf = RTFBuilder.escape(plain)
        return plain.strip(), rtf.strip()
    
    @staticmethod
    def format_ieee(entry: Dict, idx: int = 1, max_n: int = None, omit_title: bool = False, reverse_authors: bool = False) -> tuple:
        """IEEE style"""
        f = CitationFormatter._get_fields(entry)
        auth = AuthorFormatter.ieee(f['authors'], max_n=max_n, reverse_authors=reverse_authors) if max_n is not None else AuthorFormatter.ieee(f['authors'], reverse_authors=reverse_authors)

        if f['entry_type'] == "article":
            parts = []
            if f['volume']:
                parts.append(f"vol. {f['volume']}")
            if f['issue']:
                parts.append(f"no. {f['issue']}")
            if f['pages']:
                parts.append(f"pp. {f['pages']}")
            detail = ", ".join(parts)

            if omit_title:
                plain = f"[{idx}] {auth}, {f['journal']}, {detail}, {f['year']}."
                rtf = (RTFBuilder.escape(f"[{idx}] {auth}, ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(f", {detail}, {f['year']}."))
            else:
                plain = f"[{idx}] {auth}, \"{f['title']},\" {f['journal']}, {detail}, {f['year']}."
                rtf = (RTFBuilder.escape(f"[{idx}] {auth}, \"{f['title']},\" ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(f", {detail}, {f['year']}."))
        elif f['entry_type'] == "book":
            if omit_title:
                plain = f"[{idx}] {auth}, {f['address']}: {f['publisher']}, {f['year']}."
                rtf = RTFBuilder.escape(plain)
            else:
                plain = f"[{idx}] {auth}, {f['title']}. {f['address']}: {f['publisher']}, {f['year']}."
                rtf = (RTFBuilder.escape(f"[{idx}] {auth}, ") +
                       RTFBuilder.italic(f['title']) +
                       RTFBuilder.escape(f". {f['address']}: {f['publisher']}, {f['year']}."))
        else:
            if omit_title:
                plain = f"[{idx}] {auth}, {f['year']}."
            else:
                plain = f"[{idx}] {auth}, \"{f['title']},\" {f['year']}."
            rtf = RTFBuilder.escape(plain)
        return plain.strip(), rtf.strip()
    
    @staticmethod
    def format_iso690(entry: Dict, idx: int = 1, max_n: int = None, omit_title: bool = False, reverse_authors: bool = False) -> tuple:
        """ISO 690 style"""
        f = CitationFormatter._get_fields(entry)
        auth = AuthorFormatter.iso690(f['authors'], max_n=max_n, reverse_authors=reverse_authors) if max_n is not None else AuthorFormatter.iso690(f['authors'], reverse_authors=reverse_authors)
        vol_issue = f"{f['volume']}({f['issue']})" if f['issue'] else f['volume']

        if f['entry_type'] == "article":
            if omit_title:
                plain = f"[{idx}] {auth}. {f['journal']}. {f['year']}, {vol_issue}, {f['pages']}."
                if f['doi']:
                    plain += f" DOI: {f['doi']}"
                rtf = (RTFBuilder.escape(f"[{idx}] {auth}. ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(f". {f['year']}, {vol_issue}, {f['pages']}."))
                if f['doi']:
                    rtf += RTFBuilder.escape(f" DOI: {f['doi']}")
            else:
                plain = f"[{idx}] {auth}. {f['title']}. {f['journal']}. {f['year']}, {vol_issue}, {f['pages']}."
                if f['doi']:
                    plain += f" DOI: {f['doi']}"
                rtf = (RTFBuilder.escape(f"[{idx}] {auth}. {f['title']}. ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(f". {f['year']}, {vol_issue}, {f['pages']}."))
                if f['doi']:
                    rtf += RTFBuilder.escape(f" DOI: {f['doi']}")
        elif f['entry_type'] == "book":
            isbn = entry.get("isbn", "")
            if omit_title:
                plain = f"[{idx}] {auth}. {f['address']}: {f['publisher']}, {f['year']}."
                if isbn:
                    plain += f" ISBN {isbn}."
                rtf = RTFBuilder.escape(plain)
            else:
                plain = f"[{idx}] {auth}. {f['title']}. {f['address']}: {f['publisher']}, {f['year']}."
                if isbn:
                    plain += f" ISBN {isbn}."
                rtf = (RTFBuilder.escape(f"[{idx}] {auth}. ") +
                       RTFBuilder.italic(f['title']) +
                       RTFBuilder.escape(f". {f['address']}: {f['publisher']}, {f['year']}."))
                if isbn:
                    rtf += RTFBuilder.escape(f" ISBN {isbn}.")
        else:
            if omit_title:
                plain = f"[{idx}] {auth}. {f['year']}."
            else:
                plain = f"[{idx}] {auth}. {f['title']}. {f['year']}."
            rtf = RTFBuilder.escape(plain)
        return plain.strip(), rtf.strip()
    
    @staticmethod
    def format_harvard(entry: Dict, idx: int = 0, max_n: int = None, omit_title: bool = False, reverse_authors: bool = False) -> tuple:
        """Harvard style"""
        f = CitationFormatter._get_fields(entry)
        auth = AuthorFormatter.harvard(f['authors'], max_n=max_n, reverse_authors=reverse_authors) if max_n is not None else AuthorFormatter.harvard(f['authors'], reverse_authors=reverse_authors)

        if f['entry_type'] == "article":
            # Harvard: Author (Year) 'Title', Journal, Volume(Issue), Pages.
            vol_issue = f"{f['volume']}({f['issue']})" if f['issue'] else f['volume']
            if omit_title:
                plain = f"{auth} ({f['year']}) {f['journal']}, {vol_issue}, pp. {f['pages']}."
                if f['doi']:
                    plain += f" doi: {f['doi']}"
                rtf = (RTFBuilder.escape(f"{auth} ({f['year']}) ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(f", {vol_issue}, pp. {f['pages']}."))
                if f['doi']:
                    rtf += RTFBuilder.escape(f" doi: {f['doi']}")
            else:
                plain = f"{auth} ({f['year']}) '{f['title']}', {f['journal']}, {vol_issue}, pp. {f['pages']}."
                if f['doi']:
                    plain += f" doi: {f['doi']}"
                rtf = (RTFBuilder.escape(f"{auth} ({f['year']}) '{f['title']}', ") +
                       RTFBuilder.italic(f['journal']) +
                       RTFBuilder.escape(f", {vol_issue}, pp. {f['pages']}."))
                if f['doi']:
                    rtf += RTFBuilder.escape(f" doi: {f['doi']}")
        elif f['entry_type'] == "book":
            # Harvard book: Author (Year) Title. Edition. Place: Publisher.
            edition = entry.get("edition", "")
            edition_str = f" {edition} edn." if edition else ""
            if omit_title:
                plain = f"{auth} ({f['year']}).{edition_str} {f['address']}: {f['publisher']}."
                rtf = RTFBuilder.escape(plain)
            else:
                plain = f"{auth} ({f['year']}) {f['title']}.{edition_str} {f['address']}: {f['publisher']}."
                rtf = (RTFBuilder.escape(f"{auth} ({f['year']}) ") +
                       RTFBuilder.italic(f['title']) +
                       RTFBuilder.escape(f".{edition_str} {f['address']}: {f['publisher']}."))
        else:
            if omit_title:
                plain = f"{auth} ({f['year']})."
            else:
                plain = f"{auth} ({f['year']}) '{f['title']}'."
            rtf = RTFBuilder.escape(plain)
        return plain.strip(), rtf.strip()

class HTMLBuilder:
    """HTML formatting helper for web display"""
    @staticmethod
    def italic(text: str) -> str:
        return f"<i>{text}</i>"
    
    @staticmethod
    def bold(text: str) -> str:
        return f"<b>{text}</b>"
    
    @staticmethod
    def superscript(text: str) -> str:
        return f"<sup>{text}</sup>"

class InTextFormatter:
    """In-text citation formatting"""
    
    @staticmethod
    def get_author_year(entry: Dict) -> tuple:
        authors = BibTeXProcessor.parse_authors(entry.get("author", ""))
        year = entry.get("year", "")
        if not authors:
            return "Unknown", year
        if len(authors) == 1:
            auth = authors[0]["family"]
        elif len(authors) == 2:
            auth = f"{authors[0]['family']} & {authors[1]['family']}"
        else:
            auth = f"{authors[0]['family']} et al."
        return auth, year
    
    @staticmethod
    def author_year(entry: Dict, idx: int = 0) -> tuple:
        auth, year = InTextFormatter.get_author_year(entry)
        plain = f"({auth}, {year})"
        return plain, RTFBuilder.escape(plain)
    
    @staticmethod
    def author_year_narrative(entry: Dict, idx: int = 0) -> tuple:
        auth, year = InTextFormatter.get_author_year(entry)
        plain = f"{auth} ({year})"
        return plain, RTFBuilder.escape(plain)
    
    @staticmethod
    def numbered(entry: Dict, idx: int = 1) -> tuple:
        plain = f"[{idx}]"
        return plain, RTFBuilder.escape(plain)
    
    @staticmethod
    def superscript(entry: Dict, idx: int = 1) -> tuple:
        return str(idx), RTFBuilder.superscript(str(idx))


# Style registries
REFERENCE_STYLES = {
    "ACS": CitationFormatter.format_acs,
    "APA (7th)": CitationFormatter.format_apa,
    "Harvard": CitationFormatter.format_harvard,
    "Vancouver": CitationFormatter.format_vancouver,
    "Angewandte": CitationFormatter.format_angewandte,
    "RSC": CitationFormatter.format_rsc,
    "AoA": CitationFormatter.format_aoa,
    "Nature": CitationFormatter.format_nature,
    "IEEE": CitationFormatter.format_ieee,
    "ISO 690": CitationFormatter.format_iso690,
}

INTEXT_STYLES = {
    "(Author, Year)": InTextFormatter.author_year,
    "Author (Year)": InTextFormatter.author_year_narrative,
    "[n]": InTextFormatter.numbered,
    "Superscript": InTextFormatter.superscript,
}


if __name__ == "__main__":
    # Test
    bib = open('sample.bib').read()
    entries = BibTeXProcessor.parse_bibtex(bib)
    print(f"Parsed {len(entries)} entries\n")
    print(entries)
    for style_name, formatter in REFERENCE_STYLES.items():
        print(f"=== {style_name} ===")
        for i, e in enumerate(entries[:2], 1):
            plain, rtf = formatter(e, i)
            print(plain)
        print()