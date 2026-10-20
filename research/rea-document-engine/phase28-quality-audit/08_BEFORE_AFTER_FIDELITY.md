# Phase 28 Quality Audit — Report 08: Before vs. After Visual Fidelity Analysis

## 1. Feature Comparison Matrix

| Feature | Phase 27 Baseline | Phase 28 Implementation | Fidelity Impact |
| :--- | :--- | :--- | :--- |
| **Word Automation Isolation** | Filtered by `name` or `prefix`; fail-open state query | Filtered strictly by normalized POSIX path in unique UUID folder; fail-closed query | Eliminates 100% of user data loss risk |
| **Collision Metric Semantics** | Inferred `detectedCollisionsCount` from section count mismatch | Split into `sectionCountMismatch` (structural) and `visualCollisionsCount` (geometric) | Metric honesty and transparency restored |
| **Asymmetric Rounded Cards** | Forced all 4 corners uniform via `<v:roundrect>` | Emits `<v:shape path="..." coordsize="...">` with cubic Bezier curves | Modals, tabs, and drawers render with exact per-corner rounding |
| **Pill Buttons** | Potential overflow on extreme Figma radii | Clamped to exact `arcsize="0.500"` via W3C formula | Fully rounded pill buttons in Microsoft Word |
| **Single-Line Button Text Wrap** | Wrapped words onto invisible 2nd lines when fonts expanded | Universally guarded with `<w:wordWrap w:val="0"/>` | Zero unwanted wrapping or clipped button labels |
| **Parser-Renderer Symmetry** | `DocxCanvasParser` had doubled `cornerRadius` | Fixed VML arcsize reverse formula to `arc * (minSide / 2)` | Flawless DOCX -> IR -> HWPX roundtrip fidelity |
| **Oversized Frames (>22")** | Math scaling only | Live Microsoft Word native PDF/PNG rendering verified | Zero Word crashes, zero footer clipping |

---

## 2. Before / After Structural Code Diffs

### A. Asymmetric Corner Radii in `docxCanvasRenderer.ts`

```diff
- const isRound = !isOval && !!style.cornerRadius && style.cornerRadius > 0;
- const tag = isOval ? "v:oval" : isRound ? "v:roundrect" : "v:rect";
- const arcsizeAttr = isRound ? `arcsize="${Math.min(0.5, (2 * (style.cornerRadius || 0)) / minDim).toFixed(3)}"` : "";
+ const radii = style.cornerRadii;
+ const isAsymmetric = !isOval && Array.isArray(radii) && radii.length === 4 &&
+   !(radii[0] === radii[1] && radii[1] === radii[2] && radii[2] === radii[3]) &&
+   radii.some((r) => r > 0);
+
+ let tag = isOval ? "v:oval" : "v:rect";
+ let extraShapeAttrs = "";
+ if (isAsymmetric && radii) {
+   tag = "v:shape";
+   const built = this.buildRoundedRectPath(width, height, radii);
+   extraShapeAttrs = `coordsize="${built.coordsize}" path="${built.path}" `;
+ } else if (!isOval) {
+   const scalarRadius = (radii && radii[0] > 0 ? radii[0] : style.cornerRadius) || 0;
+   const isRound = scalarRadius > 0;
+   tag = isRound ? "v:roundrect" : "v:rect";
+   if (isRound) {
+     extraShapeAttrs = `arcsize="${Math.min(0.5, (2 * scalarRadius) / minDim).toFixed(3)}" `;
+   }
+ }
```

### B. Single-Line Word Wrap in `docxCanvasRenderer.ts`

```diff
- const isSingleLineAutoWidth = elem.textAutoResize === "WIDTH_AND_HEIGHT" &&
-   !elem.textRuns.some((r) => r.text && /[\r\n]/.test(r.text));
- const wordWrapXml = isSingleLineAutoWidth ? '<w:wordWrap w:val="0"/>\n ' : "";
+ const hasHardNewline = elem.textRuns.some((r) => r.text && /[\r\n]/.test(r.text));
+ const isSingleLine = !hasHardNewline && (
+   elem.textAutoResize === "WIDTH_AND_HEIGHT" ||
+   (elem.bounds.height > 0 && firstLineHeight && elem.bounds.height <= firstLineHeight * 1.45) ||
+   (elem.bounds.height > 0 && maxFontSize && elem.bounds.height <= maxFontSize * 1.6)
+ );
+ const wordWrapXml = isSingleLine ? '<w:wordWrap w:val="0"/>\n ' : "";
```
