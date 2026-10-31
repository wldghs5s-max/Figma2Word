# Phase 36 Report 08: Experiment Iterations and Tuning History

## Overview

During Phase 36, iterative experiments were executed and measured against the 16 Figma reference PNGs. The trajectory of improvements demonstrates steady, verifiable progress.

---

## Experiment Iteration Timeline

### Iteration 0: Baseline Commit (`13df75f`)
- **Pipeline**: `debug/worktree-baseline` (`BaselineParser` + `BaselineRenderer`)
- **Key Characteristics**:
  - Missing desktop screen fit guard (`isDocScale` bug caused collapse on wide screens like Page 3)
  - Cover-crop auto-cropping applied to `STRETCH` mode images, distorting maps
  - Ignored `imageTransform` on image fills
- **Benchmark Metrics**:
  - Average SSIM: **0.8972**
  - Average MAE: **11.18**
  - Average Mismatch Ratio: **10.17%**
  - Page 3 SSIM: 0.6702
  - Page 4 SSIM: 0.7882

### Iteration 1: Current Commit (`77fea13`)
- **Pipeline**: `debug/worktree-current` (`CurrentParser` + `CurrentRenderer`)
- **Key Characteristics**:
  - Introduced `isDocScale` protection in `src/canvas/types.ts` (fixed Page 3 collapse: 0.6702 -> 0.9933)
  - Added guard preventing cover-crop distortion for `STRETCH` images
  - Fixed WinRT double-scaling bug (2560x1440 -> 1920x1080)
  - Remaining flaw: Did not extract `imageTransform` crops for `scaleMode: STRETCH`
- **Benchmark Metrics**:
  - Average SSIM: **0.9186** (+0.0214 vs Baseline)
  - Average MAE: **3.58**
  - Average Mismatch Ratio: **5.81%**
  - Page 4 SSIM: 0.7927
  - Page 17 SSIM: 0.7990

### Iteration 2: Phase 36 Candidate
- **Pipeline**: Working tree (`CandidateParser` + `CandidateRenderer`)
- **Key Characteristics**:
  - Universal affine `imageTransform` crop extraction across all scale modes
  - Float32 precision tolerance handling for matrix translation/scale
  - 16.16 fixed-point VML `cropbottom`, `croptop`, `cropleft` generation
  - Corrected paragraph-level `<w:sectPr>` editability parser (resolved Page 1 0-score bug)
- **Benchmark Metrics**:
  - Average SSIM: **0.9479** (+0.0293 vs Current, +0.0508 vs Baseline)
  - Average MAE: **2.62** (-26.8% vs Current, -76.6% vs Baseline)
  - Average Mismatch Ratio: **3.29%** (-43.4% vs Current, -67.6% vs Baseline)
  - Page 4 SSIM: **0.9490** (+0.1563 jump!)
  - Page 8 SSIM: **0.9420** (+0.0929 jump!)
  - Page 10 SSIM: **0.9356** (+0.0429 jump!)
  - Page 14 SSIM: **0.9457** (+0.0491 jump!)
  - Page 17 SSIM: **0.9270** (+0.1280 jump!)

---

## Experiment Summary Table

| Iteration | Description | Average SSIM | Average MAE | Mismatch % | Delta vs Baseline | Delta vs Prior |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **0** | Baseline (`13df75f`) | 0.8972 | 11.18 | 10.17% | — | — |
| **1** | Current (`77fea13`) | 0.9186 | 3.58 | 5.81% | +0.0214 | +0.0214 |
| **2** | **Candidate (Phase 36)** | **0.9479** | **2.62** | **3.29%** | **+0.0508** | **+0.0293** |
