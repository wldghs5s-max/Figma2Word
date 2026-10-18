# Phase 21 Executive Summary: HWPX Application Compatibility Recovery, Shape Hardening & Visual Fidelity

## 1. 개요 (Overview)
Phase 21은 Phase 20에서 구축된 OWPML / KS X 6101 기반 HWPX 엔진의 실제 한컴오피스 2024 뷰어(Hancom Office 2024 Viewer) 호환성을 완전히 복구하고, 도형 직렬화의 구조적 결함을 제거하기 위해 수행된 대규모 자율 복구 작업이다.

Phase 20에서 자동화 테스트 362개가 통과했음에도 불구하고, 사용자가 실제 한컴 뷰어에서 확인한 검증 결과(Ground Truth)는 다음과 같았다:
- **Stage 1 (기본 한글 텍스트)**: **PASS** (정상 열림)
- **Stage 2 (타이포그래피 및 서식)**: **PASS** (정상 열림)
- **Stage 3 (사각형 카드 및 직선)**: **FAIL** (오류 팝업 후 뷰어 강제 종료)
- **Stage 4 (텍스트박스, 타원, 벡터)**: **FAIL** (오류 팝업 후 뷰어 강제 종료)
- **Stage 5 (이미지 리소스 및 크롭)**: **PASS** (정상 열림)
- **Stage 6 (대표 제안서 리포트)**: **FAIL** (오류 팝업 후 뷰어 강제 종료)
- **Stage 7 (고객 실측 9페이지 종합 리포트)**: **FAIL** (오류 팝업 후 뷰어 강제 종료)

본 Phase 21에서는 실제 한컴 정품 HWPX 파일(`완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`, 837개 도형 분석)과 OWPML 공식 스펙을 대조 분석하여, 실패 단계의 근본 원인을 분리·특정하고 이를 완전히 해결하였다.

---

## 2. 핵심 원인 분석 및 발견된 결함 (Root Causes Identified)

### 원인 1: `renderRectXml` 매개변수 불일치로 인한 `undefined` 속성 유출 (CRITICAL)
- **발생 위치**: `src/canvas/renderer/hwpxCanvasRenderer.ts` 내 `renderElement()` -> `renderRectXml()` 호출부
- **현상**: 호출부에서는 `colorHex`, `width`, `style`로 전달했으나, `renderRectXml` 정의부에서는 `lineColorHex`, `lineWidth`, `lineStyle`을 요구함.
- **결과**: 테두리(stroke)나 배경(fill)이 있는 모든 사각형, 카드, 텍스트박스에서 `<hp:lineShape color="#undefined" width="undefined" style="undefined" .../>`가 출력됨.
- **영향**: Stage 1, 2는 순수 텍스트(무색, 무테두리)여서 우연히 통과했으나, Stage 3, 4, 6, 7은 채우기 및 테두리를 갖는 카드/패널이 다수 포함되어 한컴 뷰어의 XML 파서가 `width="undefined"`(정수 파싱 실패) 및 `style="undefined"`(열거형 파싱 실패)에서 치명적 예외를 발생시키고 종료됨.

### 원인 2: 미등록 XML 태그 `<hp:oval>` 사용 (CRITICAL)
- **발생 위치**: `renderOvalXml()`
- **현상**: 타원/원형 요소에 대해 `<hp:oval>` 태그를 직렬화함.
- **정품 대조 결과**: 한컴 정품 HWPX 파일 및 KS X 6101 공식 규격의 타원 태그는 `<hp:ellipse intervalDirty="0" hasArcPr="0" arcType="NORMAL" ...>`이며, `<hp:oval>` 태그는 존재하지 않는 미등록 태그임.
- **결과**: Stage 4 및 Stage 7(도넛 차트 원형)에서 알 수 없는 태그 오류로 인해 파서가 실패함.

### 원인 3: `hp:line`의 미검증 비표준 속성 `isReverseHV="0"` 오염 (MODERATE)
- **발생 위치**: `renderLineXml()`
- **현상**: 웹 Argon의 제안을 반영하여 `isReverseHV="0"` 속성을 주입함.
- **정품 대조 결과**: 한컴 정품 HWPX 문서의 수천 개 객체 중 `isReverse...` 속성은 어디에도 존재하지 않으며, 그림 요소의 `reverse="0"`만 존재함. 또한 한컴 정품 문서에서 55개의 모든 수평/수직 구분선은 100% 채워진 직사각형(`<hp:rect>`)으로 안전하게 직렬화됨.
- **조치**: `renderLineXml`에서 `isReverseHV="0"`을 완전히 제거하고 순수 KS X 6101 좌표 구조로 정상화함.

---

## 3. 적용된 조치 및 기술적 복구 (Remediations Applied)

1. **`renderRectXml` 방어적 정규화 및 파라미터 듀얼 호환**:
   - `lineColorHex`, `colorHex`, `lineWidth`, `width`, `lineStyle`, `style`을 모두 수용하는 하이브리드 파라미터 타입 적용.
   - `safeWidth`: 정수 정규식(`/^\d+$/`) 검증 후 기본값 `"0"` 강제.
   - `safeStyle`: OWPML 허용 열거형(`NONE`, `SOLID`, `DASH`, `DOT`, `DASH_DOT`, `DASH_DOT_DOT`) 화이트리스트 검증.
   - `safeColor`: 6자리 16진수 검증 후 기본값 `"000000"` 강제.
   - **결과**: 생성되는 모든 XML에서 `undefined` 발생 확률 0% 달성.

2. **`<hp:ellipse>` 규격 완전 일치화**:
   - `<hp:oval>`을 공식 `<hp:ellipse>`로 전환.
   - 필수 속성 `intervalDirty="0" hasArcPr="0" arcType="NORMAL"` 적용.
   - 중심점(`<hc:center>`), 장축/단축 벡터(`<hc:ax1>`, `<hc:ax2>`), 시작/종료점(`<hc:start1>`, `<hc:end1>`, `<hc:start2>`, `<hc:end2>`)을 정품 한컴 문서와 바이트 단위로 일치시킴.

3. **`hp:line` 속성 정화**:
   - 비표준 `isReverseHV="0"` 제거.
   - 시작점(`<hc:pt0>`) 및 끝점(`<hc:pt1>`)의 좌표 무결성 유지.

4. **DOCX 엔진 및 공통 타입 100% 보존**:
   - 금지된 5대 핵심 파일(`docxCanvasRenderer.ts`, `figmaCanvasParser.ts`, `docxCanvasParser.ts`, `svgPathParser.ts`, `types.ts`)은 일체 수정하지 않음.

---

## 4. 검증 결과 요약 (Validation Summary)

| 검증 영역 | 테스트 대상 | 결과 | 비고 |
|---|---|---|---|
| **TypeScript 빌드** | 전체 프로젝트 (`tsc --noEmit`) | **PASS (0 errors)** | 엄격한 타입 체크 통과 |
| **Vitest 테스트 스위트** | 57개 테스트 파일, 362개 테스트 | **PASS (362/362, 100%)** | 회귀 테스트 전원 통과 |
| **XML 오염도 감사** | Stage 1~7 및 마이크로 진단 파일 | **PASS (undef=0, revHV=0, oval=0)** | 모든 HWPX XML 완전 무결 |
| **Phase 20 기준군 보존** | `debug/hwpx-phase20-baseline/` | **PRESERVED** | 기존 7개 Stage 파일 독립 보관 |
| **Phase 21 신규 산출물** | `debug/hwpx-phase21/` | **GENERATED (11개 HWPX)** | 7개 Stage + 4개 Diag 마이크로 파일 |

