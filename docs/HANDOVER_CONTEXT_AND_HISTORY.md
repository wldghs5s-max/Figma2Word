# Figma2Word 프로젝트 종합 인수인계 보고서
(MASTER_HANDOVER_AND_PROMPT_STRATEGY)

> **문서 목적**: 새 대화 세션(New Chat)에서 AI/GPT가 프로젝트의 전체 역사, 코드 아키텍처, 최신 Git 상태, 실패 원인 분석 결과, 그리고 향후 프롬프트 전략을 즉시 100% 파악하고 후속 작업을 이어갈 수 있도록 작성된 종합 인수인계 문서입니다.

---

## 1. 프로젝트 개요 및 핵심 헌장 (Project Charter)

- **프로젝트 명**: Figma2Word
- **목적**: Figma 디자인 파일(URL 또는 JSON AST)을 외부 AI나 클라우드 백엔드, DB, 유료 구독 없이 **순수 로컬(Node.js / 브라우저)에서 100% 결정론적으로 Microsoft Word(`.docx`) 문서로 변환**하는 고성능 비즈니스 변환 엔진.
- **원격 저장소**: `https://github.com/wldghs5s-max/Figma2Word.git`
- **현재 브랜치**: `master` (최신 커밋: `241696a`)
- **실행 환경**: Node.js 18+ (Windows PowerShell / macOS), Browser (Vite + React)
- **핵심 기술 스택**: TypeScript, `docx` (WordprocessingML 생성 라이브러리), Vitest, Vite

---

## 2. 전체 파이프라인 아키텍처

```text
Figma URL (또는 JSON AST)
       ↓
[src/api/urlParser.ts] & [src/api/figmaClient.ts]
 (URL 파싱, REST API 호출, S3 원격 이미지 다운로드)
       ↓
[src/parser/figmaParser.ts]
 (Figma AST 순회, CANVAS/FRAME/TEXT/RECTANGLE 파싱, 정렬 교정)
       ↓
[src/layout/layoutEngine.ts]
 (Spatial Layout: 수평 행 클러스터링, 카드 오버레이 폴딩, 컬럼 비례 너비)
       ↓
[src/model/documentModel.ts] (IR: Internal Document Model)
       ↓
[src/pipeline/index.ts] (Empty Document Guard)
       ↓
[src/renderer/docxRenderer.ts]
 (Word Heading, Paragraph, Table, Shading, Border, Image Run 패킹)
       ↓
.docx (네이티브 Word 문서 출력)
```

---

## 3. Phase별 히스토리 요약 (Phase 1 ~ Phase 4.1)

| Phase | 주요 작업 및 달성 사항 | 테스트 수 | 주요 커밋 |
|---|---|:---:|:---:|
| **Phase 1** | • 초기 파이프라인 기초 구축<br>• Figma Node → IR → Word DOCX 변환 기초 | 12개 | 초기 |
| **Phase 2** | • 브라우저(Web UI) 및 Node.js(CLI) 이중 환경 지원<br>• 결정론성 검증 및 대형 Fixture 스트레스 검증 | 24개 | `d65804b` |
| **Phase 3** | • `LayoutEngine` 전격 도입<br>• P1-1 Non-Auto Layout 수평 클러스터링(`clusterHorizontalRows`)<br>• P1-2 배경 사각형 오버레이 폴딩(`foldContainedOverlays`)<br>• P1-3 Fixed vs Fill 컬럼 비례 너비 계산 | 32개 | `4ff1769` |
| **Phase 4** | • 공식 Figma REST API 클라이언트 구축 (`FigmaClient`)<br>• 라이브 URL 자동 파싱 및 S3 이미지 자동 다운로드<br>• 실무형 복합 Fixture E2E 검증 및 GitHub 원격 최초 연결 | 50개 | `b756b8c` |
| **Phase 4.1** | • 실제 개인 Figma 실사용 테스트 피드백 대응:<br>  - **4.1-A**: `CANVAS` 노드(`node-id=0-1`) 지원 + 빈 문서 패킹 가드 (`13136a1`)<br>  - **4.1-B**: `_isRowCell` 플래그 분리로 다단 카드 가로 배치 보존 (`92a2fab`)<br>  - **4.1-C**: 헤더 오버레이 가로 자동 추론 + X축 좌→우 정렬 교정 (`8ecf5a4`)<br>  - **4.1-D**: 문단/제목 상하 여백(`spacing`) 압축 최적화 (`9798461`)<br>• 공식 문서 업데이트 및 GitHub push (`241696a`) | **58개**<br>(100% 통과) | `241696a` |

