# Phase 35 — 01. Phase 34B 기존 메트릭 포렌식 감사 및 공식 격리 보고서
**문서 번호**: P35-REP-01  
**작성 일시**: 2026-10-31  
**감사 대상**: `phase34b-live-fidelity/reports/` 및 `phase34b-live-fidelity/metrics/`  
**감사 판정**: **`UNVERIFIED_LEGACY_METRIC` (공식 격리 승인)**

---

## 1. 감사 배경 및 목적

Phase 34B 보고서에서는 Figma API를 통해 수집된 16개 원본 PNG와 Microsoft Word 렌더링 결과 간의 시각적 충실도로서 다음 수치를 공식 제시하였습니다:
- **평균 SSIM (Average SSIM)**: `0.9931` (99.31%)
- **평균 MAE (Average MAE)**: `0.11 / 255`
- **평균 RMSE (Average RMSE)**: `1.13`
- **평균 Mismatch Ratio**: `0.28%`
- **완전 일치 (SSIM 1.0000) 프레임**: 6개 프레임 (`Page 3`, `5`, `6`, `7`, `9`, `12`)

독립 기술 감사(AUDIT-01 ~ AUDIT-06)에서 해당 수치의 신뢰성에 심각한 의문이 제기됨에 따라, 본 감사는 코드 커밋 이력, 스크립트 실행 경로, 실제 바이너리 산출물을 포렌식 추적하여 진실을 규명하였습니다.

---

## 2. 포렌식 감사 핵심 결과 (Smoking Gun 규명)

### 2.1 수치 출처 추적: Phase 26 Before vs After 데이터의 무단 전용 (AUDIT-01, AUDIT-02)

포렌식 감사 결과, Phase 34B에서 보고된 수치는 **Figma 원본 이미지와 Word 렌더링 간의 픽셀 비교 결과가 전혀 아님**이 입증되었습니다.

- **실제 출처**: `research/rea-document-engine/phase26-visual-fidelity/08_BEFORE_AFTER_RESULTS.md`
- **Phase 26의 비교 대상**: Word 렌더러의 VML `<v:roundrect>` arcsize 모서리 곡률 개선 전(`phase26_baseline.docx`) vs 개선 후(`phase26_improved.docx`)
- **수치 일치율**: **100.0% 완전 일치**

```mermaid
flowchart TD
    subgraph Phase 26 (Before vs After)
        A["Word Before (Baseline)"] <--> B["Word After (ArcSize Fix)"]
        A -.-> C["Page 3, 5, 6, 7, 9, 12 has NO rounded rects<br/>=> Identical output => SSIM 1.0000, MAE 0.00"]
    end
    subgraph Phase 34B (Misattribution)
        C -.-> D["Phase 26 Table Copied Directly into Phase 34B"]
        D ==> E["Claimed as 'Figma Original PNG vs Word Native Render'"]
    end
```

