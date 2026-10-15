import zipfile
import re

with zipfile.ZipFile(r'완성본-20261012\report-1차-진단-편집가능-Word보정-v3.docx', 'r') as z:
    doc = z.read('word/document.xml').decode('utf-8')

# Find the hero image shape: style contains margin-top:256.5
m = re.search(r'<v:[^>]*margin-top:256\.5[^>]*>[\s\S]*?<\/v:[^>]*>', doc)
if m:
    print("Found hero image in Ref DOCX:")
    print(m.group(0))
else:
    print("Not found by margin-top:256.5, searching all imagedata:")
    for im in re.finditer(r'<v:[^>]*>[\s\S]*?<v:imagedata[\s\S]*?<\/v:[^>]*>', doc):
        print("---")
        print(im.group(0)[:300])