---

## 4. 최신 이슈: 실제 Figma E2E 재검증 실패 분석 (오늘의 핵심 발견)

Phase 4.1 배포 후 실제 복합 비즈니스 디자인(보험 보장분석 요약 대시보드)으로 실사용 테스트를 수행한 결과, Mock 테스트에서는 발견되지 않았던 심각한 문제가 발생했습니다.

로컬의 실제 결과 파일(`debug/real-figma-whole.docx`, `debug/real-figma-frame.docx`)을 압축 해제하여 OpenXML을 전수 분석한 결과입니다.

### 4.1 정량적 OpenXML 비교 데이터

```text
========================================================================================
측정 항목                          Test A: 전체 프로젝트           Test B: 단일 Frame
========================================================================================
DOCX ZIP 파일 크기                 185.6 KB                       13.6 KB
word/document.xml 크기             7,107,565 bytes (7.11 MB!)     121,981 bytes (122 KB)
총 Paragraph (<w:p>) 수            3,744개                        62개
총 Table (<w:tbl>) 수              4,817개                        88개
Nested Table 수 (중첩 테이블)      4,806개 (99.8%)                87개 (98.9%)
최대 Table 중첩 깊이 (Depth)       11단계 (Depth 11)              7단계 (Depth 7)
폭 100% 테이블 비율 (w:w="5000")   4,817개 (100.0%)               88개 (100.0%)
텍스트 노드 수                     3,679개                        62개
루트 화면 수                       11개 화면 (캔버스 전체)        1개 화면
Word 실행 결과                     100% CPU 동결 / 스크롤 불가     정상 구동되나 레이아웃 붕괴
========================================================================================
```

### 4.2 두 가지 실패의 근본 원인 (규명 완료)

#### [문제 1] 전체 파일에서 Word가 멈추는 이유 (Test A)
1. **Canvas Flattening 버그**:
   - `figmaParser.ts`가 `CANVAS` 하위의 **11개 전체 화면(Screens)**을 단일 배열로 평탄화하여 하나의 Word 문서 섹션에 페이지 구분(`Page Break`) 없이 한꺼번에 쏟아부었습니다.
2. **테이블 4,817개 및 11단계 중첩으로 인한 계산량 폭발**:
   - Word 레이아웃 엔진이 11겹으로 중첩된 4,817개의 100% 폭 테이블에 대해 페이지 분할(Pagination)과 열 너비 재귀 계산(Reflow)을 수행하다가 UI 렌더링 스레드가 완전히 정지(Freeze/Hang)했습니다.

#### [문제 2] 단일 Frame에서 레이아웃이 "고기 파편"처럼 깨지는 이유 (Test B)
1. **텍스트 62개 대비 테이블 88개 — 작은 도형까지 100% 폭 블록 테이블화**:
   - `docxRenderer.ts`에서 배경/테두리가 있는 컨테이너와 모든 사각형(Rectangle)을 무조건 폭 100%의 Word Table로 감쌉니다.
   - 피그마의 **20~30px짜리 작은 뱃지("7건", "2건"), 아이콘 배경, 컬러 도트**까지 전부 한 줄을 통째로 차지하는 100% 폭 테이블 블록이 되어, 나란히 있어야 할 요소들이 위아래로 한 줄씩 찢어져 적층되었습니다.
2. **7단계 테이블 중첩으로 내부 셀 가용 폭 소멸**:
   - 화면 → 카드 그룹 → 요약 카드 → 헤더 → 뱃지 래퍼 → 뱃지 사각형 → 텍스트로 파고들면서 안쪽 셀의 실제 너비가 수 밀리미터 단위로 축소되어 텍스트가 찌그러졌습니다.

---

## 5. 핵심 코드베이스 구조 및 파일 가이드

