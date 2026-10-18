# Phase 21 Instructions for Web Argon: Application Compatibility & Shape Hardening Audit

본 문서는 사용자가 Gemini 웹의 Argon 모델에게 Figma2Word Phase 21 복구 결과에 대한 2차 독립 검토를 의뢰할 때, Argon이 실제 한컴오피스 2024 뷰어(Hancom Office 2024 Viewer) 구동 실패 원인과 적용된 해결책을 정확하게 검증할 수 있도록 돕는 기술 가이드이다.

---

## 1. 독립 검토의 핵심 배경: 사용자 실측 결과(Ground Truth)

Phase 20 종료 시점의 단위 테스트(362개) 100% 통과에도 불구하고, 실제 한컴오피스 2024 뷰어로 Phase 20 산출물을 검증한 결과는 다음과 같았다:

| 구분 | 테스트 대상 | 사용자 실측 결과 | 비고 |
|---|---|---|---|
| Stage 1 | Korean Text | **PASS (정상 열림)** | 순수 텍스트, 무배경/무테두리 |
| Stage 2 | Typography | **PASS (정상 열림)** | 텍스트 스타일 변형, 무배경/무테두리 |
| Stage 3 | Rectangle + Line | **FAIL (오류 후 뷰어 종료)** | *"파일을 읽거나 저장하는 데 오류가 발생했습니다"* |
| Stage 4 | Textbox + Oval + Vector | **FAIL (오류 후 뷰어 종료)** | *"파일을 읽거나 저장하는 데 오류가 발생했습니다"* |
| Stage 5 | Images | **PASS (정상 열림)** | 래스터 이미지 및 비트맵 |
| Stage 6 | Representative Report | **FAIL (오류 후 뷰어 종료)** | *"파일을 읽거나 저장하는 데 오류가 발생했습니다"* |
| Stage 7 | Full Customer Report (9p) | **FAIL (오류 후 뷰어 종료)** | *"파일을 읽거나 저장하는 데 오류가 발생했습니다"* |

**핵심 통찰**:
- Stage 1, 2, 5는 열리고 Stage 3, 4, 6, 7은 동일한 오류 메시지를 내며 강제 종료됨.
- 이는 텍스트나 섹션(`<hp:secPr>`), 이미지 직렬화의 문제가 아니라, **도형(Shape) 및 카드/박스의 XML 직렬화 결함**임을 가리킴.

---

## 2. 규명된 결함 및 기술적 해명

### 결함 1: `renderRectXml` 매개변수 불일치로 인한 `undefined` 속성 유출 (CRITICAL)
- **원인**: `renderElement()` 내부에서 `renderRectXml` 호출 시 `{ colorHex, width, style }`을 전달하였으나, `renderRectXml` 함수 시그니처는 `{ lineColorHex, lineWidth, lineStyle }`을 요구함.
- **결과**: 배경색이나 테두리가 부여된 모든 사각형/카드에 대해 다음 XML이 생성됨:
  ```xml
  <hp:lineShape color="#undefined" width="undefined" style="undefined" .../>
  ```
- **치명도**: 한컴 뷰어의 OWPML 파서는 `width`를 `unsignedInt`, `style`을 열거형으로 엄격하게 파싱함. 문자열 `"undefined"`를 파싱하는 즉시 파서 내부 예외가 발생하여 *"파일을 읽거나 저장하는 데 오류가 발생했습니다"* 다이얼로그와 함께 프로세스가 강제 종료됨.
- **조치**: 매개변수 이름을 하이브리드로 수용(`colorHex | lineColorHex`, `width | lineWidth`, `style | lineStyle`)하고, 정규식(`/^\d+$/`) 및 화이트리스트 검증을 통해 유효하지 않은 값에 대해 기본값(`"0"`, `"NONE"`, `"000000"`)으로 강제 폴백 처리함.

