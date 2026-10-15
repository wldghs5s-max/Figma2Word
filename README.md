# Figma2Word

> **Figma 디자인을 분석하여 Microsoft Word(`.docx`) 및 한컴오피스 한글(`.hwpx`) 네이티브 문서로 손실 없이 재구성하는 로컬 우선(Local-first) 결정론적 듀얼 문서 엔진**

본 프로젝트는 외부 AI API, 클라우드 백엔드, 유료 구독 서비스에 일절 의존하지 않고, **순수 로컬(Node.js / 브라우저) 환경에서 100% 규칙 기반(Deterministic Rule-based)으로 실행되는 고성능 비즈니스 문서 변환 엔진**입니다.

---

## 📌 프로젝트 현황 및 MVP 성숙도 요약

- **현재 브랜치**: `master`
- **엔진 버전**: **Phase 16 Hardened (Internally Usable MVP)**
- **외부 독립 감사 대응**: Argon Audit (H1~H4 전 트랙, F-01 ~ F-18 전수 재현 및 수정 완료)
- **테스트 현황**: 53개 테스트 파일 / 325개 이상 테스트 100% 통과 (Vitest)
- **빌드 상태**: `npm run build`, `npm run build:web` 빌드 성공
- **지원 포맷**: DOCX (WordprocessingML / VML), HWPX (OWPML KS X 6101), 양방향 교차 변환 (DOCX → HWPX)

---

## 🏗️ 1. 듀얼 엔진 아키텍처 (Dual Engine Architecture)

Figma2Word는 문서의 용도와 특성에 맞추어 두 가지 독립적인 변환 엔진을 제공합니다:

```text
                               ┌────────────────────────────────────────────────┐
                               │             입력 (Input Sources)               │
                               │  - Figma REST API Live URL                     │
                               │  - Figma JSON 스냅샷 파일                       │
                               │  - 기존 DOCX 파일 (Canvas 변환)                │
                               └───────────────────────┬────────────────────────┘
                                                       │
                           ┌───────────────────────────┴───────────────────────────┐
                           ▼                                                       ▼
            ┌─────────────────────────────┐                         ┌─────────────────────────────┐
            │   Canvas IR 엔진 (--engine canvas) │                         │    Flow 엔진 (--engine flow) │
            │  (Phase 13~16 2D 절대좌표)   │                         │  (Phase 1~12 시맨틱 리플로우) │
            └──────────────┬──────────────┘                         └──────────────┬──────────────┘
                           │                                                       │
                           ▼                                                       ▼
            ┌─────────────────────────────┐                         ┌─────────────────────────────┐
            │   Canvas IR (Intermediate)  │                         │ Internal Document Model(IR) │
            │   - 2D Bounding Box (pt)    │                         │ - Sections & Headings       │
            │   - Typography & TextRuns   │                         │ - Flow Paragraphs & Tables  │
            │   - Native VML / HWPX Vector│                         │ - Clustered Rows & Cards    │
            │   - Universal Media Resource│                         └──────────────┬──────────────┘
            └──────────────┬──────────────┘                                        │
                           │                                                       │
              ┌────────────┴────────────┐                                          │
              ▼                         ▼                                          ▼
┌──────────────────────────┐ ┌──────────────────────────┐        ┌──────────────────────────┐
│   DOCX Canvas Renderer   │ │   HWPX Canvas Renderer   │        │     DOCX Flow Renderer   │
│   (Word VML Textbox/Path)│ │  (KS X 6101 hp:drawText) │        │   (Word Native Paragraph/│
│   - w:br 줄바꿈 보존     │ │  - hp:p 문단 분할 보존   │        │    Table / Shading)      │
│   - VML 절대좌표 보정    │ │  - hp:polygon 다중 서브패스│        └──────────────┬───────────┘
│   - 동적 가로/세로 페이지│ │  - 동적 가로/세로 페이지 │                       │
└─────────────┬────────────┘ └────────────┬─────────────┘                       │
              │                           │                                     │
              ▼                           ▼                                     ▼
        출력: .docx                 출력: .hwpx                            출력: .docx
```

### 1) Canvas IR 엔진 (`--engine canvas`, 기본 권장)
- **목적**: 디자이너가 의도한 2D 캔버스 배치를 1픽셀 오차 없이 문서로 충실하게 재현.
- **DOCX 렌더러**: Word VML 2D 드로잉 레이어를 활용하여 텍스트박스, 배경 카드, 이미지, 벡터 도형을 절대 좌표로 배치.
  - 줄바꿈(`<w:br/>`) 보존, VML 절대좌표(`m, l, c`) 및 SVG 좌표계 완벽 매핑.
- **HWPX 렌더러**: 국가 표준 KS X 6101 OWPML을 완벽 준수하는 한글 네이티브 드로잉 요소(`hp:drawText`, `hp:polygon`, `hp:pic`, `hp:rect`, `hp:oval`) 생성.
  - 다중 줄바꿈 시 독립 문단(`<hp:p>`) 분할, 다중 서브패스 보존, JPEG/PNG MIME 분기 처리.
- **DOCX → HWPX 역변환**: 기존 Canvas DOCX 문서를 역파싱하여 HWPX 문서로 직접 교차 변환.

### 2) Flow 엔진 (`--engine flow`)
- **목적**: 문단, 표, 제목 등 텍스트 중심의 리플로우(Reflowable) 문서를 작성할 때 사용.
- Figma 오토레이아웃과 공간 클러스터링 알고리즘을 활용하여 중첩 프레임을 Word 네이티브 단락과 테이블로 구조화.

