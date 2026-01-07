import json
import asyncio
try:
    from pyodide.http import pyfetch
except ImportError:
    # Fallback for local testing or non-PyScript environments
    pass

class DOIProcessor:
    """Class to fetch and parse metadata from Crossref API using DOIs."""

    @staticmethod
    async def fetch_doi_entries(doi_input):
        """
        Fetch metadata for DOIs using Crossref API.
        
        Args:
            doi_input (str): Single DOI or multiline string of DOIs.
            
        Returns:
            list: List of BibTeX-like dictionaries.
        """
        entries = []
        # Split by newlines and filter empty lines
        dois = [line.strip() for line in doi_input.split('\n') if line.strip()]
        
        for i, doi in enumerate(dois):
            # Respectful delay for API
            if i > 0:
                await asyncio.sleep(1)
            # Basic cleanup for common DOI formats (e.g., full URL)
            clean_doi = doi
            if "doi.org/" in clean_doi:
                clean_doi = clean_doi.split("doi.org/")[-1]
            clean_doi = clean_doi.strip()
            
            if not clean_doi:
                continue

            # Crossref API URL
            url = f"https://api.crossref.org/works/{clean_doi}"
            
            try:
                # Use pyfetch for async request in PyScript
                # Using method="GET" by default
                response = await pyfetch(url)
                
                if response.status == 200:
                    data = await response.json()
                    item = data.get('message', {})
                    entry = DOIProcessor._parse_crossref_json(item)
                    if entry:
                        entries.append(entry)
                else:
                    print(f"Failed to fetch {clean_doi}: {response.status}")
            except Exception as e:
                print(f"Error fetching DOI {clean_doi}: {e}")
                
        return entries

    @staticmethod
    def _parse_crossref_json(item):
        """Convert Crossref JSON item to internal BibTeX-like dictionary."""
        entry = {}
        
        # Entry Type Mapping
        # Crossref types: journal-article, book-chapter, book, proceedings-article, etc.
        c_type = item.get('type', 'journal-article')
        if c_type == 'journal-article':
            entry['ENTRYTYPE'] = 'article'
        elif c_type == 'book-chapter':
            entry['ENTRYTYPE'] = 'inbook'
        elif c_type == 'book':
            entry['ENTRYTYPE'] = 'book'
        elif 'proceedings' in c_type:
            entry['ENTRYTYPE'] = 'inproceedings'
        else:
            entry['ENTRYTYPE'] = 'misc' # Default fallback
            
        # Title
        if item.get('title'):
            # Crossref returns a list of titles
            entry['title'] = item['title'][0]
            
        # Authors
        if 'author' in item:
            authors_list = []
            for author in item['author']:
                given = author.get('given', '')
                family = author.get('family', '')
                if family and given:
                    authors_list.append(f"{family}, {given}")
                elif family:
                    authors_list.append(family)
                elif author.get('name'): # Organization or other name
                    authors_list.append(author['name'])
            
            if authors_list:
                entry['author'] = ' and '.join(authors_list)
            
        # Journal / Container Title
        if item.get('container-title'):
            entry['journal'] = item['container-title'][0]
        
        # Year
        # Check published-print, then published-online, then issued
        date_parts = None
        if 'published-print' in item:
            date_parts = item['published-print']['date-parts']
        elif 'published-online' in item:
            date_parts = item['published-online']['date-parts']
        elif 'created' in item:
            date_parts = item['created']['date-parts']
            
        if date_parts and len(date_parts) > 0 and len(date_parts[0]) > 0:
            entry['year'] = str(date_parts[0][0])
            
        # Volume
        if 'volume' in item:
            entry['volume'] = str(item['volume'])
            
        # Issue / Number
        if 'issue' in item:
            entry['number'] = str(item['issue'])
            
        # Pages
        if 'page' in item:
            entry['pages'] = str(item['page'])
            
        # DOI
        if 'DOI' in item:
            entry['doi'] = item['DOI']
            
        # Publisher
        if 'publisher' in item:
            entry['publisher'] = item['publisher']
            
        return entry
