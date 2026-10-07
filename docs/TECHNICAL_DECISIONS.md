# Figma2Word 기술적 의사결정 기록서 (TECHNICAL_DECISIONS)

본 문서는 Figma2Word 프로젝트의 핵심 아키텍처 및 기술 스택 선정 이유와 배경을 기록한다.

---

## 1. DOCX 생성 라이브러리 선정

### 선정: `docx` (dolanmiu/docx, v9.9.0)

### 검토된 대안들:
1. `docx`: 가장 널리 사용되고 유지보수가 활발한 TypeScript 네이티브 DOCX 생성기. Word OpenXML 표준을 정교하게 캡슐화. 브라우저/Node.js 양쪽 환경 지원 (`toBuffer`, `toBlob`).
2. `officegen`: Node.js 레거시 라이브러리. 유지보수 정체 및 TypeScript 지원 미흡.
3. `docxtemplater`: 템플릿 기반 치환 라이브러리. 빈 도큐먼트에서 동적 레이아웃 생성에 부적합.
4. OpenXML 직접 수동 조작 (JSZip + XML): 개발 비용 및 복잡도 폭발 (Charter 2.3 위배).

### 선정 이유:
- Word의 문단, 헤딩, 표, 이미지, 셀 패딩, 음영, 테두리, 머리글/바닥글을 완벽히 제어 가능.
- 타입 안전성 및 Node/브라우저 동시 동작 보장.

---

## 2. 중간 표현 계층(Internal Document Model)의 설계 원칙

### 핵심 원칙: Figma AST와 DOCX API의 강결합 방지

```text
[Figma Node Tree]  →  [Figma Parser]  →  [Internal Document Model]  →  [DOCX Renderer]  →  [.docx]
```

1. **독립성 (Decoupling)**:
   - Figma의 특정 노드 속성(예: `characters`, `layoutMode`)을 DOCX 렌더러가 직접 알지 못하게 차단.
   - DOCX 렌더러의 XML 특화 단위(`twip/dxa`, `half-points`)를 파서가 알지 못하게 차단.
2. **이중 검증 체계 (Dual Safety)**:
   - 정적 TypeScript 타입으로 개발 단계의 생산성 확보.
   - `Zod` 스키마로 런타임 데이터 유효성 검증 및 기본값(default fallback) 안전망 제공.

---

## 3. 절대 좌표(x, y) vs Flow 레이아웃 문제 해결 전략

### 문제 상황:
- Figma: 캔버스 기반 2D 절대 좌표 시스템 (`x, y, width, height`).
- Word: 위에서 아래로 흐르는 단락/페이지 기반 Flow 레이아웃 시스템.
- 무조건적인 Word Floating Shape 좌표 배치는 페이지 넘어감 시 레이아웃 붕괴, 텍스트 겹침 등 심각한 편집성 결함을 유발함.

### 검토된 전략:
- **Strategy A (Native Flow)**: 모든 요소를 단순 단락 순서로 나열 -> 레이아웃 충실도 낮음.
- **Strategy B (Table Grid)**: 전체 페이지를 바둑판식 테이블로 분할 -> Word 편집 시 셀 병합 복잡도로 수정 불가.
- **Strategy C (Positioned Objects)**: OpenXML Floating Shape 사용 -> 페이지 나누기 시 텍스트 짤림 및 Word 호환성 취약.
- **Strategy D (Image Composition)**: 전체를 통이미지화 -> 편집성 0% (Charter 목적 상실).
- **Strategy E (Hybrid - 채택)**:
  1. Auto Layout 컨테이너는 Word Native Container / Table로 1:1 매핑 (완벽한 반응형 흐름 보장).
  2. Freeform 절대좌표 요소는 Y축 기준 오름차순으로 정렬하여 자연스러운 독서 흐름 유지.
  3. 카드 및 박스 형태(Rectangle/Frame)는 Word 1x1 Shaded Table로 변환하여 배경색과 테두리를 보존하고 내부 텍스트 수정 가능하게 함.
  4. 복잡한 그래픽/아이콘은 Image/Shape Fallback 적용.

---

## 4. 프로젝트 구조 및 패키징 결정

### 결정: 모듈식 단일 저장소 구조 (Single Package with Clear Layering)

- **배경**: Turborepo, Lerna 등의 과도한 모노레포 도구는 초기 단계에서 의존성 관리 및 빌드 파이프라인의 불필요한 인프라 복잡도를 초래함 (Project Charter 2.2, 2.3 지침).
- **구조**:
  - `src/model/`: 도큐먼트 IR 스키마 및 스타일 모델
  - `src/parser/`: Figma AST 파싱 및 노드 분류
  - `src/renderer/`: DOCX 렌더링 및 XML 단위 변환
  - `src/pipeline/`: 통합 변환 파이프라인
  - `src/cli.ts`: 로컬 실행 CLI
  - `apps/web/`: React + Vite 로컬 웹 인터페이스
- **효과**: `npm install` -> `npm test` -> `npm run convert`가 단 1초 만에 실행되는 극도의 간결함과 명확성 달성.

---

## 5. 기능 지원 상태 투명성 (Transparency Policy)

Figma의 모든 기능을 억지로 지원된다고 속이지 않으며, 파서 실행 시 노드 단위로 4개 상태 중 하나로 명확히 분류하고 통계를 집계한다:
1. `Supported`: Word 네이티브 요소로 손실 없이 정확히 매핑됨.
2. `Partially Supported`: 기본 구조는 보존되나 세부 시각 효과(예: 모서리 곡률, 그림자)가 근사치로 처리됨.
3. `Unsupported`: Word에서 지원 불가능하여 건너뜀 (예: Blur, Blend Mode).
4. `Fallback`: 벡터 패스 등이 일반 도형이나 이미지 대체물로 안전하게 렌더링됨.
