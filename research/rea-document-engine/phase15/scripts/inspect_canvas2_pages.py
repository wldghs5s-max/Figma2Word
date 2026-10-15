import zipfile, xml.etree.ElementTree as ET

z = zipfile.ZipFile('debug/canvas-audit/report-2-canvas.docx')
doc = ET.fromstring(z.read('word/document.xml'))
paras = [p for p in doc.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p') 
         if len(p.findall('.//{urn:schemas-microsoft-com:vml}rect')) > 0 or len(p.findall('.//{urn:schemas-microsoft-com:vml}shape')) > 0]

print(f"Canvas DOCX content pages/paras: {len(paras)}")
for i, p in enumerate(paras):
    r_count = len(p.findall('.//{urn:schemas-microsoft-com:vml}rect'))
    s_count = len(p.findall('.//{urn:schemas-microsoft-com:vml}shape'))
    img_count = len(p.findall('.//{urn:schemas-microsoft-com:vml}imagedata'))
    txt_count = len(p.findall('.//{urn:schemas-microsoft-com:vml}textbox'))
    print(f"Page {i+1}: rects={r_count}, shapes={s_count}, images={img_count}, textboxes={txt_count}")

