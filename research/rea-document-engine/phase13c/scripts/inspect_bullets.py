import json

with open('debug/customer/Report3-Live-Snapshot.json', encoding='utf-8') as f:
    d = json.load(f)

p9 = d['figmaNode']['children'][9]

def walk(n):
    if n.get('name') == 'sub-opinion-bullets':
        print('Found sub-opinion-bullets!')
        print('type:', n.get('type'))
        print('visible:', n.get('visible'))
        print('fills:', n.get('fills'))
        print('children count:', len(n.get('children', [])))
        for c in n.get('children', []):
            print('  child:', c.get('name'), c.get('type'), 'children count:', len(c.get('children', [])))
            for gc in c.get('children', []):
                print('    gchild:', gc.get('name'), gc.get('type'), 'characters:', gc.get('characters', '')[:30], 'fills:', gc.get('fills'), 'strokes:', gc.get('strokes'))
                for ggc in gc.get('children', []):
                    print('      ggchild:', ggc.get('name'), ggc.get('type'), ggc.get('characters', '')[:30])
    for c in n.get('children', []):
        walk(c)

walk(p9)
