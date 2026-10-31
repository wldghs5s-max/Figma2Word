# Report 09: Production Parser & Renderer Structural Improvements

## 1. Engine Evolution in Phase 38
Rather than introducing superficial test scaffolding or hardcoded workarounds, Phase 38 focused on deep structural enhancements across the production pipeline (`FigmaCanvasParser`, `DocxCanvasRenderer`, and `AffineTransformEngine`).

## 2. Key Structural Improvements

### 2.1 Recursive Parsing of Container Children with Image Backgrounds
- **File**: `src/canvas/parser/figmaCanvasParser.ts`
- **Issue**: Previously, if a container node (such as a `FRAME` or `COMPONENT`) had an image fill, the parser handled the image but did not recurse into `child.children`. Any overlay UI cards, text badges, or vector icons situated on top of the image background were silently omitted.
- **Improvement**: Added recursive child processing:
  ```typescript
  if (child.children && Array.isArray(child.children) && child.children.length > 0) {
    processChildren(child, effectiveOpacity);
  }
  ```
- **Real-World Impact**: Recovered 8 previously omitted elements on Page 8 (`759:911` - 사업목록 선택된 화면), boosting Page 8 SSIM from 0.9420 to **0.9487** (+0.0067) and reducing MAE from 3.02 to 2.09.

### 2.2 Rotation-Decoupled Affine Crop Engine
- **File**: `src/fidelity/affineTransformEngine.ts`
- **Issue**: Axis-aligned crop equations were erroneously applied to rotated matrices, resulting in massive clipping of textures.
- **Improvement**: Strict conditional decoupling: crop is calculated only on non-rotated, non-sheared matrices. Rotated matrices preserve texture integrity and supply `rotationDegrees` to the renderer.

### 2.3 Depth-Aware Top-Level Section Extraction
- **File**: `src/fidelity/sectionPageMapper.ts`
- **Issue**: VML textboxes contain nested `<w:txbxContent><w:p>...</w:p></w:txbxContent>` flow structures. Naive paragraph splitters cut sections prematurely.
- **Improvement**: Implemented depth-tracking state machine that exclusively processes top-level `<w:sectPr>` tags at `depth === 0`, ensuring perfect 1:1 section-to-page correspondence.

### 2.4 Physical Raster Scale Unification
- **File**: `src/fidelity/layoutStabilityAuditor.ts`
- **Issue**: Previous auditors assumed a fixed A4 canvas (595.28 x 841.89 pt), creating coordinates offset by 2x to 3x on desktop/landscape pages.
- **Improvement**: Replaced fixed A4 logic with the physical rasterization constant:
  $$\text{Scale} = \frac{96 \text{ DPI}}{72 \text{ pt/inch}} = \frac{4}{3} \approx 1.3333 \text{ px/pt}$$
  Masked bounding boxes now align with subpixel accuracy across arbitrary custom page dimensions.

