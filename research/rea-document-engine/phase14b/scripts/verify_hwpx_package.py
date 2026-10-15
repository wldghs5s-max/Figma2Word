import zipfile
import xml.etree.ElementTree as ET
import os

HWPX_FILES = [
    ("Report 1 HWPX", "debug/canvas-audit/report-1-canvas.hwpx"),
    ("Report 2 HWPX", "debug/canvas-audit/report-2-canvas.hwpx"),
    ("Report 3 HWPX", "debug/canvas-audit/report-3-canvas.hwpx"),
]

def verify_hwpx():
    results = {}
    for label, path in HWPX_FILES:
        if not os.path.exists(path):
            results[label] = {"exists": False}
            continue

        res = {
            "exists": True,
            "sizeBytes": os.path.getsize(path),
            "files": [],
            "hasHeader": False,
            "hasSection0": False,
            "hasHpf": False,
            "fontCount": 0,
            "charPrCount": 0,
            "shapesCount": 0,
            "rectCount": 0,
            "ovalCount": 0,
            "picCount": 0,
            "drawTextCount": 0,
            "editableCount": 0,
            "pageCount": 0,
        }

        with zipfile.ZipFile(path, "r") as z:
            res["files"] = z.namelist()
            if "Contents/header.xml" in res["files"]:
                res["hasHeader"] = True
                h_xml = z.read("Contents/header.xml").decode("utf-8")
                res["fontCount"] = h_xml.count("<hh:font ")
                res["charPrCount"] = h_xml.count("<hh:charPr ")

            if "Contents/content.hpf" in res["files"]:
                res["hasHpf"] = True

            if "Contents/section0.xml" in res["files"]:
                res["hasSection0"] = True
                s_xml = z.read("Contents/section0.xml").decode("utf-8")
                res["rectCount"] = s_xml.count("<hp:rect ")
                res["ovalCount"] = s_xml.count("<hp:oval ")
                res["picCount"] = s_xml.count("<hp:pic ")
                res["drawTextCount"] = s_xml.count("<hp:drawText ")
                res["editableCount"] = s_xml.count('editable="1"')
                res["shapesCount"] = res["rectCount"] + res["ovalCount"] + res["picCount"]
                res["pageCount"] = s_xml.count("<hp:p ") # Root paragraphs per page

        results[label] = res

    print("=== HWPX OWPML STRUCTURE AUDIT ===")
    for label, r in results.items():
        print(f"\n[{label}] ({r['sizeBytes']} bytes)")
        print(f"  Package Files: {len(r['files'])} entries")
        print(f"  Header: {r['hasHeader']}, HPF: {r['hasHpf']}, Section0: {r['hasSection0']}")
        print(f"  Fonts: {r['fontCount']}, CharPrs: {r['charPrCount']}")
        print(f"  Shapes: total={r['shapesCount']} (rects={r['rectCount']}, ovals={r['ovalCount']}, pics={r['picCount']})")
        print(f"  Editable DrawText Blocks: {r['drawTextCount']} (editable='1': {r['editableCount']})")

if __name__ == "__main__":
    verify_hwpx()
