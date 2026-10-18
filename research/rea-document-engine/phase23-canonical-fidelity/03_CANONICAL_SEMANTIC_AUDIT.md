# Phase 23: Canonical JSON Semantic Audit & Cross-Format Mapping

## 1. Canonical IR의 원칙
Figma2Word 아키텍처에서 모든 문서는 특정 타겟 포맷(DOCX/HWPX)에 종속되지 않는 **중간 표현(Canonical Canvas IR, `CanvasDocument`)**으로 표현된다.

```text
  Figma AST ──────────▶ [ FigmaCanvasParser ] ──┐
  DOCX AST  ──────────▶ [ DocxCanvasParser  ] ──┼──▶ [ CanvasDocument (IR) ]
  HWPX AST  ──────────▶ [ HwpxCanvasParser  ] ──┘              │
                                                               ├──▶ [ DocxCanvasRenderer ] ──▶ .docx
                                                               └──▶ [ HwpxCanvasRenderer ] ──▶ .hwpx
```

## 2. Canvas IR 요소별 포맷 매핑 감사표

| Canvas IR 속성 | Canvas IR 의미 | DOCX (VML / DrawingML) 해석 | HWPX (OWPML) 해석 | 일관성 보장 조치 |
|---|---|---|---|---|
| `type: "card"` | 배경색, 테두리, 모서리 반경을 갖는 사각 컨테이너 | `<v:roundrect>` 또는 `<v:rect>` with `<v:fill>`, `<v:stroke>` | `<hp:rect>` with `<hc:fillBrush>`, `<hp:lineShape>` | 4변 테두리 및 배경색 정확 직렬화 |
| `type: "text"` | 독립 텍스트 요소 (투명 배경) | `<v:textbox>` with `mso-wrap-style`, `v-text-anchor` | `<hp:rect>` with `<hc:fillBrush/>` (self-closing), `<hp:drawText>` | 배경 및 테두리 완전 투명화로 외곽선 잔상 제거 |
| `type: "line"` | 직선, 구분선 (단일 선분) | `<v:line>` with `from`, `to`, `<v:stroke>` | 두께 4pt 이하 가로/세로는 thin filled `<hp:rect>`, 그 외 `<hp:line>` | 한컴 뷰어 호환성을 위한 정품 표준 thin rect 변환 |
| `verticalAlign` | 수직 텍스트 정렬 (`top`, `center`, `bottom`) | `v-text-anchor: top \| middle \| bottom` | `<hp:subList vertAlign="TOP \| CENTER \| BOTTOM">` | 중앙 정렬 시 상단 여백 이중 가산 방지 |
| `innerPaddingPt` | 컨테이너 내부 안쪽 여백 | `inset="left,top,right,bottom"` | `<hp:textMargin left,right,top,bottom>` | pt -> hwpu 단위 정확 환산 (1pt = 100hwpu) |
| `style.borderSides` | 상/우/하/좌 개별 테두리 지정 | 개별 `<v:line>` 분리 방출 | 개별 `type: "line"` 분리 방출 (thin rect) | 개별 테두리 존재 시 4면 박스화 방지 |

## 3. 포맷 간 의미론적 차이점 극복
- **DOCX**: VML 텍스트 박스는 기본적으로 상하 패딩(`inset="0,0,0,0"`)과 `mso-fit-shape-to-text` 속성으로 제어됨.
- **HWPX**: OWPML은 모든 도형 내부 텍스트를 `<hp:drawText>` 안의 `<hp:subList>`와 문단(`<hp:p>`)으로 제어하며, 여백은 `<hp:textMargin>`으로 제어함.
- **결론**: Canvas IR의 `innerPaddingPt`와 `verticalAlign`을 단일 기준으로 삼아 양쪽 렌더러가 대칭적으로 소비하도록 정렬 완료.
