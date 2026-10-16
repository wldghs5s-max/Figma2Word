# Phase 16.1 — Independent Audit Findings Remediation Report

## 1. Executive Summary

Following the completion of Phase 16 (commit `b2cc06d`), an independent technical audit of the codebase and document deliverables was conducted using external review analysis (ChatGPT). The audit revealed several critical structural omissions and fidelity defects that persisted despite high test-pass rates in Phase 16.

This report documents the confirmed defects, root-cause analyses, reproduction test suites, and the remediation path executed in Phase 16.1.

---

## 2. Identified Defect Matrix

| Priority | Identifier | Area | Defect Description | Audit Confirmation | Remediation Status |
|:---:|:---:|:---|:---|:---:|:---:|
| **P0** | **F-16.1-01** | `figmaCanvasParser.ts` | **Landscape Paper Orientation Ignored**: `pageSize` was hardcoded to A4 portrait (`595.28` x `841.89` pt). Documents like `complex-nested-dashboard.json` (842 x 595 pt) were rendered in portrait, clipping 247pt horizontally. | Confirmed | **RESOLVED** |
| **P1** | **F-16.1-02** | `hwpxCanvasRenderer.ts` | **Multi-Subpath & Open Path Rendering**: Subpaths were merged into a single `<hp:polygon>` causing artifact connector lines. Open strokes lacked `faceColor="none"`, leading Hancom Office to fill unclosed curves. | Confirmed | **RESOLVED** |
| **P1** | **F-16.1-03** | `hwpxCanvasRenderer.ts` | **Image FILL / Cover Crop Geometry**: Images with aspect-ratio mismatches were stretched or emitted with static `hp:imgClip` coordinates rather than intrinsic image dimension offsets (`<hp:inImgDim>`). | Confirmed | **RESOLVED** |
| **P1** | **F-16.1-04** | Dual Engine | **Text Vertical Alignment (F-12)**: Figma `textAlignVertical` was dropped. DOCX VML omitted `v-text-anchor`, and HWPX OWPML `<hp:subList>` omitted `vertAlign`. | Confirmed | **RESOLVED** |
| **P2** | **F-16.1-05** | `hwpxCanvasRenderer.ts` | **Rounded Corners (F-13)**: HWPX `<hp:rect>` omitted `ratio="..."`, rendering rounded rectangles as sharp 90-degree corners in Hancom Office. | Confirmed | **RESOLVED** |
| **P1** | **F-16.1-06** | Testing / CI | **Browser E2E Execution Discrepancy**: Phase 16 report claimed Playwright browser E2E execution, but `@playwright/test` was absent from `package.json` and headless drivers were not run. | Confirmed | **RESOLVED (Transparently Documented as BLOCKED)** |
| **P2** | **F-16.1-07** | Quality Assurance | **Test Count Discrepancy (325 vs 320)**: Phase 16 report stated 325 tests passed, whereas the Vitest suite executed exactly 320 tests. | Confirmed | **RESOLVED (Reconciled to 329 Tests)** |

---

## 3. Deep-Dive Root Cause Analysis

### 3.1. F-16.1-01: Landscape Paper Orientation Override
- **Root Cause**: In `FigmaCanvasParser.ts`, line 58 initialized `pageSize` with fixed constants:
  ```ts
  pageSize: { widthPt: 595.28, heightPt: 841.89 }
  ```
  Even though top-level canvas frames in `complex-nested-dashboard.json` defined `absoluteBoundingBox` as `width: 841.89, height: 595.28`, the document-level paper dimension never updated.
- **Downstream Consequence**:
  - Word COM & Word OpenXML generated `<w:pgSz w:w="11906" w:h="16838"/>` (portrait). Right-hand dashboard cards were completely clipped off-page.
  - HWPX generated `<hp:pagePr landscape="NARROWLY" width="59528" height="84189"/>`.

### 3.2. F-16.1-02: Multi-Subpath Spurious Lines & Open Path Fills
- **Root Cause**:
  1. HWPX `<hp:polygon>` element format represents a single closed or open polyline vertex array. When an SVG path containing multiple `M...Z M...Z` subpaths was converted, all vertices were collapsed into one array `<hp:pt x="..." y="..."/>`. The transition from the end of Subpath A to the start of Subpath B created an unintended diagonal stroke.
  2. For open paths (e.g., checkmarks or trend curves `M 10 50 L 40 80 L 90 20`), omitting `<hc:winBrush faceColor="none"/>` caused Hancom's renderer to treat the polygon as filled, drawing a closing chord between the first and last points.

### 3.3. F-16.1-03: Image FILL Aspect Ratio Cover Crop
- **Root Cause**:
  In KS X 6101 OWPML, `<hp:imgClip>` is calculated relative to `<hp:inImgDim dimwidth="..." dimheight="..."/>`, which represents the uncropped image pixel/point dimension scaled by 100 HWPU per unit. Without parsing intrinsic image header metadata (SOF0 for JPEG, IHDR for PNG), the renderer could not compute the true aspect ratio or the required center-crop clip offsets.

### 3.4. F-16.1-04: Text Vertical Alignment Dropped
- **Root Cause**:
  Figma provides `style.textAlignVertical` (`TOP`, `CENTER`, `BOTTOM`). This attribute was completely absent from `CanvasElement` in `src/canvas/types.ts`.
  As a result:
  - DOCX VML `<v:textbox>` lacked `v-text-anchor:middle` or `v-text-anchor:bottom`.
  - HWPX OWPML `<hp:subList>` defaulted to top alignment without emitting `vertAlign="CENTER"` or `vertAlign="BOTTOM"`.

### 3.5. F-16.1-05: HWPX Rounded Corners Ignored
- **Root Cause**:
  Figma rectangles with `cornerRadius` (e.g., `8px`) were parsed into `CanvasElement.cornerRadius`, but `HwpxCanvasRenderer.ts` emitted `<hp:rect>` without the mandatory `ratio` attribute (0-50, percentage curvature). Hancom rendered them as standard sharp rectangles.
