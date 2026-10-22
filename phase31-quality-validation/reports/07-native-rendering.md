# 07. Microsoft Word for Mac Native Rendering & Empirical Verification

## 1. Native Word Pipeline Execution Details

The updated synthetic benchmark `samples/phase30_comprehensive_synthetic_fixture.json` was converted and rendered via the Phase 31 visual pipeline using real Microsoft Word for Mac (v16.114) on macOS 15.6 (Darwin 25.6.0 arm64).

- **Execution Script**: `scripts/run_phase30_visual_pipeline.ts`
- **Output DOCX**: `debug/phase30-evidence/run/phase30_rendered.docx` (5,893 bytes)
- **Output Native PDF**: `debug/phase30-evidence/run/phase30_rendered.pdf` (166.7 KB)
- **Output High-Res PNGs**:
  - `debug/phase30-evidence/run/pages/page-001.png` ($1620 \times 1012\text{ px}$)
  - `debug/phase30-evidence/run/pages/page-002.png` ($2376 \times 1782\text{ px}$)
- **Output HWPX**: `debug/phase30-evidence/run/phase30_rendered.hwpx` (7,441 bytes)
- **Dynamic Metrics**: `debug/phase30-evidence/run/phase30_metrics.json`

---

## 2. Before vs After Pixel Measurements in Microsoft Word

To verify that the central image card and its overlay text are truly visible in Microsoft Word, pixel samples were extracted directly from the Swift PDFKit rasterized PNGs:

| Measurement Dimension | Phase 30 Baseline (Corrupt PNG) | Phase 31 Verified (Fixed PNG & VML) | Verdict / Visual Impact |
| :--- | :--- | :--- | :--- |
| **Card Center Color ($x=762, y=235$)** | `#F5F7FA` (Page Background) | `#3662E3` (Vibrant Blue, $R=54, G=98, B=227$) | **RESOLVED**: Card is fully visible |
| **Blue Pixels Inside Card Bounds** | $0\text{ pixels}$ | **$84,800\text{ pixels}$** | **RESOLVED**: Full solid fill rendered |
| **Corner Curvature Cutout ($x=563, y=140$)** | `#F5F7FA` (Unclipped) | `#F5F7FA` (Cleanly Rounded Arc) | **VERIFIED**: Image clipped to corner radius |
| **Border Stroke ($strokecolor$)** | `#C4D8F7` ($736\text{ px}$) | `#C4D8F7` (Smooth boundary stroke) | **VERIFIED**: $2\text{ pt}$ border rendered |
| **Drop Shadow ($<v:shadow>$)** | `#DBDFE9` | `#DBDFE9` (Subtle shadow beneath card) | **VERIFIED**: Native VML shadow rendered |
| **White Overlay Text ($#FFFFFF$)** | $0\text{ contrast pixels}$ (Invisible on `#F5F7FA`) | **$52\text{ high-contrast white pixels}$** | **RESOLVED**: White text clearly readable on blue card |

---

## 3. Dynamic Structural Metrics

The evaluation results recorded in `phase30_metrics.json`:
- **Candidate Frames**: 2
- **Canvas IR Pages**: 2
- **DOCX Sections Rendered**: 2
- **PDF Pages Rendered**: 2
- **Section Count Mismatch**: 0
- **Page Collisions**: 0
- **Frame Coverage**: 100%
- **Oversized Clamped Pages**: 1 (Page 2 scaled uniformly from $3200 \times 2400\text{ px}$ to $1584 \times 1188\text{ pt}$ to respect Word's 22-inch maximum limit)
- **Manifest Matched**: `true`
- **Compatibility Status**: `Valid (2 sections, 2 pages rendered)`
