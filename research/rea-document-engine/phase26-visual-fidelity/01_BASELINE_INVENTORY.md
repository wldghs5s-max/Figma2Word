# Phase 26 — 01. 저장소 및 기준선 재확인 보고서 (Baseline Inventory)

**문서 작성 일시**: 2026-10-20  
**작업자**: Antigravity (Google DeepMind Advanced Agentic Coding)  
**대상 저장소**: `Figma2Word` (`/Users/mac/projects/Figma2Word/Figma2Word`)  
**Git HEAD**: `992c12a1c3e67f41e37b8020c88c6ba70504721c` (Branch: `master`, origin/master 동기화 완료)

---

## 1. 개요 및 저장소 상태

본 문서는 Phase 26(Figma ↔ DOCX 시각적 충실도 측정 및 범용 렌더링 개선)의 첫 번째 단계로서, 직전 Phase 25 및 25V에서 안정화된 소스 코드, 렌더링 엔진, 원본 데이터 자산, 네이티브 Word 실행 환경의 기준선을 실측하고 문서화한다.

### 1.1 Git 및 빌드 기준선
- **Git HEAD**: `992c12a` (`fix(canvas): replace invalid w:noWrap with ECMA-376 compliant w:wordWrap in docx paragraph properties`)
- **직전 커밋**: `ed7922f` (`feat(canvas): Phase 25/25V visual fidelity & independent evidence package`)
- **TypeScript 타입 체크**: `npx tsc --noEmit` 통과 (오류 0건)
- **핵심 엔진 회귀 테스트**:
  - `tests/canvas-engine.test.ts`: 17개 테스트 전수 통과 (`17/17 passed`)
  - `tests/phase25-web-ui-fidelity.test.ts`: 4개 테스트 전수 통과 (`4/4 passed`)

---

## 2. 렌더링 엔진 현황 분석

### 2.1 DOCX Canvas Renderer (`src/canvas/renderer/docxCanvasRenderer.ts`)
1. **페이지별 `w:sectPr` 강제 격리**:
   - VML 절대좌표계(`position:absolute;margin-left:...;margin-top:...`)에서 Word는 섹션 단위로 그리기 원점 `(0,0)`을 초기화함.
   - 직전 버전에서는 인접 페이지의 규격이 같으면 섹션 브레이크를 생략하여 2개 이상의 화면이 1페이지에 겹쳐 그려지는 결함(Collision)이 발생함.
   - 현재 코드는 마지막 페이지를 제외한 모든 페이지 단락 끝에 `<w:sectPr><w:type w:val="nextPage"/>...</w:sectPr>`를 강제하여 17개 페이지를 독립 좌표계로 분리함.
2. **ECMA-376 표준 준수 wordWrap 속성**:
   - 단일행 자동너비 텍스트(`WIDTH_AND_HEIGHT`)에 대해 유효하지 않은 `<w:noWrap/>`를 제거하고, ECMA-376 Part 1 §17.3.1.44 규격인 `<w:wordWrap w:val="0"/>`를 적용함.
   - 이에 따라 Microsoft Word for Mac 열람 시 "손상된 파일" 오류 다이얼로그가 완전히 해결됨.
3. **단일행 텍스트 너비 완충**:
   - 단일행 자동너비 텍스트에 대해 `Math.max(3, effectiveWidth * 0.03)`의 수평 버퍼를 추가하여 DirectWrite/시스템 폰트 치환 시 조기 줄바꿈 방지.
4. **물리적 한계 클램핑**:
   - Word의 22인치(1584 pt) 제한을 방어하기 위해 `Math.min(1584, pageWidthPt)` 적용 중.

### 2.2 Figma Canvas Parser (`src/canvas/parser/figmaCanvasParser.ts`)
1. **프레임 발견 (`discoverPageFrames`)**:
   - 최상위 노드 중 `FRAME`, `COMPONENT`, `GROUP`을 후보로 수집.
   - 디자이너 플러그인에서 주입한 측정선 컨테이너(이름에 `📏`, `container`, `redline`, `measurement` 포함 또는 자식에 `INNER_PADDING`, `REDLINE` 등 포함)는 문서 페이지에서 자동 제외.
2. **읽기 순서(Reading Order) 정렬**:
   - 후보 프레임들을 Y좌표(허용오차 100px) 우선, X좌표 보조 기준으로 정렬하여 문서 페이지 순서 부여.

---

## 3. 원본 자산 및 17개 프레임 정확한 실측 매핑

### 3.1 원본 자산 현황
- **원본 JSON**: `debug/phase25-web-ui-fidelity/pentech_v3_original.json` (186.52 MB, 195,582,942 bytes)
  - SHA-256: `390e774379c9ff9bdc72e0b1918c557e9ea9f3128662692456f8e84a82e0527a`
  - Figma 노드: `node-id: 756-2`, 명칭: `디자인 보완`
  - 자식 노드: 총 30개 (프레임 15개, 그룹 1개, 도형/텍스트 14개)
