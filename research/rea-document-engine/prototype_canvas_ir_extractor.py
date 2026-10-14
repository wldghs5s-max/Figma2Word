import zipfile
import xml.etree.ElementTree as ET
import json
import os
import re

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'v': 'urn:schemas-microsoft-com:vml',
    'o': 'urn:schemas-microsoft-com:office:office',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

def parse_vml_style(style_str):
    style_dict = {}
    if not style_str:
        return style_dict
    for item in style_str.split(';'):
        if ':' in item:
            k, v = item.split(':', 1)
            style_dict[k.strip()] = v.strip()
    return style_dict

def pt_to_float(val_str):
    if not val_str:
        return 0.0
    val_str = val_str.replace('pt', '').strip()
    try:
        return float(val_str)
    except:
        return 0.0

def extract_canvas_ir_from_docx(docx_path):
    print(f"=== Extracting Canvas IR from {os.path.basename(docx_path)} ===")
    
    with zipfile.ZipFile(docx_path, 'r') as z:
        root = ET.fromstring(z.read('word/document.xml'))

    body = root.find('w:body', NAMESPACES)
    paras = body.findall('w:p', NAMESPACES)

    canvas_doc = {
        'source_file': os.path.basename(docx_path),
        'page_size': {'width_pt': 595.3, 'height_pt': 841.9, 'unit': 'pt'},
        'pages': [],
    }

    for page_idx, p in enumerate(paras):
        rects = p.findall('.//v:rect', NAMESPACES)
        page_data = {
            'page_number': page_idx + 1,
            'elements': [],
        }

        for r_idx, rect in enumerate(rects):
            style = parse_vml_style(rect.attrib.get('style', ''))
            
            x = pt_to_float(style.get('margin-left', '0'))
            y = pt_to_float(style.get('margin-top', '0'))
            w = pt_to_float(style.get('width', '0'))
            h = pt_to_float(style.get('height', '0'))
            z = int(style.get('z-index', str(r_idx + 1)))

            filled = rect.attrib.get('filled') != 'f'
            stroked = rect.attrib.get('stroked') != 'f'
            fillcolor = rect.attrib.get('fillcolor', '#FFFFFF') if filled else None
            strokecolor = rect.attrib.get('strokecolor', '#000000') if stroked else None

            # Text content
            txbx = rect.find('.//v:textbox/w:txbxContent', NAMESPACES)
            text_runs = []
            if txbx is not None:
                for tp in txbx.findall('w:p', NAMESPACES):
                    # Check paragraph alignment
                    jc = tp.find('.//w:jc', NAMESPACES)
                    align = jc.attrib.get(f"{{{NAMESPACES['w']}}}val", 'left') if jc is not None else 'left'
                    
                    runs = tp.findall('w:r', NAMESPACES)
                    for r in runs:
                        t_elem = r.find('w:t', NAMESPACES)
                        if t_elem is not None and t_elem.text:
                            rPr = r.find('w:rPr', NAMESPACES)
                            font_family = 'Inter'
                            font_size_pt = 10.0
                            bold = False
                            color = '#000000'
                            
                            if rPr is not None:
                                rFonts = rPr.find('w:rFonts', NAMESPACES)
                                if rFonts is not None:
                                    font_family = rFonts.attrib.get(f"{{{NAMESPACES['w']}}}ascii", font_family)
                                sz = rPr.find('w:sz', NAMESPACES)
                                if sz is not None:
                                    # half-points to pt
                                    font_size_pt = float(sz.attrib.get(f"{{{NAMESPACES['w']}}}val", 20)) / 2.0
                                if rPr.find('w:b', NAMESPACES) is not None:
                                    bold = True
                                c_elem = rPr.find('w:color', NAMESPACES)
                                if c_elem is not None:
                                    color = '#' + c_elem.attrib.get(f"{{{NAMESPACES['w']}}}val", '000000')

                            text_runs.append({
                                'text': t_elem.text,
                                'font_family': font_family,
                                'font_size_pt': font_size_pt,
                                'bold': bold,
                                'color': color,
                                'align': align,
                            })

            elem = {
                'id': rect.attrib.get('id', f"elem_{page_idx}_{r_idx}"),
                'bounds': {'x': x, 'y': y, 'width': w, 'height': h},
                'z_index': z,
                'fill': fillcolor,
                'stroke': strokecolor,
                'has_text': len(text_runs) > 0,
                'runs': text_runs,
            }
            page_data['elements'].append(elem)

        # Sort elements by z-index
        page_data['elements'].sort(key=lambda e: e['z_index'])
        canvas_doc['pages'].append(page_data)

    return canvas_doc

if __name__ == '__main__':
    with open('research/rea-document-engine/ref_docx_path.txt', 'r', encoding='utf-8') as f:
        ref_path = f.read().strip()

    ir = extract_canvas_ir_from_docx(ref_path)
    out_path = 'research/rea-document-engine/canvas_ir.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(ir, f, indent=2, ensure_ascii=False)

    total_elems = sum(len(p['elements']) for p in ir['pages'])
    print(f"Extracted {len(ir['pages'])} pages and {total_elems} elements into {out_path}")

