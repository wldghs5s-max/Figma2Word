# Project Handoff Document
## Figma2Word Engineering Architecture & Production Capability Status

- **버전**: Phase 41 Critical Fixes & HWPX Engine Vertical Slice
- **저장소**: `wldghs5s-max/Figma2Word`
- **브랜치**: `master`
- **기준 Git HEAD**: `87b644a95cad400844e2878244b84e5ab1ccc862`
- **독립 감사자 / 엔지니어링 작업자 대상**: AI Engineering Collaborators (ChatGPT, Codex, Gemini)

---

## 1. 프로젝트의 본질과 궁극적 목표

본 프로젝트의 궁극적인 목적은 **Figma 디자인을 높은 시각적 충실도를 유지하면서 Microsoft Word에서 실제로 편집 가능한 고품질 DOCX 문서로 변환하는 범용 엔지니어링 엔진**을 구현하는 것입니다.

장기적으로 동일한 정규화된 중간 표현(Canvas IR)을 활용하여 HWPX(한글 문서) 생성까지 유연하게 확장할 수 있는 아키텍처를 지향합니다.

다음 기본 원칙을 엄격하게 준수합니다:
1. **실제 변환 품질 최우선**: 시각 충실도와 Word 실사용 편집성을 동시에 보호합니다.
2. **시각 점수 조작 행위 엄금**: 텍스트나 도형을 통짜 이미지로 대체하는 등 편집성을 훼손하는 우회는 일절 배제합니다.
3. **Fail-Closed 품질 게이트**: 불완전한 검사나 잘못된 입력으로 인한 허위 성공(False Positive)을 원천 차단합니다.
4. **정직한 출처(Provenance) 분류**: 추정 형상을 원본 복원으로 과장하지 않고, 출처를 투명하게 구분하여 보고합니다.

---

## 2. 시스템 아키텍처 및 Canvas IR 구조

```text
[Figma JSON Document]
        │
        ▼
1. Source Parser (`src/canvas/parser/figmaCanvasParser.ts`)
   - 17개 타깃 프레임 탐색, 기하학적 정규화, 오토레이아웃 계산
   - 텍스트/스타일 추출, 도형/선 추출, 이미지 노드 추출
   - 다중 자식 VECTOR 분해 합성 (`totalVectorSiblings > 1`: search 렌즈-손잡이 분해, 원, 막대 등)
   - UI 아이콘 의미적 패스 매핑 (단어 경계 기반: profile, update, rotate-cw, rotate-ccw 등)
   - circle-check 라디오버튼/체크박스 정밀 합성: 단일 벡터(미선택 원형) 및 복합 벡터(선택 원+체크) 완벽 구분
   - search 아이콘 stroke 전용 단일 원형 렌즈+대각선 손잡이 패스 합성
   - Fill & Stroke 동시 존재 노드 분리 (`strokeVectorPath`, `fillRule: evenodd`)
   - 형상 출처(Provenance) 명시적 태깅 (`geometryProvenance`, 기본도형 `PRIMITIVE_SHAPE`)
        │
        ▼
2. Intermediate Representation (Canvas IR: `src/canvas/types.ts`)
   - CanvasDocument / CanvasPage / CanvasElement
   - 해상도 독립적 절대 좌표계 (pt 단위)
   - `geometryProvenance`: SOURCE_GEOMETRY | LOCALLY_RECOVERED_GEOMETRY |
                           SEMANTIC_APPROXIMATION | GEOMETRIC_FALLBACK |
                           PRIMITIVE_SHAPE | UNRESOLVED
        │
        ▼
3. Document Renderers
   ├─► DOCX Renderer (`src/canvas/renderer/docxCanvasRenderer.ts`)
   │   - OpenXML / VML (`<v:shape>`, `<v:textbox>`, `<v:rect>`, `<v:roundrect>`, `<v:line>`)
   │   - `<v:path fillrule="evenodd"/>` 태그 및 면/선 분리 VML 렌더링
   │   - 제로 너비/높이 수평·수직선 벡터의 최소 선 두께(0.75pt) 보장 클램핑
   │   - `alt="${elem.sourceNodeId}"` 및 `o:title` 원본 식별자 영속 바인딩
   │   - 단일 라인 텍스트박스 인라인 줄바꿈 방지 (`mso-wrap-style:none`)
   │   - 미디어 관계(`word/_rels/document.xml.rels`) 및 바이너리 매핑
   └─► HWPX Renderer (`src/canvas/renderer/hwpxCanvasRenderer.ts`)
       - OWPML KS X 6101 표준 준수 ZIP 패키징 (`application/hwp+zip` uncompressed mimetype)
       - `Contents/section0.xml` (<hp:secPr>, <hp:p>, <hp:run>, <hp:rect>, <hp:oval/ellipse>, <hp:line>, <hp:pic>)
       - `Contents/header.xml` (동적 7-Language Font Registry, charPr/paraPr 스타일 레지스트리)
       - `BinData/` (이미지 바이너리 패키징 및 고유 매핑)
       - 한컴오피스 2024 뷰어(`HwpViewer.exe`) 실제 열기 무결성 검증 완료
        │
        ▼
4. Verification & Fidelity Engine (`src/fidelity/`)
   - `verificationVerdict.ts`: 9대 필수 게이트 단일 승인 계약 및 OS 프로세스 종료 코드(0/1) 보장
   - `integrityGate.ts`: 절대 벤치마크 모드(`ABSOLUTE_FIGMA_TO_WORD`) 및 입력 디스크 바이너리 SHA-256 검증
   - `objectTraceability.ts`: 정밀 상태 체계(`DetailedContentState`), 텍스트·도형·이미지 100% 보존 Fail-Closed 게이트
   - `layoutStabilityAuditor.ts`: Before/After Union Bounding Box 기반 마스크 레이아웃 안정성 감사
   - `editabilityAuditor.ts`: Word 네이티브 편집성 점수 감사
```

