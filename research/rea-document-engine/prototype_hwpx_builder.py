import zipfile
import json
import os
import xml.sax.saxutils as saxutils

def escape_xml(text):
    return saxutils.escape(text) if text else ''

def build_hwpx_from_canvas_ir(ir_path, output_hwpx_path):
    print(f"=== Building HWPX from Canvas IR: {ir_path} ===")
    
    with open(ir_path, 'r', encoding='utf-8') as f:
        canvas_ir = json.load(f)

    page1 = canvas_ir['pages'][0]
    elements = page1['elements']

    print(f"Loaded Page 1 with {len(elements)} elements.")

    # 1. mimetype (19 bytes, uncompressed)
    mimetype_content = b'application/hwp+zip'

    # 2. version.xml
    version_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.2" application="Hancom Office Hangul" appVersion="10, 0, 0, 7888 WIN32LEWindows_8"/>
""".strip()

    # 3. settings.xml
    settings_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app">
<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>
</ha:HWPApplicationSetting>
""".strip()

    # 4. META-INF/container.xml
    container_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
<rootfiles>
<rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
</rootfiles>
</container>
""".strip()

    # 5. META-INF/manifest.xml
    manifest_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
<manifest:file-entry manifest:full-path="/" manifest:media-type="application/hwp+zip"/>
<manifest:file-entry manifest:full-path="Contents/content.hpf" manifest:media-type="application/hwpml-package+xml"/>
<manifest:file-entry manifest:full-path="Contents/header.xml" manifest:media-type="application/xml"/>
<manifest:file-entry manifest:full-path="Contents/section0.xml" manifest:media-type="application/xml"/>
<manifest:file-entry manifest:full-path="settings.xml" manifest:media-type="application/xml"/>
</manifest:manifest>
""".strip()

    # 6. Contents/content.hpf
    content_hpf = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="1.2" unique-identifier="bookid">
