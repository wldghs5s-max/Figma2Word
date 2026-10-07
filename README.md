# Figma2Word

> **Figma 디자인을 분석하여 Microsoft Word 문서(`.docx`)로 최대한 유사하고 실용적인 문서로 재구성하는 개인 업무용 로컬 변환 도구**

본 프로젝트는 상용 SaaS나 판매용 제품이 아니며, 회사의 반복적인 Figma → Word 문서화(제안서, 기획서, 보고서 등) 작업을 단축하기 위한 **로컬 우선(Local-first) 업무 도구**입니다.

상세 개발 지침과 원칙은 [Figma2Word_PROJECT_CHARTER.md](file:///c:/Users/77/Documents/Figma2Word/Figma2Word_PROJECT_CHARTER.md)를 참조하십시오.

---

## 🚀 빠른 시작 (Quick Start)

### 1. 사전 요구사항
- Node.js 18 이상 (Node v24+ 권장)
- npm 9 이상
- (옵션) Figma Personal Access Token (PAT)

### 2. 설치 및 환경 변수 설정
```bash
# 의존성 설치
npm install
npm --prefix apps/web install

# (선택) Figma API 토큰 설정
cp .env.example .env
# .env 파일에 FIGMA_ACCESS_TOKEN=figd_xxxx 입력
```

### 3. 빌드 및 테스트
```bash
# TypeScript 컴파일 검증
npm run build

# 자동 단위/통합 테스트 (50개 테스트 전원 통과)
npm test
```

### 4. Figma URL을 통한 라이브 변환 (CLI)
```bash
# 1) 환경 변수 FIGMA_ACCESS_TOKEN 설정 후 직접 URL 변환
npm run convert:url -- "https://www.figma.com/design/:fileKey/:fileName?node-id=1-2"

# 2) 토큰을 인라인으로 전달하여 특정 출력 파일로 저장
npm run convert:url -- "https://www.figma.com/design/:fileKey/:fileName" --token "figd_xxxx" --output "my-report.docx"
```

### 5. 로컬 Figma JSON 파일 변환 (CLI)
```bash
# 특정 Figma JSON 파일 변환
npm run convert -- samples/real-world/sample-e2e-document.json
```
생성된 결과물은 [samples/output/](file:///c:/Users/77/Documents/Figma2Word/samples/output) 폴더에 `.docx` 파일로 저장됩니다.

### 6. 로컬 웹 변환기 UI 실행
```bash
npm run dev:web
```
- 브라우저에서 `http://localhost:5173` 접속
- Figma URL과 Personal Access Token을 직접 입력하여 즉시 Word 문서로 변환 및 다운로드하거나, 7종 이상의 실무/검증용 프리셋을 테스트할 수 있습니다.

---

## 🏗️ 핵심 아키텍처

Figma와 DOCX를 직접 결합하지 않고, 중간 표현 계층(IR)과 룰 기반 레이아웃 엔진(`LayoutEngine`)을 두어 높은 유지보수성과 확장성을 보장합니다.

```text
Figma URL / File Key
       ↓
FigmaClient (공식 REST API & S3 이미지 Fills 자동 다운로드)
       ↓
Figma Parser (노드 분류, 지원 상태 리포팅)
       ↓
LayoutEngine (P1-1 수평 행 클러스터링, P1-2 오버레이 폴딩, P1-3 비례 컬럼 너비)
       ↓
Internal Document Model (독립적인 IR 계층 - Zod 검증)
       ↓
DOCX Renderer (Word Native OpenXML Elements)
       ↓
Microsoft Word (.docx)
```

### 핵심 변환 매핑 전략
- **텍스트/제목**: Word Native `Heading` & `Paragraph` (수정 가능)
- **카드/배경 박스**: Word Native `1x1 Shaded Table` (배경색, 테두리, 내부 텍스트 수정 가능)
- **Auto Layout (가로)**: Word Native `1행 N열 Table` (Fixed vs Fill 비례 컬럼 너비 반영)
- **Non-Auto Layout (수평)**: Bounding Box Interval 클러스터링을 통한 자동 다열 테이블 매핑
- **이미지**: S3 원격 이미지 자동 다운로드 후 Word Native `ImageRun` 패킹
- **복잡한 그래픽/벡터**: Fallback 도형 및 알림 처리

---

## 📁 디렉터리 구조

```text
figma2word/
├── src/
│   ├── api/             # 공식 Figma REST API 클라이언트 및 URL 파서
│   ├── layout/          # Phase 3 신규 LayoutEngine (P1 해결 엔진)
│   ├── model/           # Internal Document Model (IR 계층 및 Zod 스키마)
│   ├── parser/          # Figma AST 파서 및 노드 분류기
│   ├── renderer/        # DOCX 렌더러 (docx 라이브러리 연동)
│   ├── pipeline/        # End-to-End 변환 파이프라인
│   ├── fixtures/        # 샘플 Figma AST Fixture 정의
│   ├── cli.ts           # 로컬 변환 CLI
│   └── index.ts         # 패키지 진입점
├── apps/
│   └── web/             # React + Vite 기반 로컬 웹 변환 UI
├── samples/
│   ├── figma/           # 기본 Fixture JSON 파일들
│   ├── real-world/      # 실무/스트레스 및 Phase 4 E2E JSON 파일들
│   ├── layout/          # Phase 3 P1 전용 검증 Fixture 7종
│   └── output/          # 변환 완료된 실제 .docx 파일들
├── tests/               # 50개 Vitest 단위 및 통합 테스트 슈트
├── docs/                # 상세 기술 문서
│   ├── FIGMA_API_INTEGRATION.md      # Figma API 연동 가이드
│   ├── REAL_FIGMA_E2E_VALIDATION.md  # 실제 Figma E2E 검증 보고서
│   ├── LAYOUT_STRATEGY_ANALYSIS.md   # 레이아웃 전략 비교 분석서
│   ├── LAYOUT_STRATEGY_DECISION.md   # 레이아웃 전략 의사결정서
│   ├── PROJECT_STATUS.md             # 프로젝트 진행 현황 보고서
│   ├── CONVERSION_SUPPORT_MATRIX.md  # 기능 지원 매트릭스
│   └── NEXT_STEPS.md                 # 다음 작업자 인수인계 가이드
└── Figma2Word_PROJECT_CHARTER.md     # 최상위 프로젝트 헌장
```

---

## 📚 공식 기술 문서 목록

- [Figma REST API 연동 가이드](file:///c:/Users/77/Documents/Figma2Word/docs/FIGMA_API_INTEGRATION.md)
- [실제 Figma E2E 검증 보고서 (Phase 4)](file:///c:/Users/77/Documents/Figma2Word/docs/REAL_FIGMA_E2E_VALIDATION.md)
- [레이아웃 전략 비교 분석서 (Phase 3)](file:///c:/Users/77/Documents/Figma2Word/docs/LAYOUT_STRATEGY_ANALYSIS.md)
- [레이아웃 전략 의사결정서 (Phase 3)](file:///c:/Users/77/Documents/Figma2Word/docs/LAYOUT_STRATEGY_DECISION.md)
- [프로젝트 진행 현황 보고서](file:///c:/Users/77/Documents/Figma2Word/docs/PROJECT_STATUS.md)
- [기술적 의사결정 기록서](file:///c:/Users/77/Documents/Figma2Word/docs/TECHNICAL_DECISIONS.md)
- [변환 지원 매트릭스](file:///c:/Users/77/Documents/Figma2Word/docs/CONVERSION_SUPPORT_MATRIX.md)
- [다음 작업자 인수인계 가이드](file:///c:/Users/77/Documents/Figma2Word/docs/NEXT_STEPS.md)
