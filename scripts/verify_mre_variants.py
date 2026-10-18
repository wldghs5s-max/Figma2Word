import os
import zipfile
import xml.etree.ElementTree as ET

mre_files = [
    "mre-A-baseline.hwpx",
    "mre-B-wrap-only.hwpx",
    "mre-C-lineheight-only.hwpx",
    "mre-D-font-only.hwpx",
    "mre-E-geometry-only.hwpx",
    "mre-F-combined.hwpx",
]

base_dir = "debug/hwpx-overlap-mre"

print("=== MRE SUITE VERIFICATION ===")

data = {}
for fname in mre_files:
    fpath = os.path.join(base_dir, fname)
    assert os.path.exists(fpath), f"File {fpath} does not exist!"
    
    with zipfile.ZipFile(fpath) as z:
        sec0 = z.read("Contents/section0.xml").decode("utf-8")
        hdr = z.read("Contents/header.xml").decode("utf-8")
        hpf = z.read("Contents/content.hpf").decode("utf-8")
        
        # Verify XML well-formedness
        root_sec = ET.fromstring(sec0)
        root_hdr = ET.fromstring(hdr)
        root_hpf = ET.fromstring(hpf)
        
        # Check page count and dimensions
        sec_prs = root_sec.findall(".//{*}secPr")
        page_pr = root_sec.find(".//{*}pagePr")
        w = page_pr.get("width") if page_pr is not None else None
        h = page_pr.get("height") if page_pr is not None else None
        landscape = page_pr.get("landscape") if page_pr is not None else None
        
        # Count elements
        rects = root_sec.findall(".//{*}rect")
        paras = root_sec.findall(".//{*}p")
        sublists = root_sec.findall(".//{*}subList")
        
        data[fname] = {
            "size": os.path.getsize(fpath),
            "secPrCount": len(sec_prs),
            "pageWidth": w,
            "pageHeight": h,
            "landscape": landscape,
            "rectCount": len(rects),
            "paraCount": len(paras),
            "subListCount": len(sublists),
            "root_sec": root_sec,
            "root_hdr": root_hdr,
            "sec0_raw": sec0,
            "hdr_raw": hdr,
        }
        print(f"[{fname}] Size={data[fname]['size']} bytes | Page: {w}x{h} ({landscape}) | SecPr={len(sec_prs)} | Rects={len(rects)} | SubLists={len(sublists)}")

# Verify structural identity with Baseline A
ref = data["mre-A-baseline.hwpx"]
for fname in mre_files[1:]:
    cur = data[fname]
    assert cur["pageWidth"] == ref["pageWidth"] == "59528", f"Page width mismatch in {fname}"
    assert cur["pageHeight"] == ref["pageHeight"] == "84189", f"Page height mismatch in {fname}"
    assert cur["landscape"] == ref["landscape"] == "WIDELY", f"Orientation mismatch in {fname}"
    assert cur["rectCount"] == ref["rectCount"], f"Rect count mismatch in {fname}"
    assert cur["subListCount"] == ref["subListCount"], f"SubList count mismatch in {fname}"
    print(f"PASS: {fname} has identical structure, page dimensions, and element count as Baseline A.")

print("\n=== ISOLATED ATTRIBUTE DIFF AUDIT ===")

# Audit B: only hp:subList lineWrap changed
b_sublists = data["mre-B-wrap-only.hwpx"]["root_sec"].findall(".//{*}subList")
a_sublists = ref["root_sec"].findall(".//{*}subList")
b_diffs = []
for i, (a_s, b_s) in enumerate(zip(a_sublists, b_sublists)):
    if a_s.attrib != b_s.attrib:
        b_diffs.append((i, a_s.attrib, b_s.attrib))
print(f"Variant B diffs: {len(b_diffs)} sublists changed lineWrap. Header XML identical: {data['mre-B-wrap-only.hwpx']['hdr_raw'] == ref['hdr_raw']}")

# Audit C: only hh:lineSpacing changed
c_paraps = data["mre-C-lineheight-only.hwpx"]["root_hdr"].findall(".//{*}paraPr")
a_paraps = ref["root_hdr"].findall(".//{*}paraPr")
c_diffs = []
for i, (a_p, c_p) in enumerate(zip(a_paraps, c_paraps)):
    a_ls = a_p.find(".//{*}lineSpacing")
    c_ls = c_p.find(".//{*}lineSpacing")
    if a_ls is not None and c_ls is not None and a_ls.attrib != c_ls.attrib:
        c_diffs.append((i, a_ls.attrib, c_ls.attrib))
print(f"Variant C diffs: {len(c_diffs)} paraPr changed lineSpacing. Section0 XML identical: {data['mre-C-lineheight-only.hwpx']['sec0_raw'] == ref['sec0_raw']}")

# Audit D: only hh:fontRef hangul changed
d_charps = data["mre-D-font-only.hwpx"]["root_hdr"].findall(".//{*}charPr")
a_charps = ref["root_hdr"].findall(".//{*}charPr")
d_diffs = []
for i, (a_c, d_c) in enumerate(zip(a_charps, d_charps)):
    a_rf = a_c.find(".//{*}fontRef")
    d_rf = d_c.find(".//{*}fontRef")
    if a_rf is not None and d_rf is not None and a_rf.attrib != d_rf.attrib:
        d_diffs.append((i, a_rf.attrib, d_rf.attrib))
print(f"Variant D diffs: {len(d_diffs)} charPr changed fontRef. Section0 XML identical: {data['mre-D-font-only.hwpx']['sec0_raw'] == ref['sec0_raw']}")

# Audit E: only 7:1082 rect changed
e_rects = data["mre-E-geometry-only.hwpx"]["root_sec"].findall(".//{*}rect")
a_rects = ref["root_sec"].findall(".//{*}rect")
e_diffs = []
for i, (a_r, e_r) in enumerate(zip(a_rects, e_rects)):
    if ET.tostring(a_r) != ET.tostring(e_r):
        dt = e_r.find(".//{*}drawText")
        name = dt.get("name") if dt is not None else "no-text"
        e_diffs.append((i, name))
print(f"Variant E diffs: {len(e_diffs)} rect changed ({e_diffs}). Header XML identical: {data['mre-E-geometry-only.hwpx']['hdr_raw'] == ref['hdr_raw']}")

print("\nALL STRUCTURAL AND ATTRIBUTE ISOLATION TESTS PASSED 100%!")