- **생성된 기준 DOCX**:
  - `debug/phase25v-gpt-review/before.docx` (15.01 MB, SHA-256: `a9fa4e49...`) — 섹션 15개, 3곳 충돌
  - `debug/phase25v-gpt-review/after.docx` (15.00 MB, SHA-256: `f8bd3078...`) — 섹션 17개, 충돌 0곳

### 3.2 원본 JSON 실제 17개 프레임 전수 실측 매핑 테이블
> **원칙 준수**: 이전 보고서의 임의 추정 명칭을 배제하고, 원본 JSON의 실제 `frameId`, `frameName`, `absoluteBoundingBox`를 100% 실측 매핑함.

| Page | Figma Frame ID | Figma Frame 실제 명칭 | 원본 Figma 크기 (px) | Canvas IR 크기 (pt) | 방향 | 요소 수 | 비고 |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| **01** | `763:5068` | `디자인 시스템 1` | 1920 × 1080 | 1440.0 × 810.0 | Landscape | 72 | 디자인 가이드 (색상/폰트) |
| **02** | `766:256` | `디자인 시스템 2` | 1920 × 1080 | 1440.0 × 810.0 | Landscape | 50 | 디자인 가이드 (버튼/인풋) — *Before 충돌 분리* |
| **03** | `757:88` | `Desktop - 1` | 1440 × 1024 | 841.9 × 595.3 | Landscape | 1 | A4 Fit 변환 화면 (단일 이미지) |
| **04** | `759:759` | `Desktop - 대시보드 (지도뷰)` | 1920 × 1170 | 1440.0 × 877.5 | Landscape | 100 | 메인 대시보드 지도 화면 |
| **05** | `757:92` | `Desktop - 2` | 1449 × 1580 | 1086.8 × 1185.0 | Portrait | 9 | 대시보드 상세 + 리뷰 코멘트 |
| **06** | `757:142` | `촬영계획` | 1449 × 1083 | 1086.8 × 812.3 | Landscape | 4 | 촬영 계획 화면 |
| **07** | `757:158` | `촬영계획 - 건물을 선택시` | 1449 × 1083 | 1086.8 × 812.3 | Landscape | 1 | 건물 선택 모달 뷰 — *Before 충돌 분리* |
| **08** | `759:911` | `사업목록 선택된 화면` | 1920 × 1170 | 1440.0 × 877.5 | Landscape | 101 | 좌측 목록 + 우측 지도 뷰 |
| **09** | `757:124` | `필터 팝업` | 1178 × 1291 | 883.5 × 968.3 | Portrait | 4 | 필터 팝업 모달 화면 |
| **10** | `759:1076` | `신규등록 - 1` | 1920 × 1170 | 1440.0 × 877.5 | Landscape | 152 | 신규등록 Step 1 모달 화면 |
| **11** | `766:2289` | `필터` | 504 × 613 | 378.0 × 459.8 | Portrait | 71 | 필터 독립 모달 컴포넌트 |
| **12** | `757:118` | `Frame 1` | 1178 × 1291 | 883.5 × 968.3 | Portrait | 6 | 사업정보 수정 피드백 화면 |
| **13** | `766:2942` | `사업정보 수정` | 504 × 935 | 378.0 × 701.3 | Portrait | 89 | 사업정보 수정 폼 모달 |
| **14** | `759:1314` | `신규등록 - 2` | 1920 × 1170 | 1440.0 × 877.5 | Landscape | 141 | 신규등록 Step 2 모달 화면 |
| **15** | `759:1858` | `사업목록 클릭 시` | 1920 × 1170 | 1440.0 × 877.5 | Landscape | 228 | 사업 상세 촬영계획 — *Before 충돌 분리* |
| **16** | `759:1533` | `사업목록 클릭 시 - 탭디자인1` | 1920 × 1221 | 1440.0 × 915.8 | Landscape | 209 | 사업 상세 탭 UI 화면 |
| **17** | `768:3434` | `사업목록 클릭 시` | 1920 × 1170 | 1440.0 × 877.5 | Landscape | 83 | 사업 상세 KMZ 뷰 화면 |

---

## 4. Microsoft Word 실행 환경 및 자동화 상태

- **운영체제**: macOS (Apple Silicon / Darwin)
- **워드 프로세서**: Microsoft Word for Mac (v16.x)
- **AppleScript 자동화 권한**: 사용자 권한 승인 완료 (`tell application "Microsoft Word" to get name` 정상 작동)
- **실측 문서 로드 결과**:
  - `after.docx` 열람 시 경고창 0건, **총 17개 섹션 (`Total Sections: 17`)** 정확히 인식됨.
  - 각 섹션의 Page Width / Page Height / Orientation이 Canvas IR 기하학과 100% 일치함.
