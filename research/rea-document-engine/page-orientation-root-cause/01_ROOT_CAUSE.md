# HWPX 페이지 방향 불일치(Landscape Inversion) 원인 조사 및 근본 분석 보고서

**작성일**: 2026-10-18  
**대상 리포지토리**: `wldghs5s-max/Figma2Word`  
**기준 커밋**: `1d54800` (Phase 23.1)  
**결함 명칭**: HWPX Page Orientation 180° Inversion Defect (OWPML KS X 6101 규격 오해석)  

---

## 1. 핵심 요약 (Executive Summary)

- **현상**: Figma 원본 디자인과 DOCX 출력물은 정상적인 **세로형(Portrait)** 문서로 생성되었으나, HWPX 출력물만 한컴오피스 2024 뷰어에서 **가로형(Landscape)** 페이지로 열리는 심각한 방향 불일치가 발생함.
- **근본 원인**: 대한민국 국가표준 KS X 6101 (OWPML) 명세서에서:
  - `landscape="WIDELY"`: **세로형 (Portrait, 종)** 모드를 의미함.
  - `landscape="NARROWLY"`: **가로형 (Landscape, 횡)** 모드를 의미함.
  그러나 이전 개발자(`hwpxCanvasRenderer.ts`, Phase 18 커밋 `f1229d7`)가 영단어 직관(wide=넓다=가로, narrow=좁다=세로)에 의존하여 `isLandscape ? "WIDELY" : "NARROWLY"`로 **정반대로 구현함**.
- **치명적 파급 효과**: 세로 841.89pt(A4 높이)를 의도한 Stage 6 및 Stage 7 보고서가 가로 뷰포트(높이 595.28pt)로 강제 해석되면서, 595pt 아래에 배치된 모든 본문, 표, 카드, 푸터 요소들이 가상 페이지 경계에 의해 잘리거나 비정상적인 줄바꿈 및 객체 충돌을 유발함.
- **해결**: `landscapeAttr = isLandscape ? "NARROWLY" : "WIDELY"`로 교정하고, OWPML 규격에 따라 용지 기본 좌표계(portrait-base, width <= height)를 확립함.

---

## 2. 9대 포렌식 질의에 대한 상세 규명

### Q1. 현재 HWPX가 가로형으로 생성된다는 사실을 기존 코드나 테스트에서 인지하고 있었는가?
> **답변: 코드 작성자는 인지하지 못했으며, 오히려 역방향 매핑을 "정상"으로 오인하여 테스트에 강제 Asserting하고 있었습니다.**

- 코드 증거: `src/canvas/renderer/hwpxCanvasRenderer.ts` 라인 401:
  ```typescript
  const isLandscape = pageWidthPt > pageHeightPt;
  const landscapeAttr = isLandscape ? "WIDELY" : "NARROWLY";
  ```
  세로 문서(`pageWidthPt <= pageHeightPt`)일 때 `isLandscape = false`이므로 `landscapeAttr = "NARROWLY"`가 출력되었습니다.
- 테스트 증거: `tests/phase17-quality-integration.test.ts` 라인 279~281 및 `tests/phase18-architecture-fidelity.test.ts` 라인 95~96:
  ```typescript
  // Page 1 is NARROWLY, Page 2 is WIDELY
  expect(secXml).toContain('landscape="NARROWLY" width="59528" height="84189"');
  expect(secXml).toContain('landscape="WIDELY" width="84189" height="59528"');
  ```
  테스트 코드 주석에 `// Page 1 is NARROWLY, Page 2 is WIDELY`라고 명시되어 있어, 개발자가 세로=NARROWLY, 가로=WIDELY라고 확신하고 테스트 기댓값 자체를 거꾸로 하드코딩해 두었습니다.

---

### Q2. 인지하고 있었다면 왜 정상이라고 판단했는가?
> **답변: OWPML 국가표준(KS X 6101) 및 실제 한컴 생성 레퍼런스 문서를 대조하지 않고, 영어 단어의 사전적 의미("Narrow" = 폭이 좁은 세로, "Wide" = 폭이 넓은 가로)로 자의적 추론을 내렸기 때문입니다.**

한컴오피스 내부 엔진에서 용지 방향 열거형은:
- `0`: WIDELY (한컴 기본 세로 방향, 종(縱)방향)
- `1`: NARROWLY (한컴 가로 방향, 횡(橫)방향)
으로 정의되어 있습니다. 이를 모른 상태에서 단어의 뜻만 보고 반대로 코딩한 것입니다.

---

### Q3. 인지하지 못했다면 왜 Phase 20~23.1까지 발견하지 못했는가?
> **답변: 다음 세 가지 요인이 복합 작용하여 발견이 지연되었습니다.**

1. **자동화 테스트의 검증 맹점**: 기존 Vitest 테스트(`hwpx-schema-conformance.test.ts` 등)는 ZIP 패키지 무결성, XML Well-formedness, `charPr`/`paraPr` 누락 여부, 셰이프 개수만 검사했습니다.
2. **한컴 2024 뷰어의 에러 미출력**: `landscape="NARROWLY"`는 OWPML 규격상 유효한 XML 속성이므로 한컴 뷰어가 XML 파싱 오류나 충돌을 일으키지 않고 단순히 가로 모드로 깨끗하게 열렸습니다.
3. **디버깅 관심사의 국소화 (Local Fixation)**: Phase 20~23.1 동안 사용자와 AI 모두 텍스트 겹침 현상의 원인을 `lineWrap`, `BREAK_WORD`, `textMargin`, `snapToGrid`, CJK 폰트 폭 계산 등 인라인 텍스트 속성 레벨에서만 탐색하느라, 최상위 컨테이너인 페이지 방향(Page Orientation)을 의심하지 못했습니다.

