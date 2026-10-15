import zipfile
import re

with zipfile.ZipFile(r'완성본-20261012\report-1차-진단-편집가능-Word보정-v3.docx', 'r') as z:
    ref_doc = z.read('word/document.xml').decode('utf-8')

with zipfile.ZipFile('debug/canvas-audit/report-1-canvas.docx', 'r') as z:
    canvas_doc = z.read('word/document.xml').decode('utf-8')

def parse_shapes(xml_str):
    shapes = []
    for m in re.finditer(r'<v:(rect|shape|roundrect|line)\b([^>]*)>([\s\S]*?)<\/v:\1>|<v:(line)\b([^>]*)\/>', xml_str):
        tag = m.group(1) or m.group(4)
        attrs = m.group(2) or m.group(5)
        inner = m.group(3) or ''
        
        style = re.search(r'style="([^"]*)"', attrs)
        s_val = style.group(1) if style else ''
        
        texts = re.findall(r'<w:t[^>]*>([^<]+)<\/w:t>', inner)
        
        # margin-left, margin-top, width, height
        ml = re.search(r'margin-left:([0-9.]+)pt', s_val)
        mt = re.search(r'margin-top:([0-9.]+)pt', s_val)
        w = re.search(r'width:([0-9.]+)pt', s_val)
        h = re.search(r'height:([0-9.]+)pt', s_val)
        
        # font size
        sz_m = re.search(r'<w:sz w:val="(\d+)"/>', inner)
        sz = int(sz_m.group(1))/2.0 if sz_m else None
        
        fill = re.search(r'fillcolor="([^"]*)"', attrs)
        has_img = '<v:imagedata' in inner
        
        shapes.append({
            'tag': tag,
            'x': float(ml.group(1)) if ml else 0,
            'y': float(mt.group(1)) if mt else 0,
            'w': float(w.group(1)) if w else 0,
            'h': float(h.group(1)) if h else 0,
            'texts': texts,
            'sz': sz,
            'fill': fill.group(1) if fill else None,
            'has_img': has_img
        })
    return shapes

# In Ref docx, Page 1 is from start up to P 21 (<w:pageBreakBefore/>)
ref_p1_xml = ref_doc.split('<w:pageBreakBefore/>')[0]
# In Canvas docx, Page 1 is from start up to the first <w:pageBreakBefore/> (after <w:pageBreakBefore w:val="0"/>)
canvas_pages = canvas_doc.split('<w:pageBreakBefore/>')
canvas_p1_xml = canvas_pages[0]

ref_shapes = parse_shapes(ref_p1_xml)
canvas_shapes = parse_shapes(canvas_p1_xml)

print(f"Ref Page 1 Shapes count: {len(ref_shapes)}")
print(f"Canvas Page 1 Shapes count: {len(canvas_shapes)}")

print("\n=== Ref Page 1 Shapes ===")
for idx, s in enumerate(ref_shapes):
    t_str = f" txt='{' '.join(s['texts'])}'" if s['texts'] else ""
    img_str = " [IMG]" if s['has_img'] else ""
    fill_str = f" fill={s['fill']}" if s['fill'] else ""
    sz_str = f" sz={s['sz']}pt" if s['sz'] else ""
    print(f"  Ref {idx:2d}: <v:{s['tag']}> ({s['x']:5.1f}, {s['y']:5.1f}, {s['w']:5.1f}x{s['h']:5.1f}){sz_str}{fill_str}{img_str}{t_str}")

print("\n=== Canvas Page 1 Shapes ===")
for idx, s in enumerate(canvas_shapes):
    t_str = f" txt='{' '.join(s['texts'])}'" if s['texts'] else ""
    img_str = " [IMG]" if s['has_img'] else ""
    fill_str = f" fill={s['fill']}" if s['fill'] else ""
    sz_str = f" sz={s['sz']}pt" if s['sz'] else ""
    print(f"  Canvas {idx:2d}: <v:{s['tag']}> ({s['x']:5.1f}, {s['y']:5.1f}, {s['w']:5.1f}x{s['h']:5.1f}){sz_str}{fill_str}{img_str}{t_str}")

