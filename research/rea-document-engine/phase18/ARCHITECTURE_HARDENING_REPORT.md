# Phase 18: Architecture Hardening Report (`ARCHITECTURE_HARDENING_REPORT.md`)

**Mission**: Figma2Word — Phase 18 Argon Deep Engineering Mission  
**Scope**: Detailed Technical Record of Track B Architectural Hardening (`B-1` through `B-6`).

---

## 1. Overview of Modified Core Modules

| File Path | Track | Key Architectural Enhancements |
| :--- | :--- | :--- |
| [`src/canvas/types.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/types.ts) | B-2, B-3 | Added `CanvasImageCrop` (`top`, `bottom`, `left`, `right`), `imageScaleMode?: "FILL" \| "FIT" \| "CROP" \| "TILE"`, `imageCrop?: CanvasImageCrop`, and `cornerRadii?: [number, number, number, number]` |
| [`src/canvas/geometry/svgPathParser.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/geometry/svgPathParser.ts) | B-3 | Fixed `toVmlPath()` so `case "Z"` emits `"x"` instead of `"x e"` (preventing premature multi-subpath termination); added optional `customBounds?: PathBounds` to `toVmlPath` and `toHwpxSubpathsWithClosed` |
| [`src/canvas/parser/figmaCanvasParser.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/parser/figmaCanvasParser.ts) | B-1..B-5 | Added `FigmaSnapshot` & `/v1/files/:key/nodes` auto-unpacking, input validation, single-page section `CANVAS` aggregation, `synthesizeMissingChildBounds()` for Auto-Layout children, `buildEllipseArcSvgPath()` for `ELLIPSE` `arcData` (donut/pie charts), `imageScaleMode`/`imageCrop` extraction, rotated `LINE` bounds, `innerPaddingPt`, `lineHeightPt`, and `letterSpacingPt` |
| [`src/canvas/renderer/docxCanvasRenderer.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/docxCanvasRenderer.ts) | B-1..B-5 | Fixed per-page `buildBackgroundRect(page, pageIndex, pageWidthPt, pageHeightPt)`, `<v:imagedata crop*>` (`1/65536f`), `FIT` image letterboxing, open-path `filled="f"`, dashed strokes, `<v:roundrect>` `Math.min(w,h)` `arcsize`, `<w:spacing>` for `letterSpacingPt`, and CJK auto-space suppression (`<w:autoSpaceDE w:val="0"/>`, `<w:autoSpaceDN w:val="0"/>`) |
| [`src/canvas/renderer/hwpxCanvasRenderer.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/hwpxCanvasRenderer.ts) | B-1..B-5 | Added dynamic `<hh:paraPr>` registry for fixed `lineHeightPt`, extended `<hh:charPr>` with `underline`, `strikeout`, and `spacing`, rendered open vector subpaths (`!sp.closed`) as chained native `<hp:line>` segments instead of closed `<hp:polygon>`, added `imageCrop` (`<hp:imgClip>`) & `FIT` scaling, `<hp:textMargin>`, and `id === instid` consistency |
| [`src/canvas/parser/docxCanvasParser.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/parser/docxCanvasParser.ts) | B-6 | Added inline `<w:sectPr>` page splitting, per-page `<w:pgSz>` orientation/dimension recovery, `id="bg_N"` background recovery, `v-text-anchor` vertical alignment, `<v:imagedata crop*>` recovery, `dashstyle` recovery, `letterSpacingPt` recovery, and `vectorSubpaths` reconstruction |

---

## 2. Track-by-Track Technical Details

### B-1. Page / Section / Coordinate / Scale Hardening
- **Per-Page Background Sizing**: Both `DocxCanvasRenderer` and `HwpxCanvasRenderer` now pass `pageWidthPt` and `pageHeightPt` to `buildBackgroundRect`, ensuring mixed portrait/landscape documents render exact full-bleed backgrounds on every page.
- **Single-Page Section `CANVAS` Detection**: When a `CANVAS` contains only short section frames (`height < 500px`) alongside top-level `TEXT`/`LINE` headers (e.g., `sample-e2e-card-grid.json`, `sample-e2e-document.json`, `sample-e2e-complex-layout.json`), `discoverPageFrames()` aggregates the canvas into a single cohesive page instead of dropping top-level text and stretching short horizontal bands into separate A4 pages. Multi-page canvases with full-height frames (`Report1..3-Live-Snapshot.json`, `9–11 pages`) remain strictly multi-page.
- **Auto-Layout Missing `absoluteBoundingBox` Synthesis (`synthesizeMissingChildBounds`)**: For simplified/synthetic Figma JSON inputs where children inside `layoutMode: "VERTICAL" | "HORIZONTAL"` frames omit `absoluteBoundingBox` (`sample-a-proposal-doc.json`, `sample-b-nested-autolayout.json`), `FigmaCanvasParser` deterministically synthesizes child coordinates from parent padding, `itemSpacing`, and font metrics.

