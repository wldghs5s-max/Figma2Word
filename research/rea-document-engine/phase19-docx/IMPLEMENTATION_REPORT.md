# Phase 19: DOCX Text Fidelity Implementation Report

## 1. Overview of Changes

In Phase 19, targeted modifications were made to resolve real-world DOCX text layout defects without broad rewrites or architectural churn.

### Modified Files:
1. `src/canvas/types.ts`: Added `textAutoResize` property to `CanvasElement`.
2. `src/canvas/parser/figmaCanvasParser.ts`: Extracted Figma `textAutoResize` ("NONE" | "HEIGHT" | "WIDTH_AND_HEIGHT" | "TRUNCATE") and attached to `CanvasElement`.
3. `src/canvas/renderer/docxCanvasRenderer.ts`:
   - Updated `baseStyle` generation to dynamically assign `mso-wrap-style:square` for text shapes and `mso-wrap-style:none` for non-text shapes.
   - Updated `<v:textbox>` style generation to assign `mso-fit-shape-to-text:t` for pure text elements (`elem.type === "text" && !hasFill && !hasStroke`) and `mso-fit-shape-to-text:f` for containers/cards.
   - Implemented an adaptive `lineRule` policy (`atLeast` for tight line heights $< 1.25\times \text{fontSize}$, `exact` for generous line heights $\ge 1.25\times \text{fontSize}$).
4. `tests/phase19-docx-text-fidelity.test.ts`: Added 10 comprehensive unit/integration test cases covering all Phase 19 requirements.

---

## 2. Detailed Code Diffs

### 2.1 `src/canvas/types.ts`
```typescript
export interface CanvasElement {
  id: string;
  name?: string;
  type: CanvasElementType;
  bounds: CanvasBounds;
  zIndex: number;
  rotation?: number; // degrees
  opacity?: number; // 0.0 ~ 1.0
  style: CanvasStyle;
  
  // Text details
  textRuns?: CanvasTextRun[];
  paragraphAlign?: "left" | "center" | "right" | "justify";
  verticalAlign?: "top" | "center" | "bottom";
  innerPaddingPt?: CanvasPadding;
+ textAutoResize?: "NONE" | "HEIGHT" | "WIDTH_AND_HEIGHT" | "TRUNCATE";
  ...
}
```

### 2.2 `src/canvas/parser/figmaCanvasParser.ts`
```typescript
          const padTop = ((child as any).paddingTop || 0) * scaleY;
          const padRight = ((child as any).paddingRight || 0) * scaleX;
          const padBottom = ((child as any).paddingBottom || 0) * scaleY;
          const padLeft = ((child as any).paddingLeft || 0) * scaleX;
          const innerPaddingPt =
            padTop > 0 || padRight > 0 || padBottom > 0 || padLeft > 0
              ? { top: padTop, right: padRight, bottom: padBottom, left: padLeft }
              : undefined;

+         const rawTar = (child.style as any)?.textAutoResize || (child as any).textAutoResize;
+         const textAutoResize: "NONE" | "HEIGHT" | "WIDTH_AND_HEIGHT" | "TRUNCATE" | undefined =
+           rawTar === "HEIGHT" || rawTar === "WIDTH_AND_HEIGHT" || rawTar === "NONE" || rawTar === "TRUNCATE"
+             ? rawTar
+             : undefined;

          elements.push({
            id: child.id,
            name: child.name,
            type: "text",
            bounds: { x: xPt, y: yPt, width: wPt, height: hPt },
            zIndex: currentZIndex++,
            rotation: (child as any).rotation,
            opacity: child.opacity,
            style,
            textRuns,
            paragraphAlign: align,
            verticalAlign,
            innerPaddingPt,
+           textAutoResize,
            sourceNodeId: child.id,
            sourceNodeType: child.type,
          });
```

### 2.3 `src/canvas/renderer/docxCanvasRenderer.ts`
#### A. Dynamic Shape Wrap Style
```typescript
+   const hasText = !!(elem.textRuns && elem.textRuns.length > 0);
+   const wrapStyle = hasText ? "mso-wrap-style:square" : "mso-wrap-style:none";
    const baseStyle = `position:absolute;left:0;top:0;margin-left:${x.toFixed(
      3
    )}pt;margin-top:${y.toFixed(3)}pt;width:${width.toFixed(
      3
    )}pt;height:${height.toFixed(
      3
-   )}pt;z-index:${z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none${rotStyle}`;
+   )}pt;z-index:${z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page;${wrapStyle}${rotStyle}`;
```

#### B. Textbox Auto-Fit & Adaptive LineRule
```typescript
      const firstLineHeight = elem.textRuns.find((r) => r.lineHeightPt)?.lineHeightPt;
+     const maxFontSize = Math.max(...elem.textRuns.map((r) => r.fontSizePt || 12));
+     const isPureText = elem.type === "text" && !hasFill && !hasStroke;
+
+     // Auto-fit height for pure text elements (or elements with auto-resize), fixed height for cards/buttons
+     const shouldFitHeight =
+       isPureText ||
+       elem.textAutoResize === "HEIGHT" ||
+       elem.textAutoResize === "WIDTH_AND_HEIGHT";
+     const fitTextAttr =
+       shouldFitHeight && !hasFill && !hasStroke
+         ? "mso-fit-shape-to-text:t"
+         : "mso-fit-shape-to-text:f";
+
+     const isTightLine = !!(firstLineHeight && firstLineHeight < maxFontSize * 1.25);
+     const lineRule = isTightLine ? "atLeast" : "exact";

      const spacingXml = firstLineHeight
-       ? `<w:spacing w:before="0" w:after="0" w:line="${Math.round(firstLineHeight * 20)}" w:lineRule="exact"/>`
+       ? `<w:spacing w:before="0" w:after="0" w:line="${Math.round(firstLineHeight * 20)}" w:lineRule="${lineRule}"/>`
        : `<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>`;

      const vAnchor = elem.verticalAlign === "center" ? "v-text-anchor:middle" : elem.verticalAlign === "bottom" ? "v-text-anchor:bottom" : "v-text-anchor:top";
      textboxContentXml = `
-     <v:textbox style="mso-fit-shape-to-text:f;mso-next-textbox:none;${vAnchor}" ${insetAttr}>
+     <v:textbox style="${fitTextAttr};mso-next-textbox:none;${vAnchor}" ${insetAttr}>
```

---

## 3. Strict Non-Regression & Scope Adherence
- **Zero Modifications to HWPX**: `src/canvas/renderer/hwpxCanvasRenderer.ts` was not modified in any way.
- **Zero Arbitrary Font Size Shrinking**: Font sizes are 100% preserved from Figma.
- **Zero Global Height Inflation**: Only pure text elements with tight descenders or multi-line wraps adjust dynamically in Word. Container cards retain exact design dimensions.
- **Zero Hardcoded Strings or Node IDs**: All logic is 100% parametric, based on element attributes (`hasText`, `hasFill`, `hasStroke`, `textAutoResize`, `firstLineHeight`, `maxFontSize`).
