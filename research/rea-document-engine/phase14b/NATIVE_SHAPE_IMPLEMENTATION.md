# Phase 14B — Native Vector Shape Implementation Architecture

## 1. Overview & Motivation

In the comprehensive element audit ([UNSUPPORTED_ELEMENTS_AUDIT.md](./UNSUPPORTED_ELEMENTS_AUDIT.md)), we discovered that all 15 `VECTOR` nodes across Reports 1–3 were previously misclassified as `type: "card"` because the Figma REST API snapshot lacked raw SVG path strings (`geometry=paths`). This caused the renderer to output empty stroked rectangular boxes (`<v:rect stroked="t">`), inserting misleading bordered rectangles where warning triangles, checkmarks, info badges, and document icons should appear.

Phase 14B introduces first-class native vector shape rendering support into the Canvas IR and the DOCX/HWPX dual renderers.

---

## 2. Architecture & Data Model

### 1. Canvas IR Extension (`src/canvas/types.ts`)
```typescript
export type CanvasElementType =
  | "card"
  | "text"
  | "image"
  | "line"
  | "table"
  | "group"
  | "oval"
  | "vector"; // Added in Phase 14B

export interface CanvasElement {
  // ...
  vectorPath?: string; // Normalized VML or SVG path string
}
```

### 2. Semantic Vector Normalization (`src/canvas/parser/figmaCanvasParser.ts`)
When encountering `child.type === "VECTOR"`:
1. Checks for explicit vector geometry paths if available in `fillGeometry` or `vectorPaths`.
2. Inspects semantic icon context from parent node hierarchy and node name:
   - `alert-triangle` / `warning`: Normalized outer triangle with exclamation mark path.
   - `check` / `tick`: Normalized checkmark path.
   - `info`: Normalized circle contour with center dot and stroke.
   - `file-text` / `document`: Folded corner document outline with text lines.
3. Maps to normalized coordinate space `coordsize="1000,1000"`.
4. If no path is resolved, avoids emitting a bogus rectangular border, preserving clean layout aesthetics.

```typescript
// Standard UI icon path normalization (coordsize="1000,1000")
const nameLower = (parentName + " " + nodeName).toLowerCase();
if (nameLower.includes("alert") || nameLower.includes("warn") || nameLower.includes("triangle")) {
  vmlPath = "m 500,60 l 950,920 l 50,920 x e m 500,380 l 500,640 e m 500,780 l 500,840 e";
} else if (nameLower.includes("check") || nameLower.includes("tick")) {
  vmlPath = "m 150,520 l 400,780 l 880,180 e";
} else if (nameLower.includes("info")) {
  vmlPath = "m 500,50 c 748,50 950,252 950,500 c 950,748 748,950 500,950 c 252,950 50,748 50,500 c 50,252 252,50 500,50 e m 500,280 l 500,340 e m 500,460 l 500,740 e";
} else if (nameLower.includes("file") || nameLower.includes("doc")) {
  vmlPath = "m 200,80 l 620,80 l 820,280 l 820,920 l 200,920 x e m 620,80 l 620,280 l 820,280 e m 340,480 l 680,480 e m 340,640 l 680,640 e";
}
```

### 3. Native DOCX VML Output (`src/canvas/renderer/docxCanvasRenderer.ts`)
Emits editable Word VML vector shapes:
```xml
<w:r>
  <w:pict>
    <v:shape id="${shapeId}"
             alt="${elem.id}"
             o:title="${elem.name}"
             style="${baseStyle}"
             coordsize="1000,1000"
             path="${elem.vectorPath}"
             ${filledAttr}
             ${fillcolorAttr}
             ${strokedAttr}
             ${strokecolorAttr}
             ${strokeweightAttr}/>
  </w:pict>
</w:r>
```

### 4. Native HWPX Output (`src/canvas/renderer/hwpxCanvasRenderer.ts`)
Emits Hancom OWPML `<hp:rect>` or vector shape with exact bounds and styling, guaranteeing structural schema conformity without DTD validation errors.

---

## 3. Verification & Testing

Unit test in [`tests/canvas-engine.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/canvas-engine.test.ts) (`parses Figma VECTOR node with icon context into vector CanvasElement with native VML path`) passes 100%, verifying:
- Parser produces `type: "vector"`.
- `vectorPath` is assigned.
- DOCX OpenXML contains `<v:shape coordsize="1000,1000" path="m 500,60..."/>`.

