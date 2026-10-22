# Phase 32: Real Figma Fidelity Benchmark & Conversion Quality Improvement
## 03. Fidelity Discrepancy Analysis: Root Causes & Empirical Findings

### 1. Discrepancy 1: Optical Alignment Drift on Single-Line Text

#### Empirical Observation
In Phase 25/25V, single-line text elements were given a minor tolerance buffer (`effectiveWidth += buffer`) to prevent Word DirectWrite font substitution from wrapping long single-line phrases.
However, when `paragraphAlign === "center"` or `paragraphAlign === "right"`:
- The textbox expanded toward the right by `+buffer`.
- Because the origin `margin-left: x` was not shifted, Word centered the text relative to `[x, x + width + buffer]`.
- As a result, the optical center shifted to the right by $\frac{\text{buffer}}{2}$:
  $$\text{Rendered Center} = x + \frac{\text{width} + \text{buffer}}{2} = \left(x + \frac{\text{width}}{2}\right) + \frac{\text{buffer}}{2}$$
- On small buttons (e.g. 60 pt button with a 4 pt buffer), a 2 pt rightward shift was visible to designers, making centered button labels appear off-center.
- For right-aligned numbers or currencies (e.g. `123,456 원`), the text shifted right by the full `buffer` amount.

---

### 2. Discrepancy 2: VML Centered Stroke Bleed

#### Empirical Observation
In Figma, strokes on frames, cards, and rectangles default to `strokeAlign: "INSIDE"`. This means the stroke is drawn strictly within the $[x, x + w] \times [y, y + h]$ bounding rectangle.
In OpenXML VML (`<v:rect>`, `<v:roundrect>`, `<v:shape>`):
- The VML rendering specification centers the stroke stroke weight along the shape perimeter.
- A card of $200 \times 60\text{ pt}$ with a $2\text{ pt}$ stroke draws $1\text{ pt}$ inside the boundary and $1\text{ pt}$ outside the boundary.
- Consequently, adjacent cards or container borders suffered a $1\text{ pt}$ bleed / collision.

---

### 3. Discrepancy 3: Baseline Clipping on Vertically Centered Text

#### Empirical Observation
In Word for Mac, when a single-line textbox is vertically centered with `v-text-anchor:middle` and the paragraph has `w:lineRule="exact"`:
- Word locks the baseline position to the exact line height grid.
- If the font's Korean Hangul descender/ascender bounds exceed the tight line height box, Word clips the top or bottom of the glyphs against the textbox boundary.
- Conversely, switching to `w:lineRule="atLeast"` allows Word to respect the specified line height as a floor while giving glyph ascenders/descenders natural headroom.

---

### 4. Discrepancy 4: East Asian CJK Fallback Consistency

#### Empirical Observation
When Figma designs use modern fonts like `Pretendard`, systems running Microsoft Word without Pretendard installed fall back to system defaults. In Word for Mac / Windows:
- If `w:eastAsia` is omitted or unmapped, Word may fall back to default serif fonts (e.g. Batang / 바탕체).
- Ensuring `w:eastAsia="Pretendard"` (with universal fallback to `맑은 고딕` / Malgun Gothic for missing fonts) guarantees that Korean typography retains a clean, modern sans-serif appearance.
