# Figma2Word

> **Figma 디자인을 분석하여 Microsoft Word 네이티브 문서(`.docx`)로 손실 없이 재구성하는 로컬 우선(Local-first) 결정론적 변환 엔진**

본 프로젝트는 클라우드 AI API(OpenAI, Claude 등)나 외부 백엔드 서버, 데이터베이스, 유료 구독 서비스에 일절 의존하지 않고, **순수 로컬(Node.js / 브라우저) 환경에서 100% 규칙 기반(Deterministic Rule-based)으로 실행되는 고성능 비즈니스 도구**입니다.

---

## 📌 다음 세션 작업자를 위한 핵심 인수인계 요약 (Handover Summary)

- **현재 Git 브랜치**: `master`
- **현재 인수인계**: [`docs/PROJECT_HANDOVER.md`](docs/PROJECT_HANDOVER.md)
- **현재 테스트 상태**: 21개 스위트 / 101개 테스트 통과 (2026-10-08 실행)
- **빌드 상태**: `npm run build`, `npm run build:web` 통과
- **STEP 2-B-7**: 시작하지 않음

## Current Development Status

Phase 4.2 STEP 2-B is currently implemented through STEP 2-B-6.

The project intentionally prioritizes DOCX visual fidelity over aggressive table-count reduction.

STEP 2-B-7 has not started.

---

## 🏗️ 1. 전체 파이프라인 및 소스 구조

```text
Figma URL (또는 JSON AST)
       ↓
[src/api/urlParser.ts] & [src/api/figmaClient.ts]
 (URL 파싱, REST API 호출, S3 원격 이미지 자동 다운로드)
       ↓
[src/parser/figmaParser.ts]
 (Figma AST 순회, CANVAS 노드 처리, Multi-Screen Grouping, 정렬 교정)
       ↓
[src/layout/layoutEngine.ts]
 (Spatial Layout: 수평 행 클러스터링, 카드 오버레이 폴딩, 컬럼 비례 너비)
       ↓
[src/model/document.ts] & [src/model/elements.ts]
 (IR: Internal Document Model - Zod 스키마 검증)
       ↓
[src/pipeline/index.ts]
 (파이프라인 관통 및 Empty Document Guard)
       ↓
[src/renderer/docxRenderer.ts]
 (Word Native Heading, Paragraph, Table, Shading, PageBreak 패킹)
       ↓
.docx (네이티브 Word 문서 출력)
```

