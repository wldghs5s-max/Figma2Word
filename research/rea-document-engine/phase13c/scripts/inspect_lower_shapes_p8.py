import zipfile
import re

with zipfile.ZipFile(r'완성본-20261012\report-2차-경과-편집가능-Word보정-v3.docx', 'r') as z:
    ref_doc = z.read('word/document.xml').decode('utf-8')

pages = re.split(r'<w:pageBreakBefore[^>]*>', ref_doc)
p8 = pages[7]

# Find shapes with margin-top > 450pt (approx 1100px)
for m in re.finditer(r'<v:(rect|shape|roundrect)\b([^>]*)>([\s\S]*?)<\/v:\1>', p8):
    attrs = m.group(2)
    inner = m.group(3)
    mt = re.search(r'margin-top:([0-9.]+)pt', attrs)
    ml = re.search(r'margin-left:([0-9.]+)pt', attrs)
    w = re.search(r'width:([0-9.]+)pt', attrs)
    h = re.search(r'height:([0-9.]+)pt', attrs)
    top = float(mt.group(1)) if mt else 0
    left = float(ml.group(1)) if ml else 0
    width = float(w.group(1)) if w else 0
    height = float(h.group(1)) if h else 0
    
    if top > 400 and width > 100:
        texts = re.findall(r'<w:t[^>]*>([^<]+)<\/w:t>', inner)
        has_img = '<v:imagedata' in inner
        fill = re.search(r'fillcolor="([^"]*)"', attrs)
        print(f"Ref Shape at ({left:.1f}, {top:.1f}, {width:.1f}x{height:.1f}): img={has_img}, fill={fill.group(1) if fill else None}, texts={texts[:2]}")
