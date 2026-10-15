import zipfile, re

with zipfile.ZipFile('debug/canvas-audit/report-3-canvas.docx') as z:
    xml = z.read('word/document.xml').decode('utf-8')

# Search for any text or shape around top:380pt (900px / 2.35 = 382pt)
all_shapes = re.findall(r'<v:(?:roundrect|rect|shape)[^>]*>', xml)
for s in all_shapes:
    if 's_8_' in s: # page 9
        top_m = re.search(r'margin-top:([0-9.]+)pt', s)
        left_m = re.search(r'margin-left:([0-9.]+)pt', s)
        w_m = re.search(r'width:([0-9.]+)pt', s)
        h_m = re.search(r'height:([0-9.]+)pt', s)
        if top_m and left_m:
            top = float(top_m.group(1))
            left = float(left_m.group(1))
            w = float(w_m.group(1)) if w_m else 0
            h = float(h_m.group(1)) if h_m else 0
            alt_m = re.search(r'alt="([^"]+)"', s)
            title_m = re.search(r'o:title="([^"]+)"', s)
            print(f'Top {top:6.1f}, Left {left:6.1f}, w={w:6.1f}, h={h:6.1f}: title={title_m.group(1) if title_m else "?"}')
