import zipfile, re, os

ref_dirs = [d.name for d in os.scandir(".") if "20261012" in d.name]
ref_dir = ref_dirs[0] if ref_dirs else None
files = [os.path.join(ref_dir, x.name) for x in os.scandir(ref_dir) if x.name.endswith(".docx")]
print("Found files:", files)
for p in files:
    with zipfile.ZipFile(p) as z:
        xml = z.read('word/document.xml').decode('utf-8')
    tbs = re.findall(r'<v:textbox[^>]*>', xml)
    print(f'Ref {p} textboxes count: {len(tbs)}')
    styles = set(re.findall(r'style="([^"]*)"', ''.join(tbs[:20])))
    for s in styles:
        print('  tb style:', s)
