# Figma2Word — Step 4A: FAQ 텍스트 폭 고갈 원인 분리 및 최소 수정 설계 보고서

## 1. 개요 및 기준 상태 확인

본 문서는 실제 Figma2Word 웹 UI로 생성한 산출물(`Final-Prj-Real-After-Step3.docx`)의 FAQ 답변 영역에서 본문 텍스트가 4~5자 단위로 비정상 줄바꿈되는 현상의 근본 원인을 OpenXML 구조 및 Microsoft Word COM 렌더링 엔진 수준에서 정밀 추적하고, 안전한 최소 수정 설계를 제시한다.

- **작업 기준 Git HEAD**: `69b25e9b6fb643c23e0eaeaddbe13e970b8fe64b`
- **작업 원칙**: 제품 코드 수정 0건, Git 커밋 및 원격 푸시 금지, 기존 진단 및 검증 문서 100% 보존.

---

## 2. FAQ 영역 정밀 추적 (OpenXML 및 Word COM 측정)

`Final-Prj-Real-After-Step3.docx`의 26페이지(기존 30페이지)에 위치한 FAQ 질문 및 답변 영역을 정밀 추적한 결과:

### (1) 식별된 텍스트 및 위치
- **FAQ 질문**: `"커뮤니티 포인트를 어떻게 사용하나요?"` (Page 26, offset 481474)
- **FAQ 답변**: `"작성하신 후기와 질문 답변으로 적립된 포인트는 제휴된 워케이션 스페이스 예약 시 현금처럼 할인 혜택으로 사용하실 수 있습니다."` (Page 26, offset 483228)

### (2) 전체 부모 계층 및 단계별 속성
본문은 `<w:body>` 내에서 다음과 같은 4단계 중첩 테이블 구조를 갖는다:

```
[Level 1 Table] offset 407868 (루트 페이지 컨테이너)
  - tblW: pct="5000" (100%), tblGrid: gridCol="9026" dxa (451.3 pt)
  - Row 1 / Cell 1: tcW: pct="3850", tcMar: 0 dxa
    |
    v
[Level 2 Table] offset 419926 (사이드바 2열 레이아웃)
  - tblW: pct="5000" (100%), tblGrid: gridCol="1805" dxa (좌측 사이드바) + gridCol="7221" dxa (우측 본문 영역)
  - Row 1 / Cell 2: tcW: pct="4000" (80%), tcMar: 0 dxa (폭 7221 dxa / 361.05 pt)
    |
    v
[Level 3 Table] offset 479298 (FAQ 개별 카드 외곽 박스)
  - tblW: pct="5000" (100%), tblGrid: gridCol="7221" dxa (361.05 pt)
  - tblBorders: single, color="F1F5F9", sz="6" (0.75 pt)
  - Row 1 / Cell 1: tcBorders="F1F5F9", tcMar: 0 dxa, shd="FFFFFF"
    |
    +---> [Level 4 Table A: Question] offset 480184
    |       - tblW: pct="5000", tblGrid: gridCol="6932" + gridCol="289" dxa
    |       - Row 1 / Cell 1 (질문): tcW: pct="4800" (96%, 6932 dxa), tcMar: 0 dxa
    |       - Row 1 / Cell 2 (빈 Spacer/Chevron): tcW: pct="200" (4%, 289 dxa / 14.45 pt), tcMar: 0 dxa
    |
    +---> (테이블 간 분리 문단 <w:p> 부재: </w:tbl><w:tbl> 직접 접촉)
    |
    +---> [Level 4 Table B: Answer] offset 481955
            - tblW: pct="5000", tblGrid: gridCol="7221" dxa
            - tblBorders: single, color="F8FAFC", sz="6" (0.75 pt)
            - Row 1 / Cell 1 (답변): tcW 속성 없음 (<w:tcW> 태그 누락!)
            - tcMar: top="240", left="360", bottom="360", right="360" dxa (좌우 각각 18 pt)
```

### (3) Microsoft Word COM 실제 렌더링 측정 수치
Microsoft Word COM Automation(`word.Documents.Open`)을 통해 해당 영역의 실제 레이아웃 치수를 직접 조회한 결과:

- **질문 셀 (Row 1, Cell 1)**:
  - 실제 렌더링 너비: **336.35 pt**
  - 패딩: 좌우 0 pt
  - 상태: 정상 (한 줄에 여유 있게 출력)
- **Spacer 셀 (Row 1, Cell 2)**:
  - 실제 렌더링 너비: **3.25 pt**