---

### Q4. HWPX Renderer는 페이지 방향을 어떤 데이터와 로직으로 결정하고 있는가?
> **답변: `CanvasDocument.pages[i].bounds` 및 `CanvasDocument.pageSize`의 너비와 높이를 비교하여 결정합니다.**

- 추출 로직:
  ```typescript
  const pageWidthPt = page.bounds.width || doc.pageSize.widthPt || 595.28;
  const pageHeightPt = page.bounds.height || doc.pageSize.heightPt || 841.89;
  const isLandscape = pageWidthPt > pageHeightPt;
  ```
- 데이터 추출 자체는 정확했으나, 마지막 XML 직렬화 삼항연산자에서 토큰 매핑이 뒤집혔습니다.

---

### Q5. Canonical JSON의 페이지 크기와 방향 메타데이터를 올바르게 읽고 있는가?
> **답변: 네, Canonical JSON의 `bounds.width = 595.28`, `bounds.height = 841.89`를 100% 온전하게 읽고 있었습니다.**

Canonical JSON 내부의 데이터는 전혀 손상되지 않았으며, `DocxCanvasRenderer`는 동일한 Canonical JSON을 읽어 완벽한 세로형 DOCX를 생성했습니다.

---

### Q6. DOCX Renderer와 HWPX Renderer가 동일한 페이지 메타데이터를 사용하고 있는가?
> **답변: 네, 두 렌더러 모두 동일한 `CanvasDocument` AST를 입력으로 받습니다.**

- `DocxCanvasRenderer.ts`:
  ```typescript
  const curIsLandscape = pageWidthPt > pageHeightPt;
  const curOrient = curIsLandscape ? "landscape" : "portrait";
  // 출력: <w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/> (정상 세로)
  ```
- `HwpxCanvasRenderer.ts` (수정 전):
  ```typescript
  const isLandscape = pageWidthPt > pageHeightPt; // false
  const landscapeAttr = isLandscape ? "WIDELY" : "NARROWLY"; // "NARROWLY" (오류: 가로 강제)
  ```

---

### Q7. HWPX 페이지 방향이 세로와 가로가 뒤바뀌어 있는가?
> **답변: 100% 확실하게 뒤바뀌어 있었습니다 (Ground Truth 검증 완료).**

- 실제 한컴 공식 생성 파일(`완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`):
  ```xml
  <hp:pagePr landscape="WIDELY" width="59530" height="84190" gutterType="LEFT_ONLY">
  ```
  이 파일은 실제 한컴 2024에서 완벽한 **A4 세로**로 열립니다.
- 기존 생성 파일(`stage7-full-report.hwpx`):
  ```xml
  <hp:pagePr landscape="NARROWLY" width="59528" height="84189" gutterType="LEFT_ONLY">
  ```
  이 파일은 실제 한컴 2024에서 **A4 가로**로 열렸습니다.

---

### Q8. 기존 회귀 테스트나 AST 비교 도구가 왜 이 차이를 잡지 못했는가?
> **답변:**
1. `scripts/compare_hwpx_ast.py`는 ZIP 엔트리, `secCnt`, 헤더 버전, 도형(rect, pic, line 등) 개수만 카운트하고 `<hp:pagePr>`의 `landscape` 속성을 추출 및 비교하지 않았습니다.
2. 기존 테스트(`phase17`, `phase18`)는 거꾸로 된 매핑(`portrait -> NARROWLY`)을 기댓값으로 Assert하고 있었으므로, 버그가 발생했을 때 오히려 테스트가 통과하는 "순환 오류(Confirmation Bias)" 상태였습니다.

---

### Q9. 이 페이지 방향 불일치가 Stage 6과 Stage 7의 텍스트 겹침과 어떻게 연결되는가?
> **답변: 사용 가능한 수직 높이(Vertical Budget)의 강제 압축과 뷰포트 클리핑이 발생했습니다.**

- A4 세로 문서의 의도된 높이는 **841.89pt**입니다.
- 가로형 모드로 강제 열람되면 뷰어 화면의 세로 가용 높이가 **595.28pt**로 축소됩니다.
- Stage 6 및 7의 하단 요소(y = 600pt ~ 800pt 영역의 본문 카드, KPI 요약, 차트 범례, 페이지 푸터)는 뷰어 관점에서 페이지 범위를 초과하는 것으로 간주되어:
  1. 가상 페이지 분할로 인해 하단 텍스트가 잘리거나 뒤로 밀림
  2. 컨테이너 높이 계산 불일치로 인해 위/아래 객체가 중첩(Overlap)
  3. 좌우 폭(841pt)과 상하 높이(595pt)의 종횡비 왜곡으로 텍스트박스 줄바꿈 후 아래 요소 충돌 가속화
  라는 복합적인 시각 결함의 근원적 트리거로 작용했습니다.