### 결함 2: 미등록 XML 태그 `<hp:oval>` 사용 (CRITICAL)
- **원인**: 타원/원형 요소에 대해 임의로 `<hp:oval>` 태그를 사용함.
- **정품 역공학 대조**: 실제 정품 한컴 HWPX(`완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`)의 837개 도형을 역공학 전수 조사한 결과, `<hp:oval>`은 단 1건도 존재하지 않으며, 공식 태그는 다음과 같음:
  ```xml
  <hp:ellipse intervalDirty="0" hasArcPr="0" arcType="NORMAL">
    <hc:center x="cx" y="cy"/>
    <hc:ax1 x="width" y="cy"/>
    <hc:ax2 x="cx" y="height"/>
    <hc:start1 x="width" y="cy"/>
    <hc:end1 x="width" y="cy"/>
    <hc:start2 x="width" y="cy"/>
    <hc:end2 x="width" y="cy"/>
  </hp:ellipse>
  ```
- **조치**: `<hp:oval>`을 제거하고 표준 `<hp:ellipse>` 및 4축 좌표 체계로 정규화함.

### 결함 3: 미검증 속성 `isReverseHV="0"` 오염 (MODERATE)
- **원인**: 이전 가설에서 제안되었던 `isReverseHV="0"`을 `hp:line`에 주입함.
- **정품 역공학 대조**: 정품 한컴 문서 전체에서 `isReverse` 속성은 0건 검출됨(오직 그림 요소의 `reverse="0"`만 존재).
- **조치**: `hp:line`에서 `isReverseHV="0"`을 완전 제거하고 순수 `<hc:pt0>`, `<hc:pt1>` 구조로 복원함.

---

## 3. 독립 검토자가 확인해야 할 핵심 파일 및 위치

1. **엔진 소스 코드**:
   - [`src/canvas/renderer/hwpxCanvasRenderer.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/hwpxCanvasRenderer.ts)
     - `renderRectXml`: 하이브리드 파라미터 및 `safeWidth`, `safeStyle`, `safeColor` 방어 검증 로직 확인.
     - `renderOvalXml`: `<hp:ellipse>` 태그 및 속성 일치 확인.
     - `renderLineXml`: `isReverseHV` 제거 확인.
2. **무수정 보존된 DOCX 및 공통 파일 (수정 금지 준수 확인)**:
   - `src/canvas/renderer/docxCanvasRenderer.ts` (Git diff 없음)
   - `src/canvas/parser/figmaCanvasParser.ts` (Git diff 없음)
   - `src/canvas/parser/docxCanvasParser.ts` (Git diff 없음)
   - `src/canvas/geometry/svgPathParser.ts` (Git diff 없음)
   - `src/canvas/types.ts` (Git diff 없음)
3. **신규 생성된 HWPX 산출물**:
   - `debug/hwpx-phase21/stage1-korean-text.hwpx` ~ `stage7-full-report.hwpx` (7종)
   - `debug/hwpx-phase21/diag-rect-only.hwpx`
   - `debug/hwpx-phase21/diag-line-only.hwpx`
   - `debug/hwpx-phase21/diag-ellipse-only.hwpx`
   - `debug/hwpx-phase21/diag-polygon-only.hwpx`
4. **Phase 20 원본 보존본 (대조군)**:
   - `debug/hwpx-phase20-baseline/stage1` ~ `stage7.hwpx`
5. **독립 검증용 통합 Ingest**:
   - `PHASE21_ARGON_REINGEST.txt` (프로젝트 루트)

---

## 4. 권장 검증 절차 (Verification Steps for Argon)

Argon 모델은 다음 단계에 따라 검토를 진행하기를 권장한다:

1. **Zero-Regression 검증**:
   - DOCX 핵심 렌더러와 공통 타입이 단 1바이트도 수정되지 않았는지 확인.
   - Vitest 362개 테스트가 100% 통과하는지 확인.
2. **`undefined` 속성 누출 검증**:
   - `debug/hwpx-phase21/`의 모든 산출물 `Contents/section0.xml`에서 `grep -i "undefined"` 결과가 0건인지 확인.
3. **태그 및 스키마 검증**:
   - 타원이 `<hp:oval>`이 아닌 공식 `<hp:ellipse>`로 직렬화되었는지 확인.
   - 선에 `isReverseHV` 속성이 존재하지 않는지 확인.
4. **대조군 비교**:
   - `debug/hwpx-phase20-baseline/stage3-rect-line.hwpx`의 `Contents/section0.xml`과 `debug/hwpx-phase21/stage3-rect-line.hwpx`의 `Contents/section0.xml`의 diff를 통해 `color="#undefined"` 결함이 완전히 제거되었음을 확인.

