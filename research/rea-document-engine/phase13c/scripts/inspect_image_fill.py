import json

with open('debug/customer/Report1-Live-Snapshot.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

def find_node_with_image(node, target_ref):
    if 'fills' in node:
        for fill in node['fills']:
            if fill.get('imageRef') == target_ref:
                return node, fill
    for ch in node.get('children', []):
        res = find_node_with_image(ch, target_ref)
        if res: return res
    return None

target_ref = "2d1662aa31b4dab881de9a4aff399b4bd4153dbd"
result = find_node_with_image(d['figmaNode'], target_ref)
if result:
    node, fill = result
    print("Found node!")
    print("Node name:", node.get('name'), "id:", node.get('id'), "type:", node.get('type'))
    print("BBox:", node.get('absoluteBoundingBox'))
    print("Fill:", json.dumps(fill, indent=2))
else:
    print("Node not found!")

