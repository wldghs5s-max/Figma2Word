import zipfile, re, os

ref_dir = [d.name for d in os.scandir(".") if "20261012" in d.name][0]
doc1_path = [os.path.join(ref_dir, x.name) for x in os.scandir(ref_dir) if "report-1" in x.name and x.name.endswith(".docx")][0]

with zipfile.ZipFile(doc1_path) as z:
    xml = z.read("word/document.xml").decode("utf-8")

matches = re.findall(r'<w:r>.*?<w:pict>.*?</w:pict>.*?</w:r>', xml, re.DOTALL)
for m in matches:
    if 'margin-top:49' in m or 'margin-top:50' in m:
        ml_m = re.search(r'margin-left:([0-9.]+)pt', m)
        if ml_m and float(ml_m.group(1)) < 80:
            print(m[:400])
            print("---")

