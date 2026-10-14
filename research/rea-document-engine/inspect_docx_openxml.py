import zipfile
import xml.etree.ElementTree as ET
import os
import sys
import json

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'v': 'urn:schemas-microsoft-com:vml',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

def analyze_docx(docx_path):
    print(f"=== Analyzing DOCX: {os.path.basename(docx_path)} ===")
    if not os.path.exists(docx_path):
        print(f"Error: {docx_path} not found")
        return None

    results = {
        'file_name': os.path.basename(docx_path),
        'file_size_bytes': os.path.getsize(docx_path),
        'parts': [],
        'page_config': {},
        'counts': {
            'paragraphs': 0,
            'tables': 0,
            'max_table_depth': 0,
            'table_rows': 0,
            'table_cells': 0,
            'inline_drawings': 0,
            'anchor_drawings': 0,
            'vml_shapes': 0,
            'textboxes': 0,
            'page_breaks': 0,
            'images': 0,
        },
        'drawings_summary': [],
        'tables_summary': [],
        'styles_summary': [],
        'fonts_used': set(),
    }

    with zipfile.ZipFile(docx_path, 'r') as z:
        results['parts'] = z.namelist()

        # 1. Analyze word/document.xml
        if 'word/document.xml' in z.namelist():
            xml_bytes = z.read('word/document.xml')
            root = ET.fromstring(xml_bytes)

            # Page Config from sectPr
            sectPrs = root.findall('.//w:sectPr', NAMESPACES)
            for sectPr in sectPrs:
                pgSz = sectPr.find('w:pgSz', NAMESPACES)
                pgMar = sectPr.find('w:pgMar', NAMESPACES)
                cfg = {}
                if pgSz is not None:
                    cfg['width_dxa'] = int(pgSz.attrib.get(f"{{{NAMESPACES['w']}}}w", 0))
                    cfg['height_dxa'] = int(pgSz.attrib.get(f"{{{NAMESPACES['w']}}}h", 0))
                    cfg['orient'] = pgSz.attrib.get(f"{{{NAMESPACES['w']}}}orient", 'portrait')
                if pgMar is not None:
                    cfg['margin_top'] = int(pgMar.attrib.get(f"{{{NAMESPACES['w']}}}top", 0))
                    cfg['margin_bottom'] = int(pgMar.attrib.get(f"{{{NAMESPACES['w']}}}bottom", 0))
                    cfg['margin_left'] = int(pgMar.attrib.get(f"{{{NAMESPACES['w']}}}left", 0))
                    cfg['margin_right'] = int(pgMar.attrib.get(f"{{{NAMESPACES['w']}}}right", 0))
                results['page_config'] = cfg

            # Counts
            paragraphs = root.findall('.//w:p', NAMESPACES)
            results['counts']['paragraphs'] = len(paragraphs)

            # Page breaks
            for br in root.findall('.//w:br', NAMESPACES):
                if br.attrib.get(f"{{{NAMESPACES['w']}}}type") == 'page':
                    results['counts']['page_breaks'] += 1

            # Drawings: inline vs anchor
            inlines = root.findall('.//wp:inline', NAMESPACES)
            results['counts']['inline_drawings'] = len(inlines)

            anchors = root.findall('.//wp:anchor', NAMESPACES)
            results['counts']['anchor_drawings'] = len(anchors)

            # VML
            vml_shapes = root.findall('.//v:shape', NAMESPACES)
            results['counts']['vml_shapes'] = len(vml_shapes)

            # Textboxes (wps:wsp or w:txbxContent)
            txbx = root.findall('.//w:txbxContent', NAMESPACES)
            results['counts']['textboxes'] = len(txbx)

            # Images
            pics = root.findall('.//pic:pic', NAMESPACES)
            results['counts']['images'] = len(pics)

            # Fonts
            for rFonts in root.findall('.//w:rFonts', NAMESPACES):
                for attr in ['ascii', 'hAnsi', 'cs', 'eastAsia']:
                    val = rFonts.attrib.get(f"{{{NAMESPACES['w']}}}{attr}")
                    if val:
                        results['fonts_used'].add(val)

            # Table depth analysis
            tables = root.findall('.//w:tbl', NAMESPACES)
            results['counts']['tables'] = len(tables)

            def get_depth(node, current_depth=0):
                max_d = current_depth
                for child in node:
                    if child.tag == f"{{{NAMESPACES['w']}}}tbl":
                        d = get_depth(child, current_depth + 1)
                        if d > max_d:
                            max_d = d
                    else:
                        d = get_depth(child, current_depth)
                        if d > max_d:
                            max_d = d
                return max_d

            results['counts']['max_table_depth'] = get_depth(root)

            # Sample anchors / floating shapes detail
            for i, anchor in enumerate(anchors[:5]):
                extent = anchor.find('wp:extent', NAMESPACES)
                cx = int(extent.attrib.get('cx', 0)) if extent is not None else 0
                cy = int(extent.attrib.get('cy', 0)) if extent is not None else 0
                posH = anchor.find('wp:positionH', NAMESPACES)
                posV = anchor.find('wp:positionV', NAMESPACES)
                wrap = anchor.find('wp:wrapNone', NAMESPACES)
                wrap_type = 'wrapNone' if wrap is not None else 'other'
                results['drawings_summary'].append({
                    'index': i,
                    'type': 'anchor',
                    'cx_pt': cx / 12700,
                    'cy_pt': cy / 12700,
                    'wrap': wrap_type,
                    'has_textbox': anchor.find('.//w:txbxContent', NAMESPACES) is not None,
                })

            # Sample inlines detail
            for i, inline in enumerate(inlines[:5]):
                extent = inline.find('wp:extent', NAMESPACES)
                cx = int(extent.attrib.get('cx', 0)) if extent is not None else 0
                cy = int(extent.attrib.get('cy', 0)) if extent is not None else 0
                results['drawings_summary'].append({
                    'index': i,
                    'type': 'inline',
                    'cx_pt': cx / 12700,
                    'cy_pt': cy / 12700,
                })

        # 2. Analyze word/styles.xml
        if 'word/styles.xml' in z.namelist():
            s_bytes = z.read('word/styles.xml')
            s_root = ET.fromstring(s_bytes)
            for style in s_root.findall('.//w:style', NAMESPACES):
                s_id = style.attrib.get(f"{{{NAMESPACES['w']}}}styleId")
                name_el = style.find('w:name', NAMESPACES)
                s_name = name_el.attrib.get(f"{{{NAMESPACES['w']}}}val") if name_el is not None else ''
                results['styles_summary'].append({'id': s_id, 'name': s_name})

    results['fonts_used'] = list(results['fonts_used'])
    return results

if __name__ == '__main__':
    # Find reference docx in 완성본 directory dynamically
    ref_path = None
    for item in os.listdir('.'):
        if '완성본' in item and os.path.isdir(item):
            for f in os.listdir(item):
                if 'report-1' in f and f.endswith('.docx'):
                    ref_path = os.path.join(item, f)
                    break

    # Find generated docx in live_generated dynamically
    gen_path = None
    gen_dir = 'debug/quality-audit/live_generated'
    if os.path.exists(gen_dir):
        for f in os.listdir(gen_dir):
            if 'report-1' in f and '정식개선' in f and f.endswith('.docx'):
                gen_path = os.path.join(gen_dir, f)
                break

    print(f"Discovered Ref Path: {ref_path}")
    print(f"Discovered Gen Path: {gen_path}")

    ref_res = analyze_docx(ref_path) if ref_path else None
    gen_res = analyze_docx(gen_path) if gen_path else None

    out_file = 'research/rea-document-engine/docx_comparison_raw.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump({'reference': ref_res, 'generated': gen_res}, f, indent=2, ensure_ascii=False)

    print(f"\nSaved detailed analysis JSON to: {out_file}")