- **답변 셀 (Row 2, Cell 1)**:
  - 실제 렌더링 너비: **82.35 pt (1,647 dxa)**
  - 패딩: 좌측 18 pt, 우측 18 pt (합계 36 pt)
  - **최종 가용 본문 폭**: `82.35 pt - 36 pt = 46.35 pt (927 dxa)`
  - **줄당 글자 수**: 11pt 한글 기준 글자당 약 11pt 소요 -> `46.35 / 11 = 4.2자`
  - **실제 Word 렌더링 줄바꿈**: 정확히 **4~5자 단위 세로 줄바꿈** 발생 확인.

---

## 3. 원인 정밀 분리 (A / B / C 분석)

### [원인 A] 실제 Figma 디자인에서 의도된 좁은 영역인가? -> **부정 (추정)**
- Figma 원본 화면(웹사이트 FAQ 섹션)에서 질문과 답변 카드는 데스크톱 1440px 해상도 기준 너비 약 800~900px의 가로형 아코디언 카드다.
- 답변 텍스트만 우측 82pt(~110px) 너비로 고정되도록 디자인되었을 가능성은 거의 없으며, 정상적인 좌우 정렬 카드 레이아웃이다.

### [원인 B] Figma Auto Layout Spacer의 별도 컬럼 변환 -> **부분적 기여**
- 질문 영역(Level 4 Table A)에서 질문 텍스트 우측에 위치한 빈 노드(또는 미렌더링된 아코디언 화살표 아이콘)가 `columnWidths: [96, 4]`로 계산되어 2열 테이블(`gridCol="6932"` + `gridCol="289"`)을 생성하였다.
- 이 Spacer 컬럼 자체는 4%(`289 dxa`, Word COM 실측 `3.25 pt`)로 작아 질문 텍스트에는 큰 영향을 주지 않았으나, **테이블 그리드에 2열 구조를 부여하는 트리거**가 되었다.

