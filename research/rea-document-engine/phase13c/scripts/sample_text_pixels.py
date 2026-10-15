import struct
import zlib

def read_png_raw(png_path):
    with open(png_path, "rb") as f:
        f.read(8)
        width, height = 0, 0
        idat = []
        while True:
            chunk_len_bytes = f.read(4)
            if not chunk_len_bytes: break
            l = struct.unpack(">I", chunk_len_bytes)[0]
            t = f.read(4)
            d = f.read(l)
            f.read(4)
            if t == b"IHDR":
                width, height, _, _, _, _, _ = struct.unpack(">IIBBBBB", d)
            elif t == b"IDAT":
                idat.append(d)
            elif t == b"IEND":
                break
        raw = zlib.decompress(b"".join(idat))
        return width, height, raw

w1, h1, raw1 = read_png_raw("research/rea-document-engine/phase13c/renders/ref_report1/ref-Page01.png")
w2, h2, raw2 = read_png_raw("research/rea-document-engine/phase13c/renders/canvas_report1/canvas-Page01.png")

stride = 1 + w1 * 4

# Check pixels at around X=200, Y=390 (around '해운대동신아파트', margin-top ~162pt * 2.35 ≈ 380px)
for y in range(375, 420, 10):
    for x in range(150, 450, 60):
        off = y * stride + 1 + x * 4
        r1, g1, b1 = raw1[off], raw1[off+1], raw1[off+2]
        r2, g2, b2 = raw2[off], raw2[off+1], raw2[off+2]
        print(f"At ({x}, {y}): Ref RGB=({r1:3d},{g1:3d},{b1:3d}) | Canvas RGB=({r2:3d},{g2:3d},{b2:3d})")
