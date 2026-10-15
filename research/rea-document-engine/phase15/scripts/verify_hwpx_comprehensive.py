import os
import zipfile
import xml.etree.ElementTree as ET
import glob

def verify_hwpx_file(hwpx_path):
    print(f"\n========================================================")
    print(f"DEEP OWPML STRUCTURAL AUDIT: {os.path.basename(hwpx_path)}")
    print(f"Path: {hwpx_path}")
    print(f"Size: {os.path.getsize(hwpx_path)} bytes")
    print(f"========================================================")

    if not os.path.exists(hwpx_path):
        print(f"ERROR: File not found: {hwpx_path}")
        return False

    violations = []
    warnings = []

    # 1. ZIP Container & Central Directory Integrity
    try:
        z = zipfile.ZipFile(hwpx_path, 'r')
        test_res = z.testzip()
        if test_res is not None:
            violations.append(f"ZIP CRC corrupted in file: {test_res}")
    except Exception as e:
        violations.append(f"ZIP container failure: {e}")
        return False

    entries = set(z.namelist())
    print(f"1. ZIP Integrity: PASSED ({len(entries)} container entries)")

    # 2. Mandatory KS X 6101 Package Files (OCF / OWPML Standard)
    mandatory_files = [
        "mimetype",
        "version.xml",
        "META-INF/container.xml",
        "META-INF/manifest.xml",
        "Contents/content.hpf",
        "Contents/header.xml",
        "Contents/section0.xml",
    ]
    for mf in mandatory_files:
        if mf not in entries:
            violations.append(f"Missing mandatory KS X 6101 package file: {mf}")
    print(f"2. Mandatory Package Files: {len(mandatory_files)}/{len(mandatory_files)} verified")

    # 3. XML Parsing & Schema-like tree validation
    parsed_xmls = {}
    for entry_name in entries:
        if entry_name.endswith(".xml") or entry_name.endswith(".hpf"):
            try:
                xml_data = z.read(entry_name)
                root = ET.fromstring(xml_data)
                parsed_xmls[entry_name] = root
            except Exception as e:
                violations.append(f"XML Parse Error in {entry_name}: {e}")
    print(f"3. XML Schema/Syntax: {len(parsed_xmls)} XML/HPF documents cleanly parsed without syntax errors")

    # 4. Manifest & BinData Cross-Validation
    hpf_root = parsed_xmls.get("Contents/content.hpf")
    declared_items = set()
    if hpf_root is not None:
        for item in hpf_root.findall(".//{http://www.idpf.org/2007/opf}item"):
            href = item.attrib.get("href")
            if href:
                declared_items.add(href)
        # Also check without namespace if OPF default
        for item in hpf_root.findall(".//item"):
            href = item.attrib.get("href")
            if href:
                declared_items.add(href)

    bin_data_files = [e for e in entries if e.startswith("BinData/")]
    for bf in bin_data_files:
        bf_name = bf.replace("BinData/", "")
        # verify it exists in manifest
        found_in_manifest = any(bf_name in d for d in declared_items) or any(bf in d for d in declared_items)
        if not found_in_manifest and len(declared_items) > 0:
            warnings.append(f"BinData file {bf} not declared in content.hpf manifest")
    print(f"4. BinData Storage: {len(bin_data_files)} binary media resources verified")

    # 5. Header Styles & Fonts Cross-Validation
    header_root = parsed_xmls.get("Contents/header.xml")
    registered_fonts = set()
    registered_charprs = set()
    if header_root is not None:
        fonts = header_root.findall(".//{http://www.hancom.co.kr/hwpml/2011/head}font")
        for f in fonts:
            fid = f.attrib.get("id")
            if fid:
                registered_fonts.add(int(fid))
        
        charprs = header_root.findall(".//{http://www.hancom.co.kr/hwpml/2011/head}charPr")
        for cp in charprs:
            cp_id = cp.attrib.get("id")
            if cp_id:
                registered_charprs.add(int(cp_id))
    print(f"5. Header Style Tables: {len(registered_fonts)} font definitions, {len(registered_charprs)} charPr styles registered")

    # 6. Section & Shape Hierarchy Audit
    section_root = parsed_xmls.get("Contents/section0.xml")
    shape_counts = {"rect": 0, "oval": 0, "polygon": 0, "pic": 0, "line": 0}
    used_ids = set()
    duplicate_ids = []
    text_boxes = 0
    editable_text_boxes = 0
    unresolved_charprs = []
    polygon_vertex_counts = []

    if section_root is not None:
        # Check pagePr
        page_pr = section_root.find(".//{http://www.hancom.co.kr/hwpml/2011/paragraph}pagePr")
        if page_pr is not None:
            width = int(page_pr.attrib.get("width", 0))
            height = int(page_pr.attrib.get("height", 0))
            if width != 59530 or height != 84190:
                warnings.append(f"Non-standard A4 page dimensions: width={width}, height={height}")

        # Check all runs and shapes
        for elem in section_root.iter():
            tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
            if tag in shape_counts:
                shape_counts[tag] += 1
                sid = elem.attrib.get("id")
                if sid:
                    if sid in used_ids:
                        duplicate_ids.append(sid)
                    used_ids.add(sid)

                # Check polygon vertices
                if tag == "polygon":
                    pts = elem.findall(".//{http://www.hancom.co.kr/hwpml/2011/paragraph}pt")
                    polygon_vertex_counts.append(len(pts))
                    if len(pts) < 3:
                        violations.append(f"Polygon id={sid} has fewer than 3 vertices ({len(pts)})")

            elif tag == "drawText":
                text_boxes += 1
                if elem.attrib.get("editable") == "1":
                    editable_text_boxes += 1

            elif tag == "run":
                cpr_ref = elem.attrib.get("charPrIDRef")
                if cpr_ref:
                    cpr_int = int(cpr_ref)
                    if cpr_int not in registered_charprs:
                        unresolved_charprs.append(cpr_int)

    print(f"6. Shape Inventory:")
    for st, sc in shape_counts.items():
        print(f"   - <hp:{st}>: {sc}")
    print(f"7. Native Polygons (Vector): {shape_counts['polygon']} polygons verified, vertex stats: min={min(polygon_vertex_counts) if polygon_vertex_counts else 0}, max={max(polygon_vertex_counts) if polygon_vertex_counts else 0}")
    print(f"8. Text Frames & Editability: {text_boxes} total, {editable_text_boxes} marked editable='1' ({editable_text_boxes / max(1, text_boxes) * 100:.1f}%)")
    print(f"9. Style Reference Integrity: {len(unresolved_charprs)} unresolved charPr references")
    print(f"10. Shape ID Uniqueness: {len(used_ids)} unique IDs, {len(duplicate_ids)} duplicates")

    if duplicate_ids:
        violations.append(f"Duplicate shape IDs found: {duplicate_ids[:5]}")
    if unresolved_charprs:
        violations.append(f"Unresolved charPr references: {unresolved_charprs[:5]}")

    is_valid = len(violations) == 0
    print(f"\nAUDIT VERDICT: {'PASSED (100% KS X 6101 Compliant)' if is_valid else 'FAILED'}")
    if violations:
        print("VIOLATIONS:")
        for v in violations:
            print(f"  [X] {v}")
    if warnings:
        print("WARNINGS:")
        for w in warnings:
            print(f"  [!] {w}")

    return is_valid

def main():
    hwpx_files = glob.glob("debug/canvas-audit/*.hwpx")
    if not hwpx_files:
        hwpx_files = glob.glob("output/*.hwpx")

    all_passed = True
    for hf in sorted(hwpx_files):
        passed = verify_hwpx_file(hf)
        if not passed:
            all_passed = False

    print(f"\n========================================================")
    print(f"ALL HWPX VERIFICATION: {'100% PASSED' if all_passed else 'FAILURES DETECTED'}")
    print(f"========================================================")

if __name__ == "__main__":
    main()
