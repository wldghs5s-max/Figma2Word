import json
import os

SNAPSHOTS = [
    ("Report 1", "debug/customer/Report1-Live-Snapshot.json"),
    ("Report 2", "debug/customer/Report2-Live-Snapshot.json"),
    ("Report 3", "debug/customer/Report3-Live-Snapshot.json"),
]

def audit():
    overall_types = {}
    detailed_inventory = {}

    for rep_name, snap_path in SNAPSHOTS:
        with open(snap_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        root = data["figmaNode"]
        page_frames = [c for c in root.get("children", []) if c.get("type") == "FRAME" and "P" in c.get("name", "")]

        for page_idx, frame in enumerate(page_frames):
            page_num = page_idx + 1
            frame_box = frame.get("absoluteBoundingBox", {"x": 0, "y": 0, "width": 794, "height": 1123})

            def walk(node, parent_type=None):
                ntype = node.get("type", "UNKNOWN")
                overall_types[ntype] = overall_types.get(ntype, 0) + 1

                box = node.get("absoluteBoundingBox")
                width = box.get("width", 0) if box else 0
                height = box.get("height", 0) if box else 0
                area = width * height

                # Check properties
                fills = node.get("fills", [])
                strokes = node.get("strokes", [])
                has_image_fill = any(f.get("type") == "IMAGE" for f in fills if f.get("visible") != False)
                fill_geom = node.get("fillGeometry", [])
                stroke_geom = node.get("strokeGeometry", [])
                vector_paths = node.get("vectorPaths", [])
                rotation = node.get("rotation")
                opacity = node.get("opacity")
                effects = node.get("effects", [])
                dash_pattern = node.get("strokeDashes", [])
                stroke_weight = node.get("strokeWeight", 0)
                corner_radius = node.get("cornerRadius", 0)

                key = ntype
                if has_image_fill:
                    key = "IMAGE_FILL"

                if key not in detailed_inventory:
                    detailed_inventory[key] = {
                        "count": 0,
                        "pages": set(),
                        "reports": set(),
                        "max_area": 0,
                        "min_area": 999999999,
                        "total_area": 0,
                        "has_fill_geom": 0,
                        "has_vector_paths": 0,
                        "has_strokes": 0,
                        "has_stroke_dashes": 0,
                        "has_rotation": 0,
                        "has_opacity": 0,
                        "has_effects": 0,
                        "has_corner_radius": 0,
                        "samples": [],
                    }

                stat = detailed_inventory[key]
                stat["count"] += 1
                stat["pages"].add(f"{rep_name} P{page_num}")
                stat["reports"].add(rep_name)
                stat["total_area"] += area
                if area > stat["max_area"]:
                    stat["max_area"] = area
                if area > 0 and area < stat["min_area"]:
                    stat["min_area"] = area

                if fill_geom: stat["has_fill_geom"] += 1
                if vector_paths: stat["has_vector_paths"] += 1
                if strokes and stroke_weight > 0: stat["has_strokes"] += 1
                if dash_pattern: stat["has_stroke_dashes"] += 1
                if rotation and abs(rotation) > 0.001: stat["has_rotation"] += 1
                if opacity is not None and opacity < 0.999: stat["has_opacity"] += 1
                if effects: stat["has_effects"] += 1
                if corner_radius > 0: stat["has_corner_radius"] += 1

                if len(stat["samples"]) < 3:
                    stat["samples"].append({
                        "name": node.get("name"),
                        "id": node.get("id"),
                        "w": width,
                        "h": height,
                        "page": f"{rep_name} P{page_num}",
                        "fills": len(fills),
                        "strokes": len(strokes),
                        "dash": dash_pattern,
                        "fillGeomCount": len(fill_geom),
                        "pathSample": fill_geom[0].get("path", "")[:60] if fill_geom else None,
                    })

                for child in node.get("children", []):
                    walk(child, ntype)

            walk(frame)

    print("=== OVERALL TYPES ===")
    for k, v in sorted(overall_types.items(), key=lambda x: -x[1]):
        print(f"{k:20s}: {v}")

    print("\n=== DETAILED INVENTORY ===")
    for k, stat in sorted(detailed_inventory.items(), key=lambda x: -x[1]["count"]):
        print(f"\n--- {k} (Count: {stat['count']}) ---")
        print(f"  Reports: {', '.join(sorted(stat['reports']))}")
        print(f"  Pages count: {len(stat['pages'])}")
        print(f"  Area: min={stat['min_area']:.1f}, max={stat['max_area']:.1f}, avg={stat['total_area']/stat['count']:.1f}")
        print(f"  fillGeom: {stat['has_fill_geom']}, vectorPaths: {stat['has_vector_paths']}, strokes: {stat['has_strokes']}")
        print(f"  dashes: {stat['has_stroke_dashes']}, rotation: {stat['has_rotation']}, opacity: {stat['has_opacity']}, effects: {stat['has_effects']}")
        print("  Samples:")
        for s in stat["samples"]:
            print(f"    - {s['name']} ({s['id']}) on {s['page']} [{s['w']}x{s['h']}] fillGeom={s['fillGeomCount']} path={s['pathSample']}")

if __name__ == "__main__":
    audit()

