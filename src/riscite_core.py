import re
import rispy
from io import StringIO

# Import necessary components from bibcite_core
from src.bibcite_core import REFERENCE_STYLES, BibTeXProcessor

def rtf_to_html(rtf_text):
    """Convert RTF formatting to HTML for web display"""
    # Remove RTF header and footer
    rtf_text = re.sub(r'^\{\\rtf.*?\\fs24\s*', '', rtf_text)
    rtf_text = re.sub(r'\}$', '', rtf_text)
    
    # Convert RTF formatting to HTML
    rtf_text = re.sub(r'\{\\i\s+(.*?)\}', r'<i>\1</i>', rtf_text)
    rtf_text = re.sub(r'\{\\b\s+(.*?)\}', r'<b>\1</b>', rtf_text)
    rtf_text = re.sub(r'\{\\super\s+(.*?)\}', r'<sup>\1</sup>', rtf_text)
    rtf_text = re.sub(r'\\par\s*', '<br>', rtf_text)
    
    # Handle unicode characters (e.g. \u946?)
    rtf_text = re.sub(r'\\u(\d+)\?', lambda m: chr(int(m.group(1))), rtf_text)
    
    # Clean up remaining RTF codes
    rtf_text = re.sub(r'\\[a-z]+\d*\s*', '', rtf_text)
    rtf_text = rtf_text.replace('\\\\', '\\').replace('\\{', '{').replace('\\}', '}')
    
    return rtf_text.strip()

class RISProcessor:
    """RIS形式をBibTeX風辞書に変換するアダプター (rispy使用)"""
    
    # RIS entry types to BibTeX entry types mapping
    TYPE_MAP = {
        'JOUR': 'article',
        'BOOK': 'book',
        'CHAP': 'inbook',
        'CONF': 'inproceedings',
        'THES': 'phdthesis',
        'RPRT': 'techreport',
        'UNPB': 'unpublished',
    }
    
    @staticmethod
    def parse_ris(ris_str):
        """
        rispy を使用してRIS形式を解析し、BibTeX互換の辞書リストに変換
        
        Args:
            ris_str: RIS形式の文字列
            
        Returns:
            BibTeX互換の辞書のリスト
        """
        entries = []
        
        try:
            # rispy.loads() を使用してRISを解析
            # StringIOを使ってファイルライクオブジェクトとして扱う
            ris_file = StringIO(ris_str)
            ris_entries = rispy.load(ris_file)
            
            # 各エントリをBibTeX形式に変換
            for ris_entry in ris_entries:
                bib_entry = {}
                
                # Entry type (TY field)
                ris_type = ris_entry.get('type_of_reference', 'JOUR')
                bib_entry['ENTRYTYPE'] = RISProcessor.TYPE_MAP.get(ris_type, 'article')
                
                # Title (TI or T1)
                if 'title' in ris_entry or 'primary_title' in ris_entry:
                    bib_entry['title'] = ris_entry.get('title') or ris_entry.get('primary_title', '')
                
                # Authors (AU) - rispy returns a list
                if 'authors' in ris_entry and ris_entry['authors']:
                    bib_entry['author'] = ' and '.join(ris_entry['authors'])
                
                # Journal (JO, JF, T2)
                journal = (ris_entry.get('journal_name') or 
                          ris_entry.get('alternate_title1') or 
                          ris_entry.get('secondary_title', ''))
                if journal:
                    bib_entry['journal'] = journal
                
                # Year (PY, Y1)
                if 'year' in ris_entry:
                    bib_entry['year'] = str(ris_entry['year'])
                elif 'publication_year' in ris_entry:
                    bib_entry['year'] = str(ris_entry['publication_year'])
                
                # Volume (VL)
                if 'volume' in ris_entry:
                    bib_entry['volume'] = str(ris_entry['volume'])
                
                # Issue/Number (IS)
                if 'number' in ris_entry:
                    bib_entry['number'] = str(ris_entry['number'])
                
                # Pages (SP and EP)
                start_page = ris_entry.get('start_page', '')
                end_page = ris_entry.get('end_page', '')
                if start_page and end_page:
                    bib_entry['pages'] = f"{start_page}--{end_page}"
                elif start_page:
                    bib_entry['pages'] = str(start_page)
                
                # DOI
                if 'doi' in ris_entry:
                    bib_entry['doi'] = ris_entry['doi']
                
                # Publisher (PB)
                if 'publisher' in ris_entry:
                    bib_entry['publisher'] = ris_entry['publisher']
                
                # Address (AD, CY)
                if 'place_published' in ris_entry:
                    bib_entry['address'] = ris_entry['place_published']
                
                entries.append(bib_entry)
                
        except Exception as e:
            # rispy解析エラー時は空リストを返す
            print(f"RIS parsing error: {e}")
            return []
        
        return entries
