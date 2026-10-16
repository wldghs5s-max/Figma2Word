# Phase 16.1 — Format Compatibility & Specification Compliance Report

## 1. Specification References

This report validates the conformance of the dual-engine output against international and national document standards:
1. **ECMA-376 5th Edition (ISO/IEC 29500)**: Office Open XML File Formats (WordprocessingML and DrawingML/VML).
2. **KS X 6101:2018**: Open Wordprocessing Markup Language (OWPML) for Hangul (.hwpx) documents.

---

## 2. DOCX (WordprocessingML / VML) Conformance

### 2.1. Dynamic Page Orientation (`w:pgSz`)
Under ECMA-376 Part 1, §17.6.11 (`pgSz`), landscape pages require an explicit `w:orient="landscape"` attribute, and the dimensions must reflect twips (`1 pt = 20 twips`):
- **Portrait A4**:
  ```xml
  <w:pgSz w:w="11906" w:h="16838"/>
  ```
- **Landscape A4 (842 x 595 pt)**:
  ```xml
  <w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>
  ```
Figma2Word accurately calculates `Math.round(doc.pageSize.widthPt * 20)` and `Math.round(doc.pageSize.heightPt * 20)` and injects `w:orient="landscape"` when width exceeds height.

### 2.2. VML Vertical Text Alignment (`v-text-anchor`)
Under VML specification (ECMA-376 Part 4, §14.1.2.20), text alignment within a `<v:textbox>` is governed by the `v-text-anchor` CSS extension attribute:
- `top`: `v-text-anchor: top` (default)
- `center`: `v-text-anchor: middle`
- `bottom`: `v-text-anchor: bottom`

In Phase 16.1, `docxCanvasRenderer.ts` inspects `el.verticalAlign` and appends `v-text-anchor:middle;` or `v-text-anchor:bottom;` directly into the inline style string of `<v:textbox>`.

---

## 3. HWPX (KS X 6101 OWPML) Conformance

### 3.1. Package Structure
Every HWPX generated conforms strictly to the KS X 6101 container architecture:
```
hwpx-document.hwpx
├── mimetype                     (application/hwp+zip, uncompressed, offset 0)
├── META-INF/
│   └── manifest.xml             (ODF container manifest)
├── Contents/
│   ├── content.hpf              (OPF package manifest with spine)
│   ├── header.xml               (Styles, fonts, borders, fill definitions)
│   └── section0.xml             (Body text, paragraphs, and shape runs)
└── BinData/                     (Embedded raster assets)
```

### 3.2. Section Page Definition (`hp:pagePr`)
In KS X 6101 §7.3.3 (`hp:pagePr`), dimensions are expressed in HWPU (`1 pt = 100 HWPU`):
- `landscape`: `"NARROWLY"` (portrait) or `"WIDELY"` (landscape).
- `width` / `height`: Unsigned integers representing page dimensions.
```xml
<hp:secPr id="0" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" ...>
  <hp:grid char="0" line="0"/>
  <hp:startNum pageStartsOn="BOTH" page="1" pic="1" tbl="1" equation="1"/>
  <hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL"/>
  <hp:pagePr landscape="WIDELY" width="84189" height="59528" gutterType="LEFT_ONLY">
    <hp:margin header="0" footer="0" gutter="0" left="0" right="0" top="0" bottom="0"/>
  </hp:pagePr>
</hp:secPr>
```

### 3.3. Discrete Multi-Subpath Polygon Rendering
In KS X 6101 §8.2.5 (`hp:polygon`), a single `<hp:polygon>` defines a contiguous vertex loop. Prior to Phase 16.1, merging disjoint SVG paths into one vertex array resulted in invalid visual cross-lines.
Phase 16.1 emits an individual `<hp:polygon>` for each subpath:
```xml
<!-- Subpath 1 -->
<hp:polygon id="1001" zOrder="1" ...>
  <hp:pt x="0" y="0"/>
  <hp:pt x="1000" y="0"/>
  <hp:pt x="1000" y="1000"/>
  <hp:pt x="0" y="1000"/>
</hp:polygon>
<!-- Subpath 2 -->
<hp:polygon id="1002" zOrder="2" ...>
  <hp:pt x="2000" y="2000"/>
  <hp:pt x="3000" y="2000"/>
  <hp:pt x="3000" y="3000"/>
  <hp:pt x="2000" y="3000"/>
</hp:polygon>
```

### 3.4. Open Path Brush Handling
For open paths (`closed === false`), Hancom Office implicitly closes the polygon unless the fill brush is explicitly disabled:
```xml
<hp:fillBrush>
  <hc:winBrush faceColor="none"/>
</hp:fillBrush>
```
Phase 16.1 ensures that open strokes (arrows, checkmarks, line charts) maintain transparent interiors.

### 3.5. Image Cover Crop & Intrinsic Dimensions
Under KS X 6101 §8.2.8 (`hp:picture`), image clipping is defined in intrinsic image units:
```xml
<hp:imgClip left="0" right="100" top="17" bottom="83"/>
<hp:inImgDim dimwidth="100" dimheight="200"/>
```
Figma2Word sniffs PNG/JPEG headers to determine native dimensions and applies symmetrical center cropping to achieve true CSS `object-fit: cover` fidelity.

### 3.6. Rounded Rectangle Ratio (`hp:rect@ratio`)
Under KS X 6101 §8.2.2 (`hp:rect`), the curvature of rounded corners is specified as an integer percentage from `0` (sharp) to `50` (full semicircular caps):
```xml
<hp:rect id="2001" ratio="15" ...>
```
Figma2Word computes:
$$\text{ratio} = \min\left(50, \max\left(0, \text{round}\left(\frac{\text{cornerRadius}}{\min(W, H) / 2} \times 50\right)\right)\right)$$
ensuring mathematically accurate corner rounding in Hancom Office.

### 3.7. OWPML Text Vertical Alignment (`hp:subList@vertAlign`)
Under KS X 6101 §8.1.3 (`hp:subList`), text alignment within shape textboxes is governed by `vertAlign`:
- `vertAlign="TOP"`
- `vertAlign="CENTER"`
- `vertAlign="BOTTOM"`
Phase 16.1 maps Figma's vertical alignment directly to these attributes, eliminating vertical drift in badges, buttons, and table cells.
