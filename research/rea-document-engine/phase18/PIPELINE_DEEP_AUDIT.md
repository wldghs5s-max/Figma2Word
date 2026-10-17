# Phase 18: Pipeline Deep Audit (`PIPELINE_DEEP_AUDIT.md`)

**Mission**: Figma2Word — Phase 18 Argon Deep Engineering Mission  
**Baseline Commit**: `872fb6e` (Phase 17)  
**Scope**: End-to-End Structural & Fidelity Audit across `Figma JSON → FigmaCanvasParser → Canvas IR → DocxCanvasRenderer / HwpxCanvasRenderer` and `DOCX → DocxCanvasParser → Canvas IR → HwpxCanvasRenderer`.

---

## 1. End-to-End Coordinate & Unit Mapping Matrix

| Stage / System | Base Unit | Conversion Formula | Precision / Rounding | Orientation & Section Handling |
| :--- | :--- | :--- | :--- | :--- |
| **Figma Source JSON** | CSS/Figma Pixels (`px`) | Top-left origin `(x, y)` inside `absoluteBoundingBox` | Floating-point (`number`) | Per top-level `FRAME`/`COMPONENT`/`GROUP` or single-page section `CANVAS` |
| **Canvas IR (`CanvasDocument`)** | Typographic Points (`pt`, 1/72 inch) | `valPt = (valPx - frameOriginPx) * scale` (`scalePolicy: "fit-a4"` or `"1:1"`) | Floating-point (`number`), A4 Portrait `595.28 × 841.89 pt`, Landscape `841.89 × 595.28 pt` | `doc.pageSize` + per-page `page.bounds` (`width > height` → Landscape) |
| **DOCX VML (`DocxCanvasRenderer`)** | Points (`pt`) in `style="..."`, Twips (`1/20 pt`) in `<w:pgSz>` / `<w:spacing>`, `1/65536` (`f`) in `<v:imagedata crop*>` | `twips = Math.round(pt * 20)`<br>`vmlCoord = Math.round((px / w) * 1000)`<br>`cropF = Math.round(cropRatio * 65536)` | `toFixed(2)` for `pt` CSS styles; integer twips (`11906 × 16838`) | Inline `<w:pPr><w:sectPr>` for pages `0..N-2` (`w:type="nextPage"`), document-level `<w:sectPr>` for final page |
| **HWPX OWPML (`HwpxCanvasRenderer`)** | HWPUNIT (`1 pt = 100 HWPU`, `1/7200 inch`); Image Intrinsic Dim (`1 px = 75 HWPU` at 96 DPI) | `hwpu = Math.round(pt * 100)`<br>`imgDimHwpu = Math.round(px * 75)` | Integer `HWPUNIT` (`59528 × 84189` Portrait, `84189 × 59528` Landscape) | Per-page `<hp:secPr>` when page dimensions/orientation change (`landscape="NARROWLY"` for Portrait, `"WIDELY"` for Landscape) |
| **DOCX → HWPX Bridge (`DocxCanvasParser`)** | Parses `style="...pt"` and `<w:sectPr><w:pgSz>` twips back to `pt` | `pt = twips / 20`<br>`cropRatio = parseFloat(val) / 65536` | Preserves `0.01 pt` accuracy across roundtrip | Splits pages on both `<w:br w:type="page"/>` and inline `<w:sectPr>` breaks; restores per-page orientation |

---

## 2. Structural & Fidelity Bottlenecks Discovered in Phase 17 (`872fb6e`)

Through direct code inspection, XML DOM analysis, real-world customer snapshot inspection (`Report1..3-Live-Snapshot.json`), and Word COM execution, we identified **12 concrete architectural bottlenecks** that previously caused data loss or visual distortion:

### 2.1 Parser & IR Bottlenecks (`FigmaCanvasParser` & `CanvasDocument`)
1. **Dropped Auto-Layout Children Missing `absoluteBoundingBox`**:
   - Simplified/synthetic real-world fixtures (`sample-a-proposal-doc.json`, `sample-b-nested-autolayout.json`, `sample-e2e-card-grid.json`, `sample-e2e-document.json`) omit `absoluteBoundingBox` on children inside `layoutMode: "VERTICAL" | "HORIZONTAL"` frames.
   - `FigmaCanvasParser` previously skipped any node lacking `absoluteBoundingBox`, silently dropping **100% of the text** in `sample-a-proposal-doc.json` (producing only 2 shapes instead of 8!).
2. **Distorted Multi-Page Splitting of Stacked Section Canvases**:
   - In `sample-e2e-card-grid.json`, `sample-e2e-document.json`, and `sample-e2e-complex-layout.json`, top-level `TEXT` and `LINE` headers sit directly under `CANVAS` alongside short horizontal/vertical section `FRAME`s (`height: 120px–340px`).
   - `discoverPageFrames()` previously ignored top-level `TEXT`/`LINE` siblings and treated every short section `FRAME` as an independent full-bleed A4 page, stretching a `794 × 120 px` header bar to `841.89 × 595.28 pt`!
