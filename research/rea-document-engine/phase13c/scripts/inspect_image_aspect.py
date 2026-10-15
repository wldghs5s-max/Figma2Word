import zipfile
import struct

def get_png_size(zip_path, img_name):
    with zipfile.ZipFile(zip_path, 'r') as z:
        data = z.read(img_name)
        w, h = struct.unpack(">II", data[16:24])
        return w, h, len(data)

cw, ch, csize = get_png_size('debug/canvas-audit/report-1-canvas.docx', 'word/media/image2.png')
rw, rh, rsize = get_png_size(r'완성본-20261012\report-1차-진단-편집가능-Word보정-v3.docx', 'word/media/image2.png')

print(f"Canvas image2.png: {cw}x{ch} (aspect: {cw/ch:.3f}), size={csize} bytes")
print(f"Ref image2.png:    {rw}x{rh} (aspect: {rw/rh:.3f}), size={rsize} bytes")
print(f"Node in Figma:    686x220 (aspect: {686/220:.3f})")