<opf:metadata xmlns:opf="http://www.idpf.org/2007/opf/">
<opf:title>Figma2Word HWPX Prototype</opf:title>
<opf:language>ko</opf:language>
</opf:metadata>
<opf:manifest>
<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
</opf:manifest>
<opf:spine>
<opf:itemref idref="header"/>
<opf:itemref idref="section0"/>
</opf:spine>
</opf:package>
""".strip()

    # 7. Contents/header.xml
    header_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.0">
<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
<hh:refList>
<hh:fontfaces itemCnt="1">
<hh:fontface lang="hangul" fontCnt="1">
<hh:font id="0" face="맑은 고딕" type="TTF" isEmbedded="0"/>
</hh:fontface>
</hh:fontfaces>
<hh:borderFills itemCnt="2">
<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
<hh:slash type="NONE" Crooked="0" isCounter="0"/>
<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
<hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>
<hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>
<hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>
<hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>
<hh:diagonal type="NONE" width="0.1 mm" color="#000000"/>
<hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/></hc:fillBrush>
</hh:borderFill>
<hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
<hh:slash type="NONE" Crooked="0" isCounter="0"/>
<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
<hh:leftBorder type="SOLID" width="0.12 mm" color="#D0D5DD"/>
<hh:rightBorder type="SOLID" width="0.12 mm" color="#D0D5DD"/>
<hh:topBorder type="SOLID" width="0.12 mm" color="#D0D5DD"/>
<hh:bottomBorder type="SOLID" width="0.12 mm" color="#D0D5DD"/>
<hh:diagonal type="NONE" width="0.1 mm" color="#000000"/>
<hc:fillBrush><hc:winBrush faceColor="#F8FAFC" hatchColor="#999999" alpha="0"/></hc:fillBrush>
</hh:borderFill>
</hh:borderFills>
<hh:charProperties itemCnt="3">
<hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="1" useKerning="1" symMark="NONE" borderFillIDRef="1">
<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
<hh:underline type="NONE" shape="SOLID" color="#000000"/>
<hh:strikeout shape="NONE" color="#000000"/>
<hh:outline type="NONE"/>
<hh:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0"/>
</hh:charPr>
<hh:charPr id="1" height="1400" textColor="#1E293B" shadeColor="none" useFontSpace="1" useKerning="1" symMark="NONE" borderFillIDRef="1">
<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
<hh:underline type="NONE" shape="SOLID" color="#000000"/>
<hh:strikeout shape="NONE" color="#000000"/>
<hh:outline type="NONE"/>
<hh:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0"/>
</hh:charPr>
<hh:charPr id="2" height="900" textColor="#475569" shadeColor="none" useFontSpace="1" useKerning="1" symMark="NONE" borderFillIDRef="1">
<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
<hh:underline type="NONE" shape="SOLID" color="#000000"/>
<hh:strikeout shape="NONE" color="#000000"/>
<hh:outline type="NONE"/>
<hh:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0"/>
</hh:charPr>
</hh:charProperties>
<hh:paraProperties itemCnt="2">
<hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">
<hh:align horizontal="LEFT" vertical="BASELINE"/>
<hh:heading type="NONE" idRef="0" level="0"/>
<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="WORD"/>
<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>
<hh:lineSpacing type="PERCENT" value="160" unit="PERCENT"/>
</hh:paraPr>
<hh:paraPr id="1" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">
<hh:align horizontal="CENTER" vertical="BASELINE"/>
<hh:heading type="NONE" idRef="0" level="0"/>
<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="WORD"/>
<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>
<hh:lineSpacing type="PERCENT" value="160" unit="PERCENT"/>
</hh:paraPr>
</hh:paraProperties>
<hh:styles itemCnt="1">
<hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0"/>
</hh:styles>
</hh:refList>
</hh:head>
""".strip()

    # 8. Contents/section0.xml
    # Convert Canvas IR elements to HWPX shapes
    shapes_xml_parts = []
    shape_id = 1

    for elem in elements:
        b = elem['bounds']
        w_hwpu = int(round(b['width'] * 100))
        h_hwpu = int(round(b['height'] * 100))
        x_hwpu = int(round(b['x'] * 100))
        y_hwpu = int(round(b['y'] * 100))

        if w_hwpu <= 0 or h_hwpu <= 0:
            continue

        fill_color = elem.get('fill')
        stroke_color = elem.get('stroke')

        line_style = "SOLID" if stroke_color else "NONE"
        line_color = stroke_color if stroke_color else "#000000"
        line_width = "10" if stroke_color else "0"

        fill_brush = ""
        if fill_color:
            fill_brush = f'<hc:fillBrush><hc:winBrush faceColor="{fill_color}" hatchColor="#999999" alpha="0"/></hc:fillBrush>'
        else:
            fill_brush = '<hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/></hc:fillBrush>'

        draw_text_part = ""
        if elem['has_text'] and elem['runs']:
            text_runs_xml = []
            for r in elem['runs']:
                t_str = escape_xml(r['text'])
                char_pr = "1" if r.get('bold') else ("2" if r.get('font_size_pt', 10) < 10 else "0")
                text_runs_xml.append(f'<hp:run charPrIDRef="{char_pr}"><hp:t>{t_str}</hp:t></hp:run>')

            runs_joined = "".join(text_runs_xml)
            draw_text_part = f"""
<hp:drawText lastWidth="{w_hwpu}" name="" editable="1">
<hp:subList id="" textDirection="HORIZONTAL" lineWrap="SQUEEZE" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="{w_hwpu}" textHeight="{h_hwpu}" hasTextRef="0" hasNumRef="0">
<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
{runs_joined}
</hp:p>
</hp:subList>
</hp:drawText>
""".strip()

        shape_xml = f"""
<hp:rect id="{shape_id}" zOrder="{elem['z_index']}" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="{shape_id}" ratio="0">
<hp:offset x="0" y="0"/>
<hp:orgSz width="{w_hwpu}" height="{h_hwpu}"/>
<hp:curSz width="{w_hwpu}" height="{h_hwpu}"/>
<hp:flip horizontal="0" vertical="0"/>
<hp:rotationInfo angle="0" centerX="{w_hwpu//2}" centerY="{h_hwpu//2}" rotateimage="1"/>
<hp:renderingInfo>
<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
<hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
<hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
</hp:renderingInfo>
<hp:pos treatAsChar="0" horzRelTo="PAPER" vertRelTo="PAPER" horzAlign="LEFT" vertAlign="TOP" horzOffset="{x_hwpu}" vertOffset="{y_hwpu}"/>
<hp:lineShape color="{line_color}" width="{line_width}" style="{line_style}" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
{fill_brush}
{draw_text_part}
</hp:rect>
""".strip()

        shapes_xml_parts.append(shape_xml)
        shape_id += 1

    # Also add a demonstration native Table inside the document canvas
    table_xml = f"""
<hp:tbl id="{shape_id}" zOrder="999" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="2" colCnt="2" cellSpacing="0" borderFillIDRef="2">
<hp:sz width="40000" height="8000"/>
<hp:pos treatAsChar="0" horzRelTo="PAPER" vertRelTo="PAPER" horzAlign="LEFT" vertAlign="TOP" horzOffset="4050" vertOffset="70000"/>
<hp:tr>
  <hp:tc id="1" name="" header="1" hasMargin="0" protect="0" editable="1" dirty="0" borderFillIDRef="2">
    <hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="20000" height="4000"/>
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="SQUEEZE" vertAlign="CENTER">
      <hp:p id="0" paraPrIDRef="1" styleIDRef="0"><hp:run charPrIDRef="1"><hp:t>진단 항목 (Native Table Header)</hp:t></hp:run></hp:p>
    </hp:subList>
  </hp:tc>
  <hp:tc id="2" name="" header="1" hasMargin="0" protect="0" editable="1" dirty="0" borderFillIDRef="2">
    <hp:cellAddr colAddr="1" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="20000" height="4000"/>
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="SQUEEZE" vertAlign="CENTER">
      <hp:p id="0" paraPrIDRef="1" styleIDRef="0"><hp:run charPrIDRef="1"><hp:t>결과 상태</hp:t></hp:run></hp:p>
    </hp:subList>
  </hp:tc>
</hp:tr>
<hp:tr>
  <hp:tc id="3" name="" header="0" hasMargin="0" protect="0" editable="1" dirty="0" borderFillIDRef="2">
    <hp:cellAddr colAddr="0" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="20000" height="4000"/>
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="SQUEEZE" vertAlign="CENTER">
      <hp:p id="0" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>콘크리트 균열 및 박리</hp:t></hp:run></hp:p>
    </hp:subList>
  </hp:tc>
  <hp:tc id="4" name="" header="0" hasMargin="0" protect="0" editable="1" dirty="0" borderFillIDRef="2">
    <hp:cellAddr colAddr="1" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="20000" height="4000"/>
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="SQUEEZE" vertAlign="CENTER">
      <hp:p id="0" paraPrIDRef="1" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>양호 (B등급)</hp:t></hp:run></hp:p>
    </hp:subList>
  </hp:tc>
</hp:tr>
</hp:tbl>
""".strip()
    shapes_xml_parts.append(table_xml)

    joined_shapes = "\n".join([f"<hp:run>{s}</hp:run>" for s in shapes_xml_parts])

    section0_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
