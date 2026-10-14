import zipfile
import xml.etree.ElementTree as ET
import json
import os

with open('research/rea-document-engine/ref_hwpx_path.txt', 'r', encoding='utf-8') as f:
    ref_hwpx_path = f.read().strip()

print(f"=== Inspecting HWPX: {os.path.basename(ref_hwpx_path)} ===")

NAMESPACES = {
    'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
    'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
    'hh': 'http://www.hancom.co.kr/hwpml/2011/head',
    'hc': 'http://www.hancom.co.kr/hwpml/2011/core',
    'opf': 'http://www.idpf.org/2007/opf',
}

results = {
    'archive_entries': [],
    'page_setup': {},
    'counts': {
        'paragraphs': 0,
        'runs': 0,
        'shapes_rect': 0,
        'shapes_drawText': 0,
        'tables': 0,
        'table_cells': 0,
        'pictures': 0,
        'page_breaks': 0,
    },
    'sample_shapes': [],
    'font_faces': [],
}

with zipfile.ZipFile(ref_hwpx_path, 'r') as z:
    results['archive_entries'] = z.namelist()

    # 1. Inspect header.xml
    if 'Contents/header.xml' in z.namelist():
        h_bytes = z.read('Contents/header.xml')
        h_root = ET.fromstring(h_bytes)
        # Fontfaces
        for ff in h_root.findall('.//{http://www.hancom.co.kr/hwpml/2011/head}fontface'):
            lang = ff.attrib.get('lang', '')
            for f_elem in ff.findall('{http://www.hancom.co.kr/hwpml/2011/head}font'):
                results['font_faces'].append({
                    'id': f_elem.attrib.get('id'),
                    'face': f_elem.attrib.get('face'),
                    'type': f_elem.attrib.get('type'),
                    'isEmbedded': f_elem.attrib.get('isEmbedded'),
                    'lang': lang,
                })

    # 2. Inspect section0.xml
    if 'Contents/section0.xml' in z.namelist():
        s_bytes = z.read('Contents/section0.xml')
        s_root = ET.fromstring(s_bytes)

        # Page setup
        secPr = s_root.find('.//{http://www.hancom.co.kr/hwpml/2011/section}secPr')
        if secPr is not None:
            pagePr = secPr.find('{http://www.hancom.co.kr/hwpml/2011/section}pagePr')
            if pagePr is not None:
                results['page_setup']['width_hwpu'] = int(pagePr.attrib.get('width', 0))
                results['page_setup']['height_hwpu'] = int(pagePr.attrib.get('height', 0))
                results['page_setup']['width_mm'] = round(results['page_setup']['width_hwpu'] / 283.465, 2)
                results['page_setup']['height_mm'] = round(results['page_setup']['height_hwpu'] / 283.465, 2)
                margin = pagePr.find('{http://www.hancom.co.kr/hwpml/2011/section}margin')
                if margin is not None:
                    results['page_setup']['margins'] = {
                        k: int(v) for k, v in margin.attrib.items()
                    }

        # Element counts
        paras = s_root.findall('.//{http://www.hancom.co.kr/hwpml/2011/paragraph}p')
        results['counts']['paragraphs'] = len(paras)

        runs = s_root.findall('.//{http://www.hancom.co.kr/hwpml/2011/paragraph}run')
        results['counts']['runs'] = len(runs)

        rects = s_root.findall('.//{http://www.hancom.co.kr/hwpml/2011/paragraph}rect')
        results['counts']['shapes_rect'] = len(rects)

        drawTexts = s_root.findall('.//{http://www.hancom.co.kr/hwpml/2011/paragraph}drawText')
        results['counts']['shapes_drawText'] = len(drawTexts)

        tables = s_root.findall('.//{http://www.hancom.co.kr/hwpml/2011/paragraph}tbl')
        results['counts']['tables'] = len(tables)

        cells = s_root.findall('.//{http://www.hancom.co.kr/hwpml/2011/paragraph}tc')
        results['counts']['table_cells'] = len(cells)

        pics = s_root.findall('.//{http://www.hancom.co.kr/hwpml/2011/paragraph}pic')
        results['counts']['pictures'] = len(pics)

        # Inspect first 8 shapes/rects
        for i, r in enumerate(rects[:8]):
            info = {
                'index': i,
                'tag': r.tag.split('}')[-1],
                'id': r.attrib.get('id'),
                'z_order': r.attrib.get('zOrder'),
            }
            # sz
            sz = r.find('{http://www.hancom.co.kr/hwpml/2011/paragraph}sz')
            if sz is not None:
                info['width_hwpu'] = int(sz.attrib.get('width', 0))
                info['height_hwpu'] = int(sz.attrib.get('height', 0))
                info['width_pt'] = round(info['width_hwpu'] / 100.0, 2)
                info['height_pt'] = round(info['height_hwpu'] / 100.0, 2)
            # pos
            pos = r.find('{http://www.hancom.co.kr/hwpml/2011/paragraph}pos')
            if pos is not None:
                info['treatAsChar'] = pos.attrib.get('treatAsChar')
                info['horzRelTo'] = pos.attrib.get('horzRelTo')
                info['vertRelTo'] = pos.attrib.get('vertRelTo')
                info['horzAlign'] = pos.attrib.get('horzAlign')
                info['vertAlign'] = pos.attrib.get('vertAlign')
                info['horzOffset_hwpu'] = int(pos.attrib.get('horzOffset', 0))
                info['vertOffset_hwpu'] = int(pos.attrib.get('vertOffset', 0))
                info['horzOffset_pt'] = round(info['horzOffset_hwpu'] / 100.0, 2)
                info['vertOffset_pt'] = round(info['vertOffset_hwpu'] / 100.0, 2)
            # drawText
            dt = r.find('{http://www.hancom.co.kr/hwpml/2011/paragraph}drawText')
            if dt is not None:
                text_elems = dt.findall('.//{http://www.hancom.co.kr/hwpml/2011/paragraph}t')
                info['text_preview'] = "".join([t.text for t in text_elems if t.text])[:50]
            results['sample_shapes'].append(info)

out_file = 'research/rea-document-engine/hwpx_inspection_raw.json'
with open(out_file, 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print(f"Page Setup: {results['page_setup']}")
print(f"Counts: {results['counts']}")
print(f"Sample shapes saved to {out_file}")

