import zipfile, glob, xml.etree.ElementTree as ET

f_ref = glob.glob('*20261012/*report-2*.docx')[0]
z_ref = zipfile.ZipFile(f_ref)
doc_ref = ET.fromstring(z_ref.read('word/document.xml'))
paras_ref = [p for p in doc_ref.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p') 
             if len(p.findall('.//{urn:schemas-microsoft-com:vml}rect')) > 0]
p8_ref = paras_ref[7]

print("=== REF DOCX PAGE 8 IMAGES ===")
for elem in p8_ref.iter():
    if elem.tag.endswith('imagedata'):
        parent = None
        # find parent in p8_ref
        for p in p8_ref.iter():
            if elem in list(p):
                parent = p
                break
        if parent is not None:
            style = parent.attrib.get('style', '')
            props = dict(item.split(':') for item in style.split(';') if ':' in item)
            print(f"  Ref Img: top={props.get('top')}, left={props.get('margin-left', props.get('left'))}, w={props.get('width')}, h={props.get('height')}")

f_canvas = "debug/canvas-audit/report-2-canvas.docx"
z_canvas = zipfile.ZipFile(f_canvas)
doc_canvas = ET.fromstring(z_canvas.read('word/document.xml'))
paras_canvas = [p for p in doc_canvas.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p')
                if len(p.findall('.//{urn:schemas-microsoft-com:vml}rect')) > 0 or len(p.findall('.//{urn:schemas-microsoft-com:vml}shape')) > 0]
p8_canvas = paras_canvas[7]

print("\n=== CANVAS DOCX PAGE 8 IMAGES ===")
for elem in p8_canvas.iter():
    if elem.tag.endswith('imagedata'):
        parent = None
        for p in p8_canvas.iter():
            if elem in list(p):
                parent = p
                break
        if parent is not None:
            style = parent.attrib.get('style', '')
            props = dict(item.split(':') for item in style.split(';') if ':' in item)
            print(f"  Canvas Img: top={props.get('top')}, left={props.get('margin-left', props.get('left'))}, w={props.get('width')}, h={props.get('height')}")

