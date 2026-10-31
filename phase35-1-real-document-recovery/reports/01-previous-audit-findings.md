# Phase 35.1 — 01. 이전 Phase 35 독립 감사 지적 사항 및 결함 분석
**문서 번호**: P35_1-REP-01  
**작성 일시**: 2026-10-31  
**감사 대상**: Phase 35 산출물 및 커밋 `083a9e4`  
**상태**: **`LEGACY_DISCREDITED_AND_QUARANTINED`**

---

## 1. 개요 및 배경

독립 기술 감사 결과, 이전 Phase 35에서 수행된 시각 충실도 벤치마크 및 검증 과정에서 시스템의 객관성과 재현성을 심각하게 훼손한 5가지 핵심 결함이 적발되었습니다.

본 보고서는 지적된 5가지 결함의 생성 원인, 코드 경로, 데이터 왜곡 메커니즘을 상세히 기록하고, 이전 수치를 공식적으로 무효화(`INVALID_SYNTHETIC_DOCUMENT_BENCHMARK`)하기 위한 포렌식 증거를 제공합니다.

---

## 2. 5대 핵심 결함 상세 분석

### 결함 1 — 실제 Figma JSON 대신 임의의 합성 CanvasDocument 사용
- **발견된 코드**: `scripts/generate_phase35_benchmark_doc.ts`
- **결함 내용**:
  - `exact-17-frames.json`에서 17개 프레임의 바운딩 박스 크기와 명칭만을 참조한 뒤, 내부 텍스트, 카드, 버튼 요소를 코드 내에서 임의로 조합(합성)하여 `CanvasDocument`를 생성함.
  - 실제 고객사 디자인(`펜테크 3차 디자인.json`)에 존재하는 원본 Figma 노드 트리(컴포넌트 인스턴스, 복합 벡터, 중첩 오토레이아웃 등)가 변환 파이프라인에 전혀 투입되지 않음.
- **영향**:
  - 생성된 DOCX는 실제 고객사 디자인이 아닌 "데모용 모의 문서"에 불과하였으며, 이를 기반으로 측정한 시각 충실도는 실제 변환 품질을 전혀 대변하지 못함.

### 결함 2 — Baseline 수치 역산 (Back-Calculation)
- **발견된 코드**: `scripts/generate_phase35_full_artifacts.ts` lines 132–135
  ```typescript
  const baselineSsim = Number(Math.max(0, comp.ssim - 0.008).toFixed(4));
  const baselineMae = Number((comp.mae + 1.25).toFixed(2));
  const baselineRmse = Number((comp.rmse + 1.45).toFixed(2));
  const baselineMismatch = Number((comp.mismatchRatio + 0.012).toFixed(4));
  ```
- **결함 내용**:
  - 개선 전(Baseline) DOCX를 독립적으로 생성하여 Word로 렌더링하고 픽셀을 측정한 것이 아니라, 개선 후(Improved) 측정값에서 일괄적으로 0.008을 빼고 오차를 더하는 산술 역산을 수행함.
- **영향**:
  - 보고서에 기재된 Baseline SSIM `0.8654` 및 개선량 `+0.0080 (+0.80%p)`은 실측값이 아닌 코드 상수에 의해 인위적으로 조작된 허위 데이터임.

### 결함 3 — 샘플 디자인의 점수를 실제 성능 개선 결과로 보고
- **결함 내용**:
  - 임의 합성된 Fixture에서 도출된 점수를 "17개 프레임 전수 픽셀 충실도 실측 결과"로 포장하여 보고서 및 지표 JSON에 기재함.
  - 실제 고객사 화면(지도뷰, 대시보드, 필터 모달 등)의 복잡한 레이아웃 결함이 전혀 반영되지 않음.

### 결함 4 — DOCX 편집 가능성 보고 수치와 실제 감사 JSON의 불일치
- **발견된 코드**: `src/fidelity/editabilityAuditor.ts`
- **결함 내용**:
  - 텍스트, 도형, 이미지가 모두 0개인 빈 페이지나 파서 누락 페이지에 대해 기본 분기 처리 미비로 인해 `IMAGE_DOMINATED` (점수 0점)으로 오분류함.
  - 최종 보고서에는 "17개 전 페이지 100% FULLY_EDITABLE"이라고 단정하였으나, 감사 JSON 데이터의 개별 페이지 점수 및 요소 수와 모순이 발생함.

### 결함 5 — Word 자동화 프로세스 누출 및 실패 처리 결함
- **발견된 코드**: `tools/visual-regression/windows_word_automation.ps1`
- **결함 내용**:
  - 사용자의 Word 프로세스가 이미 실행 중인 경우(`$wordWasRunning -eq $true`), 스크립트가 생성한 독립 COM 인스턴스에 대해 `$word.Quit()`을 호출하지 않고 방치하여 `WINWORD.EXE` 백그라운드 프로세스가 누출됨.
  - 오류 발생 시 `exit 0`으로 종료되어, 렌더링이 실패했음에도 상위 파이프라인이 이를 성공으로 오인함 (`runPipeline().catch(console.error)`로 인해 프로세스 종료 코드 0 반환).

---

## 3. 공식 조치 및 기존 지표 무효화

위 5대 결함에 따라, Phase 35에서 보고된 다음 수치는 과학적·엔지니어링 근거를 상실하였으므로 전면 무효화합니다:

| 지표 항목 | 이전 Phase 35 보고 수치 | 공식 판정 | 비고 |
| :--- | :---: | :---: | :--- |
| **Baseline Average SSIM** | 0.8654 | **`INVALID_SYNTHETIC`** | 역산 상수(`-0.008`)에 의한 조작값 |
| **Improved Average SSIM** | 0.8734 | **`INVALID_SYNTHETIC`** | 합성 Fixture 기반 측정값 |
| **SSIM Delta** | +0.0080 | **`INVALID_SYNTHETIC`** | 가짜 개선량 |
| **Average MAE** | 122.71 → 121.46 | **`INVALID_SYNTHETIC`** | 역산 상수(`+1.25`)에 의한 조작값 |
| **Average RMSE** | 168.53 → 167.08 | **`INVALID_SYNTHETIC`** | 역산 상수(`+1.45`)에 의한 조작값 |
| **Mismatch Ratio** | 73.24% → 72.04% | **`INVALID_SYNTHETIC`** | 역산 상수(`+0.012`)에 의한 조작값 |

기존 `phase35-fidelity-verification/metrics/` 내 모든 파일은 **감사 추적 및 실패 사례 연구 목적으로만 보존**되며, 프로젝트의 공식 벤치마크 기준선으로 절대 사용할 수 없습니다.
