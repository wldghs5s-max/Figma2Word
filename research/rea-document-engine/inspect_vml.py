import zipfile
import xml.etree.ElementTree as ET
import json

with open('research/rea-document-engine/ref_docx_path.txt', 'r', encoding='utf-8') as f:
    ref_path = f.read().strip()

with zipfile.ZipFile(ref_path, 'r') as z:
    root = ET.fromstring(z.read('word/document.xml'))

parent_map = {c: p for p in root.iter() for c in p}

txbx_list = root.findall('.//{urn:schemas-microsoft-com:vml}textbox')
print(f"Total v:textbox elements: {len(txbx_list)}")

if txbx_list:
    sample = txbx_list[0]
    path = []
    curr = sample
    while curr in parent_map:
        curr = parent_map[curr]
        path.append(curr)
    
    print("\n--- Tag hierarchy of first v:textbox ---")
    for elem in reversed(path):
        tag_short = elem.tag.split('}')[-1]
        ns = elem.tag.split('}')[0].strip('{')
        attrs = dict(elem.attrib)
        # trim long attrs
        for k in list(attrs.keys()):
            if len(str(attrs[k])) > 80:
                attrs[k] = str(attrs[k])[:80] + '...'
        print(f"<{ns}:{tag_short}> attrs: {attrs}")

    print("\n--- Direct container of v:textbox ---")
    direct_parent = parent_map[sample]
    print(f"Tag: {direct_parent.tag}, Attribs: {direct_parent.attrib}")

    # Inspect all parent tags of v:textbox
    parent_tags = set(parent_map[t].tag for t in txbx_list)
    print(f"\nParent tags across all v:textbox: {parent_tags}")

    # Inspect attributes of the first 5 shapes containing v:textbox
    shapes_info = []
    for i, t in enumerate(txbx_list[:10]):
        shape = parent_map[t]
        # Text inside txbx
        texts = [e.text for e in t.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if e.text]
        shapes_info.append({
            'index': i,
            'shape_tag': shape.tag,
            'shape_attrib': dict(shape.attrib),
            'text_preview': "".join(texts)[:60]
        })

    with open('research/rea-document-engine/vml_shapes_sample.json', 'w', encoding='utf-8') as f:
        json.dump(shapes_info, f, indent=2, ensure_ascii=False)
    print("\nSaved shapes sample to research/rea-document-engine/vml_shapes_sample.json")