---

## 🚀 2. 설치 및 실행 방법

### 요구 사항
- **Node.js**: v18.0.0 이상
- **패키지 매니저**: `npm`
- **OS**: Windows, macOS, Linux (완전 크로스 플랫폼)

### 설치
```bash
git clone https://github.com/your-org/Figma2Word.git
cd Figma2Word
npm install
```

### CLI 명령어 사용법

#### 1) Figma JSON 스냅샷 변환 (Canvas 듀얼 출력)
```bash
# 기본 변환 (DOCX 출력)
npm run convert -- samples/figma/sample.json --engine canvas

# DOCX와 HWPX 동시 출력
npm run convert -- samples/figma/sample.json --engine canvas --format both

# A4 가로(Landscape) 및 1:1 스케일 변환
npm run convert -- samples/figma/sample.json --engine canvas --format both --orientation landscape --scale 1:1
```

#### 2) 실시간 Figma URL 변환 (원격 이미지 자동 다운로드 포함)
```bash
# Figma URL 직접 변환 (Figma Access Token 필요)
npm run convert -- --url "https://www.figma.com/design/FILE_KEY/Title?node-id=1-2" --token "figd_xxx" --engine canvas --format both
```

#### 3) DOCX → HWPX 교차 변환
```bash
npm run convert -- document.docx --engine canvas
# -> document.hwpx 생성
```

### 웹 인터페이스 (Web UI) 실행
```bash
# 로컬 개발 서버 실행 (Vite 기반 로컬 SPA)
npm run dev:web

# 프로덕션 빌드
npm run build:web
```
브라우저에서 `http://localhost:5173`으로 접속하여 Figma URL 입력, 프리셋 선택, 로컬 파일 드래그앤드롭 변환을 즉시 사용할 수 있습니다.

---

## 🛡️ 3. 보안 및 안정성 가드 (Phase 16 Hardening)

- **브라우저 완전 격리**: 브라우저 런타임에서 `Buffer` 미정의로 인한 크래시를 원천 차단 (`Uint8Array` 기반 바이너리 처리).
- **원격 이미지 다운로드 신뢰성**: Figma REST API가 반환하는 AWS S3 원격 이미지 URL을 병렬로 안전하게 다운로드하여 Base64 인라인 임베딩.
- **경로 조작(Path Traversal) 방지**: Null 바이트(`\0`) 삽입 공격 및 비인가 경로 탐색을 차단하는 정규화 검증.
- **압축 폭탄(ZIP Bomb) 및 크기 제한**:
  - 최대 입력 파일 크기 100MB 제한.
  - 최대 ZIP 엔트리 5,000개 및 압축 해제 누적 크기 250MB 초과 시 자동 차단.
- **정직한 스코프 진단 (Honest Diagnostics)**:
  - 캔버스 2D 범위를 벗어나는 Word 인라인 표(`<w:tbl>`), ChartML(`<c:chart>`), OLE 개체 감지 시 사일런트 실패 대신 명시적 `[SCOPE_NOTICE]` 경고 발생.

---

## 📊 4. 지원 기능 및 제한 사항 매트릭스

| 범주 | Canvas IR (DOCX) | Canvas IR (HWPX) | Flow 엔진 (DOCX) |
|---|:---:|:---:|:---:|
| **텍스트 / 폰트** | 완전 지원 (`<w:br/>` 보존) | 완전 지원 (`<hp:p>` 분할) | 완전 지원 |
| **줄바꿈 다중 텍스트** | 완전 보존 | 완전 보존 | 완전 보존 |
| **배경 카드 / 모서리 곡률** | VML roundrect 지원 | OWPML rect 지원 | 테이블 셀 음영 |
| **원형 / 타원 (Ellipse)** | VML oval 지원 | OWPML oval 지원 | 이미지 래스터화 |
| **벡터 패스 (SVG/VML/KS)** | VML shape (정확한 절대좌표) | OWPML polygon (다중 서브패스) | 단순 아이콘 대체 |
| **STAR / POLYGON** | 지원 | 지원 | 카드 폴백 |
| **이미지 (PNG / JPEG)** | 원본 포맷 임베딩 | 원본 MIME/확장자 보존 | 지원 |
| **동적 페이지 가로/세로** | 지원 (`w:orient`) | 지원 (`landscape="WIDELY"`) | 지원 |
| **Word 네이티브 표 (`<w:tbl>`)** | 스코프 진단 경고 안내 | - | 중첩 표 지원 |
| **임베디드 차트 / OLE** | 스코프 진단 경고 안내 | - | 미지원 |

---

## 🧪 5. 테스트 및 검증 실행

```bash
# 전체 테스트 스위트 실행 (53개 스위트 / 325개 이상 테스트)
npm test

# Phase 16 결함 수정 전용 검증 스위트 실행
npx vitest run tests/phase16-h1-remediation.test.ts
npx vitest run tests/phase16-h2-remediation.test.ts
npx vitest run tests/phase16-h3-remediation.test.ts

# 프로덕션 빌드 검증
npm run build
npm run build:web
```

---

## 📄 6. 라이선스

본 프로젝트의 라이선스는 저장소 루트의 `LICENSE` 파일을 따릅니다.
모든 문서 파싱 및 렌더링 코드는 독자적으로 역공학 및 구현된 오픈소스 클린룸 구현체입니다.
