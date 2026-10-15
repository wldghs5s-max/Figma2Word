import zipfile
import re

with zipfile.ZipFile(r'완성본-20261012\report-1차-진단-편집가능-Word보정-v3.docx', 'r') as z:
    doc = z.read('word/document.xml').decode('utf-8')

# Search for section breaks
sect_prs = re.findall(r'<w:sectPr\b[\s\S]*?<\/w:sectPr>', doc)
print(f"Ref DOCX sectPr count: {len(sect_prs)}")

# Check top-level paragraphs
paragraphs = re.findall(r'<w:p\b[\s\S]*?<\/w:p>', doc)
print(f"Ref DOCX total <w:p>: {len(paragraphs)}")

# Check margin-top of shapes in Ref DOCX
tops = []
for m in re.finditer(r'margin-top:([0-9.]+)pt', doc):
    tops.append(float(m.group(1)))

print(f"Total shapes with margin-top: {len(tops)}")
print(f"Min margin-top: {min(tops):.1f}pt, Max margin-top: {max(tops):.1f}pt")

# Histogram of margin-top in 842pt intervals (A4 page height is ~841.89pt)
page_height = 841.89
page_dist = {}
for t in tops:
    page_num = int(t // page_height) + 1
    page_dist[page_num] = page_dist.get(page_num, 0) + 1

print("\nRef DOCX Shape distribution across A4 height multiples (continuous coordinate space):")
for p, count in sorted(page_dist.items()):
    print(f"  A4 Page {p} (Y={ (p-1)*842 }..{ p*842 }pt): {count} shapes")
