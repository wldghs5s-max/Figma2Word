# Figma2Word

> **Figma 디자인을 분석하여 Microsoft Word 문서(`.docx`)로 최대한 유사하고 실용적인 문서로 재구성하는 개인 업무용 로컬 변환 도구**

본 프로젝트는 상용 SaaS나 판매용 제품이 아니며, 회사의 반복적인 Figma → Word 문서화(제안서, 기획서, 보고서 등) 작업을 단축하기 위한 **로컬 우선(Local-first) 업무 도구**입니다.

상세 개발 지침과 원칙은 [Figma2Word_PROJECT_CHARTER.md](file:///c:/Users/77/Documents/Figma2Word/Figma2Word_PROJECT_CHARTER.md)를 참조하십시오.

---

## 🚀 빠른 시작 (Quick Start)

### 1. 사전 요구사항
- Node.js 18 이상 (Node v24+ 권장)
- npm 9 이상

### 2. 설치
```bash
# 루트 의존성 설치
npm install

# 웹 UI 의존성 설치 (필요 시)
npm --prefix apps/web install
```

### 3. 빌드 및 테스트
```bash
# TypeScript 컴파일 검증
npm run build

# 자동 단위 및 통합 테스트 실행 (Vitest)
npm test
```

### 4. 샘플 Figma Fixture 일괄 DOCX 변환
```bash
# samples/figma/ 내의 모든 샘플 JSON 변환 실행
npm run convert

# 특정 Figma JSON 파일 변환
npm run convert -- samples/figma/card-layout.json
```
생성된 결과물은 [samples/output/](file:///c:/Users/77/Documents/Figma2Word/samples/output) 폴더에 `.docx` 파일로 저장됩니다.

### 5. 로컬 웹 변환기 UI 실행
```bash
npm run dev:web
```
브라우저에서 직접 Figma JSON을 입력/업로드하고, 모드(Balanced / Fidelity / Editability)를 선택하여 즉시 `.docx` 파일로 변환 및 다운로드할 수 있습니다.

---

## 🏗️ 핵심 아키텍처

Figma와 DOCX를 직접 결합하지 않고, 중간 표현 계층(IR)을 두어 높은 유지보수성과 확장성을 보장합니다.

```text
Figma AST (JSON / API)
       ↓
Figma Parser (노드 분류, 지원 상태 리포팅)
       ↓
Internal Document Model (독립적인 IR 계층 - Zod 검증)
       ↓
Layout Strategy (Hybrid: Auto Layout + Flow 정렬)
       ↓
DOCX Renderer (Word Native Elements)
       ↓
Microsoft Word (.docx)
```

### 핵심 변환 매핑 전략 (Hybrid Strategy)
- **텍스트/제목**: Word Native `Heading` & `Paragraph` (수정 가능)
- **카드/배경 박스**: Word Native `1x1 Shaded Table` (배경색, 테두리, 내부 텍스트 수정 가능)
- **Auto Layout (가로)**: Word Native `1행 N열 Table` (반응형 다단 컬럼 유지)
- **표(Table)**: Word Native `Table` (셀 병합, 배경, 패딩 지원)
- **이미지**: Word Native `ImageRun` (종횡비 유지)
- **복잡한 그래픽/벡터**: Image Fallback

---

## 📁 디렉터리 구조

```text
figma2word/
├── src/
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
│   ├── figma/           # 검증용 Figma AST JSON 파일들
│   └── output/          # 변환 완료된 실제 .docx 파일들
├── tests/               # Vitest 단위 및 통합 테스트 슈트
├── docs/                # 상세 기술 문서
│   ├── PROJECT_STATUS.md
│   ├── TECHNICAL_DECISIONS.md
│   ├── PHASE_0_FEASIBILITY.md
│   ├── DOCUMENT_MODEL.md
│   ├── CONVERSION_SUPPORT_MATRIX.md
│   └── NEXT_STEPS.md
└── Figma2Word_PROJECT_CHARTER.md # 최상위 프로젝트 헌장
```

---

## 📚 상세 문서 목록

- [프로젝트 진행 현황 보고서](file:///c:/Users/77/Documents/Figma2Word/docs/PROJECT_STATUS.md)
- [기술적 의사결정 기록서](file:///c:/Users/77/Documents/Figma2Word/docs/TECHNICAL_DECISIONS.md)
- [실제 Figma 데이터 검증 보고서 (Phase 2)](file:///c:/Users/77/Documents/Figma2Word/docs/REAL_FIGMA_VALIDATION.md)
- [레이아웃 한계 분석 및 문제 분류서](file:///c:/Users/77/Documents/Figma2Word/docs/LAYOUT_LIMITATIONS.md)
- [변환 가능성 및 한계 검증서 (Phase 0)](file:///c:/Users/77/Documents/Figma2Word/docs/PHASE_0_FEASIBILITY.md)
- [Internal Document Model 설계서](file:///c:/Users/77/Documents/Figma2Word/docs/DOCUMENT_MODEL.md)
- [변환 지원 매트릭스](file:///c:/Users/77/Documents/Figma2Word/docs/CONVERSION_SUPPORT_MATRIX.md)
- [다음 작업자 인수인계 가이드](file:///c:/Users/77/Documents/Figma2Word/docs/NEXT_STEPS.md)

