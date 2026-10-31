# Phase 37 — Report 01: Phase 36 Audit Defect Resolutions

## Executive Summary

During the Phase 36 independent audit, four residual defects were identified across editability scoring, media relationship tracking, baseline provenance, and affine image transformations. Phase 37 resolves all four defects deterministically with verifiable mathematical formulations, automated lineage verification, and strict regression test suites.

---

## 1. Defect B-01: Editability Scoring Overhaul

### Problem Statement
In Phase 36, `src/fidelity/editabilityAuditor.ts` contained an oversimplified heuristic: if `mediaReferencesCount === 0 && textNodeCount > 0`, the page received an arbitrary score of `100/100`. This masked pages that lacked vector shapes or had low source preservation fidelity.

### Architectural Solution
The auditor was completely overhauled in [`src/fidelity/editabilityAuditor.ts`](file:///c:/Users/77/Documents/Figma2Word/src/fidelity/editabilityAuditor.ts) to compute independent preservation and editability dimensions:
1. **Source Preservation Coverage**: Text Preservation Rate ($C_{text} = \min(1.0, N_{docx\_text} / N_{src\_text})$) and Shape Preservation Rate ($C_{shape} = \min(1.0, N_{docx\_shape} / N_{src\_shape})$).
2. **Native Element Ratio**: $R_{native} = \frac{N_{text} + N_{shape}}{N_{text} + N_{shape} + N_{image}}$.
3. **Penalization for Cheating**: Full-page cover cheats (single raster image covering $>90\%$ of page area) immediately set the editability score to 0 and classify the page as `STATIC_IMAGE_COVER_CHEAT`.
4. **Weighted Scoring Formula**:
   $$\text{Score} = \text{round}\left( 40 \cdot C_{text} + 30 \cdot C_{shape} + 20 \cdot R_{native} + 10 \cdot \text{IntegrityBonus} \right)$$
   For hybrid pages containing valid native elements and embedded icons/media, the score accurately reflects both native editable capability and source fidelity.

---

## 2. Defect B-02: OpenXML Media Relationship Tracking & Reconciliation

### Problem Statement
In Phase 36, an audit observed 19 image usages in the document but only 11/12 image files in `word/media/`, creating an apparent discrepancy that was flagged as unverified.

### Architectural Solution
We implemented [`src/fidelity/mediaRelationshipAuditor.ts`](file:///c:/Users/77/Documents/Figma2Word/src/fidelity/mediaRelationshipAuditor.ts) to parse:
1. `word/_rels/document.xml.rels` to map Relationship IDs (`rIdX`) to target media parts in `word/media/`.
2. `word/document.xml` searching both VML (`<v:imagedata r:id="...">` and `<v:imagedata o:relid="...">`) and DrawingML (`<a:blip r:embed="...">` and `<a:blip r:link="...">`).
3. Reconciled that 11 distinct media files in `word/media/` are mapped to 11 OpenXML relationships. Because certain icons (e.g., search icons, chevron arrows, logo tiles) are reused across sections, there are 19 total element references (8 duplicate usages).
4. Verified: **0 broken relationships** and **0 unreferenced media files**.

---

## 3. Defect B-03: Automated Baseline Git Lineage Verification

### Problem Statement
Baseline metrics and code provenance were previously checked via manual assertion rather than programmatic Git object interrogation.

### Architectural Solution
We created [`src/fidelity/gitOriginVerifier.ts`](file:///c:/Users/77/Documents/Figma2Word/src/fidelity/gitOriginVerifier.ts) which:
1. Executes `git show <commit>:<filepath>` to extract the exact blob from the Git object database at the target baseline commit (`aca7bd9`).
2. Normalizes line endings (`\r\n` to `\n`) to prevent Windows/Linux checkout false positives.
3. Computes SHA-256 on both the Git blob and the local file.
4. Fails closed with non-zero exit code if any tampering, drift, or mismatch is detected.

---

## 4. Defect B-04: 2D Affine ImageTransform Generalization & Tolerance Tests

### Problem Statement
Image fills in Figma can carry arbitrary 2D affine transformation matrices (`[[a, c, tx], [b, d, ty]]`). Without rigorous categorization, complex shears, reflections, and non-uniform rotations could cause clipping or distortion.

### Architectural Solution
We engineered [`src/fidelity/affineTransformEngine.ts`](file:///c:/Users/77/Documents/Figma2Word/src/fidelity/affineTransformEngine.ts):
1. **Mathematical Decomposition**: Computes determinant $\det(M) = ad - bc$, scale factors $s_x = \sqrt{a^2 + b^2}$, $s_y = \sqrt{c^2 + d^2}$, and shear factor.
2. **Matrix Categorization**:
   - `AXIS_ALIGNED` ($|b| < 10^{-5}, |c| < 10^{-5}$)
   - `ROTATED` ($\det(M) > 0, |s_x - s_y| < 10^{-4}$)
   - `REFLECTED` ($\det(M) < 0$)
   - `SHEARED` (non-orthogonal axes)
   - `SINGULAR` ($|\det(M)| < 10^{-7}$)
   - `INVALID_NUMERIC` (NaN / Inf / out of bounds)
3. **Clamped Crop Coordinates**: Inverts the affine transform to derive normalized texture coordinates $(u_{min}, v_{min}, u_{max}, v_{max})$, clamped to $[0.0, 1.0]$ with float32 rounding tolerances ($10^{-5}$).
4. **Test Suite**: Verified across 12 exhaustive unit tests in [`tests/phase37-image-transform.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/phase37-image-transform.test.ts) (12/12 passed).

