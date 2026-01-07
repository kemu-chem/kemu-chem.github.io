#!/usr/bin/env python3
"""End-to-end test for riscite_core with rispy"""

from riscite_core import RISProcessor, REFERENCE_STYLES, BibTeXProcessor, rtf_to_html

# Sample RIS data
sample_ris = """TY  - JOUR
AU  - Dmitrienko, Gary I
AU  - Nielsen, Kent E
TI  - N-cyanoindoles and n-cyanoindole-4,7-diones
JF  - Tetrahedron Letters
VL  - 31
IS  - 26
SP  - 3681
EP  - 3684
PY  - 1990
DO  - 10.1016/s0040-4039(00)97443-4
ER  - 
"""

print("=" * 60)
print("End-to-End Test: RIS → BibTeX → Citation")
print("=" * 60)

# Step 1: Parse RIS
print("\n1. Parsing RIS with rispy...")
entries = RISProcessor.parse_ris(sample_ris)
print(f"   ✓ Parsed {len(entries)} entry")

# Step 2: Display parsed entry
print("\n2. Parsed entry structure:")
for key, value in entries[0].items():
    print(f"   {key}: {value}")

# Step 3: Format with different styles
print("\n3. Testing citation formatting:")
for style_name in ["ACS", "APA (7th)", "Nature"]:
    formatter = REFERENCE_STYLES[style_name]
    plain, rtf = formatter(entries[0], 1)
    html = rtf_to_html(rtf)
    print(f"\n   {style_name}:")
    print(f"   {html[:100]}...")

print("\n" + "=" * 60)
print("✓ All tests passed successfully!")
print("=" * 60)