<hp:secPr id="0" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0">
<hp:grid char="0" line="0"/>
<hp:startNum pageStartsOn="BOTH" page="1" pic="1" tbl="1" equation="1"/>
<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>
<hp:lineNumber restartType="NEW_PAGE" countBy="1" distance="1134" startNumber="1"/>
<hp:pagePr landscape="WIDELY" width="59530" height="84190" gutterType="LEFT_ONLY">
<hp:margin header="0" footer="0" gutter="0" left="0" right="0" top="0" bottom="0"/>
</hp:pagePr>
</hp:secPr>
{joined_shapes}
</hp:p>
</hs:sec>
""".strip()

    # Create ZIP file with mimetype stored uncompressed as first entry
    with zipfile.ZipFile(output_hwpx_path, 'w') as z:
        # First entry: mimetype (STORED)
        z.writestr('mimetype', mimetype_content, compress_type=zipfile.ZIP_STORED)
        # Other entries (DEFLATED)
        z.writestr('version.xml', version_xml, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('settings.xml', settings_xml, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('META-INF/container.xml', container_xml, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('META-INF/manifest.xml', manifest_xml, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('Contents/content.hpf', content_hpf, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('Contents/header.xml', header_xml, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('Contents/section0.xml', section0_xml, compress_type=zipfile.ZIP_DEFLATED)

    print(f"Successfully generated prototype HWPX: {output_hwpx_path} ({os.path.getsize(output_hwpx_path)} bytes)")

if __name__ == '__main__':
    ir_p = 'research/rea-document-engine/canvas_ir.json'
    out_p = 'research/rea-document-engine/prototype_output.hwpx'
    build_hwpx_from_canvas_ir(ir_p, out_p)

