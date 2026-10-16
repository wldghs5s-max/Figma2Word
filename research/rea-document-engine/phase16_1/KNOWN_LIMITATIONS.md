# Phase 16.1 — Known Limitations & Technical Constraints

## 1. Overview

While Phase 16.1 resolved critical structural defects flagged in external audits, several edge cases and format-specific constraints remain inherent to the document engines or the operating environment. This document catalogs these limitations with transparency to guide future roadmap planning.

---

## 2. Document Format Constraints

### 2.1. Multi-Page Mixed Orientations (Portrait + Landscape in Single Document)
- **Current Behavior**: The document-level `pageSize` is determined by the primary (first) top-level canvas page frame. All subsequent pages in the same document inherit this paper size and orientation.
- **Limitation**: If a Figma canvas mixes an A4 Portrait page followed by an A4 Landscape slide, Word DOCX requires injecting page-level section breaks (`<w:sectPr>` with varying `<w:pgSz>`) rather than a single document-wide section break. In HWPX, this requires emitting distinct `<hp:secPr>` page definitions across paragraphs.
- **Impact**: Multi-page documents with mixed portrait/landscape pages will currently adopt the orientation of Page 1.

### 2.2. Non-Uniform Corner Radii in HWPX
- **Current Behavior**: KS X 6101 OWPML `<hp:rect>` supports a single uniform curvature ratio (`ratio="0..50"`).
- **Limitation**: Figma frames supporting independent four-corner radii (e.g., `topLeftRadius: 16`, `topRightRadius: 16`, `bottomLeftRadius: 0`, `bottomRightRadius: 0` for tab cards) cannot be represented as a native `<hp:rect>` with differing corners.
- **Current Mitigation**: The engine calculates curvature ratio based on the available `cornerRadius` property. For complex asymmetric cards, rendering fallback to closed polygon or vector clipping is required in future phases.

### 2.3. Advanced Gradient Fills in HWPX
- **Current Behavior**: Linear gradient fills in Figma are mapped to their primary dominant solid color when emitting OWPML shapes.
- **Limitation**: Full KS X 6101 gradient shading (`<hp:grad>`) requires complex color stop arrays, angle conversion, and color space transforms.
- **Impact**: Highly stylised subtle gradients appear as solid fills in HWPX.

### 2.4. Image Sniffing Format Coverage
- **Current Behavior**: The intrinsic image dimension sniffer natively parses PNG (`IHDR`) and standard baseline/progressive JPEG (`SOF0`, `SOF2`).
- **Limitation**: WebP, TIFF, or SVG data URIs do not currently have dedicated intrinsic dimension sniffers in `hwpxCanvasRenderer.ts` and default to a 1:1 fallback ratio when computing `<hp:imgClip>`.

---

## 3. Environment & Tooling Constraints

### 3.1. Browser E2E Headless Automation
- **Current Status**: `@playwright/test` and headless browser binary distributions (Chromium, WebKit) are not installed in the Windows environment.
- **Verification Performed**: Frontend type-checking and production Vite bundling (`npm run build:web`) execute cleanly with zero errors.
- **Roadmap Item**: To achieve automated browser E2E validation in CI, add `@playwright/test` to `devDependencies` and configure `npx playwright install --with-deps chromium`.
