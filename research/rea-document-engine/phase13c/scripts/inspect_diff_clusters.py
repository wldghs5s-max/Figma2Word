import struct
import zlib

def inspect_diff_image(diff_png_path):
    with open(diff_png_path, "rb") as f:
        f.read(8) # sig
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
        stride = 1 + width * 4
        
        # Count magenta pixels (difference highlights: R=235, G=15, B=120)
        # and cyan pixels (out-of-bounds: R=0, G=180, B=255)
        # and analyze where they cluster (top/mid/bottom, left/center/right)
        rows_with_diff = [0] * height
        cols_with_diff = [0] * width
        total_diff = 0
        
        for y in range(height):
            row_offset = y * stride + 1
            for x in range(width):
                p = row_offset + x * 4
                r = raw[p]
                g = raw[p+1]
                b = raw[p+2]
                # Check for magenta (highlight)
                if r > 200 and g < 50 and b > 80:
                    rows_with_diff[y] += 1
                    cols_with_diff[x] += 1
                    total_diff += 1

        # Find min/max Y and min/max X of differences
        min_y = next((y for y, c in enumerate(rows_with_diff) if c > 0), None)
        max_y = next((y for y in range(height-1, -1, -1) if rows_with_diff[y] > 0), None)
        min_x = next((x for x, c in enumerate(cols_with_diff) if c > 0), None)
        max_x = next((x for x in range(width-1, -1, -1) if cols_with_diff[x] > 0), None)

        return {
            'width': width,
            'height': height,
            'total_diff_pixels': total_diff,
            'diff_ratio': total_diff / (width * height),
            'diff_bbox': (min_x, min_y, max_x, max_y)
        }

diff_paths = [
    ("Report 1 Page 1 (Cover)", "research/rea-document-engine/phase13c/comparisons/baseline_canvas_vs_ref_report1/Page01-diff.png"),
    ("Report 2 Page 1 (Cover)", "research/rea-document-engine/phase13c/comparisons/baseline_canvas_vs_ref_report2/Page01-diff.png"),
    ("Report 2 Page 7 (Heatmap)", "research/rea-document-engine/phase13c/comparisons/baseline_canvas_vs_ref_report2/Page07-diff.png"),
    ("Report 2 Page 8 (Top 5 Cracks)", "research/rea-document-engine/phase13c/comparisons/baseline_canvas_vs_ref_report2/Page08-diff.png"),
    ("Report 3 Page 9 (AI 종합)", "research/rea-document-engine/phase13c/comparisons/baseline_canvas_vs_ref_report3/Page09-diff.png"),
]

for name, path in diff_paths:
    info = inspect_diff_image(path)
    print(f"=== {name} ===")
    print(f"  Diff Pixels: {info['total_diff_pixels']} ({info['diff_ratio']*100:.2f}%)")
    print(f"  Diff BBox (X1, Y1, X2, Y2): {info['diff_bbox']}")
