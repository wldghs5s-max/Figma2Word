import zipfile
import hashlib

def hash_images_in_docx(docx_path):
    hashes = {}
    with zipfile.ZipFile(docx_path, 'r') as z:
        for name in z.namelist():
            if name.startswith('word/media/'):
                data = z.read(name)
                h = hashlib.md5(data).hexdigest()
                hashes[name] = (len(data), h)
    return hashes

c_imgs = hash_images_in_docx('debug/canvas-audit/report-1-canvas.docx')
r_imgs = hash_images_in_docx(r'완성본-20261012\report-1차-진단-편집가능-Word보정-v3.docx')

print(f"Canvas images ({len(c_imgs)}):")
for name, (size, h) in sorted(c_imgs.items()):
    print(f"  {name}: {size} bytes, md5={h}")

print(f"\nRef images ({len(r_imgs)}):")
for name, (size, h) in sorted(r_imgs.items()):
    print(f"  {name}: {size} bytes, md5={h}")
