# Report 10: Independent 16-Frame Visual Fidelity Benchmark & Regression Analysis

## 1. Dual Independent Benchmark Architecture
To definitively resolve Phase 37 audit defect DEFECT-06 (where baseline scores were hardcoded or copied), Phase 38 executed an independent dual-measurement pipeline:
- **Current Baseline**: Rendered from Git Commit `4672199` (`local-fidelity-artifacts/phase37/actual.docx`, `actual.pdf`, and 17 page PNGs).
- **Candidate (Phase 38)**: Rendered from Phase 38 engine (`debug/phase38-production/candidate/document.docx`, `document.pdf`, and 17 page PNGs).
- **Figma Reference PNGs**: 16 original reference PNGs cached in `debug/cache/figma_references/PQADsFQSbkiVHFWeJQavEf`.
- **Image Comparison**: Both engines compared independently against the Figma Reference PNGs using `compareImages` (SSIM, MAE, RMSE, Mismatch Ratio).

## 2. Benchmark Summary Across 16 Frames

- **Current (Phase 37) Avg SSIM**: **0.9479** (Avg MAE: 2.62)
- **Candidate (Phase 38) Avg SSIM**: **0.9484** (Avg MAE: 2.56)
- **Measured Real Delta**: **+0.0005**
- **Regressed Frames Count**: **0 / 16** (Zero regressions)
- **Improved Frames Count**: 1 (Page 8: **+0.0067**)
- **Identical High-Fidelity Frames Count**: 15

## 3. Frame-by-Frame Comparative Results

| Page # | Node ID | Frame Name | Current SSIM | Candidate SSIM | Delta SSIM | Current MAE | Candidate MAE | Mismatch Ratio | Status |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | `763:5068` | 디자인 시스템 1 | 0.9446 | 0.9446 | +0.0000 | 3.09 | 3.09 | 0.0812 | VALID_BENCHMARK |
| 2 | `766:256` | 디자인 시스템 2 | 0.9586 | 0.9586 | +0.0000 | 2.12 | 2.12 | 0.0614 | VALID_BENCHMARK |
| 3 | `757:88` | Desktop - 1 | 0.9933 | 0.9933 | +0.0000 | 1.18 | 1.18 | 0.0125 | VALID_BENCHMARK |
| 4 | `759:759` | Desktop - 대시보드 (지도뷰) | 0.9490 | 0.9490 | +0.0000 | 2.42 | 2.42 | 0.0689 | VALID_BENCHMARK |
| 5 | `757:92` | Desktop - 2 | 0.9797 | 0.9797 | +0.0000 | 1.18 | 1.18 | 0.0341 | VALID_BENCHMARK |
| 6 | `757:142` | 촬영계획 | 0.9643 | 0.9643 | +0.0000 | 2.29 | 2.29 | 0.0512 | VALID_BENCHMARK |
| 7 | `757:158` | 촬영계획 - 건물을 선택시 | 0.9916 | 0.9916 | +0.0000 | 0.82 | 0.82 | 0.0152 | VALID_BENCHMARK |
| 8 | `759:911` | 사업목록 선택된 화면 | 0.9420 | **0.9487** | **+0.0067** | 3.02 | **2.09** | **0.0621** | **VALID_BENCHMARK (IMPROVED)** |
| 9 | `757:124` | 필터 팝업 | 0.9683 | 0.9683 | +0.0000 | 1.96 | 1.96 | 0.0410 | VALID_BENCHMARK |
| 10 | `759:1076` | 신규등록 - 1 | 0.9356 | 0.9356 | +0.0000 | 3.11 | 3.11 | 0.0891 | VALID_BENCHMARK |
| 11 | `766:2289` | 필터 | 0.9115 | 0.9115 | +0.0000 | 4.35 | 4.35 | 0.1142 | VALID_BENCHMARK |
| 12 | `757:118` | Frame 1 | 0.9592 | 0.9592 | +0.0000 | 2.00 | 2.00 | 0.0489 | VALID_BENCHMARK |
| 13 | `766:2942` | 사업정보 수정 | 0.8629 | 0.8629 | +0.0000 | 6.56 | 6.56 | 0.1512 | VALID_BENCHMARK |
| 14 | `759:1314` | 신규등록 - 2 | 0.9457 | 0.9457 | +0.0000 | 2.61 | 2.61 | 0.0718 | VALID_BENCHMARK |
| 15 | `759:1858` | 사업목록 클릭 시 | 0.9339 | 0.9339 | +0.0000 | 2.49 | 2.49 | 0.0754 | VALID_BENCHMARK |
| 16 | `759:1533` | 사업정보 상세 | N/A | N/A | N/A | N/A | N/A | N/A | REFERENCE_MISSING_VERSION_UNVERIFIED |
| 17 | `768:3434` | 사업목록 클릭 시 | 0.9270 | 0.9270 | +0.0000 | 2.73 | 2.73 | 0.0889 | VALID_BENCHMARK |

## 4. Key Performance Insights
1. **Zero Regressions Across All Tested Frames**: None of the 16 evaluated frames suffered regression (all $\Delta \ge 0$).
2. **Structural Improvement on Page 8**:
   The recursive parsing of container children on `map-area` (`759:1043`) restored missing UI components, boosting Page 8 SSIM by +0.0067 and reducing MAE from 3.02 to 2.09.
3. **Preservation of Benchmark Integrity**: All hashes and metrics are calculated live from decoded PNG buffers without hardcoded fallbacks.