### [원인 C] DOCX 렌더러의 OpenXML 규격 및 너비 계산 결함 -> **핵심 직접 원인 (확정)**
결정적인 원인은 DOCX 렌더러([src/renderer/docxRenderer.ts](file:///c:/Users/77/Documents/Figma2Word/src/renderer/docxRenderer.ts))에 있는 두 가지 상호작용 결함이다:

1. **연속된 테이블 사이의 분리 문단(`<w:p>`) 누락 ([src/renderer/docxRenderer.ts:986-993](file:///c:/Users/77/Documents/Figma2Word/src/renderer/docxRenderer.ts#L986-L993))**:
   - `renderSequence`는 자식 요소 사이에 `gapPt > 0`일 때만 빈 Paragraph를 추가한다.
   - FAQ 카드의 세로 자식 간 `gap`이 0이거나 미지정된 경우, Table A(질문)와 Table B(답변)가 OpenXML 상에서 `</w:tbl><w:tbl>`로 맞닿아 렌더링된다.
   - **Microsoft Word 엔진의 사양**: OpenXML에서 두 개의 `<w:tbl>`이 문단 구분자 없이 연속되면, Word는 이를 **하나의 복합 테이블(Compound Table)** 로 병합하여 처리한다.
2. **1×1 TableCell의 `<w:tcW>` 너비 속성 누락 ([src/renderer/docxRenderer.ts:679-695](file:///c:/Users/77/Documents/Figma2Word/src/renderer/docxRenderer.ts#L679-L695))**:
   - 가로 다단 테이블(lines 560-618)은 `TableCell` 생성 시 `width: { size: colWidthPercent, type: WidthType.PERCENTAGE }`를 지정하지만,
   - 카드 스타일 1×1 테이블(lines 679-695) 및 Shape 1×1 테이블(lines 473-495)은 `TableCell`에 `width` 옵션을 전혀 전달하지 않는다.
   - 따라서 Table B의 유일한 셀에는 `<w:tcW>`가 생성되지 않는다.
3. **두 결함의 결합 효과**:
   - Word는 앞선 Table A의 2열 그리드(`Col 1: 336 pt`, `Col 2: 3.25 pt`) 바로 뒤에 이어진 Table B의 단일 셀을 2번째 행(Row 2)으로 간주한다.
   - Row 2의 셀에 `gridSpan="2"`나 명시적 `<w:tcW>`가 없으므로, Word의 중첩 테이블 Auto-fit 엔진은 이 셀의 너비를 100%로 확장하지 못하고 극도로 좁은 **82.35 pt**로 강제 축소(Starvation)시킨다.

---

## 4. 수정 방안 비교 및 평가

| 수정 방안 | 구현 위치 | 장점 | 단점 및 회귀 위험 | 채택 여부 |
|---|---|---|---|---|
| **방안 1: 테이블 간 안전 분리 문단 보장** | `docxRenderer.ts:renderSequence` | 연속된 테이블이 비정상적으로 한 테이블로 병합되는 OpenXML 결함을 원천 차단 | 테이블 사이에 미세한 수직 여백이 생길 수 있으므로 `spacing: { before: 0, after: 0 }` 필수 | **권장 (핵심)** |
| **방안 2: 1×1 TableCell에 명시적 `tcW` (100%) 부여** | `docxRenderer.ts:renderContainerBody` | 1×1 테이블 셀이 부모 폭을 100% 온전히 사용하도록 OpenXML 수준에서 보장 | 없음 (1×1 테이블은 본래 전폭을 차지해야 하는 카드) | **권장 (핵심)** |
| **방안 3: 빈 Spacer 셀의 너비 보존/흡수** | `layoutEngine.ts` / `docxRenderer.ts` | 불필요한 2열 분할 방지 | 아이콘 등 의도적으로 좁은 2열 레이아웃과의 구분이 필요하여 범위가 커짐 | 보조 검토 |
| **방안 4: 미세 외곽선(#F8FAFC) 평탄화** | `docxRenderer.ts:renderSafeIdenticalWrapper` | 중첩 테이블 계층 자체를 제거하여 폭 고갈 문제 해결 | 외곽선 시각 정보 변경 위험 (사전 승인 필요) | 후속 단계 |
| **방안 5: 텍스트 셀 일괄 최소 폭 강제** | `docxRenderer.ts` | 텍스트가 좁아지는 현상 방지 | 의도적으로 좁은 배지, 카운터, 아이콘 셀 레이아웃 붕괴 (회귀 위험 큼) | **비권장** |

### 가장 작고 안전한 최소 수정 방안 (Minimum Safe Fix)
**방안 1과 방안 2의 조합**:
1. `renderContainerBody`의 1×1 Table 생성 시 `TableCell`에 `width: { size: 100, type: WidthType.PERCENTAGE }`를 명시적으로 부여한다.
2. `renderSequence`에서 연속된 Table 요소 사이에 높이 0의 빈 문단(`<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`)을 삽입하여 Word의 비정상 테이블 병합을 방지한다.

> **사전 승인 준수 확인**:
> 미세 외곽선 제거, 전역 최소폭 일괄 강제, Spacer 일괄 삭제, 전체 테이블 평탄화, A4 방향 변경 등은 일절 포함하지 않는다.

---

## 5. 회귀 테스트 설계

다음 5대 핵심 시나리오를 검증하는 테스트 스위트를 설계한다:

```typescript
describe("FAQ Text Width and Adjacent Table Isolation", () => {
  // 1. FAQ 질문(2열: 텍스트+Spacer) + 답변(1x1 카드) 구조
  it("ensures nested 1x1 table cell has explicit 100% width and does not shrink", () => { ... });

  // 2. 연속된 두 개의 Table 사이에 분리 문단이 존재하여 Word 병합 방지
  it("inserts zero-spacing separator paragraph between adjacent tables in sequence", () => { ... });

  // 3. 아이콘 + 텍스트 검색창 (의도적으로 좁은 24px 아이콘 컬럼 유지)
  it("preserves intentionally narrow icon column in search bar without distortion", () => { ... });

  // 4. 정상적인 2열/3열 카드 그리드 레이아웃 보존
  it("maintains correct columnWidths in 3-column desktop card rows", () => { ... });

  // 5. 가시적 외곽선과 배경색을 가진 1x1 컨테이너의 테두리 보존
  it("preserves visible border and padding on single-child cards", () => { ... });
});
```

---

## 6. 결론 및 대기

1. FAQ 답변의 4~5자 줄바꿈은 단순 중첩 테이블 문제가 아니라, **(1) 연속된 테이블 간 문단 구분자 누락으로 인한 Word 엔진의 비정상 테이블 병합**과 **(2) 1×1 TableCell의 `<w:tcW>` 누락**이 결합되어 Word가 답변 셀 너비를 **82.35 pt**로 강제 축소한 결과임이 실측 데이터로 명확히 입증되었다.
2. 제품 코드 수정 없이 조사를 완료하였으며, 사용자 지시를 기다린다.

