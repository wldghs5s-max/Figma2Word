# 06. Images, Shapes, Borders and Layer Geometries

## 1. Rounded Corner Images in Word VML

### The Challenge
Figma designs ubiquitous image cards with rounded corners (e.g., $8\text{ px}$ or $12\text{ px}$ radius). In Microsoft Word DOCX:
- Standard DrawingML (`<pic:pic>`) does not natively support clipping paths without external image preprocessing.
- Legacy VML `<v:shape>` containing `<v:imagedata>` ignores corner radii and renders a square image.

### The Phase 30 Solution: `<v:roundrect>` Image Clipping
In `src/canvas/renderer/docxCanvasRenderer.ts`, when an image element has `cornerRadius > 0`:
1. The renderer emits a `<v:roundrect>` element instead of a generic `<v:shape>` or `w:drawing`.
2. Computes normalized `arcsize` as:
   $$\text{arcsize} = \frac{\min(r_x, r_y)}{\min(\text{width}, \text{height})}$$
   clamped between $0.0$ and $0.5$.
3. Embeds `<v:imagedata r:id="..." />` inside the `<v:roundrect>`.
4. Word's native VML rasterizer automatically clips the embedded raster image to the rounded border curve.

```xml
<v:roundrect style="position:absolute;left:40pt;top:400pt;width:320pt;height:180pt;" arcsize="0.0444" fill="t" stroked="t" strokecolor="#cbd5e1" strokeweight="1pt">
  <v:imagedata r:id="rIdImage1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
  <v:shadow on="t" type="single" color="#0f172a" opacity="0.08" offset="0pt,4pt"/>
</v:roundrect>
```

This delivers three production visual fidelity benefits simultaneously:
1. **True Native Clipping**: Image corners are rounded in Word without pixelating the bitmap.
2. **Integrated Border**: The border stroke follows the rounded contour smoothly.
3. **Integrated Drop Shadow**: The drop shadow projects from the rounded silhouette rather than a rectangular box.

Verified in `tests/phase30-production-fidelity.test.ts` (Test 5).

---

## 2. Pill Buttons & Uniform Semicircular Radii

For UI badges and pill-shaped action buttons where the corner radius equals half the height ($r = \frac{h}{2}$):
- Normalized `arcsize` reaches its theoretical maximum of $0.500$.
- In `docxCanvasRenderer.ts`, if $r \ge \frac{\min(w, h)}{2}$, `arcsize="0.500"` is emitted.
- Word renders a perfect stadium/capsule shape with fully rounded semicircular caps.

---

## 3. Asymmetric Rounded Corners (`<v:shape path="...">`)

When a Figma card features non-uniform corner radii (e.g., top corners rounded at $16\text{ px}$, bottom corners sharp at $0\text{ px}$ for a modal or card header):
- Uniform `<v:roundrect>` cannot represent independent corner radii.
- The renderer constructs a custom VML path with quadratic Bezier curves (`qb`):
  ```xml
  <v:shape style="..." path="m 0,240 qb 0,0 240,0 l 4560,0 qb 4800,0 4800,240 l 4800,2400 l 0,2400 x">
  ```
- All path coordinates are calculated in VML coordinate space ($21600 \times 21600$ internal units), guaranteeing pixel-perfect rendering across varying display DPIs.

---

## 4. Stroke Borders: Dashed, Dotted & Solid Styles

Phase 30 maps Figma stroke properties directly to VML `<v:stroke>` attributes:
- Solid strokes: `dashstyle="solid"`
- Dashed strokes: `dashstyle="dash"`
- Dotted strokes: `dashstyle="dot"`
- Line weight: mapped in points (`strokeweight="1.5pt"`).
- Color: 6-digit hex notation (`strokecolor="#94a3b8"`).

In HWPX, stroke styles map to `<hp:lineShape>` with corresponding `type="DASH"` or `type="SOLID"`.

---

## 5. Z-Index and Layer Ordering

Figma Canvas IR elements are ordered back-to-front. In `docxCanvasRenderer.ts`, shapes and textboxes are emitted sequentially with explicit `z-index` CSS style attributes:
```css
z-index: ${element.zIndex ?? index};
```
Word honors both document flow order and explicit `z-index`, ensuring foreground textboxes and pill badges remain above background cards and container panels.
