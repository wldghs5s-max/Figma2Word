import zipfile, glob, xml.etree.ElementTree as ET

# Ref DOCX
f_ref = glob.glob('*20261012/*report-2*.docx')[0]
z_ref = zipfile.ZipFile(f_ref)
doc_ref = ET.fromstring(z_ref.read('word/document.xml'))
paras_ref = [p for p in doc_ref.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p') 
             if len(p.findall('.//{urn:schemas-microsoft-com:vml}rect')) > 0]
p8_ref = paras_ref[7]

print("=== REF DOCX PAGE 8 SHAPE POSITIONS ===")
for r in p8_ref.findall('.//{urn:schemas-microsoft-com:vml}rect'):
    style = r.attrib.get('style', '')
    # Check if has imagedata
    has_img = len(r.findall('.//{urn:schemas-microsoft-com:vml}imagedata')) > 0
    tb = r.findall('.//{urn:schemas-microsoft-com:vml}textbox')
    has_tb = len(tb) > 0
    tb_txt = ""
    if has_tb:
        t_runs = [t.text for t in tb[0].findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text]
        tb_txt = "".join(t_runs).strip()[:30]
    
    # parse top, left, width, height from style
    props = dict(item.split(':') for item in style.split(';') if ':' in item)
    top = props.get('top', '')
    left = props.get('margin-left', props.get('left', ''))
    w = props.get('width', '')
    h = props.get('height', '')
    print(f"  Ref Rect: top={top}, left={left}, w={w}, h={h}, img={has_img}, txt='{tb_txt}'")

print("\n=== CANVAS DOCX PAGE 8 SHAPE POSITIONS ===")
f_canvas = "debug/canvas-audit/report-2-canvas.docx"
z_canvas = zipfile.ZipFile(f_canvas)
doc_canvas = ET.fromstring(z_canvas.read('word/document.xml'))
paras_canvas = [p for p in doc_canvas.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p')
                if len(p.findall('.//{urn:schemas-microsoft-com:vml}rect')) > 0 or len(p.findall('.//{urn:schemas-microsoft-com:vml}shape')) > 0]
p8_canvas = paras_canvas[7]
for r in p8_canvas.findall('.//{urn:schemas-microsoft-com:vml}rect'):
    style = r.attrib.get('style', '')
    has_img = len(r.findall('.//{urn:schemas-microsoft-com:vml}imagedata')) > 0
    tb = r.findall('.//{urn:schemas-microsoft-com:vml}textbox')
    has_tb = len(tb) > 0
    tb_txt = ""
    if has_tb:
        t_runs = [t.text for t in tb[0].findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text]
        tb_txt = "".join(t_runs).strip()[:30]
    
    props = dict(item.split(':') for item in style.split(';') if ':' in item)
    top = props.get('top', '')
    left = props.get('margin-left', props.get('left', ''))
    w = props.get('width', '')
    h = props.get('height', '')
    if has_img:
        print(f"  Canvas Rect: top={top}, left={left}, w={w}, h={h}, img={has_img}, txt='{tb_txt}'")

