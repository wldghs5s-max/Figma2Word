import struct
import zlib
import os

def read_png_pixels(png_path):
    with open(png_path, "rb") as f:
        signature = f.read(8)
        width, height = 0, 0
        idat_chunks = []
        while True:
            chunk_len_bytes = f.read(4)
            if not chunk_len_bytes or len(chunk_len_bytes) < 4:
                break
            chunk_len = struct.unpack(">I", chunk_len_bytes)[0]
            chunk_type = f.read(4)
            chunk_data = f.read(chunk_len)
            f.read(4) # crc
            if chunk_type == b"IHDR":
                width, height, _, _, _, _, _ = struct.unpack(">IIBBBBB", chunk_data)
            elif chunk_type == b"IDAT":
                idat_chunks.append(chunk_data)
            elif chunk_type == b"IEND":
                break
                
        raw_data = zlib.decompress(b"".join(idat_chunks))
        # Parse RGBA scanlines (filter byte + 4 bytes per pixel)
        stride = width * 4
        # We can extract downsampled luminance grid for fast analysis
        step = 4
        sub_w = width // step
        sub_h = height // step
        grid = bytearray(sub_w * sub_h)
        
        # Scanlines have 1 filter byte at start of each row
        row_len = 1 + stride
        for gy in range(sub_h):
            y = gy * step
            row_offset = y * row_len + 1 # skip filter byte (assuming 0/none or close enough for sampled analysis)
            for gx in range(sub_w):
                x = gx * step
                p_offset = row_offset + x * 4
                if p_offset + 2 < len(raw_data):
                    r = raw_data[p_offset]
                    g = raw_data[p_offset + 1]
                    b = raw_data[p_offset + 2]
                    # luminance
                    lum = int(0.299 * r + 0.587 * g + 0.114 * b)
                    grid[gy * sub_w + gx] = lum
        return width, height, sub_w, sub_h, grid

w1, h1, sw, sh, g1 = read_png_pixels("research/rea-document-engine/phase13c/renders/ref_report2/ref-Page08.png")
w2, h2, _, _, g2 = read_png_pixels("research/rea-document-engine/phase13c/renders/canvas_report2/canvas-Page08.png")

print(f"Comparing 350x495 sampled grids...")

# Check 10 vertical bands
bands = 10
band_h = sh // bands
for b in range(bands):
    start_y = b * band_h
    end_y = (b + 1) * band_h
    diffs = 0
    total = band_h * sw
    avg_lum1 = 0
    avg_lum2 = 0
    for y in range(start_y, end_y):
        for x in range(sw):
            l1 = g1[y * sw + x]
            l2 = g2[y * sw + x]
            avg_lum1 += l1
            avg_lum2 += l2
            if abs(l1 - l2) > 15:
                diffs += 1
    pct = (diffs / total) * 100
    print(f"Band {b} (Y: {start_y*4:4d}..{end_y*4:4d}): {pct:5.1f}% diff | avg L1={avg_lum1/total:5.1f}, avg L2={avg_lum2/total:5.1f}")

