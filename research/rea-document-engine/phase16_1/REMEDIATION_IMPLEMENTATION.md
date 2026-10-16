# Phase 16.1 — Remediation Implementation Architecture

## 1. Overview of Code Modifications

Phase 16.1 addressed every finding from the external audit with concrete, production-grade architectural enhancements across the Canvas IR, geometry subpath parser, Figma parser, DOCX VML renderer, and HWPX OWPML renderer.

```
                    ┌──────────────────────────┐
                    │    Figma JSON Source     │
                    └────────────┬─────────────┘
                                 │
                     [FigmaCanvasParser.ts]
                     - Dynamic Page Size & Orientation
                     - Extract textAlignVertical -> verticalAlign
                     - Multi-Subpath Extraction via SVG Parser
                                 │
                                 ▼
                     ┌─────────────────────────┐
                     │    Canvas IR Document   │
                     │  - pageSize (orientation)│
                     │  - verticalAlign        │
                     │  - vectorSubpaths[]     │
                     └───────┬─────────┬───────┘
                             │         │
             ┌───────────────┘         └───────────────┐
             ▼                                         ▼
   [docxCanvasRenderer.ts]                   [hwpxCanvasRenderer.ts]
   - v-text-anchor: middle|bottom            - vertAlign="CENTER"|"BOTTOM"
   - <w:pgSz w:orient="landscape">           - Discrete <hp:polygon> Subpaths
                                             - faceColor="none" on Open Paths
                                             - Intrinsic Img Sniff & <hp:imgClip>
                                             - <hp:rect ratio="${ratio}">
                                             - <hp:pagePr landscape="WIDELY">
```

---

## 2. Detailed Implementation by Module

### 2.1. Canvas IR Types (`src/canvas/types.ts`)

1. **`pageSize` Orientation Support**:
   Added `orientation?: 'portrait' | 'landscape'` to `CanvasDocument.pageSize`.
2. **Text Vertical Alignment**:
   Added `verticalAlign?: 'top' | 'center' | 'bottom'` to `CanvasElement`.
3. **Discrete Subpath IR**:
   Defined `CanvasVectorSubpath` interface:
   ```ts
   export interface CanvasVectorSubpath {
     points: Array<{ x: number; y: number }>;
     closed: boolean;
   }
   ```
   Added `vectorSubpaths?: CanvasVectorSubpath[]` to `CanvasElement`.

---

### 2.2. SVG Path Geometry Engine (`src/canvas/geometry/svgPathParser.ts`)

Implemented `toHwpxSubpathsWithClosed(targetWidthPt: number, targetHeightPt: number, curveSteps: number)`:
- Iterates through SVG path commands.
- On each `M` command, initiates a new subpath branch.
- On each `Z` / `z` command, marks `currentSubpath.closed = true`.
- Interpolates Bézier curves (`C`, `S`, `Q`, `T`) into linear polylines.
- Scales point coordinates by `targetWidthPt / viewBoxWidth` and `targetHeightPt / viewBoxHeight`.
- Returns an array of `{ points: Array<{ x: number; y: number }>, closed: boolean }`.

---

### 2.3. Figma Canvas Parser (`src/canvas/parser/figmaCanvasParser.ts`)

1. **Dynamic Page Size & Orientation Extraction**:
   Inspects the bounding box of the primary page frame:
   ```ts
   const primaryFrame = topLevelFrames[0];
   const frameWidth = primaryFrame?.absoluteBoundingBox?.width ?? 595.28;
   const frameHeight = primaryFrame?.absoluteBoundingBox?.height ?? 841.89;
   const isLandscape = frameWidth > frameHeight;

   doc.pageSize = {
     widthPt: frameWidth,
     heightPt: frameHeight,
     orientation: isLandscape ? 'landscape' : 'portrait',
   };
   ```
2. **Text Vertical Alignment**:
   Maps Figma's `style.textAlignVertical`:
   - `'CENTER'` -> `'center'`
   - `'BOTTOM'` -> `'bottom'`
   - Default -> `'top'`
3. **Multi-Subpath Vector Processing**:
   When parsing vector shapes with SVG path data, invokes `toHwpxSubpathsWithClosed` and populates `element.vectorSubpaths`.

---

### 2.4. DOCX Canvas Renderer (`src/canvas/renderer/docxCanvasRenderer.ts`)

