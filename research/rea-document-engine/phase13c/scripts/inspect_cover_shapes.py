import zipfile
import re

def inspect_cover_shapes(docx_path):
    shapes = []
    with zipfile.ZipFile(docx_path, 'r') as z:
        doc = z.read('word/document.xml').decode('utf-8')
    
    # In canvas docx, page 1 is before the first <w:pageBreakBefore/>
    # In ref docx, page 1 is before the first <w:p> with page break or first section
    # Let's extract first 30 shapes
    for m in re.finditer(r'<v:(rect|shape|roundrect|line)\b([^>]*)>([\s\S]*?)<\/v:\1>|<v:(line)\b([^>]*)\/>', doc):
        tag = m.group(1) or m.group(4)
        attrs = m.group(2) or m.group(5)
        inner = m.group(3) or ''
        
        texts = re.findall(r'<w:t[^>]*>([^<]+)<\/w:t>', inner)
        style = re.search(r'style="([^"]*)"', attrs)
        style_val = style.group(1) if style else ''
        title = re.search(r'o:title="([^"]*)"', attrs)
        title_val = title.group(1) if title else ''
        
        has_img = '<v:imagedata' in inner
        fill = re.search(r'fillcolor="([^"]*)"', attrs)
        fill_val = fill.group(1) if fill else ''
        
        shapes.append({
            'tag': tag,
            'title': title_val,
            'style': style_val,
            'texts': texts,
            'has_img': has_img,
            'fill': fill_val
        })
        if len(shapes) >= 20: break
    return shapes

c_shapes = inspect_cover_shapes('debug/canvas-audit/report-1-canvas.docx')
r_shapes = inspect_cover_shapes(r'완성본-20261012\report-1차-진단-편집가능-Word보정-v3.docx')

print(f"=== Canvas Cover Shapes (first 10 of {len(c_shapes)}) ===")
for s in c_shapes[:10]:
    print(f"  <v:{s['tag']}> title='{s['title']}' img={s['has_img']} fill={s['fill']} texts={s['texts'][:2]} | style={s['style']}")

print(f"\n=== Ref Cover Shapes (first 10 of {len(r_shapes)}) ===")
for s in r_shapes[:10]:
    print(f"  <v:{s['tag']}> title='{s['title']}' img={s['has_img']} fill={s['fill']} texts={s['texts'][:2]} | style={s['style']}")

