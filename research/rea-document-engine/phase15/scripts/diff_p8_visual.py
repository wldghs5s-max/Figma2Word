import cv2
import numpy as np

img_ref = cv2.imread("research/rea-document-engine/phase13c/renders/ref_report2/ref-Page08.png")
img_canvas = cv2.imread("research/rea-document-engine/phase13c/renders/canvas_report2/canvas-Page08.png")

print(f"Ref shape: {img_ref.shape}, Canvas shape: {img_canvas.shape}")

# Compute pixel difference
diff = cv2.absdiff(img_ref, img_canvas)
gray_diff = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
_, thresh = cv2.threshold(gray_diff, 20, 255, cv2.THRESH_BINARY)
mismatch_pixels = np.sum(thresh > 0)
total_pixels = thresh.size
print(f"Mismatch ratio: {mismatch_pixels / total_pixels * 100:.2f}%")

# Find bounding rects of diff clusters
contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
large_contours = [c for c in contours if cv2.contourArea(c) > 5000]
print(f"Number of large diff regions: {len(large_contours)}")
for i, c in enumerate(large_contours[:10]):
    x, y, w, h = cv2.boundingRect(c)
    print(f"  Region {i+1}: x={x}, y={y}, w={w}, h={h}")

# Check what color the canvas image has in these regions vs ref image
for i, c in enumerate(large_contours[:3]):
    x, y, w, h = cv2.boundingRect(c)
    ref_patch = img_ref[y:y+h, x:x+w]
    canvas_patch = img_canvas[y:y+h, x:x+w]
    print(f"  Region {i+1} ref mean BGR: {np.mean(ref_patch, axis=(0,1))}")
    print(f"  Region {i+1} canvas mean BGR: {np.mean(canvas_patch, axis=(0,1))}")

