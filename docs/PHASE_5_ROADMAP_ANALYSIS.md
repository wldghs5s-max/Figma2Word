# Phase 5 Roadmap & Architecture Analysis

작성일: 2026-10-08
기준 Git Commit: `b7f5e6f` (`chore(phase-4.2): checkpoint step-2b6 and handover`)
선행 완료 상태: Phase 4.2 완료 (`docs/PHASE_4_2_COMPLETION.md`)
목적: 현재 아키텍처 성숙도 평가, Phase 5 개발 후보 발굴 및 우선순위 분석, HWPX 확장성 사전 평가

---

## 1. Current Architecture

Figma2Word는 순수 로컬(Node.js / 브라우저) 환경에서 외부 AI API나 유료 서비스 없이 실행되는 **100% 결정론적(Deterministic) 규칙 기반 변환 엔진**이다.

### 1.1 전체 파이프라인 데이터 흐름
```text
Figma URL (또는 JSON AST)
       ↓
[src/api/urlParser.ts] & [src/api/figmaClient.ts]
 (URL 정규화, REST API 호출, S3 원격 이미지 자동 다운로드 및 버퍼 캐싱)
       ↓
[src/parser/figmaParser.ts]
 (Figma AST 순회, Multi-Screen Grouping, PageBreak 삽입, 2D 좌표 정렬)
       ↓
[src/layout/layoutEngine.ts]
 (Spatial Layout: 수평 행 클러스터링, 카드 오버레이 폴딩, 컬럼 비례 너비 계산)
       ↓
[src/model/document.ts] & [src/model/elements.ts]
 (IR: Internal Document Model - Zod 스키마 기반 순수 데이터 구조)
       ↓
[src/pipeline/index.ts]
 (파이프라인 관통 및 Empty Document Guard)
       ↓
[src/renderer/docxRenderer.ts]
 (Word Native Heading, Paragraph, Table, Shading, PageBreak, Drawing 패킹)
       ↓
.docx (네이티브 Microsoft Word 문서)
```

