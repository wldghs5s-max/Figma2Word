# Figma2Word — Phase 25: 작업 E — DOCX 렌더러 근본 원인 분석 및 해결 방안 보고서

**문서 번호**: P25-DELIV-05  
**작성 일자**: 2026-10-20  
**대상 파일**: `src/canvas/renderer/docxCanvasRenderer.ts`  
**분석 책임**: Antigravity REA Document Engine Team  

---

## 1. 개요

본 문서는 실전 웹 UI 디자인 변환 시 발생한 치명적 시각적 결함(페이지 겹침, 다중 화면 충돌, 비정상적 개행 등)의 근본 원인을 OOXML(OpenXML) 및 Word VML 렌더링 엔진 관점에서 규명하고, 프로덕션 반영을 위한 무결성 검증 해결책을 제시한다.

---

## 2. 결함 1: 동일 규격 인접 페이지의 캔버스 충돌 (Multi-Page Canvas Collision)

### 2.1 결함 현상
사용자가 관찰한 *"일부 페이지는 텍스트 줄바꿈, 객체 배치, 페이지 규격 등의 문제로 크게 무너진다"* 현상의 가장 결정적인 원인은 **여러 개의 독립된 아트보드 화면이 한 페이지 위에 그대로 겹쳐서 출력**된 것이었다.

- Page 1: `디자인 시스템 1` (1920×1080) 위에 `디자인 시스템 2` (1920×1080)가 100% 겹쳐 출력됨.
- Page 7: `촬영계획` (1449×1083) 위에 `촬영계획 - 건물을 선택시` (1449×1083)가 겹쳐 출력됨.
- Page 15: `신규등록 - 2` (1920×1170) 위에 `사업목록 클릭 시` (1920×1170)가 겹쳐 출력됨.

이로 인해 총 18개의 프레임 중 3번의 겹침이 발생하여 실제 Word에는 15페이지만 나타났으며, 겹쳐진 페이지는 글자와 도형이 뒤엉켜 완전히 파손된 형상을 보였다.

### 2.2 근본 원인 코드 분석

`src/canvas/renderer/docxCanvasRenderer.ts` (lines 268-285):

```typescript
// 이전 구현
for (let pIdx = 0; pIdx < doc.pages.length; pIdx++) {
  // ...
  const nextDiffers = nextW !== currW || nextH !== currH || nextOrient !== currOrient;
  if (nextDiffers) {
    sectPr = renderSectionPr(currW, currH, currOrient, "nextPage");
  } else if (!isLast) {
    // 규격이 같으면 일반 페이지 브레이크만 적용
    pageBreakXml = '<w:r><w:br w:type="page"/></w:r>';
  }
}
```

### 2.3 Word OOXML 렌더링 메커니즘 분석
1. **VML 절대 좌표계의 참조 기준**:
   - Figma2Word의 모든 UI 요소는 VML `<v:shape>` 및 `<v:rect>`로 직렬화되며, `style="position:absolute;left:...;top:..."` 속성을 갖는다.
   - Word에서 VML 도형의 절대 위치는 **현재 섹션(Section)의 여백 및 원점**을 기준으로 렌더링된다.
2. **일반 페이지 브레이크(`<w:br w:type="page"/>`)의 한계**:
   - 일반 페이지 나누기는 본문 텍스트의 텍스트 흐름(Flow Text) 커서만 다음 페이지로 넘긴다.
   - **새로운 VML 드로잉 캔버스(Drawing Canvas Context)를 생성하지 못한다.**
   - 따라서 동일한 섹션 내에서 일반 페이지 브레이크 뒤에 등장하는 VML 절대 좌표 요소들은, 이전 페이지의 (0, 0) 원점과 동일한 위치에 겹쳐서 그려진다!
3. **해결 원리**:
   - Word에서 절대 좌표 도형을 다음 페이지의 새로운 캔버스에 그리기 위해서는, 인접 페이지의 규격이 동일하든 다르든 **반드시 각 페이지 문단마다 독립된 섹션 브레이크(`<w:sectPr><w:type w:val="nextPage"/>...</w:sectPr>`)를 선언**해야 한다.

---

## 3. 결함 2: Auto-Resize 단일행 텍스트 박스 줄바꿈 (Typography Wrap)