```text
Figma2Word/
├── src/
│   ├── api/
│   │   ├── figmaClient.ts       # Figma REST API (File, Nodes, Image fills S3 다운로드)
│   │   ├── urlParser.ts         # Figma URL 파서 (?node-id= 파싱 및 : 정규화)
│   │   └── types.ts
│   ├── parser/
│   │   ├── figmaParser.ts       # Figma AST 순회 (CANVAS 처리, 요소 분류, 정렬)
│   │   └── types.ts             # FigmaNode 스키마
│   ├── layout/
│   │   └── layoutEngine.ts      # Spatial Layout (Row 클러스터링, 오버레이 폴딩, 컬럼 비례)
│   ├── model/
│   │   ├── documentModel.ts     # IR Document 정의
│   │   └── types.ts             # DocElement (Heading, Paragraph, Table, Container, Shape)
│   ├── renderer/
│   │   └── docxRenderer.ts      # Word OpenXML 변환 (Heading, Paragraph, Table, Shading)
│   ├── pipeline/
│   │   └── index.ts             # 파이프라인 관통 및 Empty Document Guard
│   └── cli.ts                   # CLI 실행기 (npm run convert:url)
├── debug/
│   ├── real-figma-whole.docx    # 실제 전체 파일 변환 결과 (Word 멈춤 현상 재현 파일)
│   ├── real-figma-frame.docx    # 실제 단일 Frame 변환 결과 (레이아웃 붕괴 재현 파일)
│   ├── unpacked-whole/          # 압축 해제된 whole OpenXML
│   └── unpacked-frame/          # 압축 해제된 frame OpenXML
├── docs/
│   ├── PROJECT_STATUS.md
│   ├── CONVERSION_SUPPORT_MATRIX.md
│   ├── NEXT_STEPS.md
│   └── REAL_FIGMA_E2E_FAILURE_ANALYSIS.md  # [중요] 최신 실패 분석 상세 보고서
└── tests/                       # 15개 파일, 58개 테스트 (100% 통과 유지 필수)
```

---

## 6. 새 세션(GPT)을 위한 후속 프롬프트 전략 가이드

새 대화 세션에서 GPT에게 후속 작업 프롬프트를 요청할 때, 아래의 **핵심 설계 방향과 제약 사항**을 그대로 전달해야 합니다.

### 6.1 핵심 해결 전략 (Option B + Option C 결합)

1. **전략 1: Canvas 하위 Multi-Frame의 화면별 페이지 격리 (Option B)**
   - `CANVAS` 바로 아래에 존재하는 최상위 Screen Frame들을 단일 리스트로 flatten하지 않습니다.
   - 각 Screen Frame 사이에 Word의 **페이지 나누기(`new Paragraph({ children: [new PageBreak()] })`)** 또는 **섹션(`DocumentSection`)**을 삽입하여 화면별로 레이아웃 컨텍스트를 완벽히 격리합니다.
   - 이를 통해 11개 화면이 서로 간섭하는 현상과 Word 엔진의 단일 플로우 계산량 폭발을 원천 방지합니다.

2. **전략 2: Word Table 래핑 조건 엄격화 (Option C)**
   - **(a) 내용물 없는 단순 사각형 도형의 테이블화 금지**:
     - 텍스트나 자식이 없는 순수 장식 사각형, 아이콘 배경 등은 100% 폭의 Word Table로 만들지 않고, 무시하거나 인라인/도형 흐름으로 처리합니다.
   - **(b) 순수 레이아웃용 투명 Frame의 평탄화(Flatten)**:
     - 배경색(`fill`)과 테두리(`border`)가 없는 오토레이아웃 Frame은 Table을 생성하지 않고, 내부 자식들의 단락 흐름(Flow)으로 풀어냅니다.
   - **(c) 최대 Table 중첩 깊이 제한 (Max Depth Cap)**:
     - Table 중첩 깊이를 최대 2~3단계로 제한합니다. 3단계를 초과하는 안쪽 컨테이너는 1x1 Table을 생성하지 않고 부모 셀 안의 일반 단락/텍스트로 렌더링합니다.

### 6.2 프롬프트 작성 시 반드시 지켜야 할 원칙 (Safety Rules)

1. **기존 아키텍처 폐기 금지**: 기존 Parser → LayoutEngine → IR → Renderer 파이프라인 유지.
2. **테스트 58개 100% 회귀 방지**: 기존 단위/통합 테스트가 단 1개도 깨지지 않아야 함.
3. **단계별 점진적 진행 및 Git 커밋**:
   - Step 1: Canvas Multi-Frame 페이지 격리
   - Step 2: Table 래핑 기준 엄격화 및 중첩 깊이 제한
   - Step 3: 실제 Figma 파일 재검증
4. **특정 파일 전용 하드코딩 금지**: 일반적인 Figma UI 디자인 규칙에 기반한 설계 유지.

