import zipfile, re, os

ref_dir = [d.name for d in os.scandir(".") if "20261012" in d.name][0]
doc1_path = [os.path.join(ref_dir, x.name) for x in os.scandir(ref_dir) if "report-1" in x.name and x.name.endswith(".docx")][0]

with zipfile.ZipFile(doc1_path) as z:
    xml = z.read("word/document.xml").decode("utf-8")

lines = re.findall(r'<v:line[^>]*>', xml)
print(f"Total v:lines in Ref 1: {len(lines)}")
for l in lines:
    print("  ", l)

