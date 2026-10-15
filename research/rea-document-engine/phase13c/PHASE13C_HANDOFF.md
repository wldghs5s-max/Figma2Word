# Phase 13C — Technical Handoff & Phase 14 Roadmap

## 1. Executive Summary & Deliverables

Phase 13C successfully established an objective, mathematically rigorous visual fidelity benchmarking infrastructure and delivered major visual quality enhancements to the Canvas IR conversion engine.

### Deliverables Checklist
- [x] **Word COM + WinRT Batch Rendering Infrastructure**: `research/rea-document-engine/phase13c/scripts/batch_render.ps1`
- [x] **High-Performance C# Image Metrics Engine**: `research/rea-document-engine/phase13c/tools/ImageMetrics.cs`
- [x] **Automated Benchmark Runner**: `research/rea-document-engine/phase13c/scripts/run_benchmarks.ps1`
- [x] **Text Background Artifact Fix**: `src/canvas/parser/figmaCanvasParser.ts`
- [x] **Native Image Aspect-Ratio VML Cropper**: `src/canvas/renderer/docxCanvasRenderer.ts`
- [x] **Visual Fidelity Regression Test Suite**: `tests/canvas-engine.test.ts`
- [x] **Master Benchmark Ledgers**: `metrics_baseline.json`, `metrics_improved.json`
- [x] **Comprehensive Documentation**: `README.md`, `VISUAL_BASELINE.md`, `ROOT_CAUSE_ANALYSIS.md`, `IMPROVEMENT_RESULTS.md`, `PHASE13C_HANDOFF.md`

---

## 2. Quantitative Achievements

### Benchmark Summary Across All 3 Reports

| Metric | Baseline | Improved | Net Impact |
| :--- | :---: | :---: | :---: |
| **Report 1 Mean SSIM** | 0.8336 | **0.8768** | **+0.0432 (+5.2%)** |
| **Report 1 Min SSIM** | 0.7759 | **0.8505** | **+0.0746 (+9.6%)** |
| **Report 1 Mean MAE** | 18.03 | **7.02** | **-11.01 (-61.1% error cut)** |
| **Report 1 Mismatch %** | 13.78% | **6.92%** | **-6.86% (-49.8% mismatch cut)** |
| **Report 2 Mean SSIM** | 0.7930 | **0.8210** | **+0.0280 (+3.5%)** |
| **Report 2 Mean MAE** | 20.30 | **10.17** | **-10.13 (-49.9% error cut)** |
| **Report 3 Mean SSIM** | 0.8264 | **0.8708** | **+0.0444 (+5.4%)** |
| **Report 3 Mean MAE** | 18.46 | **7.07** | **-11.39 (-61.7% error cut)** |
| **Cover Pages Average SSIM** | 0.7766 | **0.8995** | **+0.1230 (+15.8%)** |
| **Cover Pages Average MAE** | 24.01 | **6.53** | **-72.8% error cut** |
| **Page-by-Page Regression Rate** | — | **0 / 30 pages (0%)** | **100% monotonic improvement** |

---

## 3. Key Architecture Decisions & Code Changes

### 1. Stripping Container Fill on Pure Figma Text Nodes
- **File**: `src/canvas/parser/figmaCanvasParser.ts`
- **Rationale**: In Figma, text font color is stored inside `node.fills`. When parsed as general container styles, it caused `docxCanvasRenderer.ts` to output dark solid rectangular background shapes behind text labels.
- **Implementation**: Specifically stripped `fillColor` and `fillOpacity` for elements with `child.type === "TEXT"`, leaving container boxes transparent while retaining typography formatting in `textRuns`.

### 2. VML Image Aspect-Ratio Preservation via Buffer Header Extraction
- **File**: `src/canvas/renderer/docxCanvasRenderer.ts`
- **Rationale**: Figma images often use `scaleMode: "FILL"` (CSS `object-fit: cover`). Placing them inside arbitrary containers in Word without cropping causes severe stretching/squashing.
- **Implementation**: Built lightweight PNG and JPEG dimension parsers directly from image byte buffers, calculated divergence between container and image aspect ratios, and injected fractional VML crop attributes (`croptop`, `cropbottom`, `cropleft`, `cropright`) in `65536f` units.

---

## 4. Operational State & Testing

- **TypeScript Compilation**: Clean pass (`npm run build` / `tsc` exits with code 0).
- **Unit & Regression Testing**: 100% pass across all 48 test suites and 294 tests (`tests/canvas-engine.test.ts` passed with 14 tests).
- **Git State**: Clean working directory ready for local commit. All generated PNG and PDF rendering artifacts are isolated and excluded via `.gitignore`.

---

## 5. Recommended Next Steps for Phase 14

1. **HWPX Cropping Parity**:
   Extend the aspect-ratio crop calculation from `DocxCanvasRenderer` to `HwpxCanvasRenderer` by mapping fractional crops to HWPX `<hp:pic>` clipping attributes (`<hc:clipRect>` / `<hc:imgRect>`).
2. **Table & Card Stroke Refinements**:
   Fine-tune inner table borders, cell padding twips, and stroke colors on complex data grid pages (e.g., Page 5 and Page 7) to push SSIM beyond the 0.900 threshold.
3. **Web UI Pipeline Integration**:
   Add an engine selection toggle (`Flow` vs `Canvas Dual Engine`) in `apps/web/` so users can choose between standard text flow and high-fidelity canvas rendering.