---

## 3. Phase 41 주요 엔지니어링 성과

### 3.1 Track A: 핵심 결함 교정
1. **A-01: Stress 한글 전체 문자열 검증 및 개행 정규화**:
   - `Normalize-WordText`를 통해 Word COM 제어문자(`\x07`, `\x0c`) 제거 및 개행 통일.
   - 부분 일치(`.Contains()`)를 배제하고 전체 문자열 완전 일치(`normActual === normExpected`)를 적용하여 순서 교체, 줄 누락, 내용 중복, 인코딩 손실 차단.
2. **A-02: 빈 VML Path 허위 성공 차단**:
   - 표준 프리미티브(`rect`, `oval`, `line`, `roundrect`)와 커스텀 벡터(`v:shape`) 구분.
   - 유효 좌표 명령(`m`, `l`, `c`, `x`, `e`)이 없는 빈 `<v:path/>`나 속성 없는 shape는 `CONTENT_UNVERIFIED`로 엄격 처리.
3. **A-03: 대형 전경 객체(Modal/Card) 선택 보호**:
   - 텍스트 포함 객체는 크기와 무관하게 전경으로 인식. 텍스트가 없는 원점 앵커 전체 백드롭만 배경으로 제외.
4. **A-04: Word COM 프로세스 소유권 안전 회수**:
   - 실행 시점 고유 신규 PID 대조 및 생성 시간 검증으로 `IsOwned = true` 인스턴스만 타깃 종료. 미확인/타 사용자 프로세스 강제 종료 원천 차단.

### 3.2 Track B: HWPX 변환 엔진 첫 번째 실구현 (Vertical Slice)
1. **단일 Canvas IR 기반 이중 렌더러 아키텍처 가동**:
   - Figma JSON -> FigmaCanvasParser -> Canvas IR -> DOCX / HWPX Renderer.
2. **합성 및 실제 프레임 HWPX 생성 완료**:
   - `debug/hwpx-phase41/phase41-synthetic-vertical-slice.hwpx` (제목, 본문 2단락, 카드, 선, 타원, 이미지 1개).
   - `debug/hwpx-phase41/phase41-real-figma-frame.hwpx` (실제 Figma 프레임 HWPX 변환).
   - `debug/hwpx-phase41/phase41-customer-frame-759-844.hwpx` (고객사 로그인 화면 프레임).
3. **OWPML / KS X 6101 패키지 무결성 검증**:
   - 무압축 STORED `mimetype` 첫 번째 엔트리, 7개 언어 글꼴 레지스트리, BinData 이미지 참조, `Contents/section0.xml`.
4. **한컴오피스 2024 뷰어(`HwpViewer.exe`) 실제 열기 확인**:
   - 합성 및 고객사 프레임 문서 모두 `HwpViewer.exe`에서 에러 없이 정상 표시 확인 (`PASS`).
   - 단, 뷰어 특성상 인터랙티브 편집/저장은 Fail-Closed 원칙에 따라 `NOT_VERIFIED`로 정직하게 기록.

### 3.3 최신 핵심 벤치마크 지표 요약

| 지표 항목 | Phase 40.5 Baseline | Phase 41 Current | 판정 기준 | 최종 상태 |
|---|:---:|:---:|:---:|:---:|
| **평균 SSIM (16개 프레임)** | 0.9502 | **0.9502** | >= 0.9400 | **PASSED (보존)** |
| **Normal Edit Persistence** | 25 / 25 (100%) | **25 / 25 (100%)** | 100% 지속 (한글 완전 일치) | **PASSED** |
| **Stress Edit Persistence** | 25 / 25 (100%) | **25 / 25 (100%)** | 100% 지속 (전체 문자열 완전 일치) | **HARDENED** |
| **빈 Shape 허위 성공 차단** | - | **차단 완료** | 빈 <v:path/> 거부 | **VERIFIED** |
| **대형 전경 객체 선택률** | - | **정상 선택** | 텍스트 포함 카드/모달 보존 | **VERIFIED** |
| **HWPX 패키지 무결성** | - | **100% 준수** | KS X 6101 / OWPML 규격 | **VERIFIED** |
| **HWPX 뷰어 실제 열기** | - | **PASS** | 한컴오피스 2024 뷰어 정상 표시 | **VERIFIED** |
| **전체 단위/통합 테스트** | 707 passed | **717 passed (100%)** | 104개 파일 전원 통과 | **PASSED** |
| **TypeScript / Web 빌드** | 0 errors | **0 errors (336ms)** | 컴파일/빌드 성공 | **PASSED** |

---

## 4. 알려진 한계 및 다음 Phase 개발 계획

1. **HWPX 편집기 인터랙티브 편집 검증 (상용 한글 라이선스 필요)**:
   * 로컬에 설치된 프로그램이 `HwpViewer.exe`(뷰어)이므로, 열기 및 렌더링은 확인되었으나 COM을 통한 자동 편집 및 저장은 `NOT_VERIFIED`입니다.
2. **HWPX 다중 페이지 및 오토레이아웃 고도화**:
   * 현재 17개 전체 페이지 렌더링이 가능하나, 페이지 간 구분선 및 섹션 브레이크 속성을 더욱 정밀화할 계획입니다.
3. **다음 개발 권고**:
   * HWPX 테이블(표) 네이티브 요소(`<hp:tbl>`) 렌더링 지원 추가.
   * DOCX 폼 입력란 및 텍스트박스 내부 여백(inset) 미세 보정.
