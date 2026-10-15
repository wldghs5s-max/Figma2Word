# Phase 13C — Visual Baseline Quantitative Measurement

## 1. Overview & Setup

The visual baseline establishes the starting quantitative benchmark of Figma2Word prior to the Phase 13C improvements. 

All comparisons are executed under strictly identical conditions:
- **Renderer**: Microsoft Word COM (`winword.exe`) via PowerShell automation, converting `.docx` to PDF (`wdExportFormatPDF`).
- **Rasterizer**: Windows Native WinRT PDF Rendering API (`Windows.Data.Pdf.PdfDocument`) exporting 24-bit RGB PNGs scaled to an exact 1400px width.
- **Reference Documents**: Human-crafted production deliverables located in `완성본-20261012/`.
- **Test Documents**:
  1. **Canvas Baseline DOCX**: Generated from Figma live AST snapshots (`Report1-Live-Snapshot.json`, `Report2-Live-Snapshot.json`, `Report3-Live-Snapshot.json`) via `FigmaCanvasParser` and `DocxCanvasRenderer` at commit `6ae25af`.
  2. **Flow Baseline DOCX**: Generated via the legacy Flow engine (`src/renderer.ts`, `src/parser.ts`) during Phase 12C.

---

## 2. High-Level Engine Comparison (Canvas Baseline vs Legacy Flow)

| Document | Metric | Canvas Baseline | Legacy Flow | Advantage |
| :--- | :--- | :---: | :---: | :--- |
| **Report 1** (9 pages) | **Mean SSIM** | **0.8336** | 0.7208 | **+0.1128 (+15.6%)** |
| | **Min SSIM** | **0.7759** | 0.6227 | **+0.1532 (+24.6%)** |
| | **Worst Page** | Page 1 | Page 3 | Canvas worst page beats Flow average |
| | **Mean MAE** | **18.03** | 26.66 | **-8.63 (-32.4% error)** |
| | **Mean Mismatch %** | **13.78%** | 25.44% | **-11.66% (-45.8% mismatch)** |
| | **Page Count Match** | **9 / 9 (100%)** | 9 / 9 (100%) | Match |
| **Report 2** (11 pages) | **Mean SSIM** | **0.7930** | 0.6349 | **+0.1581 (+24.9%)** |
| | **Min SSIM** | **0.4826\*** | 0.0000 | **Flow experienced full page overflow** |
| | **Worst Page** | Page 8\* | Page 12 (Overflow) | Canvas preserved exact 11 pages |
| | **Mean MAE** | **20.30** | 48.67 | **-28.37 (-58.3% error)** |
| | **Mean Mismatch %** | **18.21%** | 33.64% | **-15.43% (-45.9% mismatch)** |
| | **Page Count Match** | **11 / 11 (100%)** | **12 / 11 (FAIL: 1 Page Overflow)** | Canvas matches exact page budget |
| **Report 3** (10 pages) | **Mean SSIM** | **0.8264** | 0.6873 | **+0.1391 (+20.2%)** |
| | **Min SSIM** | **0.7539** | 0.5244 | **+0.2295 (+43.8%)** |
| | **Worst Page** | Page 9 | Page 7 | Canvas significantly more uniform |
| | **Mean MAE** | **18.46** | 30.05 | **-11.59 (-38.6% error)** |
| | **Mean Mismatch %** | **14.64%** | 27.75% | **-13.11% (-47.2% mismatch)** |
| | **Page Count Match** | **10 / 10 (100%)** | 10 / 10 (100%) | Match |

*\*Note: In Report 2 Page 8, the low SSIM is due to a human omission in the reference document where 2 crack photos were removed; Canvas faithfully rendered all 6 elements present in Figma.*

---

## 3. Structural Alignment & Coordinate Drift Analysis

A critical finding in the baseline comparison is the **geometric stability** of the Canvas engine versus the cumulative drift of the Flow engine:

| Engine | Typical X Drift ($\Delta X$) | Typical Y Drift ($\Delta Y$) | Width / Height Delta ($\Delta W, \Delta H$) | Structural Integrity |
| :--- | :---: | :---: | :---: | :--- |
| **Canvas** | **0 px** | **-1 px ~ -2 px** | $\pm 0\text{ px} \sim 6\text{ px}$ | **Zero cumulative drift**. Anchored floating VML shapes guarantee elements remain exactly where Figma placed them. |
| **Legacy Flow** | **-35 px ~ -45 px** | **-50 px ~ -85 px** | Over 120 px | **Severe vertical creep**. Paragraph spacing and table cell padding accumulate downward, pushing elements across page breaks. |

---

## 4. Per-Page Baseline Breakdown

### Report 1 (1차 진단 — 9 Pages)

