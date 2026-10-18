import zipfile
import xml.etree.ElementTree as ET
from collections import Counter

ref_path = "완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx"
with zipfile.ZipFile(ref_path) as z:
    hdr_xml = z.read("Contents/header.xml").decode("utf-8")
    sec_xml = z.read("Contents/section0.xml").decode("utf-8")

root_hdr = ET.fromstring(hdr_xml)
root_sec = ET.fromstring(sec_xml)

# 1. Inspect paraPr lineSpacing
print("=== PARAPR LINESPACING IN AUTHENTIC HWPX ===")
para_prs = root_hdr.findall(".//{*}paraPr")
print(f"Total paraPrs: {len(para_prs)}")
ls_counter = Counter()
for i, pp in enumerate(para_prs):
    ls = pp.find(".//{*}lineSpacing")
    if ls is not None:
        t = ls.get("type")
        v = ls.get("value")
        u = ls.get("unit")
        ls_counter[(t, v, u)] += 1
        if i < 10:
            print(f"  paraPr[{i}]: type={t} value={v} unit={u}")

print("\nLineSpacing distribution across all paraPr in authentic reference:")
for k, count in ls_counter.most_common():
    print(f"  type={k[0]}, value={k[1]}, unit={k[2]}: {count} occurrences")

# 2. Inspect fontfaces
print("\n=== FONTFACES IN AUTHENTIC HWPX ===")
for ff in root_hdr.findall(".//{*}fontface"):
    lang = ff.get("lang")
    font_cnt = ff.get("fontCnt")
    fonts = [f.get("name") for f in ff.findall(".//{*}font")]
    print(f"  lang={lang} fontCnt={font_cnt}: {fonts}")

# 3. Inspect charPr font mapping
print("\n=== CHARPR FONT MAPPING IN AUTHENTIC HWPX ===")
for i, cp in enumerate(root_hdr.findall(".//{*}charPr")[:10]):
    rf = cp.find(".//{*}refFont")
    sz = cp.find(".//{*}sz")
    sz_val = sz.get("value") if sz is not None else None
    rf_attr = rf.attrib if rf is not None else None
    print(f"  charPr[{i}]: sz={sz_val} refFont={rf_attr}")

# 4. Compare with our current HwpxCanvasRenderer
print("\n=== CURRENT GENERATED HWPX (stage7-portrait.hwpx) ===")
with zipfile.ZipFile("debug/hwpx-page-orientation-fix/stage7-portrait.hwpx") as z:
    our_hdr_xml = z.read("Contents/header.xml").decode("utf-8")

our_root_hdr = ET.fromstring(our_hdr_xml)
print("Our fontfaces:")
for ff in our_root_hdr.findall(".//{*}fontface"):
    lang = ff.get("lang")
    fonts = [f.get("name") for f in ff.findall(".//{*}font")]
    print(f"  lang={lang}: {fonts}")

print("Our paraPr lineSpacing:")
our_ls_counter = Counter()
for pp in our_root_hdr.findall(".//{*}paraPr"):
    ls = pp.find(".//{*}lineSpacing")
    if ls is not None:
        our_ls_counter[(ls.get("type"), ls.get("value"), ls.get("unit"))] += 1
for k, count in our_ls_counter.most_common():
    print(f"  type={k[0]}, value={k[1]}, unit={k[2]}: {count} occurrences")
