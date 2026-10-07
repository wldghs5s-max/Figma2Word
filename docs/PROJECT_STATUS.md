# Figma2Word 프로젝트 진행 현황 보고서 (PROJECT_STATUS)

- **보고 일시**: 2026-10-07
- **프로젝트 단계**: Phase 0 (변환 가능성 검증) 및 Phase 1 (수직 슬라이스 구축 완료)
- **대상 OS**: Windows / macOS 호환 로컬 런타임

---

## 1. 현재 구현 완료된 항목 (What is Implemented)

1. **Internal Document Model (IR 계층)**:
   - Figma AST와 Word docx를 직접 결합하지 않는 독립적인 중간 표현 모델(`src/model/`) 설계 및 구현.
   - Zod 런타임 스키마와 TypeScript 정적 타입을 동시에 제공하여 강력한 유효성 검증 제공.
   - Document, PageConfig(여백, 방향, A4/Letter 규격), Header/Footer, Section, Heading, Paragraph, Run, Table, Shape, Line, Image, Container 지원.

2. **Native DOCX Renderer (`src/renderer/`)**:
   - `docx` (dolanmiu/docx) 최신 라이브러리 기반 네이티브 DOCX 렌더링 엔진 구축.
   - 텍스트/헤딩(폰트, 크기, 볼드/이탤릭/밑줄, 색상), 이미지(Buffer/DataURI/Base64), 실선/구분선 지원.
   - 카드(Card) 및 배경 박스: Word의 1x1 Shaded Table을 활용한 완전 네이티브 편집 가능 레이아웃 렌더링.
   - 테이블(Table): 테두리, 배경 음영(Shading), 셀 패딩, 병합 속성 완벽 지원.
   - 오토레이아웃(Horizontal Flex): 1행 N열 Word Table로 안정적 다단 컬럼 자동 근사화.
   - Node.js 환경(`renderToBuffer`, `renderToFile`) 및 브라우저 환경(`renderToBlob`) 듀얼 출력 지원.

3. **Figma AST Parser (`src/parser/`)**:
   - Figma JSON 트리(DOCUMENT, CANVAS, FRAME, GROUP, TEXT, RECTANGLE, LINE, VECTOR 등) 파싱.
   - 노드 분류(Classification) 및 지원 상태(`Supported`, `Partially Supported`, `Unsupported`, `Fallback`) 자동 리포팅 시스템 내장.
   - 절대 좌표(x, y) 기반 레이아웃을 Y축 오름차순 문서 흐름(Document Flow)으로 안정적 재배열.
   - Auto Layout(HORIZONTAL, VERTICAL) 감지 및 Word 컨테이너/테이블 매핑.

4. **End-to-End 변환 파이프라인 & CLI (`src/pipeline/`, `src/cli.ts`)**:
   - `ConversionPipeline`: `Figma Input -> Parser -> IR Model -> Layout Strategy -> DOCX Renderer -> .docx` 수직 슬라이스 완성.
   - `npm run convert`: CLI 환경에서 샘플 JSON 또는 사용자 지정 JSON 파일 일괄/개별 변환 및 상세 통계 출력.

5. **자동 테스트 슈트 (`tests/`)**:
   - Vitest 기반 단위/통합 테스트 (10개 테스트 100% 통과).
   - 실제 .docx 파일 생성 및 ZIP/XML 유효성 자동 검증.

6. **로컬 웹 UI 스캐폴드 (`apps/web/`)**:
   - React + TypeScript + Vite 기반 무설치/로컬 브라우저 UI.
   - 샘플 프리셋 선택, 파일 업로드, 직접 JSON 수정, Balanced/Fidelity/Editability 모드 선택, 통계 확인, 브라우저 직접 DOCX 다운로드 지원.

---

## 2. 현재 검증 완료된 항목 (What is Verified)

- [x] **Project Charter 원칙 준수**: 불필요한 인프라(DB, Auth, Docker, Cloud) 배제 및 로컬 우선 구조 유지.
- [x] **TypeScript 빌드 무결성**: strict 컴파일러 설정 통과 (`npm run build`).
- [x] **자동 테스트 통과**: 4개 테스트 파일 10개 케이스 100% 통과 (`npm test`).
- [x] **수직 슬라이스 동작**: 3종 핵심 샘플 Fixture (`simple-document`, `card-layout`, `auto-layout`)의 실제 DOCX 파일 생성 성공 (`samples/output/*.docx`).
- [x] **생성된 DOCX 파일 무결성**: Python zipfile & XML 파서를 통해 `[Content_Types].xml`, `word/document.xml`, 유효 텍스트 추출 검증 완료.

---

## 3. 아직 검증하지 못한 것 (To Be Verified)

- **대규모 실무 Figma 디자인(수백 개 프레임/다단 중첩 컴포넌트)**에 대한 성능 및 레이아웃 안정성.
- **실제 Figma Personal Access Token 기반 Live API 연동**: 현재는 JSON Fixture 기반으로 검증됨. (API 연동 인터페이스 설계는 준비 완료)
- **복잡한 Figma 다단 테이블 자동 감지**: 표 형태의 프레임 중첩을 자동 인식하여 Word Native Table로 변환하는 심층 추론 로직.

---

## 4. 발견된 기술적 한계 및 대응 전략

| 한계점 | 원인 | 대응 전략 |
|---|---|---|
| **절대좌표 자유 배치 (Floating elements)** | Word는 기본적으로 Flow 기반 문서 레이아웃임. x, y 좌표를 무조건 Word 절대위치로 박으면 페이지 넘김 시 레이아웃 파괴 발생 | **Strategy E (Hybrid)** 채택: Y축 순서 기반 정렬 및 인접 요소 Table 그룹핑. 복잡한 그래픽은 이미지 Fallback 처리 |
| **복잡한 벡터 패스 (Vector/Boolean Op)** | DOCX는 복잡한 SVG/Vector 직접 렌더링에 제약이 있음 | SVG/PNG 래스터화 또는 Fallback 도형으로 표시 |
| **블러(Blur) 및 블렌드 모드(Blend Mode)** | Word 오피스 오픈XML 스펙 상 동일 표현 불가 | MVP 스코프에서 공식 제외 (`Unsupported` 알림 후 기본 배경 유지) |

---

## 5. 생성된 샘플 DOCX 결과물

- `samples/output/simple-document.docx`: 제목(H1), 구분선, 본문 단락, 이미지 포함.
- `samples/output/card-layout.docx`: 섹션 제목 및 2개의 둥근 카드 박스(음영 테이블) 포함.
- `samples/output/auto-layout.docx`: 3단 가로 오토레이아웃 그리드(컬럼 1, 2, 3) 포함.
- `samples/output/renderer-test-output.docx`: 헤더, 푸터, H1, H3, 테이블, 선, 이미지 통합 테스트 문서.

---

## 6. 다음 우선순위 작업 (Next Priorities)

1. 실제 회사 업무용 Figma 파일 export JSON을 확보하여 변환 테스트 (`samples/real-world/`).
2. Figma REST API 클라이언트 모듈 연동 (`FIGMA_PERSONAL_ACCESS_TOKEN`을 이용한 직접 파일 fetch).
3. Auto Layout 내 텍스트 줄바꿈(wrap) 및 유동 너비(Fill container / Hug contents) 근사치 세밀화.