1. **Orientation & Page Dimensions**:
   In `renderDocumentXml`:
   ```ts
   const widthTwips = Math.round(doc.pageSize.widthPt * 20);
   const heightTwips = Math.round(doc.pageSize.heightPt * 20);
   const isLandscape = doc.pageSize.orientation === 'landscape' || doc.pageSize.widthPt > doc.pageSize.heightPt;
   const orientAttr = isLandscape ? ' w:orient="landscape"' : '';
   ```
   Emits:
   ```xml
   <w:pgSz w:w="${widthTwips}" w:h="${heightTwips}"${orientAttr}/>
   ```
2. **VML Textbox Vertical Anchoring**:
   In `renderTextElement`:
   ```ts
   let vAnchor = '';
   if (el.verticalAlign === 'center') {
     vAnchor = 'v-text-anchor:middle;';
   } else if (el.verticalAlign === 'bottom') {
     vAnchor = 'v-text-anchor:bottom;';
   }
   // Injected into <v:textbox style="...;${vAnchor}">
   ```

---

### 2.5. HWPX Canvas Renderer (`src/canvas/renderer/hwpxCanvasRenderer.ts`)

1. **Dynamic Page Setup**:
   In `section0.xml` builder:
   ```ts
   const isLandscape = doc.pageSize.orientation === 'landscape' || doc.pageSize.widthPt > doc.pageSize.heightPt;
   const landscapeAttr = isLandscape ? "WIDELY" : "NARROWLY";
   const widthHwpu = Math.round(doc.pageSize.widthPt * 100);
   const heightHwpu = Math.round(doc.pageSize.heightPt * 100);
   ```
   Emits `<hp:pagePr landscape="${landscapeAttr}" width="${widthHwpu}" height="${heightHwpu}" gutterType="LEFT_ONLY">`.

2. **Discrete Multi-Subpath Vectors & Open Strokes**:
   In `renderVectorElement`:
   - Iterates through `el.vectorSubpaths`.
   - Each subpath emits an independent `<hp:polygon>` element.
   - For open subpaths (`!subpath.closed`):
     Emits `<hc:winBrush faceColor="none"/>` inside `<hp:fillBrush>`.
   - Prevents Hancom Office from creating artifact connector lines or unwanted closed-chord fills.

3. **Image Sniffing & Aspect-Ratio Cover Crop**:
   In `renderImageElement`:
   - Sniffs raw image buffers from data URIs or base64 resources:
     - PNG: parses 4 bytes after `IHDR` chunk for width & height.
     - JPEG: scans SOF0/SOF2 markers (`0xFFC0`, `0xFFC2`) for width & height.
   - Calculates aspect ratios:
     `arBox = boxWidth / boxHeight`, `arImg = imgWidth / imgHeight`.
   - If `arImg > arBox` (image wider than frame):
     `dimH = Math.round(imgHeight * 100)`, `visW = dimH * arBox`, `cropX = (dimWidth - visW) / 2`.
     `left = cropX`, `right = dimWidth - cropX`, `top = 0`, `bottom = dimHeight`.
   - If `arBox > arImg` (frame wider than image):
     `dimW = Math.round(imgWidth * 100)`, `visH = dimW / arBox`, `cropY = (dimHeight - visH) / 2`.
     `left = 0`, `right = dimWidth`, `top = cropY`, `bottom = dimHeight - cropY`.
   - Emits:
     ```xml
     <hp:imgClip left="${clip.left}" right="${clip.right}" top="${clip.top}" bottom="${clip.bottom}"/>
     <hp:inImgDim dimwidth="${dimWidth}" dimheight="${dimHeight}"/>
     ```

4. **Text Vertical Alignment in OWPML**:
   In `renderTextElement`:
   ```ts
   const vertAlignAttr = el.verticalAlign === 'center' ? ' vertAlign="CENTER"' : el.verticalAlign === 'bottom' ? ' vertAlign="BOTTOM"' : ' vertAlign="TOP"';
   ```
   Emitted on `<hp:subList id="${subListId}" textDirection="HORIZONTAL" lineWrap="BREAK"${vertAlignAttr} vertAlignMethod="AUTO">`.

5. **Rectangle Curvature Ratio (`ratio`)**:
   In `renderRectElement`:
   ```ts
   let ratioAttr = '';
   if (el.cornerRadius && el.cornerRadius > 0) {
     const minDim = Math.min(el.bounds.widthPt, el.bounds.heightPt);
     const computedRatio = Math.min(50, Math.max(0, Math.round((el.cornerRadius / (minDim / 2)) * 50)));
     ratioAttr = ` ratio="${computedRatio}"`;
   }
   ```
   Emitted on `<hp:rect id="${id}"${ratioAttr}...>`.
