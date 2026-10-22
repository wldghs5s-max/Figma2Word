# 03. VML Image Binding & ArcSize Experiments (Audit A2 & A3)

## 1. Controlled Experiment Matrix

To isolate whether the invisible card was caused by corrupted image data or a fundamental flaw in Word's VML image binding (`filled="f"` vs `filled="t"` vs `<v:fill>`), four distinct variants were compiled into DOCX files, rendered in Microsoft Word for Mac (v16.114), and sampled via Swift PDFKit.

| Variant ID | Configuration Description | Underlying PNG | VML Fill Attribute | VML Binding Tag | Center Pixel Color | Image Visible? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Var A** | Baseline Phase 30 reproduction | Corrupt Base64 | `filled="f"` | `<v:imagedata>` | `#F5F7FA` (Page BG) | **NO** |
| **Var B** | PNG fix ONLY (Existing VML code) | Valid Solid Blue | `filled="f"` | `<v:imagedata>` | `#3662E3` (Solid Blue) | **YES** |
| **Var C1** | Explicit `filled="t"` | Valid Solid Blue | `filled="t"` | `<v:imagedata>` | `#3662E3` (Solid Blue) | **YES** |
| **Var C2** | Frame Fill binding | Valid Solid Blue | `filled="t"` | `<v:fill type="frame">` | `#3662E3` (Solid Blue) | **YES** |

### Key Empirical Findings
1. **Refutation of the `filled="f"` Blocker Hypothesis (Audit A2)**:
   In Microsoft Word for Mac, `<v:imagedata>` renders completely and accurately even when `filled="f"` is specified. In VML, `filled` governs vector fill paints (e.g. `fillcolor`), not the bitmap content of `<v:imagedata>`. Variant B proved that simply replacing the corrupted PNG immediately restored the image card to vibrant blue (`#3662E3`), with all rounded corners, borders, shadows, and white overlay text intact.
2. **Defensive Improvement**:
   While `filled="f"` works, `docxCanvasRenderer.ts` was updated to output `filled="t"` with `fillcolor="#..."` whenever Figma specifies an explicit fill color on an image node, providing a solid background fallback if a remote or external image is transparent.

---

## 2. Corner Radius & `arcsize` Empirical Measurement (Audit A3)

### The Question
Does `arcsize` in VML scale as $\frac{r}{\min(w, h)}$ or $\frac{2 \times r}{\min(w, h)}$?

### The Experiment
A test document containing two $200 \times 100\text{ pt}$ ($300 \times 150\text{ px}$ in 1.5x rasterization) rectangles was rendered in Word for Mac:
- **Card 1**: `arcsize="0.250"`
- **Card 2**: `arcsize="0.500"`

### Measurement via Swift PDFKit
```swift
// Card 1 right edge vertical span at x = 373:
Card 1 (arcsize=0.250) vertical straight edge span: 92 pixels (total height = 150 px)
// Curvature per corner: (150 - 92) / 2 = 29 px = 19.3 pt (~20% of height)

// Card 2 right edge vertical span at x = 748:
Card 2 (arcsize=0.500) vertical straight edge span: 24 pixels (total height = 150 px)
// Curves almost to the centerline (semicircular pill shape)
```

### Analysis & Resolution
In VML (ECMA-376 Part 4 §19.1.2.17):
- The maximum permissible value for `arcsize` is `0.5` ($50\%$), which yields a perfect semicircular pill ($r = \frac{\min}{2}$).
- Therefore, $\text{arcsize} = 0.5$ represents $100\%$ of the maximum corner radius.
- The formula $\min(0.5, \frac{2 \times r}{\min})$ established in Phase 26 caused any radius $\ge \frac{\min}{4}$ to saturate to $0.5$ (full pill).
- For rectangular images with $r = 0$, `docxCanvasRenderer.ts` now emits standard `<v:rect>` instead of a pathless `<v:shape>`, ensuring strict OpenXML compliance.
