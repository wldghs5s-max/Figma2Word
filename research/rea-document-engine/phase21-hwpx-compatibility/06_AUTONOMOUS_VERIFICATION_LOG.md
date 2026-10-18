# Phase 21 Autonomous Verification & Audit Log

## 1. 실행 타임라인 및 작업 기록 (Audit Trail)

### Step 1: 환경 상태 점검 및 안전 체크포인트 확보
- **Git HEAD 확인**: Commit `bfe0f93` on branch `master`.
- **작업 트리 보호**: 수정 전 작업 트리가 클린한 상태임을 확인.
- **수정 금지 파일 보호 검증**:
  - `docxCanvasRenderer.ts` (0 edits)
  - `figmaCanvasParser.ts` (0 edits)
  - `docxCanvasParser.ts` (0 edits)
  - `svgPathParser.ts` (0 edits)
  - `types.ts` (0 edits)
- **Phase 20 원본 보존**: `debug/hwpx-recovery/`의 산출물 전체를 `debug/hwpx-phase20-baseline/`으로 복사하여 안전한 기준군 확보.

---

### Step 2: 사용자 실측 결과(Ground Truth) 기반 원인 조사
- 사용자의 실측 결과: Stage 1, 2, 5는 정상 통과, Stage 3, 4, 6, 7은 "파일을 읽거나 저장하는 데 오류가 발생했습니다" 팝업 후 한컴 뷰어 강제 종료.
- **가설 1**: Stage 3과 4에 추가된 요소 중 공통 파싱 실패를 유발하는 속성 또는 태그가 존재할 것이다.
- **조사 조치**:
  - `debug/hwpx-phase20-baseline/stage3-rect-line.hwpx`의 `Contents/section0.xml`을 역공학하여 추출.
  - 추출 결과, 카드 및 사각형의 테두리 정의에 다음과 같은 치명적 문자열 발견:
    `<hp:lineShape color="#undefined" width="undefined" style="undefined" .../>`
  - 원인 추적: `hwpxCanvasRenderer.ts` 내 `renderElement()`가 `renderRectXml()`을 호출할 때 넘긴 프로퍼티 이름(`colorHex`, `width`, `style`)과 `renderRectXml` 매개변수 선언(`lineColorHex`, `lineWidth`, `lineStyle`) 간의 불일치로 인해 3개 필드가 모두 `undefined`로 평가됨.

---

### Step 3: 정품 한컴 HWPX 문서(`완성본-20261012/*.hwpx`) 역공학 대조
- 작업 공간 내 실제 한컴 정품 문서 3종(`report-1차...hwpx`, `report-2차...hwpx`, `report-3차...hwpx`)의 XML 구조를 정밀 분석:
  1. **타원 태그 분석**:
     - 정품 문서 전체에서 `<hp:oval>` 태그는 0건, `<hp:ellipse>` 태그가 4건 존재.
     - 기하 속성: `<hp:ellipse intervalDirty="0" hasArcPr="0" arcType="NORMAL" ...>`
     - 좌표 속성: `<hc:center>`, `<hc:ax1>`, `<hc:ax2>`, `<hc:start1..end2>`가 명시적으로 존재하며, 시작점/끝점은 `(0, 0)`이 아니라 `(width, cy)` 좌표를 가짐.
     - **결론**: 기존 구현의 `<hp:oval>`은 미등록 불법 태그였음이 규명됨.
  2. **구분선(Divider Line) 분석**:
     - 정품 문서의 837개 도형 중 높이 400 HWPU 이하의 얇은 직사각형이 55개 발견됨.
     - 반면 `<hp:line>`은 0건으로, 한컴 자체도 안정성을 위해 구분선을 얇은 `<hp:rect>`로 직렬화함을 발견.
  3. **비표준 속성 `isReverseHV` 검증**:
     - 정품 문서 전체에서 `isReverse...` 속성은 0건 검출됨.
     - 웹 Argon이 제안했던 `isReverseHV="0"`은 정품 문서에서 전혀 사용되지 않는 비표준 속성임이 확인됨.

---

### Step 4: 엔진 코드 리팩토링 및 방어적 하드닝 구현
- 대상 파일: `src/canvas/renderer/hwpxCanvasRenderer.ts`
- **구현 내용**:
  1. `renderRectXml`: 매개변수 이름을 `lineColorHex`와 `colorHex`, `lineWidth`와 `width`, `lineStyle`과 `style` 모두를 지원하도록 하이브리드 인터페이스로 확장하고, 정수 정규식 및 열거형 화이트리스트를 통한 폴백 강제 (`safeWidth = "0"`, `safeStyle = "NONE"`, `safeColor = "000000"`).
  2. `renderOvalXml`: 태그명을 정품 규격인 `<hp:ellipse>`로 전환하고 공식 속성 및 4축 좌표 체계 완전 일치화.
  3. `renderLineXml`: 비표준 속성 `isReverseHV="0"` 제거 및 표준 OWPML 좌표 유지.
  4. `renderPolygonXml`: 닫힌 벡터 패스의 좌표 순환성 및 안전 속성 적용.

---

### Step 5: 회귀 검증 및 테스트 스위트 전수 실행
1. **TypeScript 타입 검사**: `npx tsc --noEmit` 실행 -> 0 errors (통과).
2. **테스트 스위트 동기화**:
   - `tests/canvas-engine.test.ts`: `<hp:oval>` -> `<hp:ellipse>` 검증으로 동기화.
   - `tests/hwpx-schema-conformance.test.ts`: `<hp:ellipse>` 규격 검증으로 동기화.
   - `tests/phase17-quality-integration.test.ts`: 비표준 `isReverseHV` 검증 제거.
3. **Vitest 전체 실행**: 57개 테스트 파일, 362개 테스트 케이스 전원 통과 (100% PASS).
4. **산출물 생성 및 XML 오염도 검사**:
   - `scripts/generate_phase21_deliverables.ts` 실행 -> 11개 HWPX 산출물 생성 완료.
   - 파이썬 전수 스캔: `undefined = 0`, `isReverseHV = 0`, `hp:oval = 0` 확인.

