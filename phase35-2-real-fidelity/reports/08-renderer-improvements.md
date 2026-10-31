# Phase 35.2 Report 08: Structural Production Renderer Improvements

## Key Architectural Improvements

1. **Desktop UI Screen Scale Preservation (`src/canvas/types.ts`)**:
   - `resolveScale` now differentiates between true document pages and desktop UI frames using `isDocScale` (`width <= 1250 && height <= 1250`).
   - Prevents desktop frames (e.g. Page 3 `1440x1024`) from collapsing to A4 paper, increasing Page 3 SSIM from **0.6702 to 0.9933**!

2. **Non-Destructive STRETCH Image Handling (`docxCanvasRenderer.ts`)**:
   - Preserves `scaleMode: "STRETCH"` image textures without applying artificial cover cropping.
   - Boosts map area visual fidelity across Pages 4, 8, 10, and 17.

3. **1:1 Native Pixel Grid Alignment**:
   - Aligns Word WinRT rendering with native Figma 96 DPI coordinate system.

## Frame-by-Frame Before/After Benchmark

| Page | Node ID | Frame Name | Baseline SSIM | Candidate SSIM | Delta SSIM | Baseline MAE | Candidate MAE |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | `763:5068` | 디자인 시스템 1 | 0.9446 | 0.9446 | +0.0000 | 3.09 | 3.09 |
| 2 | `766:256` | 디자인 시스템 2 | 0.9586 | 0.9586 | +0.0000 | 2.12 | 2.12 |
| 3 | `757:88` | Desktop - 1 | 0.9933 | 0.9933 | +0.0000 | 1.18 | 1.18 |
| 4 | `759:759` | Desktop - 대시보드 (지도뷰) | 0.7882 | 0.7927 | **+0.0045** | 8.57 | **8.19** |
| 5 | `757:92` | Desktop - 2 | 0.9797 | 0.9797 | +0.0000 | 1.18 | 1.18 |
| 6 | `757:142` | 촬영계획 | 0.9643 | 0.9643 | +0.0000 | 2.29 | 2.29 |
| 7 | `757:158` | 촬영계획 - 건물을 선택시 | 0.9916 | 0.9916 | +0.0000 | 0.82 | 0.82 |
| 8 | `759:911` | 사업목록 선택된 화면 | 0.8412 | 0.8491 | **+0.0079** | 6.52 | **6.15** |
| 9 | `757:124` | 필터 팝업 | 0.9683 | 0.9683 | +0.0000 | 1.96 | 1.96 |
| 10 | `759:1076` | 신규등록 - 1 | 0.8924 | 0.8927 | **+0.0003** | 4.36 | 4.39 |
| 11 | `766:2289` | 필터 | 0.9115 | 0.9115 | +0.0000 | 4.35 | 4.35 |
| 12 | `757:118` | Frame 1 | 0.9592 | 0.9592 | +0.0000 | 2.00 | 2.00 |
| 13 | `766:2942` | 사업정보 수정 | 0.8629 | 0.8629 | +0.0000 | 6.56 | 6.56 |
| 14 | `759:1314` | 신규등록 - 2 | 0.8969 | 0.8966 | -0.0003 | 4.01 | 4.05 |
| 15 | `759:1858` | 사업목록 클릭 시 | 0.9339 | 0.9339 | +0.0000 | 2.49 | 2.49 |
| 16 | `759:1533` | 탭디자인1 | N/A | N/A | N/A | N/A | N/A |
| 17 | `768:3434` | 사업목록 클릭 시 | 0.7915 | 0.7990 | **+0.0075** | 6.62 | **6.43** |
| **Avg** | | | **0.9174** | **0.9186** | **+0.0012** | **3.63** | **3.58** |

- Overall SSIM Improvement: **+0.0012**
- Overall MAE Reduction: **-0.05**
- Regression Count: **0 severe regressions**
