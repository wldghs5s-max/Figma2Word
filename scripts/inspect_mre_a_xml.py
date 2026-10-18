import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile('debug/hwpx-overlap-mre/mre-A-baseline.hwpx') as z:
    sec = z.read('Contents/section0.xml').decode('utf-8')
    hdr = z.read('Contents/header.xml').decode('utf-8')

root_sec = ET.fromstring(sec)
root_hdr = ET.fromstring(hdr)

rects = root_sec.findall('.//{*}rect')
print(f'Total rects in section0: {len(rects)}')
for i, r in enumerate(rects):
    dt = r.find('.//{*}drawText')
    pt = r.find('.//{*}pt')
    pt_x = pt.get('x') if pt is not None else None
    pt_y = pt.get('y') if pt is not None else None
    sz = r.find('.//{*}sz')
    sz_w = sz.get('width') if sz is not None else None
    sz_h = sz.get('height') if sz is not None else None

    if dt is not None:
        sub = dt.find('.//{*}subList')
        t_all = ''.join(t.text or '' for t in dt.findall('.//{*}t'))
        p = sub.find('.//{*}p') if sub is not None else None
        pid = p.get('paraPrIDRef') if p is not None else None
        print(f'Rect[{i}] name="{dt.get("name")}" pos=({pt_x}, {pt_y}) sz=({sz_w}, {sz_h}) lineWrap={sub.get("lineWrap") if sub is not None else None} vertAlign={sub.get("vertAlign") if sub is not None else None} paraPr={pid} text="{t_all[:40]}"')
    else:
        print(f'Rect[{i}] (No text) pos=({pt_x}, {pt_y}) sz=({sz_w}, {sz_h})')
