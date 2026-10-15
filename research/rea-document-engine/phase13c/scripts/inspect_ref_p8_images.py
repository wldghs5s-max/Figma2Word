import zipfile
import re

with zipfile.ZipFile(r'완성본-20261012\report-2차-경과-편집가능-Word보정-v3.docx', 'r') as z:
    ref_doc = z.read('word/document.xml').decode('utf-8')
    ref_rels = z.read('word/_rels/document.xml.rels').decode('utf-8')

# Find paragraph 7 (page 8)
# Split by page breaks
pages = re.split(r'<w:pageBreakBefore[^>]*>', ref_doc)
print(f"Ref total pages: {len(pages)}")

p8 = pages[7]
print(f"Ref Page 8 XML length: {len(p8)}")
# Find all imagedata r:id
imgs = re.findall(r'<v:imagedata\s+r:id="([^"]+)"', p8)
print(f"Ref Page 8 imagedata r:ids: {imgs}")

for rId in imgs:
    m = re.search(r'<Relationship\s+Id="' + rId + r'"[^>]*Target="([^"]+)"', ref_rels)
    target = m.group(1) if m else "unknown"
    print(f"  {rId} -> {target}")

