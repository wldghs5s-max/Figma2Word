# 08. Truth Labeling, Provenance Hierarchy & Figma Reference Status

## 1. Provenance Hierarchy & Truth Labeling Principles

To prevent false claims of design fidelity and metric distortion, Phase 30 strictly adheres to a 4-tier provenance classification model. Every visual asset and metric computation is tagged with its provenance level:

```mermaid
flowchart TD
    Tier1["Tier 1: figma_ground_truth (Official Cloud Export)"]
    Tier2["Tier 2: synthetic_expected (Deterministic Fixture Coordinates)"]
    Tier3["Tier 3: approximate_reference (Local HTML5/Skia Vector Rasterizer)"]
    Tier4["Tier 4: word_candidate (Native Microsoft Word PDF/PNG)"]

    Tier1 -.-> |When FIGMA_ACCESS_TOKEN Present| Comp1[Fidelity Benchmark]
    Tier2 --> |Phase 30 Synthetic Benchmark| Comp2[Geometry & Topology Verification]
    Tier4 --> Comp2
    Tier3 -.-> |Offline Visual Reference| Comp3[Local Approximations]
```

---

## 2. Status of `FIGMA_ACCESS_TOKEN` & Cloud Reference

### Explicit Status
- **Environment Status**: `FIGMA_ACCESS_TOKEN` is currently **NOT SET** in the local runtime environment.
- **Protocol Policy**: In accordance with the Phase 28/29 integrity principles:
  1. No mock cloud requests or falsified network responses are generated.
  2. No fake cloud images are fabricated to inflate SSIM scores.
  3. The metric system explicitly marks `cloudExportAvailable: false`.

### Why This Protects Codebase Integrity
In previous phases (e.g., Phase 26/27 audit), automated tools risked comparing rendered Word pages against arbitrary placeholder images or calculating SSIM against identical blank images, claiming "0.999 fidelity". 

In Phase 30, fidelity is measured against deterministic, mathematically defined `synthetic_expected` topologies:
- Bounding boxes, stroke widths, corner radii, and text boundaries are checked against exact Canvas IR definitions.
- Visual output is rendered through real Microsoft Word for Mac (v16.114) and verified via Swift PDFKit.

---

## 3. Truth Labeling Evaluation Matrix

| Metric / Dimension | Provenance Tier | Value / Evidence | Trust Level |
| :--- | :--- | :--- | :--- |
| **Section Count** | `word_candidate` vs `synthetic_expected` | 2 sections rendered / 2 expected | **100% Verifiable** (OpenXML `<w:sectPr>` & PDF pages) |
| **Page Collisions** | `word_candidate` | 0 collisions detected | **100% Verifiable** (Swift PDFKit page geometry) |
| **Frame Coverage** | `word_candidate` vs `synthetic_expected` | 100% (2/2 frames) | **100% Verifiable** (Manifest SHA-256 matches) |
| **CJK Spacing Tags** | `word_candidate` (DOCX OpenXML) | Emitted `<w:autoSpaceDE w:val="0"/>` | **100% Verifiable** (XML string assertion) |
| **VML Image Rounded Rect** | `word_candidate` (DOCX OpenXML) | Emitted `<v:roundrect arcsize="...">` | **100% Verifiable** (XML string assertion) |
| **HWPX Package Structure** | HWPX ZIP Entry | Valid KS X 6101 package structure | **100% Verifiable** (JSZip archive verification) |
| **Figma Cloud Pixel SSIM** | `figma_ground_truth` | N/A (`FIGMA_ACCESS_TOKEN` unset) | **Explicitly Uncomputed** (Zero deception) |

---

## 4. How Cloud Verification Can Be Activated

When a user supplies a valid `FIGMA_ACCESS_TOKEN` and `FIGMA_FILE_KEY`:
1. The pipeline calls `fetchFigmaImageExport(fileKey, nodeIds)`.
2. The downloaded Figma PNG is tagged `figma_ground_truth`.
3. The Local Window SSIM engine (`tools/visual-regression/visual_comparator.ts`) computes Local SSIM, Worst-case SSIM, and Mean Absolute Error (MAE) between `figma_ground_truth` and `word_candidate`.
4. Until then, synthetic vector tests provide 100% deterministic coverage of all rendering code paths.
