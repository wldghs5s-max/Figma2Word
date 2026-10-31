# Report 08: Universal Affine Transform Hardening & Rotation Crop Decoupling

## 1. Defect Analysis: Destructive Axis-Aligned Crop on Rotated Matrices
In Figma image fills, transformations are specified as a 2x3 affine matrix:
$$\begin{bmatrix} m_{00} & m_{01} & t_x \\ m_{10} & m_{11} & t_y \end{bmatrix}$$

In Phase 37, `src/fidelity/affineTransformEngine.ts` categorized matrices into `AXIS_ALIGNED`, `ROTATED`, `REFLECTED`, `SHEARED`, `SINGULAR`, and `INVALID_NUMERIC`. However, regardless of the classification, the engine unconditionally applied the axis-aligned crop formula:
$$\text{crop}_{\text{left}} = t_x, \quad \text{crop}_{\text{right}} = 1 - (t_x + m_{00})$$
$$\text{crop}_{\text{top}} = t_y, \quad \text{crop}_{\text{bottom}} = 1 - (t_y + m_{11})$$

When an image was rotated by 90° ($\theta = \pi/2$):
$$m_{00} = \cos(\pi/2) = 0, \quad m_{01} = -\sin(\pi/2) = -1$$
Here, $m_{00} \approx 0$, which caused $\text{crop}_{\text{right}} = 1 - (t_x + 0) \approx 1 - t_x$, clipping almost 100% of the visible texture area!

## 2. Hardened Architecture & Separation of Concerns
Phase 38 refactored `analyzeFigmaImageTransform` with the following invariants:
1. **Axis-Aligned Crop Decoupling**: Crop parameters are strictly computed if and only if `!isRotated && !isSheared`.
2. **Rotation Preservation**: Rotated matrices extract rotation angle ($\theta = \text{atan2}(m_{10}, m_{00})$ in degrees) and emit `rotationDegrees` without destructive clipping.
3. **Shear Isolation**: Sheared matrices are flagged with `isSheared: true` and excluded from invalid axis-aligned bounding boxes.
4. **Reflection Tracking**: Negative scale components along either axis are classified as `REFLECTED`.
5. **Singular & Degenerate Protection**: Matrices with zero or near-zero determinants ($|\det| < 10^{-6}$) or NaN/Infinity values are safely rejected with fail-closed errors.

## 3. Test Coverage Matrix (`tests/phase38-affine-transform.test.ts`)

| # | Test Scenario | Matrix Input | Expected Classification | Expected Output | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| 1 | Identity Matrix | `[[1, 0, 0], [0, 1, 0]]` | `AXIS_ALIGNED` | Crop: all 0, Rotation: 0° | **PASS** |
| 2 | Pure Translation | `[[1, 0, 0.1], [0, 1, 0.2]]` | `AXIS_ALIGNED` | Crop: left=0.1, top=0.2 | **PASS** |
| 3 | Uniform Scale | `[[0.5, 0, 0.25], [0, 0.5, 0.25]]` | `AXIS_ALIGNED` | Crop: all 0.25 | **PASS** |
| 4 | 90° Clockwise Rotation | `[[0, -1, 1], [1, 0, 0]]` | `ROTATED` | Rotation: 90°, Crop: undefined | **PASS** |
| 5 | 45° Arbitrary Rotation | `[[cos45, -sin45, 0], [sin45, cos45, 0]]` | `ROTATED` | Rotation: 45°, Crop: undefined | **PASS** |
| 6 | Horizontal Reflection | `[[-1, 0, 1], [0, 1, 0]]` | `REFLECTED` | Reflection detected, Crop: safe | **PASS** |
| 7 | Shear Matrix | `[[1, 0.5, 0], [0, 1, 0]]` | `SHEARED` | Shear detected, Crop: undefined | **PASS** |
| 8 | Singular & NaN Matrices | `[[0, 0, 0], [0, 0, 0]]`, NaNs | `SINGULAR` / `INVALID` | Safely handled without crash | **PASS** |

All 8 regression tests passed with zero failures.

