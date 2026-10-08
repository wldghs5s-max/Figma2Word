# Phase 5-A Completion Report: Character Style Overrides

작성일: 2026-10-08
상태: **COMPLETE**

---

## 1. 개요

Phase 5-A에서는 Figma 텍스트 노드 내에서 특정 단어나 글자별로 다른 서식(볼드, 글자 크기, 색상, 이탤릭, 밑줄, 취소선)을 지정하는 **Character Style Overrides** 기능을 파서 레벨에서 구현하고, 전체 회귀 검증을 통과하여 공식 완료하였다.

---

## 2. 변경 내역 및 아키텍처 영향

- **Parser (`src/parser/`)**:
  - `types.ts`: `FigmaNode`에 `characterStyleOverrides?: number[]`, `styleOverrideTable?: Record<string | number, FigmaTypeStyle>` 추가.
  - `figmaParser.ts`:
    - `parseText()` 내에서 rich text 오버라이드 유무 감지.
    - `buildTextRuns()`: 동일한 스타일 ID를 공유하는 연속 구간별로 `TextRun[]` 분할.
    - `resolveRunStyle()`: 기본 노드 스타일과 오버라이드 스타일의 정밀 상속 병합.
    - `areTextStylesEqual()`: 인접한 동일 서식 구간 자동 병합으로 불필요한 Run 분할 최소화.
    - `isHighSurrogate()` / `isLowSurrogate()`: 이모지(🚀, 👍 등) 서러게이트 페어 분할 방어 가드.
    - 트레일링 0 생략 및 누락된 스타일 ID에 대한 안전한 Base Style 폴백 보장.
- **Document Model (`src/model/`)**:
  - **UNCHANGED (0줄 변경)**: `ParagraphElement` 및 `HeadingElement`의 기존 `runs: TextRun[]` 스키마 100% 재사용.
- **Renderer (`src/renderer/`)**:
  - **UNCHANGED (0줄 변경)**: 기존 `docxRenderer.ts`가 이미 `elem.runs.map(r => this.renderTextRun(r))`로 복수 Run을 각각 독립 서식으로 렌더링 지원.
- **LayoutEngine (`src/layout/`)**:
  - **UNCHANGED (0줄 변경)**: LayoutEngine은 텍스트 내부를 참조하지 않고 공간 배치만 수행하므로 영향 0.

---

## 3. 테스트 및 품질 검증

- **신규 테스트**: [`tests/character-style-overrides.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/character-style-overrides.test.ts) (12개 시나리오 전원 통과)
  - Test 1: Override 없음 단일 Run 유지 (기존 하위 호환)
  - Test 2: 단일 구간 볼드 분할
  - Test 3: 단일 구간 색상 오버라이드
  - Test 4: 단일 구간 글꼴 크기 오버라이드
  - Test 5: 다중 구간 복합 오버라이드 (녹색/빨강/볼드)
  - Test 6: 한글 완성형 음절 UTF-16 인덱싱
  - Test 7: 영문 + 숫자 + 한글 혼합 문자열
  - Test 8: 이모지 서러게이트 페어(🚀) 무손실 보존
  - Test 9: 시작/끝 경계값 오버라이드
  - Test 10: 길이 불일치 및 미정의 스타일 ID 안전 폴백
  - Test 11: Word OpenXML (`<w:r>`, `<w:b/>`, `<w:color/>`, `<w:sz/>`) 네이티브 렌더링 검증
  - Test 12: Rich text 결정론적 렌더링 일치 검증
- **전체 테스트 결과**: **22개 파일 / 113개 테스트 전원 통과 (113 passed, 0 failed)**.
- **기존 테스트 회귀**: **0건 (101개 기존 테스트 100% 통과 유지)**.
- **빌드 검증**:
  - `npm run build` (TypeScript): PASS
  - `npm run build:web` (Vite Production): PASS

---

## 4. 알려진 제한사항 (Known Limitations)

- 현재 로컬 저장소 fixture(`samples/`)에는 실제 Figma API에서 추출된 `characterStyleOverrides`가 포함되어 있지 않아, 합성(Synthetic) Fixture를 통해 엄격한 검증을 완료함.
- 향후 라이브 피그마 E2E 환경에서 실제 디자인 파일을 연결할 때 추가 실측 권장.

---

## 5. 결론

Phase 5-A는 기존 아키텍처와 모델, 렌더러를 전혀 해치지 않고 최소한의 파서 개선만으로 안전하게 구현 및 검증을 완료하였다.