### B-2. Image Pipeline Hardening (`FILL`, `FIT`, `CROP`)
- **`CROP` with `imageTransform`**: Extracts `[sx, 0, tx]` and `[0, sy, ty]` from Figma's 2×3 affine `imageTransform` matrix into `elem.imageCrop = { left, top, right, bottom }`.
  - In DOCX VML: Emits `cropleft="${cropL}f" croptop="${cropT}f" cropright="${cropR}f" cropbottom="${cropB}f"` in `1/65536` units on `<v:imagedata>`.
  - In HWPX OWPML: Adjusts `<hp:imgClip left="..." right="..." top="..." bottom="..."/>` in `75 HWPU/px` intrinsic image coordinates.
- **`FIT` Aspect-Ratio Preservation**: Reads intrinsic PNG/JPEG headers (`readImageDimensions`) and centers the fitted bounding box inside the target frame without aspect distortion in both DOCX and HWPX.

### B-3. Vector / Shape / Line Fidelity Hardening
- **Compound VML Path Fix**: Changed `case "Z"` in `SvgPath.toVmlPath()` from `"x e"` to `"x"`, keeping only a single terminal `"e"` at the end of the path string. Compound icons and hollow rings with multiple `M ... Z` subpaths now render all subpaths in Word.
- **Donut & Pie Chart `ELLIPSE` `arcData`**: Implemented `buildEllipseArcSvgPath(startAngle, endAngle, innerRadius)` using cubic Bezier arc approximation ($\alpha = \frac{4}{3}\tan(\Delta\theta / 4)$). `ELLIPSE` nodes with `innerRadius > 0.001` or partial sweep angle `< 2\pi` are converted into exact closed `vector` elements (`vectorPath` + `vectorSubpaths`), eliminating overlapping full circles on Page 4 of Reports 1–3.
- **Open Vector Subpaths in HWPX & DOCX**:
  - In HWPX: Open subpaths (`!sp.closed`) are emitted as native `<hp:line>` segments between consecutive points rather than `<hp:polygon>`, preventing Hancom Office from drawing a spurious closing line from the end point back to the start point.
  - In DOCX: Vector elements whose subpaths are all open (`!hasClosedSubpath`) force `filled="f"` on `<v:shape>`.

### B-4. Text & Typography Hardening
- **Line Height & Letter Spacing**:
  - `FigmaCanvasParser` extracts `lineHeightPt` (unless `lineHeightUnit === "INTRINSIC_%"`) and `letterSpacingPt`.
  - `DocxCanvasRenderer` emits `<w:spacing w:val="${letterSpacingTwips}"/>` in `<w:rPr>` and `<w:contextualSpacing w:val="0"/><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/>` in `<w:pPr>`.
  - `HwpxCanvasRenderer` dynamically registers `<hh:paraPr>` entries with `<hh:lineSpacing type="FIXED" value="${lhHwpu}" unit="HWPUNIT"/>` and extends `<hh:charPr>` with `<hh:underline>`, `<hh:strikeout>`, and `<hh:spacing>`.
- **Inner Text Box Padding**: Extracted `innerPaddingPt` from Figma `TEXT` node padding and mapped to both VML `inset` and HWPX `<hp:textMargin>`.

### B-5 & B-6. Direct `FigmaSnapshot` Unpacking & DOCX → HWPX Bridge Hardening
- `FigmaCanvasParser.parse()` now transparently unwraps `{ figmaNode, imageMap }` snapshots and `/v1/files/:key/nodes` payloads, registering base64 `imageMap` entries into `resources`.
- `DocxCanvasParser.parse()` now splits pages on both `<w:br w:type="page"/>` and inline `<w:sectPr>` breaks, parses per-section `<w:pgSz>` orientation/size, restores `page.backgroundColor` from `bg_N` shapes, and preserves `verticalAlign`, `imageCrop`, `strokeDashed`, `letterSpacingPt`, and `vectorSubpaths`.
