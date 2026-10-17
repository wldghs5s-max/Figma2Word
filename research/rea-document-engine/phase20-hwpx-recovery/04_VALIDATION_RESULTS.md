# Phase 20 Validation Results: Comprehensive Test Suite & Schema Audit

본 문서는 Phase 20 복구 작업 완료 후 수행된 모든 자동화 검증, 단위/통합 테스트, 스키마 유효성 검사 및 로컬 한컴 환경 분석 결과를 기록한다.

---

## 1. 단위 및 통합 테스트 결과 (Vitest Suite)

전체 테스트 스위트 실행 결과, **57개 테스트 파일 362개 테스트 전원 통과(0건 실패)**를 기록하였다.

```
 RUN  v5.0.3 C:/Users/77/Documents/Figma2Word

 ✓ tests/step-2b2-flatten.test.ts (8 tests)
 ✓ tests/step-2b6-background-row.test.ts (10 tests)
 ✓ tests/layout-p1.test.ts (8 tests)
 ✓ tests/figma-offline-snapshot.test.ts (10 tests)
 ✓ tests/phase18-architecture-fidelity.test.ts (9 tests)
 ✓ tests/e2e-real-figma.test.ts (4 tests)
 ✓ tests/frame-selection.test.ts (11 tests)
 ✓ tests/step-12b-fidelity-improvements.test.ts (5 tests)
 ✓ tests/stress.test.ts (4 tests)
 ✓ tests/browser-memory-stability.test.ts (4 tests)
 ✓ tests/geometry-cluster.test.ts (9 tests)
 ✓ tests/faq-table-isolation.test.ts (6 tests)
 ✓ tests/step-2b5-safe-flatten.test.ts (6 tests)
 ✓ tests/cta-padding-preservation.test.ts (4 tests)
 ✓ tests/nested-table-flattening-guard.test.ts (7 tests)
 ✓ tests/compact-chip-boundary.test.ts (5 tests)
 ✓ tests/synthetic-benchmarks.test.ts (7 tests)
 ✓ tests/border-preservation.test.ts (7 tests)
 ✓ tests/parent-context-row-cluster.test.ts (12 tests)
 ✓ tests/geometry-cluster-coordinates.test.ts (7 tests)
 ✓ tests/decorative-shapes-minimization.test.ts (5 tests)
 ✓ tests/canvas-multi-screen-isolation.test.ts (6 tests)
 ✓ tests/pipeline.test.ts (2 tests)
 ✓ tests/data-table-support.test.ts (11 tests)
 ✓ tests/page-orientation-selection.test.ts (6 tests)
 ✓ tests/character-style-overrides.test.ts (12 tests)
 ✓ tests/step-12c-fidelity-improvements.test.ts (4 tests)
 ✓ tests/renderer.test.ts (2 tests)
 ✓ tests/determinism.test.ts (2 tests)
 ✓ tests/screen36-modal-isolation.test.ts (4 tests)
 ✓ tests/folded-cards-clustering.test.ts (2 tests)
 ✓ tests/regression-guards.test.ts (12 tests)
 ✓ tests/desktop-padding-clamping.test.ts (5 tests)
 ✓ tests/phase19-docx-text-fidelity.test.ts (13 tests)
 ✓ tests/canvas-and-guard.test.ts (4 tests)
 ✓ tests/tabbar-button-wrapping.test.ts (2 tests)
 ✓ tests/header-overlay.test.ts (1 test)
 ✓ tests/text-layout.test.ts (1 test)
 ✓ tests/phase16-h1-remediation.test.ts (5 tests)
 ✓ tests/bento-grid-layout.test.ts (8 tests)
 ✓ tests/empty-shape-no-table.test.ts (3 tests)
 ✓ tests/figma-api.test.ts (18 tests)
 ✓ tests/phase16-1-remediation.test.ts (9 tests)
 ✓ tests/phase17-quality-integration.test.ts (6 tests)
 ✓ tests/phase16-h2-remediation.test.ts (7 tests)
 ✓ tests/quality-audit/audit-infra.test.ts (4 tests)
 ✓ tests/desktop-screen-isolation.test.ts (9 tests)
 ✓ tests/canvas-engine.test.ts (17 tests)
 ✓ tests/desktop-multi-page-isolation.test.ts (6 tests)
 ✓ tests/desktop-card-group-clustering.test.ts (4 tests)
 ✓ tests/edge-cases.test.ts (5 tests)
 ✓ tests/parser.test.ts (4 tests)
 ✓ tests/model.test.ts (3 tests)
 ✓ tests/autolayout.test.ts (2 tests)
 ✓ tests/phase16-h3-remediation.test.ts (4 tests)
 ✓ tests/hwpx-schema-conformance.test.ts (5 tests)
 ✓ tests/quality-audit/synthetic-fixtures.test.ts (6 tests)

 Test Files  57 passed (57)
      Tests  362 passed (362)
   Duration  64.37s
```

