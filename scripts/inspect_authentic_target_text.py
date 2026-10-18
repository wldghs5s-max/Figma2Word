import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile('완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx') as z:
    sec = z.read('Contents/section0.xml').decode('utf-8')
    hdr = z.read('Contents/header.xml').decode('utf-8')

root_sec = ET.fromstring(sec)
root_hdr = ET.fromstring(hdr)

para_map = {}
for pp in root_hdr.findall('.//{*}paraPr'):
    pid = pp.get('id')
    ls = pp.find('.//{*}lineSpacing')
    if ls is not None:
        para_map[pid] = (ls.get('type'), ls.get('value'), ls.get('unit'))

char_map = {}
for cp in root_hdr.findall('.//{*}charPr'):
    cid = cp.get('id')
    h = cp.get('height')
    rf = cp.find('.//{*}fontRef')
    char_map[cid] = (h, rf.attrib if rf is not None else {})

for sublist in root_sec.findall('.//{*}subList'):
    lw = sublist.get('lineWrap')
    va = sublist.get('vertAlign')
    for p in sublist.findall('.//{*}p'):
        t_elems = p.findall('.//{*}t')
        txt = ''.join(t.text or '' for t in t_elems)
        if any(k in txt for k in ['균열밀도', '0.031', '품질 가공', '전반적인', '정제 검출']):
            pid = p.get('paraPrIDRef')
            # find runs
            cids = [r.find('.//{*}c').get('charPrIDRef') for r in p.findall('.//{*}run') if r.find('.//{*}c') is not None]
            print(f'Text: "{txt.strip()}"')
            print(f'   subList lineWrap={lw}, vertAlign={va}')
            print(f'   paraPrIDRef={pid} -> lineSpacing={para_map.get(pid)}')
            print(f'   charPrIDRefs={cids} -> charPr={ [char_map.get(cid) for cid in cids] }')
