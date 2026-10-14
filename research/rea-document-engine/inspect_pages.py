import zipfile
import xml.etree.ElementTree as ET

with open('research/rea-document-engine/ref_docx_path.txt', 'r', encoding='utf-8') as f:
    ref_path = f.read().strip()

with zipfile.ZipFile(ref_path, 'r') as z:
    root = ET.fromstring(z.read('word/document.xml'))

body = root.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}body')
paras = body.findall('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p')
print(f"Total direct paragraphs under body: {len(paras)}")

for i, p in enumerate(paras):
    rects = p.findall('.//{urn:schemas-microsoft-com:vml}rect')
    brs = p.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}br')
    br_types = [br.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}type', 'line') for br in brs]
    # Check min/max y coordinates of rects in this paragraph
    y_coords = []
    for r in rects:
        style = r.attrib.get('style', '')
        for part in style.split(';'):
            if part.startswith('margin-top:'):
                try:
                    val = float(part.split(':')[1].replace('pt', ''))
                    y_coords.append(val)
                except:
                    pass
    min_y = min(y_coords) if y_coords else None
    max_y = max(y_coords) if y_coords else None
    print(f"Paragraph {i}: rects={len(rects)}, brs={len(brs)} (types={br_types}), y_range=({min_y}pt to {max_y}pt)")

