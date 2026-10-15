import zipfile
import re

with zipfile.ZipFile('debug/canvas-audit/report-3-canvas.docx') as z:
    xml = z.read('word/document.xml').decode('utf-8')

shapes_p8 = re.findall(r'<v:(?:roundrect|rect|shape)[^>]*id="s_8_[^>]*>', xml)
print('Page 8 total shapes:', len(shapes_p8))
for s in shapes_p8:
    ml_m = re.search(r'margin-left:([0-9.]+)pt', s)
    w_m = re.search(r'width:([0-9.]+)pt', s)
    title_m = re.search(r'o:title="([^"]+)"', s)
    if ml_m and w_m:
        ml = float(ml_m.group(1))
        w = float(w_m.group(1))
        if ml + w > 500:
            print(f'Shape: {title_m.group(1) if title_m else "?"}: ml={ml}, w={w}, right={ml+w}')

