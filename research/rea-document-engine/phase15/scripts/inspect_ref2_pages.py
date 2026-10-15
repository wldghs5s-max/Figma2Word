import zipfile, glob, xml.etree.ElementTree as ET

f = glob.glob('*20261012/*report-2*.docx')[0]
z = zipfile.ZipFile(f)
doc = ET.fromstring(z.read('word/document.xml'))
paras = doc.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p')

content_paras = [p for p in paras if len(p.findall('.//{urn:schemas-microsoft-com:vml}rect')) > 0 or len(p.findall('.//{urn:schemas-microsoft-com:vml}shape')) > 0]
print(f"Total content pages/paras in Reference DOCX: {len(content_paras)}")
for i, p in enumerate(content_paras):
    r_count = len(p.findall('.//{urn:schemas-microsoft-com:vml}rect'))
    img_count = len(p.findall('.//{urn:schemas-microsoft-com:vml}imagedata'))
    txt_count = len(p.findall('.//{urn:schemas-microsoft-com:vml}textbox'))
    print(f"Page {i+1}: rects={r_count}, images={img_count}, textboxes={txt_count}")

