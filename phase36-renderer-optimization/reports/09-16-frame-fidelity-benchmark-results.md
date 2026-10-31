# Phase 36 Report 09: 16-Frame Fidelity Benchmark Results

## Comprehensive Comparison Matrix

The following table presents the authentic, reproducible measurements across all 17 frames (16 valid comparison frames + 1 unverified reference frame):

| Page | Node ID | Frame Name | Baseline SSIM | Current SSIM | Candidate SSIM | Delta vs Current | Delta vs Baseline | Candidate MAE | Candidate Mismatch |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | `763:5068` | 디자인 시스템 1 | 0.9446 | 0.9446 | **0.9446** | +0.0000 | +0.0000 | 3.09 | 2.38% |
| **2** | `766:256` | 디자인 시스템 2 | 0.9586 | 0.9586 | **0.9586** | +0.0000 | +0.0000 | 2.12 | 1.79% |
| **3** | `757:88` | Desktop - 1 | 0.6702 | 0.9933 | **0.9933** | +0.0000 | +0.3231 | 1.18 | 2.04% |
| **4** | `759:759` | Desktop - 대시보드 (지도뷰) | 0.7882 | 0.7927 | **0.9490** | **+0.1563** | **+0.1608** | **2.42** | **3.85%** |
| **5** | `757:92` | Desktop - 2 | 0.9797 | 0.9797 | **0.9797** | +0.0000 | +0.0000 | 1.18 | 2.50% |
| **6** | `757:142` | 촬영계획 | 0.9643 | 0.9643 | **0.9643** | +0.0000 | +0.0000 | 2.29 | 3.85% |
| **7** | `757:158` | 촬영계획 - 건물을 선택시 | 0.9916 | 0.9916 | **0.9916** | +0.0000 | +0.0000 | 0.82 | 1.66% |
| **8** | `759:911` | 사업목록 선택된 화면 | 0.8412 | 0.8491 | **0.9420** | **+0.0929** | **+0.1008** | **3.02** | **4.21%** |
| **9** | `757:124` | 필터 팝업 | 0.9683 | 0.9683 | **0.9683** | +0.0000 | +0.0000 | 1.96 | 4.36% |
| **10** | `759:1076` | 신규등록 - 1 | 0.8924 | 0.8927 | **0.9356** | **+0.0429** | **+0.0432** | **3.11** | **3.91%** |
| **11** | `766:2289` | 필터 | 0.9115 | 0.9115 | **0.9115** | +0.0000 | +0.0000 | 4.35 | 4.61% |
| **12** | `757:118` | Frame 1 | 0.9592 | 0.9592 | **0.9592** | +0.0000 | +0.0000 | 2.00 | 4.18% |
| **13** | `766:2942` | 사업정보 수정 | 0.8629 | 0.8629 | **0.8629** | +0.0000 | +0.0000 | 6.56 | 6.47% |
| **14** | `759:1314` | 신규등록 - 2 | 0.8969 | 0.8966 | **0.9457** | **+0.0491** | **+0.0488** | **2.61** | **3.42%** |
| **15** | `759:1858` | 사업목록 클릭 시 | 0.9339 | 0.9339 | **0.9339** | +0.0000 | +0.0000 | 2.49 | 3.08% |
| **16** | `759:1533` | 사업목록 클릭 시 - 탭디자인1 | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| **17** | `768:3434` | 사업목록 클릭 시 (상세) | 0.7915 | 0.7990 | **0.9270** | **+0.1280** | **+0.1355** | **2.73** | **3.89%** |

*Note: Page 16 (`759:1533`) is correctly designated `REFERENCE_MISSING_VERSION_UNVERIFIED` because no original reference PNG exists for this frame.*

---

## Benchmark Statistical Highlights

- **Valid Comparisons Count**: 16 of 16 expected reference frames (100% coverage).
- **Candidate Average SSIM**: **0.9479**
- **Current Average SSIM**: **0.9186**
- **Baseline Average SSIM**: **0.8972**
- **Net Gain vs Current**: **+0.0293 SSIM (+2.93% jump)**
- **Net Gain vs Baseline**: **+0.0508 SSIM (+5.08% jump)**
- **Candidate Average MAE**: **2.62** (Down from 3.58 Current, 11.18 Baseline)
- **Candidate Average Mismatch Ratio**: **3.29%** (Down from 5.81% Current, 10.17% Baseline)
- **Regression Count**: **0 frames** (Zero valid frames experienced an SSIM decrease).
