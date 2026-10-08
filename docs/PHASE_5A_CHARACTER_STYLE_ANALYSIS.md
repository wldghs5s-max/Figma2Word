# Phase 5-A 사전 분석: Figma Character Style Overrides

작성일: 2026-10-08
기준 Git Commit: `b7f5e6f` (`chore(phase-4.2): checkpoint step-2b6 and handover`)
선행 완료 상태: Phase 4.2 완료 (`docs/PHASE_4_2_COMPLETION.md`), Phase 5 로드맵 확정 (`docs/PHASE_5_ROADMAP_ANALYSIS.md`)
목적: **구현 착수 전 사전 기술 분석, 아키텍처 호환성 검증, Unicode/Index 안전성 평가 및 최소 구현 범위 확정** (코드 수정 일절 없음)

---

## 1. 현재 텍스트 파싱 구조

### 1.1 소스 코드 위치 및 흐름
- **파일명**: [`src/parser/figmaParser.ts`](file:///c:/Users/77/Documents/Figma2Word/src/parser/figmaParser.ts)
- **함수명**: `parseText(node: FigmaNode): HeadingElement | ParagraphElement` (라인 316 ~ 360)

### 1.2 현재 실제 변환 로직 분석
```typescript
// src/parser/figmaParser.ts (Lines 316-360)
private parseText(node: FigmaNode): HeadingElement | ParagraphElement {
  const text = node.characters || "";
  const style = node.style || {};

  const color = this.extractFillColor(this.textFills(node));
  const fontSize = style.fontSize ? Math.round(style.fontSize * 0.75) : 11; // px to pt approx

  const textStyle: TextStyle = {
    fontFamily: style.fontFamily || "Calibri",
    fontSize,
    fontWeight: this.mapFontWeight(style.fontWeight),
    italic: style.italic || false,
    underline: style.textDecoration === "UNDERLINE",
    strike: style.textDecoration === "STRIKETHROUGH",
    color: color || { r: 0, g: 0, b: 0, a: 1, hex: "000000" },
  };

  const alignment: Alignment = this.mapAlignment(style.textAlignHorizontal);
  const isHeading = this.isHeadingText(node, text, fontSize);

  if (isHeading) {
    ...
    return {
      id: node.id,
      type: "heading",
      level,
      alignment,
      runs: [{ type: "run", text, style: textStyle }], // <--- 단일 Run 고정
    };
  }

  return {
    id: node.id,
    type: "paragraph",
    alignment,
    runs: [{ type: "run", text, style: textStyle }], // <--- 단일 Run 고정
  };
}
```

### 1.3 핵심 결론 (Q1 답변)
현재 `figmaParser.ts`는 Figma `TEXT` 노드의 `characters` 전체 문자열을 노드 레벨 스타일(`node.style`) 하나만 적용하여 **항상 길이가 1인 단일 `TextRun` 배열(`runs: [{ type: "run", text, style: textStyle }]`)로 축약**하고 있다.
Figma AST에 글자별 부분 서식이 존재하더라도, 현재 파서는 이를 완전히 무시하고 첫 번째 기본 스타일로 전체 문단을 통일시켜버린다.

---

## 2. 실제 Figma Character Style Override 구조

### 2.1 저장소 내 실측 데이터 조사 결과 (Q3 답변)
- **조사 대상**: `samples/` 및 `debug/` 하위의 모든 Figma JSON 파일 (21개 JSON 파일 전수 조사).
- **조사 결과**:
  - `samples/figma/` (`simple-document.json`, `card-layout.json` 등)
  - `samples/real-world/` (`sample-a-proposal-doc.json`, `sample-b-nested-autolayout.json` 등)
  - `samples/layout/` (`layout-p1-*.json`)
  > **"현재 저장소의 로컬 mock fixture 및 샘플 JSON에는 `characterStyleOverrides`와 `styleOverrideTable`이 포함된 노드가 존재하지 않는다."**
  - 현재 저장소의 모든 샘플은 `characters`, `style`, `fills` 단일 서식만 포함하고 있다.
  - 또한 [`src/parser/types.ts`](file:///c:/Users/77/Documents/Figma2Word/src/parser/types.ts)의 `FigmaNode` 인터페이스에도 `characterStyleOverrides`와 `styleOverrideTable` 속성이 **아직 정의되어 있지 않다**.

### 2.2 공식 Figma REST API 스펙 분석
공식 Figma REST API 사양에 따른 Rich Text 데이터 구조는 다음과 같다:

1. **`characters: string`**: 노드의 전체 원본 문자열.
2. **`style: TypeStyle`**: 노드의 기본(Base) 텍스트 스타일.
3. **`characterStyleOverrides: number[]`**:
   - 각 글자(UTF-16 코드 유닛) 위치에 대응하는 정수 배열.
   - 값 `0`: 기본 스타일(`node.style`) 사용.
   - 값 `N (N > 0)`: `styleOverrideTable[N]`에 정의된 스타일 오버라이드 적용.
   - 배열 길이가 `characters.length`보다 짧을 수 있음 (후속 글자들은 모두 `0`으로 간주, 트레일링 0 생략 최적화).
4. **`styleOverrideTable: Record<string | number, Partial<TypeStyle>>`**:
   - 스타일 ID를 키로 갖고, 기본 스타일에서 변경된 속성(예: `{ fontWeight: 700 }`, `{ fills: [...] }`)만 담고 있는 딕셔너리.

### 2.3 실제 3대 사례 분류
- **Case A — Override 없음 (기존 지원)**
  ```json
  {
    "characters": "Hello World",
    "style": { "fontFamily": "Calibri", "fontSize": 14 }
  }
  ```
  `characterStyleOverrides` 없음 → 단일 Run 유지.

- **Case B — 일부 단어만 강조 (단일 오버라이드)**
  ```json
  {
    "characters": "안녕하세요 홍길동님",
    "style": { "fontFamily": "Calibri", "fontSize": 14, "fontWeight": 400 },
    "characterStyleOverrides": [0, 0, 0, 0, 0, 0, 1, 1, 1, 0],
    "styleOverrideTable": {
      "1": { "fontWeight": 700, "fills": [{ "type": "SOLID", "color": { "r": 0, "g": 0.3, "b": 0.8 } }] }
    }
  }
  ```
  결과:
  - Run 1: `"안녕하세요 "` (기본 스타일, 400)
  - Run 2: `"홍길동"` (Override 1: 700 볼드, 파란색)
  - Run 3: `"님"` (기본 스타일, 400)

- **Case C — 여러 구간 복합 서식 (다중 오버라이드)**
  ```json
  {
    "characters": "계약금 100만원 / 할인 20%",
    "style": { "fontFamily": "Calibri", "fontSize": 14, "fontWeight": 400 },
    "characterStyleOverrides": [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 2, 2, 2, 2, 2],
    "styleOverrideTable": {
      "1": { "fontWeight": 700, "fills": [{ "type": "SOLID", "color": { "r": 0.1, "g": 0.5, "b": 0.1 } }] },
      "2": { "fontWeight": 700, "fills": [{ "type": "SOLID", "color": { "r": 0.9, "g": 0.1, "b": 0.1 } }] }
    }
  }
  ```
  결과: 5개 연속 구간으로 분할 렌더링.

---

## 3. 현재 Document Model 호환성 (Q2 및 Q5 답변)

### 3.1 모델 구조 정밀 검증
`src/model/elements.ts`와 `src/model/style.ts`의 스키마를 대조한 결과:

| 서식 속성 | Document Model (`TextStyle`) | 지원 여부 | 비고 |
| :--- | :---: | :---: | :--- |
| **fontFamily** | `fontFamily: z.string()` | **지원됨** | Calibri 기본값 |
| **fontSize** | `fontSize: z.number()` | **지원됨** | pt 단위 |
| **fontWeight** | `fontWeight: z.union(...)` | **지원됨** | number / "bold" / "normal" |
| **italic** | `italic: z.boolean()` | **지원됨** | boolean |
| **color** | `color: ColorSchema` | **지원됨** | r, g, b, a, hex |
| **opacity** | `color.a` (알파 채널) | **지원됨** | 0~1 부동소수점 |
| **underline** | `underline: z.boolean()` | **지원됨** | boolean |
| **strike** | `strike: z.boolean()` | **지원됨** | 취소선 지원 |
| **letterSpacing** | `letterSpacing: z.number()` | 모델에 있음 | DOCX 렌더러 미매핑 |
| **lineHeight** | `lineHeight: z.number()` | 문단 레벨 속성 | Run 레벨 속성 아님 (Word 제약) |

### 3.2 모델 채택 판정: **Option A (현재 TextRun[] 구조 100% 그대로 사용)**
- `ParagraphElement` 및 `HeadingElement`의 스키마는 이미 `runs: z.array(TextRunSchema)`로 정의되어 있다.
- 하나의 문단이 1개의 Run을 갖든, 10개의 Run을 갖든 Document Model 스키마를 단 1줄도 수정할 필요가 없다.
- **새로운 추상화 계층(Intermediate Model)을 만들지 않는다.**

---

## 4. DOCX Renderer 영향 분석 (Q6 답변)

### 4.1 렌더러 코드 검증
[`src/renderer/docxRenderer.ts`](file:///c:/Users/77/Documents/Figma2Word/src/renderer/docxRenderer.ts)의 텍스트 렌더링 경로:
```typescript
// docxRenderer.ts (Lines 240, 265, 284-301)
const runs = elem.runs.map((r) => this.renderTextRun(r));
return new Paragraph({
  ...
  children: runs,
});

private renderTextRun(modelRun: ModelTextRun): TextRun {
  const style = modelRun.style;
  const isBold =
    style?.fontWeight === "bold" ||
    (typeof style?.fontWeight === "number" && style.fontWeight >= 600) ||
    (typeof style?.fontWeight === "string" && parseInt(style.fontWeight, 10) >= 600);

  return new TextRun({
    text: modelRun.text,
    font: style?.fontFamily || "Calibri",
    size: style?.fontSize ? ptToHalfPt(style.fontSize) : 22,
    bold: isBold,
    italics: style?.italic,
    underline: style?.underline ? {} : undefined,
    strike: style?.strike,
    color: colorToHex(style?.color),
  });
}
```

### 4.2 렌더러 영향 판정: **Renderer 수정 불필요 (Zero Changes)**
- `DocxRenderer`는 이미 `elem.runs` 배열을 순회하며 각각의 `TextRun` 인스턴스를 독립된 서식(font, size, bold, italic, underline, strike, color)으로 생성하고 있다.
- 파서 단계에서 `runs` 배열의 원소 개수만 늘려주면, **DOCX Renderer는 단 한 줄의 코드 수정 없이 복수 Run 렌더링을 즉시 완벽하게 수행한다**.

---

## 5. LayoutEngine 영향 분석 (Q7 답변)

### 5.1 LayoutEngine 호출 위치 검증
파이프라인 상에서 `LayoutEngine`의 실행 지점:
```text
Canvas Nodes
     ↓
[LayoutEngine.processNodes(nodes: FigmaNode[])]  <--- 2D 공간 배치 계산
     ↓
[figmaParser.parseNodeToElements(node)]          <--- 그 후에 호출됨
     ↓
[figmaParser.parseText(node)]                    <--- 여기서 TextRun 분할
```

### 5.2 LayoutEngine 영향 판정: **LayoutEngine 수정 불필요 (Zero Changes)**
- `LayoutEngine`은 `TEXT` 노드의 `absoluteBoundingBox`(`x`, `y`, `width`, `height`)만을 사용하여 가로 행 클러스터링과 오버레이 폴딩을 수행한다.
- `LayoutEngine`은 텍스트 내부의 문자열, 글자 수, Run 서식에 일절 관여하지 않으며, 텍스트 줄바꿈 계산도 수행하지 않는다 (텍스트 줄바꿈은 Word 엔진의 자체 영역).
- 따라서 파서에서 `TextRun`이 분할되어도 **LayoutEngine의 연산 결과는 100% 동일하며 아무런 영향을 받지 않는다**.

---

## 6. Index / Unicode 위험성 분석 (Q4 답변)

Character Style Override 구현에서 가장 중요한 기술적 위험은 문자열 인덱싱 단위 불일치이다.

### 6.1 인덱싱 단위 검증
- **Figma API 인덱스 기준**: **UTF-16 코드 유닛 (Code Units)**.
- **JavaScript `string` 인덱스 기준**: **UTF-16 코드 유닛 (`str.length`, `str[i]`, `str.substring()`)**.
- Figma와 JavaScript 모두 내부적으로 UTF-16 인덱싱을 채택하고 있으므로, 기본적으로 인덱스가 1:1 일치한다.

### 6.2 다국어 및 특수문자 케이스 분석
1. **한글 (Hangul Syllables, U+AC00 ~ U+D7A3)**:
   - BMP(Basic Multilingual Plane) 영역에 속하므로 1글자 = 1 UTF-16 Code Unit.
   - `str.length`가 글자 수와 정확히 일치하며 인덱스 밀림 위험 전혀 없음.
2. **영문 / 숫자 / 일반 특수기호 (ASCII / BMP)**:
   - 1글자 = 1 UTF-16 Code Unit, 완전 안전.
3. **이모지 및 희귀 문자 (Surrogate Pairs, U+10000 이상, 예: 🚀, 👍, 🍎)**:
   - 1글자 = 2 UTF-16 Code Units (High Surrogate + Low Surrogate).
   - Figma에서도 이모지 1글자에 대해 `characterStyleOverrides` 배열에 2개의 슬롯이 할당되며, 두 슬롯 모두 동일한 스타일 ID를 갖는다.
   - **위험 시나리오**: 만약 오버라이드 경계가 이모지 한가운데를 가를 경우 (예: High Surrogate와 Low Surrogate의 ID가 다른 결함 데이터), `substring()`으로 자르면 글자가 깨져 ``로 변환됨.
   - **방어 대책 (Defensive Guard)**:
     - Run 분할 시 경계 인덱스가 서러게이트 페어(Surrogate Pair) 중간에 걸치지 않도록 `String.prototype.codePointAt()` 또는 `isHighSurrogate()` 검증 가드를 반드시 둔다.

---

## 7. 회귀 위험 분석 (Q8 답변)

Phase 4.2 완료 기준 101개 테스트에 미치는 영향:

### 7.1 안전하게 추가 가능한 영역
- `characterStyleOverrides`가 없는 기존 21개 테스트 파일의 모든 Text 노드는 기존과 동일하게 길이 1인 단일 `TextRun`을 생성하므로, **기존 101개 테스트는 100% 통과 유지**.

### 7.2 잠재적 위험 영역
- `node.characterStyleOverrides` 길이가 `node.characters`보다 짧거나 긴 비정상 입력(Malform)이 들어왔을 때 배열 인덱스 초과(`undefined`) 예외 발생 위험.
  → 방어 로직: `overrides[i] ?? 0` 기본값 보장.
- `styleOverrideTable`에 선언되지 않은 Style ID를 참조하는 경우.
  → 방어 로직: 테이블에 키가 없으면 기본 스타일 상속.

### 7.3 실제 Figma 샘플 부재에 따른 위험
- 현재 저장소 내에 `characterStyleOverrides`가 실제로 포함된 대형 JSON이 없으므로, 합성(Synthetic) Fixture를 정밀하게 작성하여 테스트를 입증해야 함.

---

## 8. 최소 구현 범위 (Phase 5-A MVP)

Phase 5-A에서 구현할 최소 변경 범위:

1. **타입 정의 보강 (`src/parser/types.ts`)**:
   - `FigmaNode`에 `characterStyleOverrides?: number[]`, `styleOverrideTable?: Record<string | number, FigmaTypeStyle>` 추가.
2. **파서 분할 로직 구현 (`src/parser/figmaParser.ts`)**:
   - `parseText()` 내에서 `characterStyleOverrides` 유무를 확인.
   - 없으면 기존 단일 Run 생성 경로 유지 (완전 동일).
   - 있으면 `buildTextRuns(node)` 헬퍼 함수를 통해 동일한 스타일 ID를 공유하는 연속 구간(Slice)별로 `TextRun[]` 생성.
   - `resolveRunStyle(baseStyle, overrideStyle)`를 통해 기본 스타일 위에 오버라이드 스타일(fontWeight, fills, fontSize, italic, underline 등)을 덮어씀(Merge).
3. **Renderer / Model / LayoutEngine 변경 일절 없음**:
   - 렌더러, 모델, 레이아웃엔진 코드는 단 한 글자도 수정하지 않음.

---

## 9. 테스트 전략 설계 (10개 시나리오)

`tests/character-style-overrides.test.ts`에 구축할 테스트 스위트 설계:

- **Test 1 (기존 하위 호환)**: `characterStyleOverrides`가 없는 노드는 정확히 1개 Run 반환.
- **Test 2 (단일 구간 볼드)**: `"Hello World"` 중 `"World"`만 볼드 적용 시 2개 Run 분할 및 각 텍스트/스타일 검증.
- **Test 3 (단일 구간 색상)**: `"경고: 확인 바랍니다"` 중 `"경고:"`만 빨간색 적용 시 색상 분할 검증.
- **Test 4 (글꼴 크기 차이)**: 단일 텍스트 내에서 큰 숫자와 작은 단위 텍스트(`"100"` 24pt, `"원"` 12pt) 분할 검증.
- **Test 5 (다중 연속 오버라이드)**: Case C와 같이 3개 이상의 상이한 스타일이 번갈아 나오는 텍스트 분할.
- **Test 6 (한글 인덱싱)**: 한글 완성형 문장(`"안녕하세요 홍길동님"`)의 글자 인덱스 일치 검증.
- **Test 7 (특수문자/이모지 보호)**: 이모지(🚀)가 포함된 문장에서 서러게이트 페어가 쪼개지지 않는지 검증.
- **Test 8 (배열 길이 불일치 방어)**: `characterStyleOverrides.length < characters.length` (트레일링 0 생략) 시 나머지 글자가 기본 스타일로 정상 처리되는지 검증.
- **Test 9 (알 수 없는 Style ID 방어)**: `styleOverrideTable`에 없는 ID가 지정되어도 예외 없이 기본 스타일로 폴백되는지 검증.
- **Test 10 (E2E Word 렌더링)**: 분할된 복수 Run이 최종 `DocxRenderer`를 거쳐 `word/document.xml`에 복수의 `<w:r>` 태그로 정상 렌더링되는지 검증.

---

## 10. DO / DON'T 명세

### DO (반드시 수행할 것)
- `src/parser/types.ts`에 Figma AST 오버라이드 타입 추가
- `src/parser/figmaParser.ts` 내 텍스트 분할 알고리즘 구현
- 기본 스타일과 오버라이드 스타일의 정밀한 병합(Inheritance Merge)
- 문자열 길이 및 서러게이트 경계 방어 가드 구축
- 10개 시나리오를 검증하는 단위 및 E2E 테스트 신설

### DON'T (절대로 건드리지 말 것)
- `src/model/` (Document Model 스키마 수정 금지)
- `src/renderer/` (DocxRenderer 수정 금지 — 이미 다중 Run 완벽 지원)
- `src/layout/` (LayoutEngine 수정 금지)
- `src/pipeline/` (Pipeline 수정 금지)
- HWPX 관련 속성(자간, 장평, 한/영 폰트 분리) 추가 금지
- 테이블 구조 최적화 재개 금지
- 기존 101개 테스트 수정 금지

---

## 11. 예상 수정 파일

실제 구현 시 수정 및 추가될 파일 목록:

1. **타입 정의**: [`src/parser/types.ts`](file:///c:/Users/77/Documents/Figma2Word/src/parser/types.ts) (약 5~10줄 추가)
2. **파서 로직**: [`src/parser/figmaParser.ts`](file:///c:/Users/77/Documents/Figma2Word/src/parser/figmaParser.ts) (약 60~80줄 추가: `buildTextRuns` 및 `resolveRunStyle`)
3. **신규 테스트**: `tests/character-style-overrides.test.ts` (신규 파일 생성)

---

## 12. 구현 난이도 및 범위 판정

| 평가 항목 | 평점 (1~5) | 사유 |
| :--- | :---: | :--- |
| **Parser 변경 범위** | **2 (낮음)** | `parseText()` 분기 및 분할 헬퍼 함수 1개 추가로 충분 |
| **Model 변경 범위** | **1 (없음)** | 기존 `TextRunSchema` 및 `runs: TextRun[]` 100% 재사용 |
| **Renderer 변경 범위** | **1 (없음)** | 기존 `docxRenderer.ts`가 이미 `runs.map()`을 지원함 |
| **LayoutEngine 변경 범위** | **1 (없음)** | LayoutEngine은 Text 내부를 보지 않으므로 영향 0 |
| **테스트 추가량** | **3 (중간)** | 10개 핵심 시나리오 테스트 신규 작성 |
| **회귀 위험** | **1 (매우 낮음)** | 오버라이드 미사용 시 기존 경로 100% 유지 |
| **실제 시각적 개선 기대** | **5 (매우 높음)** | 단일 문단 내 키워드 볼드, 상태 라벨 컬러 완벽 보존 |
| **HWPX 미래 호환성 영향** | **5 (최상)** | HWPX의 `<hp:run>`과 1:1 완벽 호환 |

---

## 13. 최종 권고

### 판정: **APPROVED FOR IMPLEMENTATION (구현 착수 강력 권고)**

1. **완벽한 아키텍처 준비도**:
   Document Model과 DOCX Renderer가 이미 다중 `TextRun` 배열을 완벽하게 렌더링할 준비가 되어 있어, **오직 Parser 레벨에서만 국소적으로 변경**하면 구현이 완료된다.
2. **극도로 낮은 회귀 위험**:
   기존 101개 테스트와 Phase 4.2 산출물에 미치는 영향이 0이며, LayoutEngine이나 Renderer를 전혀 건드릴 필요가 없다.
3. **차기 프롬프트 제안**:
   사전 분석이 완벽히 검증되었으므로, 다음 대화 세션에서 **Phase 5-A (Character Style Overrides) 최소 MVP 구현 프롬프트**를 진행할 것을 추천한다.

---

## 14. 실제 구현 및 검증 결과 (Phase 5-A 완료)

- **구현 완료일**: 2026-10-08
- **실제 수정 파일**:
  - `src/parser/types.ts`: `characterStyleOverrides`, `styleOverrideTable` 타입 선언
  - `src/parser/figmaParser.ts`: `buildTextRuns()`, `resolveRunStyle()`, `areTextStylesEqual()`, 서러게이트 페어 방어 헬퍼 구현
  - `tests/character-style-overrides.test.ts`: 12개 검증 테스트 신설
- **Model / Renderer / LayoutEngine 변경**: **0줄 (Zero Changes)**
- **테스트 결과**:
  - 신규 테스트: 12개 전원 통과 (볼드, 컬러, 폰트크기, 복합 오버라이드, 한글, 영문/숫자, 이모지 서러게이트 페어, 경계값, malformed fallback, OpenXML 검증, 결정론성 검증)
  - 기존 테스트 회귀: **기존 101개 테스트 전원 통과 (회귀 0건)**
  - 총 테스트 수: **22개 파일 / 113개 테스트 전원 통과 (113 passed, 0 failed)**
- **빌드 결과**: TypeScript 컴파일 통과, Vite 웹 빌드 통과
- **DOCX OpenXML 검증**: `<w:r>` 분할 및 `<w:b/>`, `<w:color/>`, `<w:sz/>` 네이티브 태그 정상 방출 확인
- **알려진 제한사항**: 로컬 저장소 fixture에는 실제 Figma 파일의 override AST가 포함되어 있지 않아 synthetic fixture로 입증됨 (향후 라이브 피그마 E2E 테스트에서 추가 실측 권장).
