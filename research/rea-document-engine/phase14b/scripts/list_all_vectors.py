import json

for r in [1, 2, 3]:
    p = f"debug/customer/Report{r}-Live-Snapshot.json"
    with open(p, "r", encoding="utf-8") as f:
        d = json.load(f)
    print(f"=== Report {r} Vectors ===")
    def walk(n, path=""):
        if n.get("type") == "VECTOR":
            box = n.get("absoluteBoundingBox", {})
            print(f"  ID: {n.get('id')}, name: {n.get('name')}, parent: {path}, box: {box.get('width')}x{box.get('height')}, strokes: {len(n.get('strokes', []))}, fills: {len(n.get('fills', []))}")
        for c in n.get("children", []):
            walk(c, path + " / " + str(n.get("name")))
    walk(d["figmaNode"])

