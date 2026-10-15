import zipfile
import re

print("=== Inspecting Page 8 Image VML/DrawingML in Canvas DOCX vs Ref DOCX ===")

def inspect_docx_shapes(docx_path):
    shapes = []
    with zipfile.ZipFile(docx_path, 'r') as z:
        doc_xml = z.read('word/document.xml').decode('utf-8', errors='ignore')
        rels_xml = z.read('word/_rels/document.xml.rels').decode('utf-8', errors='ignore') if 'word/_rels/document.xml.rels' in z.namelist() else ''
        
        # Find all v:shape, v:rect, etc with v:imagedata or v:fill
        for m in re.finditer(r'<v:(rect|shape|roundrect)\b([^>]*)>([\s\S]*?)<\/v:\1>', doc_xml):
            tag = m.group(1)
            attrs = m.group(2)
            inner = m.group(3)
            if '<v:imagedata' in inner or '<v:fill' in inner:
                shapes.append((tag, attrs, inner[:300]))
                
        # Also check DrawingML <w:drawing>
        drawings = len(re.findall(r'<w:drawing\b', doc_xml))
    return shapes, drawings

canvas_shapes, canvas_drawings = inspect_docx_shapes('debug/canvas-audit/report-2-canvas.docx')
ref_shapes, ref_drawings = inspect_docx_shapes(r'완성본-20261012\report-2차-경과-편집가능-Word보정-v3.docx')

print(f"Canvas DOCX image/fill shapes: {len(canvas_shapes)}, drawings: {canvas_drawings}")
for s in canvas_shapes[:6]:
    print(f"  Canvas Shape: <v:{s[0]} {s[1]}> -> inner: {s[2]}")

print(f"\nRef DOCX image/fill shapes: {len(ref_shapes)}, drawings: {ref_drawings}")
for s in ref_shapes[:6]:
    print(f"  Ref Shape: <v:{s[0]} {s[1]}> -> inner: {s[2]}")

