import json
import os
import zipfile
import xml.etree.ElementTree as ET

def audit_p8():
    json_path = "debug/customer/Report2-Live-Snapshot.json"
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    figma_node = data.get("figmaNode", {})
    frames = [c for c in figma_node.get("children", []) if c.get("type") == "FRAME"]
    print(f"Total top-level frames in Report2: {len(frames)}")

    for i, fr in enumerate(frames):
        name = fr.get('name')
        fid = fr.get('id')
        bbox = fr.get('absoluteBoundingBox')
        print(f"Page {i+1} (Index {i}): id={fid}, name='{name}', bbox={bbox}")

    # Inspect Frame Index 7 (Page 8 in document sequence: P6b)
    # and Frame Index 9 (Name includes P8)
    for target_idx in [6, 7, 8, 9]:
        fr = frames[target_idx]
        print(f"\n========================================================")
        print(f"AUDIT OF PAGE {target_idx + 1} (Frame Index {target_idx}, Name: '{fr.get('name')}', ID: {fr.get('id')})")
        print(f"========================================================")
        
        all_nodes = []
        def collect(n):
            all_nodes.append(n)
            for ch in n.get("children", []):
                collect(ch)
        collect(fr)

        print(f"Total descendant nodes: {len(all_nodes)}")

        # Count images / photo cards
        images = []
        for n in all_nodes:
            fills = n.get("fills", [])
            has_img = any(f.get("type") == "IMAGE" for f in fills)
            if has_img:
                images.append(n)

        print(f"Nodes with IMAGE fills: {len(images)}")
        for img in images:
            print(f"  IMAGE Node: id={img.get('id')}, name='{img.get('name')}', type={img.get('type')}, bbox={img.get('absoluteBoundingBox')}")

        # List all direct children of this page frame
        direct_children = fr.get("children", [])
        print(f"\nDirect children count: {len(direct_children)}")
        for dc in direct_children:
            print(f"  Child: type={dc.get('type')}, name='{dc.get('name')}', id={dc.get('id')}, bbox={dc.get('absoluteBoundingBox')}")

    # Now let's inspect the Reference Word DOCX for Report 2
    ref_folder = None
    for item in os.listdir("."):
        if "20261012" in item:
            ref_folder = item
            break

    if ref_folder:
        docx_candidates = [os.path.join(ref_folder, f) for f in os.listdir(ref_folder) if "report-2" in f.lower() and f.endswith(".docx")]
        if docx_candidates:
            ref_docx = docx_candidates[0]
            print(f"\n========================================================")
            print(f"AUDIT OF REFERENCE DOCX: {ref_docx}")
            print(f"========================================================")
            with zipfile.ZipFile(ref_docx, "r") as z:
                doc_xml = z.read("word/document.xml").decode("utf-8")
                root = ET.fromstring(doc_xml)
                vml_shapes = root.findall(".//{urn:schemas-microsoft-com:vml}shape")
                vml_rects = root.findall(".//{urn:schemas-microsoft-com:vml}rect")
                vml_images = root.findall(".//{urn:schemas-microsoft-com:vml}imagedata")
                print(f"Reference DOCX total shapes: {len(vml_shapes)}, rects: {len(vml_rects)}, imagedata: {len(vml_images)}")

                # Look for sectPr / page breaks to see how many pages and shapes per page
                body = root.find("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}body")
                paras = body.findall("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p")
                print(f"Total paragraphs in body: {len(paras)}")
                
                # Check rendered PNGs of ref_report2 vs canvas_report2 on Page 7, 8, 9
                renders_dir = "research/rea-document-engine/phase13c/renders"
                ref_p8_png = os.path.join(renders_dir, "ref_report2", "ref-Page08.png")
                canvas_p8_png = os.path.join(renders_dir, "canvas_report2", "canvas-Page08.png")
                print(f"Ref Page 8 PNG exists: {os.path.exists(ref_p8_png)}")
                print(f"Canvas Page 8 PNG exists: {os.path.exists(canvas_p8_png)}")

if __name__ == "__main__":
    audit_p8()