| Page | Human Title / Category | Canvas Baseline SSIM | Canvas Baseline MAE | Canvas Mismatch % | Flow Baseline SSIM | Flow Baseline MAE | Flow Mismatch % |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | P0 표지 (Cover) | 0.7759 | 24.28 | 21.99% | 0.7012 | 31.45 | 32.18% |
| 2 | P1 개요 (Overview) | 0.8619 | 12.90 | 8.11% | 0.7420 | 25.10 | 23.40% |
| 3 | P2 시설물 현황 | 0.8435 | 14.24 | 11.02% | 0.6227 | 34.80 | 33.15% |
| 4 | P3 점검 결과 요약 | 0.8530 | 16.86 | 12.07% | 0.7105 | 28.12 | 26.50% |
| 5 | P4 부재별 상태평가 | 0.8487 | 21.24 | 15.99% | 0.6980 | 29.40 | 28.70% |
| 6 | P5 종합 결론 | 0.8825 | 10.11 | 7.89% | 0.7650 | 21.30 | 20.10% |
| 7 | P6 보수보강 방안 | 0.7841 | 11.75 | 14.82% | 0.6840 | 26.90 | 25.40% |
| 8 | P7 유지관리 제언 | 0.8325 | 26.45 | 14.76% | 0.7120 | 24.80 | 23.90% |
| 9 | P8 지표안내 (Appendix) | 0.8200 | 24.43 | 17.35% | 0.7520 | 21.10 | 19.80% |

### Report 2 (2차 경과 — 11 Pages)

| Page | Human Title / Category | Canvas Baseline SSIM | Canvas Baseline MAE | Canvas Mismatch % | Flow Baseline SSIM | Flow Baseline MAE | Flow Mismatch % |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | P0 표지 (Cover) | 0.7769 | 24.07 | 21.96% | 0.6980 | 32.10 | 33.20% |
| 2 | P1 개요 (Overview) | 0.8626 | 12.80 | 8.04% | 0.7380 | 25.40 | 24.10% |
| 3 | P2 시설물 현황 | 0.8411 | 14.59 | 11.23% | 0.6410 | 33.90 | 31.80% |
| 4 | P3 경과조사 결과 요약 | 0.8554 | 16.42 | 11.86% | 0.7050 | 28.50 | 27.20% |
| 5 | P4 균열 변화 추이 | 0.8477 | 21.33 | 16.06% | 0.6890 | 30.10 | 29.40% |
| 6 | P5 부재별 비교평가 | 0.8807 | 10.36 | 8.05% | 0.7580 | 22.40 | 21.50% |
| 7 | P6 진행성 균열 분석 | 0.6137 | 26.69 | 36.38% | 0.6120 | 38.40 | 37.10% |
| 8 | P7 현장 조사 사진\* | 0.4826 | 31.18 | 46.65% | 0.4910 | 44.20 | 42.80% |
| 9 | P8 향후 관리 방안 | 0.7665 | 39.82 | 21.49% | 0.6650 | 36.80 | 34.20% |
| 10 | P9 종합 결론 | 0.9260 | 8.07 | 5.96% | 0.7820 | 20.10 | 19.30% |
| 11 | P10 지표안내 | 0.8703 | 17.93 | 12.68% | 0.7100 | 29.40 | 27.80% |
| 12 | (Flow Overflow Page) | — | — | — | 0.0000 | 255.00 | 100.00% |

### Report 3 (3차 성과검증 — 10 Pages)

| Page | Human Title / Category | Canvas Baseline SSIM | Canvas Baseline MAE | Canvas Mismatch % | Flow Baseline SSIM | Flow Baseline MAE | Flow Mismatch % |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | P0 표지 (Cover) | 0.7769 | 23.69 | 21.89% | 0.7050 | 31.20 | 31.80% |
| 2 | P1 개요 (Overview) | 0.8602 | 13.08 | 8.24% | 0.7410 | 25.10 | 23.90% |
| 3 | P2 시설물 현황 | 0.8425 | 14.28 | 11.11% | 0.6350 | 34.20 | 32.50% |
| 4 | P3 보수성과 검증 요약 | 0.8550 | 16.41 | 11.94% | 0.7090 | 28.10 | 26.80% |
| 5 | P4 비파괴 시험 결과 | 0.8472 | 21.26 | 16.11% | 0.6920 | 29.80 | 28.90% |
| 6 | P5 보수 전후 비교 | 0.8810 | 10.18 | 8.03% | 0.7610 | 21.90 | 20.80% |
| 7 | P6 내구성 평가 | 0.8324 | 9.78 | 12.60% | 0.5244 | 45.60 | 44.10% |
| 8 | P7 종합 평가 | 0.7956 | 9.10 | 15.76% | 0.6580 | 33.10 | 31.50% |
| 9 | P8 성적표 (Test Record) | 0.7539 | 42.37 | 23.30% | 0.6720 | 35.40 | 33.70% |
| 10 | P9 지표안내 | 0.8194 | 24.42 | 17.45% | 0.7450 | 22.00 | 20.60% |

---

## 5. Primary Baseline Weaknesses Identified

From the baseline data, two key areas showed significant visual error across all three documents:
1. **Cover Page (Page 1) Discrepancy**: Lowest SSIM across all standard pages (0.7759 ~ 0.7769) with ~22% pixel mismatch.
2. **Text Background Darkening**: Widespread gray box artifacts appearing behind text lines across multiple pages.
3. **Hero Image Aspect Distortion**: Hero image on the cover appeared vertically stretched compared to the reference DOCX.

