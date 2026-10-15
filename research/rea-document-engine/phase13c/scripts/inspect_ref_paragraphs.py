import zipfile
import re

with zipfile.ZipFile(r'완성본-20261012\report-1차-진단-편집가능-Word보정-v3.docx', 'r') as z:
    doc = z.read('word/document.xml').decode('utf-8')

# Check top-level paragraphs inside <w:body>
body = re.search(r'<w:body>([\s\S]*?)<\/w:body>', doc).group(1)

# Let's count how many paragraphs have <w:pPr> with breaks, or how pages are broken
p_list = re.findall(r'<w:p\b[^>]*>[\s\S]*?<\/w:p>', body)
print(f"Total <w:p> in body: {len(p_list)}")

# Look for page breaks in paragraphs
for idx, p in enumerate(p_list[:20]):
    # check if p has pict
    has_pict = '<w:pict' in p
    has_br = '<w:br' in p
    has_page_break = 'w:type="page"' in p or 'w:pageBreakBefore' in p
    print(f"Paragraph {idx}: pict={has_pict}, br={has_br}, pageBreak={has_page_break}, len={len(p)}")
    if has_br or has_page_break:
        print(f"   Break details: {re.findall(r'<w:[a-zA-Z]+Break[^>]*>', p)} {re.findall(r'<w:br[^>]*>', p)}")
