# Phase 32: Real Figma Fidelity Benchmark & Conversion Quality Improvement
## 04. Universal Renderer Improvements & Mathematical Verifications

### 1. Mathematical Proof of Optical Center Invariance

To eliminate the optical center drift while preserving the width buffer, we adjust the origin coordinate `x`:

$$\text{Let } x_0 \text{ be the original Figma X position, and } w_0 \text{ be the original width.}$$
$$\text{Original Optical Center } C_0 = x_0 + \frac{w_0}{2}$$

When buffer $B > 0$ is added, the new width is $w' = w_0 + B$.
To keep the center invariant:
$$\text{New Center } C' = x' + \frac{w'}{2} = x' + \frac{w_0 + B}{2} = C_0 = x_0 + \frac{w_0}{2}$$
$$x' + \frac{w_0}{2} + \frac{B}{2} = x_0 + \frac{w_0}{2} \implies x' = x_0 - \frac{B}{2}$$

Similarly, for right-aligned text with anchor $R_0 = x_0 + w_0$:
$$R' = x' + w' = x' + w_0 + B = R_0 = x_0 + w_0 \implies x' = x_0 - B$$

For left-aligned text with anchor $L_0 = x_0$:
$$L' = x' = L_0 = x_0 \implies x' = x_0$$

#### Implemented Code in `docxCanvasRenderer.ts`:
```ts
let effectiveWidth = width;
let adjustedX = x;
let buffer = 0;
if (elem.type === "text" && elem.textAutoResize === "WIDTH_AND_HEIGHT") {
  buffer = Math.max(3, effectiveWidth * 0.03);
  effectiveWidth += buffer;
} else if (hasText && wrapStyle === "mso-wrap-style:none") {
  buffer = Math.max(2, Math.min(8, effectiveWidth * 0.025));
  effectiveWidth += buffer;
}

if (buffer > 0) {
  if (elem.paragraphAlign === "center") {
    adjustedX -= buffer / 2;
  } else if (elem.paragraphAlign === "right") {
    adjustedX -= buffer;
  }
}
```

---

### 2. VML Stroke Inset Calculation for `INSIDE` Strokes

In Figma, `strokeAlign: "INSIDE"` means the stroke is fully contained inside the $[x, x + w] \times [y, y + h]$ rectangle.
In VML, strokes are centered on the bounding box path with stroke weight $S$.
To ensure the outer stroke edge matches the Figma rectangle exactly:

$$\text{Shape X: } x_s = x + \frac{S}{2}$$
$$\text{Shape Y: } y_s = y + \frac{S}{2}$$
$$\text{Shape Width: } w_s = \max(0.1, w - S)$$
$$\text{Shape Height: } h_s = \max(0.1, h - S)$$

Verification of outer stroke extent:
- Outer Left $= x_s - \frac{S}{2} = x + \frac{S}{2} - \frac{S}{2} = x$
- Outer Right $= x_s + w_s + \frac{S}{2} = x + \frac{S}{2} + (w - S) + \frac{S}{2} = x + w$
- Outer Top $= y_s - \frac{S}{2} = y$
- Outer Bottom $= y_s + h_s + \frac{S}{2} = y + h$

Outer boundary error is exactly **$0.000\text{ pt}$**.

#### Implemented Code in `docxCanvasRenderer.ts`:
```ts
let shapeX = adjustedX;
let shapeY = y;
let shapeW = effectiveWidth;
let shapeH = height;
if (!isText && (elem.type === "card" || elem.type === "oval") && hasStroke && style.strokeAlign === "INSIDE") {
  const strokeW = style.strokeWidth || 1;
  const halfStroke = strokeW / 2;
  shapeX = x + halfStroke;
  shapeY = y + halfStroke;
  shapeW = Math.max(0.1, width - strokeW);
  shapeH = Math.max(0.1, height - strokeW);
}
```

---

### 3. Vertical Centering Line Rule Tuning

```ts
const isTightLine = !!(firstLineHeight && firstLineHeight < maxFontSize * 1.25);
const isVerticallyCenteredSingleLine = elem.verticalAlign === "center" && isSingleLine;
const lineRule = isTightLine || isVerticallyCenteredSingleLine ? "atLeast" : "exact";
```
- For single-line buttons and badges: `w:lineRule="atLeast"` allows Word's layout engine to render Hangul descenders cleanly within `v-text-anchor:middle`.
- For multi-line paragraphs: `w:lineRule="exact"` is preserved, guaranteeing strict vertical line spacing matching Figma designs.
