# Phase 13C — Visual Fidelity Benchmarking & Canvas Renderer Concentrated Improvements

## 1. Executive Summary

Phase 13C establishes an automated, mathematically rigorous visual fidelity benchmarking pipeline for Figma2Word, comparing generated documents against human-crafted reference DOCX files (`완성본-20261012/`) in an identical Microsoft Word COM + Windows WinRT PDF-to-PNG rendering environment at 1400px width.

Using this quantitative infrastructure, Phase 13C identified root causes for the largest visual discrepancies, implemented structural improvements in the Canvas parser and DOCX renderer, and achieved **statistically verified visual fidelity gains across 100% of pages in all three customer reports with zero regression**.

---

## 2. Infrastructure Architecture

The Phase 13C benchmarking pipeline consists of three core layers:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Word COM & WinRT High-Res Batch Rendering Engine        │
│    (research/rea-document-engine/phase13c/scripts/batch_render.ps1) │
│    - Headless Word.Application COM automation                │
│    - DOCX -> PDF (WdExportFormat.wdExportFormatPDF)          │
│    - Windows.Data.Pdf (WinRT) -> 1400px Native PNG           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. High-Performance C# Image Metrics Engine                │
│    (research/rea-document-engine/phase13c/tools/ImageMetrics.cs)   │
│    - Wang et al. 8x8 Block SSIM (C1=6.5025, C2=58.5225)      │
│    - MAE (Mean Absolute Error, 0-255 & normalized 0-1)       │
│    - RMSE (Root Mean Squared Error)                          │
│    - Pixel Mismatch Ratio (Tolerance = 10 RGB levels)        │
│    - Content Bounding Box Tracking & Drift (dX, dY, dW, dH)  │
│    - Diff Maps (Magenta highlight) & 50/50 Alpha Overlays    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Automated Benchmark Runner & Comparative Analysis       │
│    (research/rea-document-engine/phase13c/scripts/run_benchmarks.ps1)│
│    - Compares Canvas vs Ref and Flow vs Ref across Reports 1-3│
│    - Produces JSON audit ledgers and visual diff artifacts   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Key Quantitative Results

### Summary Comparison (Human Ref DOCX vs Generated DOCX)

| Benchmark Target | Mean SSIM | Min SSIM | Worst Page | Mean MAE | Mean Mismatch % | Page Count Match |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Report 1 (Canvas Improved)** | **0.8768** | **0.8505** | Page 9 | **7.02** | **6.92%** | **9 / 9 (100%)** |
| Report 1 (Canvas Baseline) | 0.8336 | 0.7759 | Page 1 | 18.03 | 13.78% | 9 / 9 (100%) |
| Report 1 (Legacy Flow) | 0.7208 | 0.6227 | Page 3 | 26.66 | 25.44% | 9 / 9 (100%) |
| **Report 2 (Canvas Improved)** | **0.8210** | **0.4899\*** | Page 8\* | **10.17** | **12.63%** | **11 / 11 (100%)** |
| Report 2 (Canvas Baseline) | 0.7930 | 0.4826\* | Page 8\* | 20.30 | 18.21% | 11 / 11 (100%) |
| Report 2 (Legacy Flow) | 0.6349 | 0.0000 | Page 12 | 48.67 | 33.64% | **12 / 11 (Page Overflow!)** |
| **Report 3 (Canvas Improved)** | **0.8708** | **0.7976** | Page 9 | **7.07** | **7.42%** | **10 / 10 (100%)** |
| Report 3 (Canvas Baseline) | 0.8264 | 0.7539 | Page 9 | 18.46 | 14.64% | 10 / 10 (100%) |
| Report 3 (Legacy Flow) | 0.6873 | 0.5244 | Page 7 | 30.05 | 27.75% | 10 / 10 (100%) |

*\*Note on Report 2 Page 8: In the Figma AST snapshot (`Report2-Live-Snapshot.json`), frame `7:3115` contains 6 crack photos. In the human reference document (`완성본-20261012/2차/`), the designer intentionally omitted rows 3 (photos 5 & 6). Canvas faithfully rendered all 6 elements from the Figma design.*

---

## 4. Directory Structure

```
research/rea-document-engine/phase13c/
├── README.md                      # This overview document
├── VISUAL_BASELINE.md             # Initial quantitative baseline metrics (Canvas vs Flow vs Ref)
├── ROOT_CAUSE_ANALYSIS.md         # In-depth analysis of visual defects & root cause investigation
├── IMPROVEMENT_RESULTS.md         # Before/after metric comparison & verification
├── PHASE13C_HANDOFF.md            # Technical handoff & recommendations for Phase 14
├── metrics_baseline.json          # Master baseline JSON metrics
├── metrics_improved.json          # Master improved JSON metrics
├── tools/
│   ├── ImageMetrics.cs            # High-performance C# image measurement library
│   └── CompareRunner.ps1          # Per-document PowerShell comparison runner
└── scripts/
    ├── batch_render.ps1           # MS Word COM + WinRT PDF->PNG rendering script
    ├── run_benchmarks.ps1         # Full benchmark automation script
    ├── regenerate_canvas_docx.ts  # Canvas DOCX generator from Figma snapshots
    └── compare_summary.py         # Summary delta reporting script
```

---

## 5. How to Run the Benchmarks

### 1. Batch Render All DOCX Documents to PNG
```powershell
powershell -ExecutionPolicy Bypass -NoProfile -File research/rea-document-engine/phase13c/scripts/batch_render.ps1 -TargetGroup "all"
```
Options for `-TargetGroup`: `all`, `ref`, `canvas`, `flow`.

### 2. Run Quantitative Measurement
```powershell
powershell -ExecutionPolicy Bypass -NoProfile -File research/rea-document-engine/phase13c/scripts/run_benchmarks.ps1 -Target "improved"
```

### 3. Print Summary Improvement Delta Table
```powershell
python research/rea-document-engine/phase13c/scripts/compare_summary.py
```