### 3.1 결함 현상
`"대시보드 / 사업장 관리 / 사업 관리"`와 같이 한 줄로 완결되어야 하는 브레드크럼, 메뉴, 버튼 라벨에서 마지막 단어가 다음 줄로 강제 개행되면서 박스 하단으로 넘치거나 잘리는 현상.

### 3.2 근본 원인
1. Figma에서 `textAutoResize: "WIDTH_AND_HEIGHT"`로 설정된 텍스트는 박스 폭이 텍스트의 글리프 외곽선에 정확히 맞춰져 있다 (`width: 188px` → `141.0pt`).
2. Word에서 열람 시 Pretendard 웹폰트가 로컬 폰트나 시스템 글꼴로 대체되거나, Word의 DirectWrite 엔진이 줄 간격/자간을 계산할 때 1~3%의 너비 오차가 발생한다 (실제 필요 너비 약 `145~147pt`).
3. Word의 `<v:textbox>` 내부 문단(`<w:pPr>`)에 줄바꿈 방지 속성이 없으므로, Word는 너비가 1pt만 부족해도 공백 기준으로 즉시 단어를 다음 행으로 내려버린다.

### 3.3 해결책
1. `textAutoResize === "WIDTH_AND_HEIGHT"`인 단일행 텍스트 박스에 대해:
   - `<w:pPr>`에 `<w:noWrap/>`을 추가하여 Word가 텍스트 박스 폭을 이유로 줄을 강제로 나누지 않도록 보장함.
   - 글꼴 메트릭 오차를 수용할 수 있도록 너비에 안전 완충 여백(`+4pt` 또는 `+2.5%`)을 미세하게 부여함.
2. 이 조치는 다행 텍스트(`textAutoResize === "HEIGHT"` 또는 명시적 엔터가 포함된 문단)에는 영향을 주지 않으므로, 설명글이나 본문의 정상적인 자동 줄바꿈은 완벽히 보존됨.

---

## 4. 결함 3: 플러그인 치수 가이드 프레임 오인식

### 4.1 결함 현상
Node `763:5084` (`📏 Container`)가 35인치 거대 페이지로 렌더링되어 Word의 최대 페이지 크기 한계(22인치)를 초과함.

### 4.2 근본 원인
`FigmaCanvasParser.discoverPageFrames()`에서 `child.type === "GROUP"`을 무조건 페이지 후보로 수용함.

### 4.3 해결책
- `child.type === "GROUP"`인 경우, 측정 도구/플러그인 명명 패턴(`📏`, `Container`, `Redline`, `Measure`, `INNER_PADDING`, `OUTER_SPACING` 등)을 검사하여 자동 필터링함.

---

## 5. 프로덕션 구현 계획 및 검증 기준

### 5.1 `docxCanvasRenderer.ts` 수정 사양
```typescript
// 모든 페이지 문단(pPr)에 해당 페이지 규격의 sectPr 방출 (마지막 페이지 제외)
if (!isLast) {
  pPrXml = `<w:pPr>
  <w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>
  <w:autoSpaceDE w:val="0"/>
  <w:autoSpaceDN w:val="0"/>
  <w:sectPr>
    <w:type w:val="nextPage"/>
    <w:pgSz w:w="${curWidthTwips}" w:h="${curHeightTwips}" w:orient="${curOrient}"/>
    <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>
  </w:sectPr>
</w:pPr>`;
}
// 마지막 페이지의 섹션 규격은 <w:body>의 최하단에 단독 배치
```

### 5.2 부작용 방지 및 Stage 6·7 보존
1. **기존 A4 보고서 무결성**:
   - A4 세로/가로 혼합 문서에서도 각 페이지가 독립 섹션으로 분리되므로, 기존 Stage 6·7 테스트 케이스는 동일하게 통과함.
2. **HWPX 렌더러 보호**:
   - 본 수정은 DOCX 전용 렌더러(`docxCanvasRenderer.ts`)에 한정되며, `hwpxCanvasRenderer.ts`의 수식이나 문단 구조를 건드리지 않음.
3. **하드코딩 금지 준수**:
   - 특정 노드 ID나 고객사 명칭을 하드코딩하지 않고, OpenXML 표준 규약과 일반화된 기하학적 로직으로만 해결함.
