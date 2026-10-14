import zipfile
import xml.etree.ElementTree as ET
import json
import os

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'v': 'urn:schemas-microsoft-com:vml',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
}

def deep_inspect_docx(docx_path):
    print(f"=== Deep Inspecting DOCX: {os.path.basename(docx_path)} ===")
    with zipfile.ZipFile(docx_path, 'r') as z:
        doc_xml = z.read('word/document.xml')
        root = ET.fromstring(doc_xml)

        body = root.find('w:body', NAMESPACES)
        print(f"Direct children of w:body: {len(body)}")
        
        # Count types of children
        child_tags = {}
        for child in body:
            tag = child.tag.split('}')[-1]
            child_tags[tag] = child_tags.get(tag, 0) + 1
        print("w:body direct child tag distribution:", child_tags)

        # Inspect anchors
        anchors = root.findall('.//wp:anchor', NAMESPACES)
        print(f"Total wp:anchor elements: {len(anchors)}")

        sample_anchors = []
        for i, a in enumerate(anchors[:8]):
            info = {
                'index': i,
                'distT': a.attrib.get('distT'),
                'distB': a.attrib.get('distB'),
                'distL': a.attrib.get('distL'),
                'distR': a.attrib.get('distR'),
                'simplePos': a.attrib.get('simplePos'),
                'relativeHeight': a.attrib.get('relativeHeight'),
                'behindDoc': a.attrib.get('behindDoc'),
                'locked': a.attrib.get('locked'),
                'layoutInCell': a.attrib.get('layoutInCell'),
                'allowOverlap': a.attrib.get('allowOverlap'),
            }
            # Extent
            extent = a.find('wp:extent', NAMESPACES)
            if extent is not None:
                info['cx'] = int(extent.attrib.get('cx', 0))
                info['cy'] = int(extent.attrib.get('cy', 0))
                info['cx_pt'] = round(info['cx'] / 12700, 2)
                info['cy_pt'] = round(info['cy'] / 12700, 2)
                info['cx_mm'] = round(info['cx'] / 360000, 2)
                info['cy_mm'] = round(info['cy'] / 360000, 2)

            # positionH
            posH = a.find('wp:positionH', NAMESPACES)
            if posH is not None:
                info['posH_relativeFrom'] = posH.attrib.get('relativeFrom')
                posOffset = posH.find('wp:posOffset', NAMESPACES)
                if posOffset is not None:
                    info['posH_offset'] = int(posOffset.text)
                    info['posH_offset_pt'] = round(info['posH_offset'] / 12700, 2)
                    info['posH_offset_mm'] = round(info['posH_offset'] / 360000, 2)

            # positionV
            posV = a.find('wp:positionV', NAMESPACES)
            if posV is not None:
                info['posV_relativeFrom'] = posV.attrib.get('relativeFrom')
                posOffset = posV.find('wp:posOffset', NAMESPACES)
                if posOffset is not None:
                    info['posV_offset'] = int(posOffset.text)
                    info['posV_offset_pt'] = round(info['posV_offset'] / 12700, 2)
                    info['posV_offset_mm'] = round(info['posV_offset'] / 360000, 2)

            # Shape properties
            wsp = a.find('.//wps:wsp', NAMESPACES)
            if wsp is not None:
                spPr = wsp.find('wps:spPr', NAMESPACES)
                if spPr is not None:
                    geom = spPr.find('.//a:prstGeom', NAMESPACES)
                    info['geom_prst'] = geom.attrib.get('prst') if geom is not None else None
                    solidFill = spPr.find('.//a:solidFill/a:srgbClr', NAMESPACES)
                    info['fill_color'] = solidFill.attrib.get('val') if solidFill is not None else None
                    ln = spPr.find('a:ln', NAMESPACES)
                    if ln is not None:
                        lnClr = ln.find('.//a:srgbClr', NAMESPACES)
                        info['stroke_color'] = lnClr.attrib.get('val') if lnClr is not None else None
                        info['stroke_w'] = ln.attrib.get('w')

                bodyPr = wsp.find('wps:bodyPr', NAMESPACES)
                if bodyPr is not None:
                    info['bodyPr_lIns'] = bodyPr.attrib.get('lIns')
                    info['bodyPr_tIns'] = bodyPr.attrib.get('tIns')
                    info['bodyPr_rIns'] = bodyPr.attrib.get('rIns')
                    info['bodyPr_bIns'] = bodyPr.attrib.get('bIns')
                    info['bodyPr_vert'] = bodyPr.attrib.get('vert')

                txbx = wsp.find('wps:txbx/w:txbxContent', NAMESPACES)
                if txbx is not None:
                    txbx_paras = txbx.findall('w:p', NAMESPACES)
                    info['txbx_paragraph_count'] = len(txbx_paras)
                    sample_texts = []
                    for tp in txbx_paras[:3]:
                        t_texts = "".join([t.text for t in tp.findall('.//w:t', NAMESPACES) if t.text])
                        if t_texts:
                            sample_texts.append(t_texts)
                    info['sample_texts'] = sample_texts

            sample_anchors.append(info)

        # Inspect page break mechanism
        p_list = root.findall('.//w:p', NAMESPACES)
        page_break_paragraphs = []
        for idx, p in enumerate(p_list):
            brs = p.findall('.//w:br[@w:type="page"]', NAMESPACES)
            if brs:
                page_break_paragraphs.append(idx)
        print(f"Total paragraphs: {len(p_list)}")
        print(f"Paragraphs containing w:br type='page': {len(page_break_paragraphs)} at indices {page_break_paragraphs}")

        # Check section breaks
        sect_breaks = root.findall('.//w:p/w:pPr/w:sectPr', NAMESPACES)
        print(f"Section breaks in paragraphs: {len(sect_breaks)}")

        return {
            'child_tags': child_tags,
            'total_anchors': len(anchors),
            'sample_anchors': sample_anchors,
            'page_break_paragraph_indices': page_break_paragraphs,
            'sect_breaks_count': len(sect_breaks),
        }

if __name__ == '__main__':
    with open('research/rea-document-engine/ref_docx_path.txt', 'r', encoding='utf-8') as f:
        ref_path = f.read().strip()
    res = deep_inspect_docx(ref_path)
    with open('research/rea-document-engine/docx_deep_inspection.json', 'w', encoding='utf-8') as f:
        json.dump(res, f, indent=2, ensure_ascii=False)
    print("Done! Output saved to research/rea-document-engine/docx_deep_inspection.json")

