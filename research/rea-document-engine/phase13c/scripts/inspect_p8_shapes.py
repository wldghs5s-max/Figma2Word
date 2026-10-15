import zipfile
import re

def get_page_shapes(docx_path, target_page_idx=7): # 0-indexed: 7 = page 8
    shapes_by_page = []
    with zipfile.ZipFile(docx_path, 'r') as z:
        doc_xml = z.read('word/document.xml').decode('utf-8', errors='ignore')
        
        # Split by page breaks
        pages = doc_xml.split('<w:br w:type="page"/>')
        print(f"{docx_path}: Total pages found by split = {len(pages)}")
        if target_page_idx < len(pages):
            p_xml = pages[target_page_idx]
            
            # Find all shapes
            for m in re.finditer(r'<v:(rect|shape|roundrect|line)\b([^>]*)>([\s\S]*?)<\/v:\1>|<v:(line)\b([^>]*)\/>', p_xml):
                tag = m.group(1) or m.group(4)
                attrs = m.group(2) or m.group(5)
                inner = m.group(3) or ''
                
                # Extract style, fill, stroke, text
                style_match = re.search(r'style="([^"]*)"', attrs)
                style = style_match.group(1) if style_match else ''
                
                # Extract texts
                t_list = re.findall(r'<w:t[^>]*>([^<]+)<\/w:t>', inner)
                
                # Extract fill/image
                has_image = '<v:imagedata' in inner
                has_fill = 'filled="t"' in attrs or '<v:fill' in inner
                fillcolor_match = re.search(r'fillcolor="([^"]*)"', attrs)
                fillcolor = fillcolor_match.group(1) if fillcolor_match else ''
                
                shapes_by_page.append({
                    'tag': tag,
                    'style': style,
                    'texts': t_list,
                    'has_image': has_image,
                    'has_fill': has_fill,
                    'fillcolor': fillcolor,
                    'raw_attrs': attrs[:100]
                })
    return shapes_by_page

canvas_p8 = get_page_shapes('debug/canvas-audit/report-2-canvas.docx', 7)
ref_p8 = get_page_shapes(r'완성본-20261012\report-2차-경과-편집가능-Word보정-v3.docx', 7)

print(f"\nCanvas Page 8 Shapes Count: {len(canvas_p8)}")
for s in canvas_p8[:12]:
    print(f"  Canvas: <v:{s['tag']}> fill={s['fillcolor']} img={s['has_image']} text={s['texts'][:2]} style={s['style'][:90]}")

print(f"\nRef Page 8 Shapes Count: {len(ref_p8)}")
for s in ref_p8[:12]:
    print(f"  Ref: <v:{s['tag']}> fill={s['fillcolor']} img={s['has_image']} text={s['texts'][:2]} style={s['style'][:90]}")

