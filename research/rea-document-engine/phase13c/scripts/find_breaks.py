import zipfile
import re

with zipfile.ZipFile(r'완성본-20261012\report-1차-진단-편집가능-Word보정-v3.docx', 'r') as z:
    doc = z.read('word/document.xml').decode('utf-8')

body = re.search(r'<w:body>([\s\S]*?)<\/w:body>', doc).group(1)
p_list = re.findall(r'<w:p\b[^>]*>[\s\S]*?<\/w:p>', body)
print('Total <w:p> in Ref DOCX:', len(p_list))

break_paragraphs = []
for idx, p in enumerate(p_list):
    has_pict = '<w:pict' in p
    breaks = re.findall(r'<w:pageBreakBefore[^>]*>', p)
    if has_pict or breaks:
        break_paragraphs.append((idx, has_pict, breaks, len(p)))

print(f"Paragraphs with pict or pageBreakBefore: {len(break_paragraphs)}")
for b in break_paragraphs:
    print(f"  P {b[0]:3d}: pict={b[1]}, break={b[2]}, len={b[3]}")