### 1.2 소스 계층별 실제 역할
- [`src/api/`](file:///c:/Users/77/Documents/Figma2Word/src/api/): URL 파싱, Figma REST API 통신, S3 이미지 다운로드 및 MIME 감지.
- [`src/parser/`](file:///c:/Users/77/Documents/Figma2Word/src/parser/): Figma AST를 순회하며 캔버스 레벨 독립 화면을 분할(Screen Grouping)하고 기초 IR 요소로 매핑.
- [`src/layout/`](file:///c:/Users/77/Documents/Figma2Word/src/layout/): 2D 절대좌표계를 문서 흐름으로 재구성 (가로 행 클러스터링, 배경 오버레이 폴딩, 컬럼 비례 너비).
- [`src/model/`](file:///c:/Users/77/Documents/Figma2Word/src/model/): 렌더러에 독립적인 순수 중간 표현(IR Document Model).
- [`src/pipeline/`](file:///c:/Users/77/Documents/Figma2Word/src/pipeline/): 파이프라인 관통 및 빈 문서 생성 방지(Guard).
- [`src/renderer/`](file:///c:/Users/77/Documents/Figma2Word/src/renderer/): IR을 WordprocessingML(`docx` 라이브러리) 네이티브 요소로 변환.

---

## 2. Phase 4.2 Final Baseline

Phase 4.2 종료 시점의 공식 기준 지표 (Baseline):

```text
Target Design: Sh 영업지원시스템 (ODS) 스토리보드 (Node: 1154-2208)
Screens: 39개
Tables: 3,062개
Nested Tables: 3,023개
Max Table Depth: 11
Paragraphs: 5,153개
Text Nodes: 3,934개 (100% 무손실 보존)
Images / Drawings: 63개 (100% 무손실 보존)
PageBreaks: 38개 (39개 화면 1:1 완벽 격리)

Vitest Tests: 21 suites / 101 tests (100% Passed)
Build: TypeScript PASS / Web Build PASS
Word Visual Validation: PASS (로딩 ~3초, 스크롤 60FPS, 탐색/편집 원활)
```

---

## 3. Architecture Assessment

현재 코드베이스 구조에 대해 제기된 4가지 핵심 아키텍처 질문에 대한 정밀 평가 결과:

### Q1. 현재 Document Model이 renderer와 충분히 분리되어 있는가?
- **평가: 완벽히 분리됨 (Decoupled)**
- `src/model/` 내부에는 `docx` 라이브러리의 클래스(`Paragraph`, `Table`, `TableCell`, `WidthType` 등)나 WordprocessingML 고유 태그가 일절 존재하지 않는다.
- 모든 요소는 Zod 스키마 기반의 순수 TypeScript 인터페이스(`InternalDocument`, `DocumentSection`, `HeadingElement`, `ParagraphElement`, `ImageElement`, `LineElement`, `PageBreakElement`, `ShapeElement`, `TableElement`, `ContainerElement`)로 정의되어 있다.
- 길이 및 여백 단위 또한 표준 단위(mm, px, pt, %)로 추상화되어 있어 렌더러 독립적이다.

### Q2. 향후 DOCX 이외의 renderer를 추가할 수 있는 구조인가?
- **평가: 즉시 확장 가능한 플러그형 구조 (Pluggable)**
- 현재 `DocxRenderer`는 `InternalDocument`를 입력받아 `Promise<Buffer>`를 반환하는 단일 책임을 갖는다.
- 공통 인터페이스 `interface DocumentRenderer { renderToBuffer(doc: InternalDocument): Promise<Buffer>; }`를 정의하면, 향후 `HwpxRenderer`, `PdfRenderer`, `HtmlRenderer` 등을 동일한 IR 트리 위에서 플러그인 형태로 추가할 수 있다.

### Q3. 현재 parser/layout 단계가 특정 DOCX 구현에 지나치게 종속되어 있는가?
- **평가: 90% 이상 범용적이며, 일부 DOCX 특화 가정 존재**
- **범용적 부분**: 2D 절대좌표계를 수직 흐름, 수평 다열 클러스터(`clusterHorizontalRows`), 배경 사각형 폴딩(`foldContainedOverlays`)으로 변환하는 `LayoutEngine`의 알고리즘은 Word, HWPX, HTML 등 모든 플로우 기반 문서 엔진에 공통적으로 요구되는 핵심 연산이다.
- **종속적 부분**: Word에 CSS `div`와 같은 순수 컨테이너 블록이 없어, `ContainerElement`와 `ShapeElement`가 DOCX 렌더러 단계에서 주로 1×1 Table이나 음영 문단으로 변환되도록 설계되어 있다. 하지만 이는 렌더러의 해석 문제일 뿐, Parser/LayoutEngine의 출력 모델 자체는 일반적인 트리 구조를 유지하고 있다.

### Q4. Figma → Word 외에 향후 HWPX 확장을 고려할 때 현재 구조에서 병목이 되는 부분은 무엇인가?
1. **타이포그래피 및 표 속성 차이**:
   - 한글(HWPX) 문서는 자간(-50%~50%), 장평(50%~200%), 한글/영문 폰트 분리(`hangul`/`latin`), 개조식 문단 번호 체계(`문단 번호/글머리표`)가 핵심이다. 현재 `src/model/style.ts`의 `TextStyle`에는 이 필드들이 정의되어 있지 않다.
2. **Node.js 생태계의 HWPX 빌더 라이브러리 부재**:
   - DOCX는 성숙한 `docx` npm 라이브러리가 존재하여 OpenXML 패키징을 손쉽게 수행할 수 있으나, HWPX는 오픈소스 고수준 라이브러리가 전무하여 OCF ZIP 패키징(`Contents/section0.xml`, `header.xml`, `manifest.xml`)을 직접 XML 템플릿 빌더로 구축해야 한다.
3. **Word → HWPX 방향의 비효율성**:
   - `Word → HWPX`는 DOCX 파서(역공학)를 새로 만들어야 하므로 완전히 다른 제품군이 된다. 따라서 `Figma → Document Model (IR) → HWPX Renderer` (단일 IR 다중 렌더러) 구조가 압도적으로 효율적이고 타당하다.

---

## 4. Candidate Evaluation

Phase 5에서 검토 가능한 7대 기능 후보에 대한 개별 상세 평가:

### Candidate A — Character Style Overrides (단일 Text 내 글자별 부분 서식)
- **개요**: Figma Text 노드 내부의 부분 문자열별 폰트 굵기, 색상, 밑줄, 크기 차이를 Word `TextRun` 수준에서 분할 보존.
- **현재 상태 분석**:
  - `src/model/elements.ts`의 `ParagraphElement` 및 `HeadingElement`는 이미 `runs: TextRun[]` 배열 구조를 완비하고 있음.
  - `src/renderer/docxRenderer.ts` 또한 `elem.runs.map(r => this.renderTextRun(r))`로 여러 `TextRun`을 렌더링하도록 이미 구현되어 있음.
  - **유일한 미구현 지점**: `src/parser/figmaParser.ts`가 `node.characterStyleOverrides` 및 `node.styleOverrideTable`을 읽지 않고 전체 텍스트를 단일 `TextRun`으로 합치고 있음.
- **비즈니스 가치**: 매우 높음 (금융/기획/제안서에서 특정 키워드 볼드, 빨간색 주의 문구, 상태 라벨 서식 완벽 보존).
- **구현 난이도**: 낮음~중간 (Parser에서 문자열 인덱스별 스타일 분할 로직만 추가하면 됨, 모델/렌더러 수정 불필요).
- **회귀 위험도**: 매우 낮음 (오버라이드가 없는 일반 텍스트는 기존 1개 run 유지).

### Candidate B — Typography Fidelity (글꼴 매핑, 행간/자간, 정렬 정밀화)
- **개요**: Figma의 `lineHeightPx`/`lineHeightPercent`, `letterSpacing`, 대체 폰트 패밀리 매핑(Pretendard → Malgun Gothic / Calibri)을 Word 타이포그래피로 정밀 변환.
- **비즈니스 가치**: 높음 (줄바꿈 위치 일치도 및 문서 가독성 대폭 향상).
- **구현 난이도**: 중간 (Figma 행간 단위를 Word dxa로 변환하고 폰트 fallback 테이블 구축 필요).
- **회귀 위험도**: 낮음~중간 (문단 상하 여백 변경 시 페이지 분할 위치에 영향 가능).

### Candidate C — Figma Auto Layout Fidelity (오토레이아웃 패딩/간격/정렬 고도화)
- **개요**: Figma의 Auto Layout Hug/Fill 크기 정책 및 정렬(Top/Center/Bottom)을 Word 셀/문단에 더 정밀하게 반영.
- **비즈니스 가치**: 높음 (모던 Figma 디자인의 90% 이상이 Auto Layout 기반).
- **구현 난이도**: 중간~높음 (Word의 제한적인 셀 높이 및 정렬 모델과의 타협 필요).
- **회귀 위험도**: 중간 (기존 Phase 3/4의 LayoutEngine 회귀 테스트 영향 검증 필수).

### Candidate D — Document Composition (문서 구성: 다중 섹션, 표지, 머리글/바닥글)
- **개요**: 여러 Screen을 묶어 정식 제안서/보고서 형태(표지 페이지, 목차, 머리글, 바닥글, 페이지 번호)로 조립.
- **비즈니스 가치**: 높음 (원클릭 보고서 산출물화).
- **구현 난이도**: 중간 (`InternalDocument`의 header/footer 스키마를 `docx`의 Header/Footer 클래스로 매핑).
- **회귀 위험도**: 낮음 (본문 레이아웃에 직접적 간섭 없음).

### Candidate E — HWPX Renderer 확장성 (공통 IR 기반 HWPX 모듈 신설)
- **개요**: `InternalDocument`를 입력받아 한글과컴퓨터 HWPX 문서를 출력하는 `HwpxRenderer` 모듈 개발.
- **비즈니스 가치**: 매우 높음 (한국 공공/금융/교육 기관의 필수 포맷).
- **구현 난이도**: 매우 높음 (HWPX 패키징 및 OWPML XML 스키마 생성 엔진 자체 구축 필요).
- **회귀 위험도**: 낮음 (기존 DOCX 파이프라인과 100% 격리된 신규 렌더러).

### Candidate F — Word → HWPX 독립 변환기
- **개요**: 생성된 DOCX를 다시 HWPX로 변환하는 독립 파이프라인 구축.
- **평가**: Figma2Word의 핵심 정체성("Figma to Native Document")에서 벗어나며, 상용 변환기 시장의 영역임. Figma2Word 내에서는 `Figma → IR → HWPX`가 훨씬 우수하므로 **부적합 판정**.

### Candidate G — 실제 업무 문서 기능 (Header/Footer, 페이지 번호, 스타일 템플릿)
- **개요**: 머리글/바닥글, 동적 페이지 번호("Page X of Y"), 회사 로고 워터마크 지원.
- **비즈니스 가치**: 높음 (실무 배포용 문서 필수 요소).
- **구현 난이도**: 낮음~중간 (`docx` 라이브러리의 `PageNumber`, `Header`, `Footer` 네이티브 지원 활용).
- **회귀 위험도**: 낮음.

---

## 5. Candidate Comparison

각 평가 기준 (1 = 매우 낮음 ~ 5 = 매우 높음):

| Candidate | Business Value | Visual Fidelity | Implementation Difficulty | Architecture Fit | Regression Risk | Future HWPX Compatibility | 종합 우선순위 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **A. Character Style Overrides** | **5** | **5** | **2 (쉬움)** | **5 (완벽)** | **1 (극소)** | **5** | **1위 (최우선)** |
| **B. Typography Fidelity** | 4 | 4 | 3 | 4 | 2 | 4 | **2위 (병행)** |
| **G. 업무 문서 기능 (Header/PageNum)** | 4 | 3 | 2 (쉬움) | 5 (완벽) | 2 | 4 | **3위 (단기)** |
| **C. Auto Layout Fidelity** | 4 | 4 | 4 | 4 | 3 | 4 | **4위 (중기)** |
| **D. Document Composition** | 4 | 3 | 3 | 4 | 2 | 4 | **5위 (중기)** |
| **E. HWPX Renderer 신설** | **5** | 4 | 5 (매우 높음) | 4 | 1 | 5 | **6위 (장기 스프린트)** |
| **F. Word → HWPX 변환기** | 2 | 2 | 5 (매우 높음) | 1 (부적합) | 1 | 3 | **제외 (Drop)** |

---

## 6. HWPX Expansion Assessment

- **실현 가능성 (Feasibility)**: **100% 가능**.
  - Document Model이 이미 Zod 기반 순수 데이터 구조로 분리되어 있으므로 기술적으로 완전 실현 가능.
- **아키텍처 준비도 (Architecture Readiness)**: **80% 준비 완료**.
  - Document Model, Parser, LayoutEngine은 그대로 재사용 가능.
  - 부족한 20%: HWPX 고유 속성(자간, 장평, 한/영 폰트 분리, 문단 번호)을 수용할 수 있는 `TextStyle`의 선택적(optional) 확장 필요.
- **필수 개발 요소 (Required Changes)**:
  1. HWPX OCF ZIP 패키징 모듈 (`mimetype`, `META-INF/manifest.xml`, `Contents/content.hpf`)
  2. OWPML XML 빌더 (`Contents/section0.xml`, `Contents/header.xml`)
  3. `HwpxRenderer` 클래스 신설 (`renderToBuffer(doc: InternalDocument): Promise<Buffer>`)
- **결론**: Phase 5에서 대규모 추상화 리팩토링을 먼저 할 필요는 없으며, Phase 5에서 Word 기능 완성도를 극대화한 후 **Phase 6 독립 스프린트**로 HWPX 렌더러를 추가하는 것이 가장 안전함.

---

## 7. Recommended Phase 5 Order

### Recommended #1: Candidate A — Character Style Overrides (부분 텍스트 서식 보존)
- **선정 이유**:
  - 모델(`runs[]`)과 렌더러(`renderTextRun`)가 이미 준비되어 있어, **비용 대비 효과(ROI)가 프로젝트 전 영역 중 가장 높음**.
  - 금융/기획 문서에서 볼드체 강조, 빨간색 경고 문구, 상태 라벨이 단일 문단 내에서 완벽히 보존됨.
- **수정 대상 파일**:
  - `src/parser/types.ts` (`FigmaTypeStyle`, `FigmaNode`의 `characterStyleOverrides`, `styleOverrideTable` 타입 추가)
  - `src/parser/figmaParser.ts` (`parseText()` 내 `buildTextRuns()` 분할 유틸리티 구현)
- **101개 테스트 영향**: 기존 테스트 100% 안전 (오버라이드가 없는 텍스트는 동일한 1개 run 생성).
- **실제 사용자 가치**: 텍스트 서식 붕괴 없는 압도적 시각적 완성도.

### Recommended #2: Candidate B & G — Typography & Business Document Features (타이포그래피 및 업무 규격)
- **선정 이유**:
  - 폰트 매핑(Pretendard/Noto Sans → 맑은 고딕), 행간 비율 정밀화, 바닥글 페이지 번호("Page X of Y") 추가로 실무 배포 가능한 공식 문서 완성.
- **수정 대상 파일**:
  - `src/model/style.ts`, `src/renderer/docxRenderer.ts`
- **실제 사용자 가치**: 실제 결재/보고용 Word 문서로서의 외형 규격 완비.

### Recommended #3: Candidate E — HWPX Renderer 기초 설계 (장기 과제)
- **선정 이유**:
  - 국내 공공/금융 시장 확장을 위한 HWPX 지원 준비.
  - 별도 패키지 또는 서브 모듈 형태로 점진적 구축.

---

## 8. Risks

1. **Text Run 분할 시 공백(Whitespace) 누락 위험**:
   - 단어 단위 분할 시 단어 사이 공백(` `)의 서식 ID가 앞뒤 단어 중 어디에 속하는지에 따라 공백이 사라지는 Word 렌더링 버그 발생 가능.
   - **대책**: 분할 알고리즘 작성 시 원본 `characters`의 길이와 모든 run의 `text` 길이 합이 100% 일치함을 보장하는 단위 테스트 구축.
2. **복합 이중 서식(볼드 + 색상 + 폰트) 누락 위험**:
   - Figma의 `styleOverrideTable`이 기본 노드 스타일과 병합(Merge)되는 구조이므로 상속 처리 필수.
   - **대책**: `resolveRunStyle(baseStyle, overrideStyle)` 병합 함수 완비.

---

## 9. Proposed First Implementation (차기 첫 작업 제안)

Phase 5의 첫 번째 구현 작업으로 **Phase 5-1: Character Style Overrides** 구현을 강력히 제안한다.

- **목표**: Figma 단일 Text 노드 내에서 볼드, 색상, 글꼴 크기가 부분적으로 다른 경우, 이를 복수의 `TextRun`으로 분할하여 Word 문서에 100% 무손실 반영.
- **범위**:
  - `src/parser/types.ts`: Figma AST 스타일 오버라이드 인터페이스 보강.
  - `src/parser/figmaParser.ts`: `parseText()`에 `buildTextRuns()` 분할 파서 구현.
  - `tests/character-style-overrides.test.ts`: 혼합 텍스트 서식 검증 테스트 신설.
  - 기존 101개 테스트 전원 통과 유지.

---

## 10. Conclusion

1. Phase 4.2는 대형 실제 피그마 디자인을 대상으로 무결점 Word 변환 및 실무 편집 성능을 달성하며 성공적으로 종료되었다.
2. 현재 Figma2Word 아키텍처는 Document Model이 렌더러와 완벽히 분리되어 있어 다중 출력 포맷(HWPX 등)으로 확장할 수 있는 견고한 기초를 갖추고 있다.
3. Phase 5에서는 **Candidate A (Character Style Overrides)**를 최우선으로 구현하여 단일 텍스트 내 부분 서식 무손실 보존을 달성하고, 이어서 타이포그래피 및 업무 문서 규격을 완성하는 로드맵을 확정한다.
