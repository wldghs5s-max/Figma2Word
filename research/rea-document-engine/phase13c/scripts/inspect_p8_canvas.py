import zipfile
import re

with zipfile.ZipFile('debug/canvas-audit/report-2-canvas.docx') as z:
    doc_xml = z.read('word/document.xml').decode('utf-8')

# Find all <w:p>
paragraphs = re.findall(r'<w:p\b[\s\S]*?<\/w:p>', doc_xml)
print(f"Canvas DOCX total <w:p> paragraphs: {len(paragraphs)}")

p8 = paragraphs[7] # Page 8
print(f"Page 8 <w:p> length: {len(p8)} chars")

# Find all VML shapes in Page 8
shapes = re.findall(r'<v:(rect|shape|roundrect|line)\b[^>]*>', p8)
print(f"Page 8 VML shapes count: {len(shapes)}")

# Find all image tags in Page 8
images = re.findall(r'<v:imagedata\b[^>]*>', p8)
print(f"Page 8 <v:imagedata> tags: {len(images)}")
for im in images:
    print(f"  {im}")

# Let's inspect the shapes with images
for m in re.finditer(r'<v:(rect|shape|roundrect|line)\b([^>]*)>([\s\S]*?)<\/v:\1>', p8):
    tag = m.group(1)
    attrs = m.group(2)
    inner = m.group(3)
    if '<v:imagedata' in inner:
        style_match = re.search(r'style="([^"]*)"', attrs)
        style = style_match.group(1) if style_match else ''
        title_match = re.search(r'o:title="([^"]*)"', attrs)
        title = title_match.group(1) if title_match else ''
        print(f"  Shape <v:{tag}> title='{title}': style='{style}'")
