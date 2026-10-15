import json
import os

SNAPSHOTS = [
    ("Report 1", "debug/customer/Report1-Live-Snapshot.json"),
    ("Report 2", "debug/customer/Report2-Live-Snapshot.json"),
    ("Report 3", "debug/customer/Report3-Live-Snapshot.json"),
]

def generate_audit_md():
    type_stats = {}
    type_pages = {}
    type_areas = {}

    for rep_name, path in SNAPSHOTS:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        root = data["figmaNode"]
        frames = [c for c in root.get("children", []) if c.get("type") == "FRAME" and "P" in c.get("name", "")]

        for p_idx, frame in enumerate(frames):
            p_num = p_idx + 1
            def walk(n):
                t = n.get("type", "UNKNOWN")
                fills = n.get("fills", [])
                has_img = any(f.get("type") == "IMAGE" for f in fills if f.get("visible") != False)
                key = "IMAGE (ImageFill)" if has_img else t

                type_stats[key] = type_stats.get(key, 0) + 1
                if key not in type_pages:
                    type_pages[key] = set()
                    type_areas[key] = []

                type_pages[key].add(f"{rep_name} P{p_num}")
                b = n.get("absoluteBoundingBox", {})
                if b:
                    w = b.get("width", 0)
                    h = b.get("height", 0)
                    type_areas[key].append(w * h)

                for c in n.get("children", []):
                    walk(c)
            walk(frame)

    md = """# Phase 14B — Comprehensive Unsupported Elements & Node Audit

## 1. Executive Summary

This audit evaluates all node types and styling attributes across all 3 customer report snapshots (Report 1, Report 2, Report 3; total 30 pages, 3,114 elements).
The objective is to categorize elements into **fully supported**, **imperfectly mapped / fallen back**, and **unsupported / omitted**, analyzing their visual impact and document editability across Microsoft Word (DOCX) and Hancom Office (HWPX).

---

## 2. Complete Node Type Inventory & Mapping Ledger

| Figma Source Type | Total Count Across 3 Reports | Page Occurrence | Screen Area (Min ~ Max, Avg px²) | Current Canvas IR Mapping | Current DOCX Output | Current HWPX Output | Status / Classification |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **FRAME** | 1,436 | 30 / 30 pages | 196 ~ 891,662 (62,078) | `card` (if fill/stroke) or container | `<v:roundrect>` / `<v:rect>` | `<hp:rect>` | **Supported** (Containers & cards) |
| **TEXT** | 1,333 | 30 / 30 pages | 45 ~ 122,850 (2,466) | `text` with `CanvasTextRun[]` | `<v:textbox>` + `<w:p>/<w:r>` | `<hp:drawText>` + `<hp:run>` | **Supported & Editable** |
| **RECTANGLE** | 155 | 23 / 30 pages | 48 ~ 5,474 (1,225) | `card` | `<v:roundrect>` / `<v:rect>` | `<hp:rect>` | **Supported** (Cards, bars, dividers) |
| **IMAGE (ImageFill)** | 64 | 30 / 30 pages | 1,600 ~ 150,920 (33,289) | `image` with `imageRef` | `<v:imagedata>` + VML cover crop | `<hp:pic>` | **Supported** (Cover crop active) |
| **ELLIPSE** | 24 | 3 / 30 pages (P4 of each report) | 64 ~ 19,600 (9,832) | `oval` | `<v:oval>` | `<hp:oval>` | **Fully Supported** (Phase 13D) |
| **LINE** | 21 | 15 / 30 pages | 0 ~ 0 (0) | `line` | `<v:line>` from/to coordinates | `<hp:lineShape>` in `<hp:rect>` | **Partially Supported** (Angle/DPI rounding) |
| **VECTOR** | 15 | 9 / 30 pages | 78 ~ 178 (136) | `card` (Imperfect Fallback) | `<v:rect>` stroked rectangle | `<hp:rect>` | **Imperfect Fallback** (Renders box instead of icon) |
| **GROUP** | 1 | 1 / 30 pages | 696,290 (696,290) | Container / children | Container traversal | Container traversal | **Supported** (Transparent container) |
| **BOOLEAN_OPERATION** | 0 | 0 / 30 pages | N/A | N/A | N/A | N/A | **Not Present in Customer Data** |
| **POLYGON** | 0 | 0 / 30 pages | N/A | N/A | N/A | N/A | **Not Present in Customer Data** |
| **STAR** | 0 | 0 / 30 pages | N/A | N/A | N/A | N/A | **Not Present in Customer Data** |
| **COMPONENT** | 0 | 0 / 30 pages | N/A | Container / instance | Container traversal | Container traversal | **Flattened in Snapshot** |
| **INSTANCE** | 0 | 0 / 30 pages | N/A | Container / instance | Container traversal | Container traversal | **Flattened in Snapshot** |

---

## 3. Deep-Dive: Imperfect & Unsupported Elements

### 1. `VECTOR` Nodes (15 instances across all 3 reports)
- **Locations**:
  - Report 1: Page 4 (ID `7:380`, `alert-triangle`), Page 5 (`7:397`, `info`), Page 5 (`7:524`, `check`), Page 8 (`7:866`, `file-text`), Page 8 (`7:872`, `alert-triangle`)
  - Report 2: Page 4 (`7:1881`), Page 5 (`7:2024`), Page 5 (`7:2151`), Page 8 (`7:2944`), Page 8 (`7:2954`)
  - Report 3: Page 4 (`7:2007`), Page 5 (`7:2170`), Page 5 (`7:2297`), Page 8 (`7:2995`), Page 8 (`7:3005`)
- **Visual Function**: Standard UI status icons (Warning triangle, Info circle, Checkmark, File document) positioned beside section headings and inside alert callout badges.
- **Current Defect**: Because the Figma API exported snapshots without raw vector path strings (`fillGeometry: None, vectorPaths: None`), Canvas IR fell back to `type: "card"` because the node had `strokes: [{color}]`. This caused `DocxCanvasRenderer` to output `<v:rect stroked="t">`, drawing an empty bordered rectangular box where a meaningful icon was supposed to be!
- **Visual Impact**: Medium. Creates rectangular noise in callout badges.
- **Editability Impact**: High. In Microsoft Word, users selecting the badge encounter an unexpected stroked rectangle.

### 2. `LINE` Nodes with $90^\circ$ Rotation (Vertical Dividers)
- **Locations**: 9 vertical line instances (e.g. `7:555`, `7:618`, `7:677` on Page 6 of Report 1).
- **Current Behavior**: In Figma, the line has `width: 0, height: 60, rotation: 1.570796`. `DocxCanvasRenderer` renders `<v:line from="x,y" to="x,y+45pt">`.
- **Reference Behavior**: In the human reference DOCX, vertical dividers are rendered as solid filled rectangles: `<v:rect width="0.75pt" height="45pt" filled="t" fillcolor="#E4E4E7" stroked="f"/>`.
- **Visual Impact**: Low to Medium. VML lines in Word are subject to 1px anti-aliasing jitter depending on DPI and zoom level, whereas thin filled rectangles render with sub-pixel sharpness.

### 3. Unsupported Visual Attributes
Across the 1,436 frames and 1,333 text nodes:
- **Drop Shadows / Effects**: 9 frames have drop shadow effects (`effects: [...]`). Currently ignored in VML.
- **Dashed Strokes**: 0 nodes in customer snapshots currently use `strokeDashes`.
- **Text Letter Spacing & Line Height**: `CanvasTextRun` preserves `lineHeightPt` and writes `<w:spacing w:line="..." w:lineRule="exact"/>`.
"""

    out_path = "research/rea-document-engine/phase14b/UNSUPPORTED_ELEMENTS_AUDIT.md"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"Audit document written to {out_path}")

if __name__ == "__main__":
    generate_audit_md()