### 소스 계층별 실제 역할 (Actual File Responsibilities)
- [`src/api/urlParser.ts`](file:///c:/Users/77/Documents/Figma2Word/src/api/urlParser.ts): 최신 `design/`, 레거시 `file/`, `proto/` 등 다양한 형태의 피그마 URL과 `node-id`를 표준 파라미터로 추출하고 정규화합니다.
- [`src/api/figmaClient.ts`](file:///c:/Users/77/Documents/Figma2Word/src/api/figmaClient.ts): 공식 Figma REST API(File, Nodes)를 호출하고, S3에 호스팅된 이미지 Fills를 로컬 메모리로 자동 다운로드하여 캐싱합니다.
- [`src/parser/figmaParser.ts`](file:///c:/Users/77/Documents/Figma2Word/src/parser/figmaParser.ts): Figma AST를 파싱하여 IR 요소로 분류하며, CANVAS 직하위의 독립 Screen Frame들을 판별(Screen Grouping)하여 LayoutEngine으로 넘깁니다.
- [`src/layout/layoutEngine.ts`](file:///c:/Users/77/Documents/Figma2Word/src/layout/layoutEngine.ts): 2D 절대좌표계를 Word 문서 구조로 변환하기 위해 수평 행 클러스터링(`clusterHorizontalRows`), 배경 사각형 오버레이 폴딩(`foldContainedOverlays`), 고정/가변 컬럼 비례 너비(`enrichSizingRatios`)를 계산합니다.
- [`src/model/document.ts`](file:///c:/Users/77/Documents/Figma2Word/src/model/document.ts): `InternalDocument`, `DocumentSection`, `PageConfig` 등 문서 전체의 메타데이터와 페이지 설정을 정의합니다.
- [`src/model/elements.ts`](file:///c:/Users/77/Documents/Figma2Word/src/model/elements.ts): `Heading`, `Paragraph`, `Image`, `Line`, `Shape`, `Table`, `Container`, 그리고 Phase 4.2에서 신설된 `PageBreakElement`의 Zod 스키마 및 타입을 정의합니다.
- [`src/pipeline/index.ts`](file:///c:/Users/77/Documents/Figma2Word/src/pipeline/index.ts): 입력부터 출력까지 파이프라인을 단일 호출로 관통하며, 변환 가능 요소가 0개일 때 빈 DOCX 생성을 차단하는 `Empty Document Guard`를 수행합니다.
- [`src/renderer/docxRenderer.ts`](file:///c:/Users/77/Documents/Figma2Word/src/renderer/docxRenderer.ts): IR 요소를 WordprocessingML(`docx` 패키지) 네이티브 요소(Heading, Paragraph, Table, Shading, PageBreak)로 변환합니다.

---

## 📈 2. 개발 히스토리 요약 (Phase 1 ~ Phase 4.2)

- **Phase 1**: 파이프라인 기초 및 IR 모델, 렌더러 기초 구축 (12개 테스트).
- **Phase 2**: Node.js(CLI) / 브라우저(Web UI) 이중 환경 지원, 결정론성 검증 (24개 테스트).
- **Phase 3**: `LayoutEngine` 전격 도입. P1-1 수평 클러스터링, P1-2 오버레이 폴딩, P1-3 비례 너비 산출 (`4ff1769`, 32개 테스트).
- **Phase 4**: 공식 Figma REST API, 라이브 URL 파서, S3 이미지 자동 다운로드 E2E 파이프라인 관통 (`b756b8c`, 50개 테스트).
- **Phase 4.1**: 실제 개인 Figma 실사용 테스트 피드백 대응 (`241696a`, 58개 테스트):
  - 4.1-A: `CANVAS` 노드(`node-id=0-1`) 지원 및 빈 문서 패킹 가드 (`13136a1`).
  - 4.1-B: `_isRowCell` 플래그 분리로 폴딩된 다단 카드의 가로 배치 보존 (`92a2fab`).
  - 4.1-C: 헤더 영역 가로 자동 추론 및 X축(좌→우) 정렬 교정 (`8ecf5a4`).
  - 4.1-D: 문단/제목 상하 여백(`spacing`) 압축 최적화 (`9798461`).
- **Phase 4.2 STEP 1**: 멀티스크린 CANVAS 처리 개선 (`6e509c1`, 62개 테스트):
  - 여러 화면이 한 번에 LayoutEngine으로 넘어가 상호 간섭하던 문제 해결.
  - Screen Grouping 규칙 및 `PageBreakElement` 도입으로 화면별 레이아웃 격리 및 페이지 분할 달성.
- **Phase 4.2 STEP 2-A**: Table 88개 폭증 원인 OpenXML 전수 역공학 분석 완료.
- **Phase 4.2 STEP 2-B-1 (현재 커밋 `8986931`)**:
  - 내용물 없는 빈 ShapeElement의 불필요한 100% Table 생성 제거 (24개 Table 즉각 제거, 65개 테스트 통과).

---

## 🔍 3. 실제 Figma 문제와 실측 데이터 (안심플랜 설문조사 node 0-1)

실제 복합 비즈니스 디자인(안심플랜 설문조사 리포트)을 대상으로 E2E 변환을 수행했을 때 발견된 문제와 실측치입니다:

### (1) Whole CANVAS 변환 결과 (STEP 1 이전)
- `word/document.xml`: **약 7.11 MB**
- Paragraphs: 3,744개 / Tables: **4,817개** / Nested Tables: **4,806개** / Max Depth: **11**
- **현상**: 11개 화면이 페이지 구분 없이 한 섹션으로 쏟아부어져, Word 레이아웃 엔진이 열 너비 재귀 계산과 페이지 분할을 돌리다 **100% CPU 동결(Freeze/Hang)** 상태에 빠짐.
- **해결 (STEP 1)**: Screen Grouping 및 화면 간 `PageBreak` 삽입으로 화면별 레이아웃 컨텍스트를 완벽히 격리함.

### (2) Single Frame 변환 결과 (STEP 2-A 분석 기준)
- `word/document.xml`: 약 121 KB
- Paragraphs: 62개 / Tables: **88개** / Nested Tables: 87개 / Max Depth: 7 / Text Nodes: 62개
- **현상**: Word는 열리나 텍스트 62개에 테이블이 88개로, 요소들이 100% 폭 테이블 블록으로 변환되어 상하로 찢어짐.

---

## 📊 4. STEP 2-A: Table 88개 실측 분류 결과

OpenXML 태그를 전수 역공학 분석하여 도출된 88개 테이블의 카테고리 분포입니다:

```text
========================================================================================
카테고리 (Category)                                    실제 Table 수     비율 (%)
========================================================================================
Category A — 실제 다열 레이아웃 Table (Cols >= 2)          24개          27.3% (유지 대상)
Category B — 시각적 카드/패널 컨테이너 (텍스트 포함 1x1)     10개          11.4% (유지 대상)
Category C — 빈 장식 Rectangle (텍스트 0개 빈 도형)         24개          27.3% (STEP 2-B-1에서 제거 완료!)
Category D — 순수 구조/투명 1x1 래퍼 Container             8개           9.1% (STEP 2-B-2 대상)
Category E — Badge / Chip / Button (단어 1개 수준 1x1)     22개          25.0% (STEP 2-B-2 대상)
========================================================================================
총합                                                       88개         100.0%
========================================================================================
```

> **핵심 진단**:  
> 불필요한 테이블(Category C + D + E)이 **총 54개(61.4%)**에 달하며, 핵심 원인은 Figma의 작은 장식/래퍼/뱃지까지 Word의 100% 폭 Table로 변환하던 렌더러 정책 때문이었습니다.

---

## ✅ 5. STEP 2-B-1 완료 결과 (현재 체크포인트)

- **커밋**: [`8986931`](https://github.com/wldghs5s-max/Figma2Word/commit/8986931) (`fix(phase-4.2-step2b1): avoid tables for empty decorative shapes`)
- **수정 파일**: `src/renderer/docxRenderer.ts`, `tests/empty-shape-no-table.test.ts`
- **핵심 변경**:
  ```text
  content가 없는 ShapeElement (Category C)  ──>  Word Table 생성하지 않고 null 반환 (생략)
  content가 있는 ShapeElement (Category B)  ──>  기존 1x1 Shaded Table 렌더링 유지
  가로 Auto Layout 다열 Table (Category A)   ──>  영향 없음 (완벽 보존)
  ```
- **실제 Figma 실측 Before / After**:

| 항목 (Metric) | Before (2-A 실측) | After (2-B-1 현재) | 변화량 |
|---|---:|---:|:---:|
| **총 Table 수** | **88개** | **64개** | **-24개 (27.3% 감소)** |
| **Nested Tables** | 87개 | 63개 | -24개 감소 |
| **Max Table Depth** | 7 | 7 | (말단 뱃지 번호에 의해 유지) |
| **텍스트 노드 수** | 62개 | 62개 | **0개 손실 (100% 무손실 보존)** |
| **빈 장식 Shape Tables (Category C)** | 24개 | 0개 | **100% 제거 완료** |

---

## ⚠️ 6. 현재 남아 있는 미해결 문제 (Pending Issues)

아래 목록은 STEP 2-B-1 직후의 기록이다. 그 이후 2-B-2부터 2-B-6까지 진행되었다. 현재 상태와 남은 후보는 `docs/PROJECT_HANDOVER.md`를 본다.

다음 문제들은 **아직 해결되지 않았으며, 후속 단계에서 처리해야 합니다**:

1. **문제 1: Badge / Chip / Button의 100% Table화 (Category E, 22개 테이블 잔여)**:
   - 숫자 `"1"`, `"2"`, `"3"`, `"4"`, 상태 태그 `"부족"`, 버튼 `"이전"`, `"다음"` 등 글자 1~2개 수준의 요소가 배경색 때문에 100% 폭 Word Table 블록으로 렌더링되어 상하로 찢어지는 현상.
2. **문제 2: 단일 구조 래퍼 Container (Category D, 8개 테이블 잔여)**:
   - 배경/테두리가 없는 투명 Frame이나, 단 하나의 자식 Table만을 불필요하게 감싸는 1x1 Table 래핑 잔여.
3. **문제 3: Table Nesting Depth (현재 Max Depth = 7)**:
   - **[주의] 현재 시점에서 `maxDepth = 3` 같은 하드캡(Hard Cap)을 구현하지 않았습니다.**
   - Category E와 D를 flatten한 후 실제 측정값을 다시 확인하고 깊이 정책을 결정해야 합니다.

---

## 🎯 7. 내일 이어받을 다음 작업 로드맵 (Next Tasks)

이 로드맵은 STEP 2-B-1 직후 계획이다. 2-B-2, 2-B-5, 2-B-6은 구현되었고 2-B-3과 2-B-4는 분석만 했다. STEP 2-B-7은 시작하지 않았다.

다음 세션에서 수행할 작업 순서는 다음과 같습니다:

```text
[STEP 2-B-2]
Badge / Chip / Button (Category E 22개) 및 단일 래퍼 (Category D 8개) Flatten 처리
       ↓
실제 Figma Frame OpenXML 재측정 (Table 수 및 Depth 감소량 확인)
       ↓
[STEP 2-B-3]
필요 시 Table Nesting Depth 정책 검토 및 적용 (실측 데이터 기반 판단, 임의 하드캡 금지)
       ↓
[STEP 2-B-4]
전체 65개+ 테스트 회귀 검증 및 신규 테스트 보강
       ↓
[STEP 2-B-5]
실제 Figma Before / After 정량 비교 및 최종 검증
```

---

## ⛔ 8. 절대 하면 안 되는 작업 및 안전 수칙 (Safety Rules)

다음 AI 작업 세션은 아래의 원칙을 반드시 준수해야 합니다:

1. **특정 Figma node ID나 레이어 이름을 코드에 하드코딩하지 말 것.**
2. **특정 디자인 파일만을 위한 임의의 예외 처리를 만들지 말 것.**
3. **전체 Renderer나 Parser를 처음부터 재작성(Rewrite)하지 말 것.**
4. **근거 없이 `maxDepth = 3` 같은 하드캡을 섣불리 강제하지 말 것 (2-B-2 적용 후 실측값 보고 판단).**
5. **LayoutEngine의 역할(공간 분석)과 Renderer의 역할(출력 형태)을 혼동하지 말 것.**
6. **실제 측정 없이 추측만으로 코드를 대규모 수정하지 말 것.**
7. **기존 65개 테스트의 통과를 반드시 유지할 것.**
8. **실제 Figma 변환 결과(OpenXML 태그)를 확인하지 않고 다음 단계로 넘어가지 말 것.**

### 개발 실행 사이클:
$$\text{실측 및 분석} \longrightarrow \text{최소 변경 설계} \longrightarrow \text{단위 테스트} \longrightarrow \text{실제 Figma 재검증} \longrightarrow \text{Git Commit} \longrightarrow \text{다음 단계}$$

---

## STEP 2-B-6 기록

배경만 있고 테두리와 패딩이 없는 1×1 wrapper 57개 가운데, 자식이 글자 칩으로만 된 1×N 2개만 부모 표를 제거했다. 부모 배경은 자식 표의 `w:tblPr/w:shd`로 옮긴다. 칸마다 배경을 칠하지 않는다.

- 대상: 부모 배경만 있음, 테두리 없음, 패딩 0, 자식 1×N, 각 칸이 문단 또는 단일 텍스트 칩, 이미지 없음.
- 제외: 패딩, 테두리, 이미지 29개, shape가 섞인 26개, 중첩 표, UNSAFE 64개.
- 구현: `renderConditionalBackgroundWrapper`. 조건이 하나라도 다르면 기존 1×1 표를 유지한다.
- 테스트: 기존 91 + 신규 10 = 101, 실패 0. `npm run build`, `npm run build:web` 통과.
- 동일 Figma: Tables 3064→3062, Nested 3025→3023, depth 11. 텍스트 3934, 이미지 63, 페이지 나누기 38 유지.
- Word: `01 고객 발굴` / `02 FC 배정` / `03 배정결과` 3열이 한 줄로 남아 있고, 칩 배경 `F5F7FA`가 문단에 유지된다.
- 다음 후보: 이미지 없는 shape 혼합 26개와 패딩 wrapper. 이번 단계에서 처리하지 않음.

---

## 🚀 빠른 시작 및 실행 명령어

```bash
# 의존성 설치
npm install
npm --prefix apps/web install

# 빌드 검증
npm run build
npm run build:web

# 전체 테스트 실행 (2026-10-08 기준 101개)
npm test

# Figma URL 직접 변환 (CLI)
npm run convert:url -- "https://www.figma.com/design/:key/:title?node-id=0-1" --token "figd_xxxx"

# 로컬 웹 변환기 UI 실행 (브라우저 http://localhost:5173)
npm run dev:web
```