---

## 2. 순환 검증 테스트 교정 내역

이전 구현체가 자체적으로 방출하던 비표준 XML 문자열을 묵인하던 3개 테스트 파일을 정품 OWPML 규격에 맞게 교정하였다:

1. `tests/canvas-engine.test.ts`:
   - 소문자 `lang="hangul"` / `lang="latin"` 단언을 대문자 `lang="HANGUL"` / `lang="LATIN"`으로 교정.
   - 비표준 다각형 좌표 `<hp:pt` 단언을 표준 코어 좌표 `<hc:pt`로 교정.
2. `tests/phase16-1-remediation.test.ts`:
   - 비표준 직선 좌표 `<hp:pt0` / `<hp:pt1` 단언을 표준 코어 좌표 `<hc:pt0` / `<hc:pt1`로 교정.
3. `tests/phase17-quality-integration.test.ts`:
   - 레거시 직선 속성 `isReverseHWP97="0"` 단언을 `isReverseHV="0"`으로 교정.
   - 이미지 검증에서 비표준 속성 `binRef` 및 불필요한 `<hp:inImgDim>` 단언을 제거하고, 정품 중첩 구조인 `<hp:imgRect><hc:pt0..3/></hp:imgRect>` 단언으로 보강.

---

## 3. 신규 스키마 준수 테스트 (`tests/hwpx-schema-conformance.test.ts`)

새로 추가된 적격성 게이트는 다음 5대 영역을 엄격하게 단언한다:
1. `<hp:secPr>`이 반드시 `<hp:run charPrIDRef="0">` 내부에 위치하고 표준 8대 하위 요소 순서를 따르는지 검증.
2. 공통 도형이 `offset`부터 `outMargin`까지 15단계 sequence를 정확히 지키며, 도형 ID가 순수 `unsignedInt`인지 검증.
3. 타원(`hp:oval`)이 `hc:center`, `hc:ax1`, `hc:ax2`, `hc:start1..end2` 전용 지오메트리를 올바르게 방출하는지 검증.
4. 이미지(`hp:pic`)가 중첩 `imgRect`, `imgClip`, `inMargin`, `imgDim`, `hc:img` 구조를 온전히 갖추었는지 검증.
5. 헤더 XML(`Contents/header.xml`)의 7개 언어 코드가 대문자 열거형(`HANGUL`, `LATIN` 등)인지 검증.

---

## 4. 로컬 한컴 환경 분석 및 뷰어 현황

- **설치 감지 결과**:
  - `C:\Program Files (x86)\Hnc\Office 2024 Viewer\HOffice130\Bin\HwpViewer.exe` (정품 한컴오피스 2024 뷰어 존재 확인)
  - `C:\Program Files (x86)\Hnc\Hwp80\Hwp.exe` (한컴 2010 Hwp80 존재 확인)
  - COM 객체 `HWPFrame.HwpObject` 레지스트리 등록 확인 (`{2291CF00-64A1-4877-A9B4-68CFE89612D6}`)
- **뷰어 직접 검증의 한계와 미검증 범위 명시**:
  - 현재 AI 에이전트 실행 환경은 비대화형 백그라운드 콘솔(Headless PowerShell)이므로 GUI 데스크톱 세션이 필요한 `HwpViewer.exe` 창의 렌더링 화면을 직접 OCR하거나 스크린샷 캡처할 수 없음.
  - 따라서 **한컴 뷰어 화면의 픽셀 단위 시각적 레이아웃 일치 여부는 "미검증(Unverified)"으로 남기며**, 향후 사용자가 GUI 환경에서 직접 뷰어로 열람하거나 전용 COM 자동화 테스트를 통해 최종 확인할 것을 권장함.