| Page | Frame ID | Frame Name | Phase 26 Before vs After | Phase 34B 보고 수치 | 실제 관계 |
| :---: | :---: | :--- | :---: | :---: | :--- |
| **01** | `763:5068` | 디자인 시스템 1 | SSIM 0.9859, MAE 0.21 | SSIM 0.9859, MAE 0.21 | **수치 100% 동일 복사** |
| **02** | `766:256` | 디자인 시스템 2 | SSIM 0.9913, MAE 0.10 | SSIM 0.9913, MAE 0.10 | **수치 100% 동일 복사** |
| **03** | `757:88` | Desktop - 1 | SSIM 1.0000, MAE 0.00 | SSIM 1.0000, MAE 0.00 | **코너 라운딩 없는 페이지** |
| **04** | `759:759` | 대시보드 (지도뷰) | SSIM 0.9973, MAE 0.05 | SSIM 0.9973, MAE 0.05 | **수치 100% 동일 복사** |
| **05** | `757:92` | Desktop - 2 | SSIM 1.0000, MAE 0.00 | SSIM 1.0000, MAE 0.00 | **코너 라운딩 없는 페이지** |
| **06** | `757:142` | 촬영계획 | SSIM 1.0000, MAE 0.00 | SSIM 1.0000, MAE 0.00 | **코너 라운딩 없는 페이지** |
| **07** | `757:158` | 촬영계획 - 건물선택 | SSIM 1.0000, MAE 0.00 | SSIM 1.0000, MAE 0.00 | **코너 라운딩 없는 페이지** |
| **08** | `759:911` | 사업목록 선택된 화면 | SSIM 0.9944, MAE 0.05 | SSIM 0.9944, MAE 0.05 | **수치 100% 동일 복사** |
| **09** | `757:124` | 필터 팝업 | SSIM 1.0000, MAE 0.00 | SSIM 1.0000, MAE 0.00 | **코너 라운딩 없는 페이지** |
| **10** | `759:1076` | 신규등록 - 1 | SSIM 0.9959, MAE 0.11 | SSIM 0.9959, MAE 0.11 | **수치 100% 동일 복사** |
| **11** | `766:2289` | 필터 | SSIM 0.9841, MAE 0.45 | SSIM 0.9841, MAE 0.45 | **수치 100% 동일 복사** |
| **12** | `757:118` | Frame 1 | SSIM 1.0000, MAE 0.00 | SSIM 1.0000, MAE 0.00 | **코너 라운딩 없는 페이지** |
| **13** | `766:2942` | 사업정보 수정 | SSIM 0.9898, MAE 0.31 | SSIM 0.9898, MAE 0.31 | **수치 100% 동일 복사** |
| **14** | `759:1314` | 신규등록 - 2 | SSIM 0.9933, MAE 0.15 | SSIM 0.9933, MAE 0.15 | **수치 100% 동일 복사** |
| **15** | `759:1858` | 사업목록 클릭 시 | SSIM 0.9637, MAE 0.26 | SSIM 0.9637, MAE 0.26 | **수치 100% 동일 복사** |
| **16** | `759:1533` | 탭디자인1 | SSIM 0.9814, MAE 0.21 | N/A (MISSING) | **API 결측으로 N/A 수정** |
| **17** | `768:3434` | 사업목록 클릭 시 | SSIM 0.9941, MAE 0.04 | SSIM 0.9941, MAE 0.04 | **수치 100% 동일 복사** |

### 2.2 6개 프레임의 비현실적 SSIM 1.0000 원인 규명
- Page 3, 5, 6, 7, 9, 12는 디자인 내에 `cornerRadius > 0`인 요소가 없었기 때문에, Phase 26에서 ArcSize 수정을 적용하기 전과 후의 Word 렌더링 결과가 100% 바이너리 일치하였습니다.
- Phase 34B 작성자는 이 Before/After 일치 수치(1.0000)를 그대로 가져와 Figma 원본과의 일치도로 포장하였습니다.
- **결론**: 비현실적인 1.0000은 래스터 커버 이미지 치팅이 아니라, **Before/After 무변경 페이지 수치의 명백한 오용/전용** 때문이었습니다.

### 2.3 집계 계산 불일치 (AUDIT-04)
- Phase 34B `06-fidelity-baseline.md` 본문에는 Average RMSE: `1.13`, Mismatch Ratio: `0.28%`로 기재되었습니다.
- 그러나 테이블에 나열된 16개 프레임의 실제 산술 평균은:
  - $\text{RMSE} = \frac{\sum \text{RMSE}}{16} = 1.11375 \approx 1.11$
  - $\text{Mismatch Ratio} = \frac{\sum \text{Mismatch}}{16} = 0.255\% \approx 0.26\%$
- 이는 수작업 표 작성 과정에서 발생한 전형적인 전사/반올림 오류였습니다.

---

## 3. 공식 격리 조치

본 감사 결과에 따라 다음 조치를 즉각 시행합니다:

1. **상태 전환**: Phase 34B의 모든 메트릭을 `OFFICIAL_BENCHMARK`에서 **`UNVERIFIED_LEGACY_METRIC`**으로 공식 강등 및 격리합니다.
2. **참조 금지**: 향후 모든 의사결정 및 품질 기준선에서 Phase 34B의 0.9931 수치를 공식 지표로 인용하는 것을 전면 금지합니다.
3. **재측정 기준선 확립**: Phase 35에서 구축된 독립 벤치마크 엔진에 의해 실측된 수치만을 유일한 공인 기준선으로 채택합니다.
