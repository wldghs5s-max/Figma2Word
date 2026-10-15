import zipfile
import re

def extract_all_shapes_detail(docx_path):
    shapes = []
    with zipfile.ZipFile(docx_path, 'r') as z:
        doc = z.read('word/document.xml').decode('utf-8')
    
    # We want page 1 elements
    # Split before page 2
    p1_xml = re.split(r'<w:pageBreakBefore[^>]*>', doc)[0]
    
    for m in re.finditer(r'<v:(rect|shape|roundrect|line)\b([^>]*)>([\s\S]*?)<\/v:\1>|<v:(line)\b([^>]*)\/>', p1_xml):
        tag = m.group(1) or m.group(4)
        attrs = m.group(2) or m.group(5)
        inner = m.group(3) or ''
        
        # parse style
        style_match = re.search(r'style="([^"]*)"', attrs)
        style = style_match.group(1) if style_match else ''
        
        left_m = re.search(r'margin-left:([0-9.]+)pt', style)
        top_m = re.search(r'margin-top:([0-9.]+)pt', style)
        w_m = re.search(r'width:([0-9.]+)pt', style)
        h_m = re.search(r'height:([0-9.]+)pt', style)
        
        x = float(left_m.group(1)) if left_m else 0
        y = float(top_m.group(1)) if top_m else 0
        w = float(w_m.group(1)) if w_m else 0
        h = float(h_m.group(1)) if h_m else 0
        
        texts = re.findall(r'<w:t[^>]*>([^<]+)<\/w:t>', inner)
        
        # font size & color
        sz_m = re.search(r'<w:sz w:val="(\d+)"/>', inner)
        sz = int(sz_m.group(1))/2.0 if sz_m else None
        
        color_m = re.search(r'<w:color w:val="([^"]+)"/>', inner)
        color = color_m.group(1) if color_m else None
        
        fillcolor_m = re.search(r'fillcolor="([^"]*)"', attrs)
        fillcolor = fillcolor_m.group(1) if fillcolor_m else None
        
        has_img = '<v:imagedata' in inner
        
        if w > 1 or h > 1 or texts:
            shapes.append({
                'tag': tag,
                'x': x, 'y': y, 'w': w, 'h': h,
                'texts': texts,
                'sz': sz,
                'color': color,
                'fill': fillcolor,
                'has_img': has_img
            })
    return shapes

c_p1 = extract_all_shapes_detail('debug/canvas-audit/report-1-canvas.docx')
r_p1 = extract_all_shapes_detail(r'완성본-20261012\report-1차-진단-편집가능-Word보정-v3.docx')

print(f"Canvas Page 1 Shapes: {len(c_p1)}")
print(f"Ref Page 1 Shapes: {len(r_p1)}")

print("\n--- Canvas Text Shapes on Page 1 ---")
for s in c_p1:
    if s['texts']:
        print(f"  Canvas: ({s['x']:5.1f}, {s['y']:5.1f}, {s['w']:5.1f}x{s['h']:5.1f}) sz={s['sz']} col={s['color']} fill={s['fill']} txt={' '.join(s['texts'])[:30]}")

print("\n--- Ref Text Shapes on Page 1 ---")
for s in r_p1:
    if s['texts']:
        print(f"  Ref:    ({s['x']:5.1f}, {s['y']:5.1f}, {s['w']:5.1f}x{s['h']:5.1f}) sz={s['sz']} col={s['color']} fill={s['fill']} txt={' '.join(s['texts'])[:30]}")

