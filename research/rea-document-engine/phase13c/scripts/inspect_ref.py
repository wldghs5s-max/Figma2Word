import zipfile
import re
import os

docs = [
    ("Report 1 Ref", r"완성본-20261012\report-1차-진단-편집가능-Word보정-v3.docx"),
    ("Report 2 Ref", r"완성본-20261012\report-2차-경과-편집가능-Word보정-v3.docx"),
    ("Report 3 Ref", r"완성본-20261012\report-3차-성과검증-편집가능-Word보정-v3.docx"),
]

for name, path in docs:
    print(f"\n=== {name} ({path}) ===")
    if not os.path.exists(path):
        print("  FILE NOT FOUND!")
        continue
    with zipfile.ZipFile(path, 'r') as z:
        doc_xml = z.read('word/document.xml').decode('utf-8', errors='ignore')
        app_xml = z.read('docProps/app.xml').decode('utf-8', errors='ignore') if 'docProps/app.xml' in z.namelist() else ''
        p_match = re.search(r'<Pages>(\d+)</Pages>', app_xml)
        print(f"  App.xml Pages: {p_match.group(1) if p_match else 'None'}")
        br_count = len(re.findall(r'<w:br\s+w:type="page"/>', doc_xml))
        last_br = len(re.findall(r'<w:lastRenderedPageBreak/>', doc_xml))
        print(f"  Page breaks (<w:br w:type=\"page\"/>): {br_count}, LastRendered: {last_br}")
        texts = [t for t in re.findall(r'<w:t[^>]*>([^<]+)</w:t>', doc_xml) if len(t.strip()) > 3]
        print(f"  Total text elements: {len(texts)}")
        print(f"  Sample texts: {texts[:6]}")
