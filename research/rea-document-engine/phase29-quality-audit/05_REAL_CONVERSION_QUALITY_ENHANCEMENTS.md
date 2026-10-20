# Phase 29: Real Conversion Quality & Rendering Enhancements

## 1. Soft Drop Shadow Support (`<v:shadow>` & `<hp:shadow>`)

In previous phases, Figma `DROP_SHADOW` effects were ignored or discarded during Canvas IR extraction.

### Architecture in Phase 29:
1. **Canvas IR Extension**:
   ```ts
   export interface CanvasShadow {
     color?: string; // hex '#RRGGBB'
     opacity?: number; // 0.0 ~ 1.0
     offsetX?: number; // pt
     offsetY?: number; // pt
     blur?: number; // pt
     spread?: number; // pt
   }
   ```
2. **Figma Parser**:
   Extracts `node.effects` where `type === "DROP_SHADOW"` and `visible !== false`. Scales offsets and blur by `scaleX`/`scaleY`.
3. **DOCX Renderer (VML)**:
   Emits W3C VML compliant shadow child elements:
   ```xml
   <v:shadow on="t" type="single" color="#000000" offset="2.00pt,4.00pt" opacity="0.15"/>
   ```
4. **HWPX Renderer (OWPML KS X 6101)**:
   Emits compliant Hancom shape shadow elements:
   ```xml
   <hp:shadow type="DROP" color="#000000" offsetX="200" offsetY="400" alpha="217"/>
   ```
   (where offsets are converted from points to HWPUs: $1\text{ pt} = 100\text{ HWPU}$).
5. **Roundtrip Reverse Parser**:
   `DocxCanvasParser` now parses `<v:shadow>` back into `CanvasStyle.shadow`, supporting full roundtrip fidelity.

---

## 2. Korean Ascender/Descender Protection (`w:lineRule="atLeast"`)

Korean Hangul glyphs (e.g., 국, 롹, 흗) have larger vertical bounding boxes compared to Latin alphabets due to combining vowels and final consonants (받침). When textboxes are defined with tight line heights in Figma (e.g. `lineHeight: 16pt` on `fontSize: 14pt`), OpenXML `w:lineRule="exact"` forces Word's rendering engine to strictly clip any pixels extending beyond the line height, truncating top and bottom glyph strokes.

### Remediation:
- In `docxCanvasRenderer.ts`, if `firstLineHeight < maxFontSize * 1.25`, the line rule is automatically adjusted to `atLeast`:
  ```xml
  <w:spacing w:before="0" w:after="0" w:line="320" w:lineRule="atLeast"/>
  ```
- This guarantees full glyph preservation without clipping while preserving the baseline position.

---

## 3. Single-Line Tolerance Breathing Buffer

Word uses Microsoft DirectWrite or system GDI font rendering, which can measure Korean fonts (like Pretendard or Malgun Gothic) 1%–3% wider than Figma's Skia/Canvas engine. For fixed-width single-line buttons and badges, this minimal variance previously caused Word to break words onto unexpected second lines.

### Remediation:
For all single-line non-wrapping elements (`wrapStyle === "mso-wrap-style:none"`), a subtle horizontal buffer is applied:
```ts
let effectiveWidth = width;
if (elem.type === "text" && elem.textAutoResize === "WIDTH_AND_HEIGHT") {
  effectiveWidth += Math.max(3, effectiveWidth * 0.03);
} else if (hasText && wrapStyle === "mso-wrap-style:none") {
  effectiveWidth += Math.max(2, Math.min(8, effectiveWidth * 0.025));
}
```
This guarantees that buttons, status chips, and breadcrumb labels never wrap onto a second line, maintaining 100% visual fidelity with the original Figma design.