3. **Donut & Pie Chart `ELLIPSE` `arcData` Ignored**:
   - Customer snapshots (`Report1..3-Live-Snapshot.json`, Page 4 KPI Donut Chart) represent 4 colored donut sectors as `ELLIPSE` nodes with `arcData: { startingAngle, endingAngle, innerRadius: 0.62 }`.
   - `FigmaCanvasParser` ignored `arcData` and emitted 4 overlapping full `oval` elements (`<v:oval>` / `<hp:ellipse>`), destroying the donut chart appearance.
4. **Image Scale Mode & `imageTransform` Crop Matrix Ignored**:
   - Figma `IMAGE` fills with `scaleMode: "CROP"` and `imageTransform: [[sx, 0, tx], [0, sy, ty]]` or `scaleMode: "FIT"` were treated identically to `"FILL"`, stretching cropped or aspect-fitted images across the entire container box.
5. **Rotated `LINE` Bounding Box Collapse**:
   - In Figma, vertical lines are often represented as `LINE` nodes with `width: L, height: 0, rotation: ±90°` (or `±π/2`). `FigmaCanvasParser` used raw `width` and `height: 0`, turning vertical dividers into horizontal lines.
6. **Raw `FigmaSnapshot` & `/v1/files/:key/nodes` Unpacking**:
   - Passing a `FigmaSnapshot` wrapper (`{ figmaNode, imageMap }`) or `/v1/files/:key/nodes` payload directly to `FigmaCanvasParser.parse()` without pre-unwrapping failed to locate page frames or embedded base64 images.

### 2.2 VML & DOCX Renderer Bottlenecks (`DocxCanvasRenderer` & `SvgPath`)
7. **Premature Multi-Subpath Termination in `SvgPath.toVmlPath()`**:
   - `case "Z"` in `svgPathParser.ts` emitted `"x e"` (`close` + `end`) instead of `"x"`. In Word VML, `e` immediately terminates the entire `<v:shape path="...">` definition, causing all subsequent subpaths (compound icons, hollow rings, multi-part glyphs) to be discarded by Microsoft Word.
8. **Hardcoded Document-Level Page Size for Background Rectangles**:
   - `buildBackgroundRect()` used `doc.pageSize.widthPt/heightPt` for every page instead of `pageWidthPt/pageHeightPt`, causing landscape pages in mixed-orientation documents to have portrait-sized background fills.
9. **Roundrect `arcsize` Denominator & Open Vector Fill**:
   - `<v:roundrect arcsize="...">` divided `cornerRadius` by `Math.max(width, height)` instead of `Math.min(width, height)`.
   - Open vector paths (`!hasClosedSubpath`) with a style fill were emitted without `filled="f"`, causing Word to fill open polylines.
10. **Typography Spacing & CJK Auto-Space Distortion**:
    - `letterSpacingPt` was not emitted as `<w:spacing w:val="..."/>`, and Word's default `<w:autoSpaceDE/>` / `<w:autoSpaceDN/>` injected extra spacing between Korean and English/numeric runs.

### 2.3 HWPX OWPML & DOCX→HWPX Bridge Bottlenecks (`HwpxCanvasRenderer` & `DocxCanvasParser`)
11. **Open Vector Subpaths Rendered as Closed `<hp:polygon>` in HWPX**:
    - `HwpxCanvasRenderer` emitted `<hp:polygon>` for all vector subpaths, even when `sp.closed === false` (such as `M 0 0 L 50 50 L 100 0`), causing Hancom Office to draw a spurious closing line from the last point back to the start point.
    - Additionally, `underline`, `strike`, `letterSpacingPt`, and custom `lineHeightPt` (`<hh:paraPr>` fixed line spacing) were not wired into `Contents/header.xml`.
12. **Lossy `DocxCanvasParser` Roundtrip**:
    - `DocxCanvasParser` only split pages on `<w:br w:type="page"/>` (missing `<w:sectPr>` section breaks), ignored `<w:pgSz>` per-page dimensions, treated `id="bg_1"` background rectangles as regular foreground cards, and dropped `verticalAlign`, `imageCrop`, `strokeDashed`, `letterSpacingPt`, and `vectorSubpaths`.

---

## 3. Summary of Remediation Status

All **12 architectural bottlenecks** identified in this audit were remediated in Phase 18 and verified via unit/mutation tests, HWPX Level 1/2 schema audits across 17 fixtures, and real Microsoft Word 16.0 COM rendering and editability verification across 6 documents.
