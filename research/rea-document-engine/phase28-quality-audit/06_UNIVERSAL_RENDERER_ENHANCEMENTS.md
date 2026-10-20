# Phase 28 Quality Audit — Report 06: Universal Renderer Enhancements & Defect Resolutions

## 1. Asymmetric Corner Radii via VML `<v:shape>` Paths

### Problem
Figma allows each corner of a rectangle or card to have an independent radius via `rectangleCornerRadii: [topLeft, topRight, bottomRight, bottomLeft]`.
In Microsoft Word VML, the standard `<v:roundrect>` tag supports only a single scalar `arcsize` attribute that forces all four corners to round identically. In Phase 27, when asymmetric cards were parsed, the renderer averaged or picked one radius and applied it uniformly to all four corners, ruining modal headers, card tabs, and bottom drawers.

### Solution
In Phase 28, `DocxCanvasRenderer` introduces dynamic shape branching:
1. If `cornerRadii` has 4 equal values (or a single scalar radius), the renderer continues emitting native `<v:roundrect arcsize="...">`.
2. If `cornerRadii` contains **differing corner radii** (e.g., `[24, 24, 0, 0]` for a top-rounded card header):
   - The renderer automatically switches the VML tag to `<v:shape>`.
   - It computes an exact vector path in integer coordinate space ($0.1$ pt resolution) using cubic Bezier curves ($\kappa \approx 0.55228475$):
     - For rounded corners ($r_i > 0$): emits `c (x1, y1, x2, y2, x3, y3)`
     - For sharp corners ($r_i = 0$): emits `l (x, y)`
   - Full support for fills, strokes, opacity, and `<v:textbox>` text content is preserved inside the `<v:shape>`.

### Verification
In `tests/phase28-word-isolation-and-rendering.test.ts` (Test 8), a card with `cornerRadii: [20, 20, 0, 0]` was confirmed to emit:
```xml
<v:shape id="s_0_0" coordsize="2000,1000" path="m 200,0 l 1800,0 c 1910,0,2000,90,2000,200 l 2000,1000 l 0,1000 l 0,200 c 0,90,90,0,200,0 x e" filled="t" fillcolor="#10B981" stroked="t" strokecolor="#047857" strokeweight="2.00pt">
  <v:textbox style="v-text-anchor:top;mso-fit-shape-to-text:f" inset="0.00pt,0.00pt,0.00pt,0.00pt">
    ...
  </v:textbox>
</v:shape>
```
Real Word for Mac rendering confirmed this exports cleanly to PDF and PNG.

---

## 2. Pill Button Clamping Defense

### Problem
Figma buttons often specify extreme corner radii (e.g., `cornerRadius: 999` or `100`) to guarantee a pill shape. If unconstrained, this could overflow or produce undefined VML values.

### Solution
In `DocxCanvasRenderer`, the pill button formula enforces the W3C VML limit:
$$\text{arcsize} = \min\left(0.5, \frac{2 \times r}{\min(W, H)}\right)$$
For any button where $r \ge \min(W, H) / 2$, `arcsize` is clamped to exactly `0.500`, guaranteeing a fully rounded pill button in Microsoft Word.

---

## 3. Universal Single-Line Word Wrap Prevention

### Problem
When Word renders text, subtle differences between Figma's Skia font rasterizer and Word's DirectWrite engine can cause glyphs to measure 1–2% wider. On single-line buttons, chips, badges, and metrics, this slight expansion caused Word to wrap the last word onto an invisible second line (e.g. "Submit Order" -> "Submit\nOrder"), causing text truncation.

### Solution
In Phase 28, `<w:wordWrap w:val="0"/>` is universally applied to:
1. Any text element with `textAutoResize === "WIDTH_AND_HEIGHT"`.
2. Any single-line text element without hard newlines where `height <= firstLineHeight * 1.45` or `height <= fontSize * 1.6`.

This instructs Word's paragraph engine to disable line wrapping for buttons and single-line labels, preventing truncated or wrapped text.

---

## 4. Parser-Renderer Arcsize Symmetry Fix

### Defect Identified
In `src/canvas/parser/docxCanvasParser.ts` (line 423), the parser was computing:
`cornerRadius = Math.round(arc * minSide * 100) / 100;`
Because Phase 26 normalized `DocxCanvasRenderer` to use $\text{arcsize} = (2 \times r) / \text{minSide}$, the parser's reverse formula was doubling the radius ($24$ pt instead of $12$ pt).

### Resolution
Updated `DocxCanvasParser.ts` to:
`cornerRadius = Math.round(arc * (minSide / 2) * 100) / 100;`
This restored roundtrip parity and resolved the `tests/phase18-architecture-fidelity.test.ts` failure.
