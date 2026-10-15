import struct
import zlib

def analyze_diff_pixel_locations(diff_path):
    with open(diff_path, "rb") as f:
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
        stride = 1 + width * 4
        
        # Segment page into a 4x8 grid of cells and count diff pixels in each cell
        grid_cols = 4
        grid_rows = 8
        cell_w = width // grid_cols
        cell_h = height // grid_rows
        grid_counts = [[0 for _ in range(grid_cols)] for _ in range(grid_rows)]
        
        for y in range(height):
            gy = min(grid_rows - 1, y // cell_h)
            row_offset = y * stride + 1
            for x in range(width):
                gx = min(grid_cols - 1, x // cell_w)
                p = row_offset + x * 4
                r, g, b = raw[p], raw[p+1], raw[p+2]
                if r > 200 and g < 50 and b > 80: # Magenta diff
                    grid_counts[gy][gx] += 1
                    
        cell_pixels = cell_w * cell_h
        print(f"=== Diff Pixel Grid (4x8) for {diff_path} ===")
        for gy in range(grid_rows):
            row_str = " | ".join(f"{grid_counts[gy][gx] / cell_pixels * 100:5.1f}%" for gx in range(grid_cols))
            y_range = f"Y {gy*cell_h:4d}..{(gy+1)*cell_h:4d}"
            print(f"  {y_range}: {row_str}")

analyze_diff_pixel_locations("research/rea-document-engine/phase13c/comparisons/baseline_canvas_vs_ref_report1/Page01-diff.png")
analyze_diff_pixel_locations("research/rea-document-engine/phase13c/comparisons/baseline_canvas_vs_ref_report2/Page08-diff.png")

