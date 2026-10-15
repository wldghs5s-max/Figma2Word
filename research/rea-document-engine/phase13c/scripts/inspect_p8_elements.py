import zipfile
import re
import json

print("=== Comparing Elements on Page 8 of Report 2 ===")

# 1. Check Figma JSON node for page 8 (child index 7: 7:3115)
with open('debug/customer/Report2-Live-Snapshot.json', 'r', encoding='utf-8') as f:
    figma_data = json.load(f)

p8_figma = None
for c in figma_data['figmaNode']['children']:
    if 'P6b' in c['name']:
        p8_figma = c
        break

print(f"Figma Frame: {p8_figma['name']} (id: {p8_figma['id']})")

# Let's inspect background fills and images in this figma frame
fills = []
images = []
texts = []
rects = []

def traverse(node):
    if 'fills' in node:
        for fill in node['fills']:
            if fill.get('visible', True):
                if fill.get('type') == 'IMAGE':
                    images.append((node.get('name'), node.get('id'), fill.get('imageRef'), node.get('absoluteBoundingBox')))
                elif fill.get('type') == 'SOLID':
                    color = fill.get('color', {})
                    opacity = fill.get('opacity', 1.0)
                    fills.append((node.get('name'), node.get('id'), color, opacity, node.get('absoluteBoundingBox')))
    if node.get('type') == 'TEXT':
        texts.append((node.get('name'), node.get('characters', ''), node.get('absoluteBoundingBox')))
    for ch in node.get('children', []):
        traverse(ch)

traverse(p8_figma)
print(f"Figma Node Image Fills count: {len(images)}")
for im in images:
    print(f"  IMAGE: name='{im[0]}' id='{im[1]}' ref='{im[2]}' bbox={im[3]}")

print(f"Figma Node Solid Fills count: {len(fills)}")
print(f"Figma Node Texts count: {len(texts)}")
for t in texts[:8]:
    print(f"  TEXT: '{t[1][:30]}' at {t[2]}")
