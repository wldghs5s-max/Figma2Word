import zipfile
import re
import os

ref_dir = [d.name for d in os.scandir(".") if "20261012" in d.name][0]
doc1_path = os.path.join(ref_dir, "report-1-진단-완성-Word정답-v3.docx")
if not os.path.exists(doc1_path):
    doc1_path = [os.path.join(ref_dir, x.name) for x in os.scandir(ref_dir) if "report-1" in x.name and x.name.endswith(".docx")][0]

with zipfile.ZipFile(doc1_path) as z:
    xml = z.read("word/document.xml").decode("utf-8")

# Let's search for alert-triangle or check or info or file-text
for kw in ["alert", "triangle", "check", "info", "file"]:
    matches = re.findall(rf'<v:[^>]*{kw}[^>]*>', xml, re.IGNORECASE)
    print(f"Keyword '{kw}': {len(matches)} matches")

# Let's search for shapes around margin-left: 35~40pt, margin-top: 150~300pt
shapes = re.findall(r'<v:(?:shape|rect|roundrect|oval)[^>]*>', xml)
print(f"Total VML shapes in Ref 1: {len(shapes)}")
for s in shapes[:30]:
    if any(k in s for k in ["alert", "check", "info", "triangle", "file"]):
        print("  Found:", s[:150])

