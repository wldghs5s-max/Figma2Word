import zipfile, re, os

ref_dir = [d.name for d in os.scandir(".") if "20261012" in d.name][0]
doc1_path = [os.path.join(ref_dir, x.name) for x in os.scandir(ref_dir) if "report-1" in x.name and x.name.endswith(".docx")][0]

with zipfile.ZipFile(doc1_path) as z:
    xml = z.read("word/document.xml").decode("utf-8")

shapes = re.findall(r'<v:(?:shape|rect|roundrect|oval|line)[^>]*>', xml)
for s in shapes:
    ml_m = re.search(r'margin-left:([0-9.]+)pt', s)
    mt_m = re.search(r'margin-top:([0-9.]+)pt', s)
    w_m = re.search(r'width:([0-9.]+)pt', s)
    h_m = re.search(r'height:([0-9.]+)pt', s)
    if ml_m and mt_m:
        ml = float(ml_m.group(1))
        mt = float(mt_m.group(1))
        if 35 <= ml <= 45 and 470 <= mt <= 485:
            print("Found shape around (38, 477):", s)

