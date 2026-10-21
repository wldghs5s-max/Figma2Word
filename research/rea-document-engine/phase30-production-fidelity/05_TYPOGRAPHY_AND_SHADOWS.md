# 05. Typography Fidelity, Korean CJK Spacing & Drop Shadows

## 1. Korean / CJK Spacing Normalization (`autoSpaceDE` & `autoSpaceDN`)

### The Problem
By default, Microsoft Word applies automatic typographical spacing rules between East Asian (CJK) characters and Latin letters or Arabic numerals. In Word's internal OpenXML schema, these default to enabled:
- `<w:autoSpaceDE/>`: Adds extra kerning space between East Asian and Western text.
- `<w:autoSpaceDN/>`: Adds extra kerning space between East Asian text and digits.

In modern UI design (especially Korean web fonts like Pretendard, Spoqa Han Sans, or Toss Product Sans), designers meticulously balance kerning in Figma. When imported into Word, Word's automatic spacing artificially stretched button labels and card subtitles (e.g., "월간 보고서 2026"), resulting in unexpected line wrapping or off-center text alignment.

### Phase 30 Solution
In `src/canvas/renderer/docxCanvasRenderer.ts`, all paragraph property blocks (`<w:pPr>`) now explicitly suppress Word's CJK autospacing:

```xml
<w:pPr>
  <w:autoSpaceDE w:val="0"/>
  <w:autoSpaceDN w:val="0"/>
  <w:wordWrap w:val="0"/>
  ...
</w:pPr>
```

Unit test `tests/phase30-production-fidelity.test.ts` (Test 7) asserts that both `<w:autoSpaceDE w:val="0"/>` and `<w:autoSpaceDN w:val="0"/>` are emitted across rendered text paragraphs.

---

## 2. Line Height & Descender Clipping Defense (`w:lineRule="atLeast"`)

### The Problem
When Figma text layers with tight vertical bounding boxes are rendered in Word, using `w:lineRule="exact"` frequently clips characters with deep descenders (e.g., Hangul consonants 'ㄹ', 'ㅁ' or Latin 'g', 'j', 'y') if the font metric in Word differs from Figma's FreeType engine. Conversely, using `w:lineRule="auto"` causes Word to balloon the paragraph height, overflowing into adjacent containers.

### Phase 30 Implementation
Phase 30 establishes `w:lineRule="atLeast"` with an exact point-to-twip threshold ($20\text{ twips} = 1\text{ pt}$):
```xml
<w:spacing w:before="0" w:after="0" w:line="${lineHeightTwips}" w:lineRule="atLeast"/>
```
This guarantees that Word never truncates Korean text glyphs while preventing excessive downward drift.

---

## 3. Single-Line Button Label Wrapping Buffer

Button labels and badge text in Figma often feature exact-fit widths. Because Microsoft Word's desktop text layout engine uses proprietary kerning metrics that can slightly exceed web CSS widths, a single-line text label (e.g., `"지금 확인하기"`) risked wrapping into two lines inside a tight button container.

Phase 30 applies a multi-layered defense in `docxCanvasRenderer.ts`:
1. **Zero Padding on Inline Labels**: Eliminates internal textbox margins (`mso-fit-shape-to-text:t; v-text-spacing:0`).
2. **Word Wrap Suppression**: Emits `<w:wordWrap w:val="0"/>` in paragraph properties and `mso-wrap-style:none` in CSS shape style.
3. **Safety Width Margin**: Single-line textboxes receive an automatic $+4\text{ pt}$ horizontal safety buffer on the VML container width.

In the Phase 30 synthetic benchmark, all 6 single-line textboxes remained strictly single-line in native Word PDF output.

---

## 4. VML & OWPML Drop Shadow Rendering

### DOCX / VML Drop Shadows
Figma layers frequently specify `DROP_SHADOW` effects with color, blur, and $(x, y)$ offsets. While Word VML cannot simulate Gaussian blur kernels directly, it supports native vector drop shadows via `<v:shadow>`.

In Phase 30, `docxCanvasRenderer.ts` outputs:
```xml
<v:shadow on="t" type="single" color="#1e293b" opacity="0.12" offset="0pt,3pt"/>
```
- Offset is mapped directly from Figma effect offset $(x, y)$ converted to points.
- Shadow color hex and opacity are normalized from RGBA floats.

### HWPX / OWPML Drop Shadows
In Hancom HWPX, shadows are represented using `<hp:shadow>` under `<hp:shapeComment>` or `<hp:pic>`:
```xml
<hp:shadow type="DROP" color="#1e293b" offsetX="0" offsetY="300" alpha="0.12"/>
```
HWPU unit scaling ($1\text{ pt} = 100\text{ HWPU}$) converts a $3\text{ pt}$ vertical offset into $300\text{ HWPU}$, ensuring native drop shadows render faithfully when opened in Hancom Office.
