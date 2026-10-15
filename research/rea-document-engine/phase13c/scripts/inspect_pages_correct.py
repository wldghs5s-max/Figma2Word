import zipfile
import re

with zipfile.ZipFile('debug/canvas-audit/report-2-canvas.docx') as z:
    doc_xml = z.read('word/document.xml').decode('utf-8')

# The document body has <w:body> ... </w:body>
body_match = re.search(r'<w:body>([\s\S]*?)<\/w:body>', doc_xml)
body = body_match.group(1)

# Split by top-level <w:p> that starts a page: <w:p>\s*<w:pPr>\s*<w:pageBreakBefore
# Or we can split by <w:pageBreakBefore
page_splits = re.split(r'<w:pageBreakBefore[^>]*>', body)
print(f"Top-level pages found: {len(page_splits)}")

for idx, p_xml in enumerate(page_splits):
    images = re.findall(r'<v:imagedata\b[^>]*>', p_xml)
    shapes = re.findall(r'<v:(rect|shape|roundrect|line)\b[^>]*>', p_xml)
    texts = re.findall(r'<w:t[^>]*>([^<]+)<\/w:t>', p_xml)
    title = texts[0] if texts else "No Text"
    print(f"Page {idx+1}: {len(shapes)} shapes, {len(images)} images, {len(texts)} text runs (First: '{title[:30]}')")

