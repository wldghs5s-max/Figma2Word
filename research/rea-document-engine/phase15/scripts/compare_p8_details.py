import zipfile, glob, xml.etree.ElementTree as ET

# 1. Ref DOCX Page 8
f_ref = glob.glob('*20261012/*report-2*.docx')[0]
z_ref = zipfile.ZipFile(f_ref)
doc_ref = ET.fromstring(z_ref.read('word/document.xml'))
paras_ref = [p for p in doc_ref.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p') 
             if len(p.findall('.//{urn:schemas-microsoft-com:vml}rect')) > 0]
p8_ref = paras_ref[7]

print("=== REF DOCX PAGE 8 TEXTBOXES ===")
for tb in p8_ref.findall('.//{urn:schemas-microsoft-com:vml}textbox'):
    t_runs = [t.text for t in tb.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text]
    txt = "".join(t_runs).strip()
    if txt:
        print(f"  Ref Text: {txt[:80]}")

print("\n=== REF DOCX PAGE 8 IMAGEDATA ===")
for img in p8_ref.findall('.//{urn:schemas-microsoft-com:vml}imagedata'):
    rel_id = img.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    print(f"  Ref Image relId: {rel_id}")

# 2. Canvas DOCX Page 8
f_canvas = "debug/canvas-audit/report-2-canvas.docx"
z_canvas = zipfile.ZipFile(f_canvas)
doc_canvas = ET.fromstring(z_canvas.read('word/document.xml'))
paras_canvas = [p for p in doc_canvas.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p')
                if len(p.findall('.//{urn:schemas-microsoft-com:vml}rect')) > 0 or len(p.findall('.//{urn:schemas-microsoft-com:vml}shape')) > 0]
p8_canvas = paras_canvas[7]

print("\n=== CANVAS DOCX PAGE 8 TEXTBOXES ===")
for tb in p8_canvas.findall('.//{urn:schemas-microsoft-com:vml}textbox'):
    t_runs = [t.text for t in tb.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text]
    txt = "".join(t_runs).strip()
    if txt:
        print(f"  Canvas Text: {txt[:80]}")

print("\n=== CANVAS DOCX PAGE 8 IMAGEDATA ===")
for img in p8_canvas.findall('.//{urn:schemas-microsoft-com:vml}imagedata'):
    rel_id = img.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    print(f"  Canvas Image relId: {rel_id}")

