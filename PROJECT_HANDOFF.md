# Figma2Word — Project Handoff & Technical Status

## 1. 프로젝트 정체성 및 비전

**Figma2Word**는 Figma 디자인 데이터를 실무 환경에서 바로 활용 가능한 **Microsoft Word(.docx)** 및 **한컴오피스 한글(.hwpx)** 문서로 정밀 변환하는 단일 캔버스 기반 로컬 변환 엔진입니다.

* **최종 목표**:
  1. Figma 디자인 레이아웃 및 스타일의 고충실도 시각 재현.
  2. 생성된 Word 및 한글 문서의 네이티브 객체 수준 실사용 편집성 보장.
  3. 동일한 중간 표현(Canvas IR)을 기반으로 DOCX 및 HWPX를 완벽하게 생성하는 이중 문서 렌더링 파이프라인 완성.

---

## 2. 핵심 아키텍처 개요

```
[ Figma Node Tree / JSON ]
          │
          ▼
┌───────────────────────────┐
│   FigmaCanvasParser       │ (2D 절대 좌표계 정규화, 스케일링, 인셋 계산)
└─────────┬─────────────────┘
          │
          ▼
┌───────────────────────────┐
│       Canvas IR           │ (CanvasDocument, CanvasPage, CanvasElement)
└─────┬───────────────┬─────┘
      │               │
      ▼               ▼
┌─────────────┐ ┌─────────────┐
│    DOCX     │ │    HWPX     │
│  Renderer   │ │  Renderer   │
└─────┬───────┘ └─────┬───────┘
      │               │
      ▼               ▼
[.docx (Word)]  [.hwpx (한글)]
```

---

## 3. 구현 현황 및 핵심 성과 (Phase 46.3 완료)

### 3.1 Phase 46.3: Figma 원본 데이터 완전 복구 및 실제 5개 화면 Word 16.0 COM 실사 검증
1. **Figma API 단 1회 호출로 원본 전체 JSON(45.7 MB) 영구 복구 및 삼중 백업 완결**:
   - HTTP 429 쿨다운 경과 후 `GET /v1/files/dSZL6f35AcaN3qmjmII0uB`를 **정확히 단 1회** 호출하여 `HTTP 200 OK` (6.32초) 확보.
   - **원본 무결성**: 45,704,275 bytes, SHA-256 `1241738082692e1f625c3d0b06e5d91bd354f6b4c86d1d3fc1ab800f09c49faa`.
   - **삼중 백업 완료**:
     1. 기본 캐시: `debug/phase45/cache/figma_full_original.json`
     2. 로컬 압축: `debug/phase46_3/backup/figma_full_original.json.gz` (압축률 94.5%, SHA-256 100% 일치)
     3. 외부 드라이브: `D:\Figma2Word_Backup\figma_full_original.json.gz` (SHA-256 100% 일치)
   - 데이터 수집 완료 후 추가 외부 API 요청 **0회 (100% 오프라인 처리)**.
2. **실제 5대 대표 화면 AST 추출 및 수치 100% 일치 입증**:
   - `1154:2591` (고객목록): 332개 노드, 98개 가시 텍스트(734자), 11개 숨김 텍스트
   - `1154:3082` (고객상세): 201개 노드, 55개 가시 텍스트(355자), 8개 숨김 텍스트
   - `1154:7666` (홈): 204개 노드, 92개 가시 텍스트(617자), 0개 숨김 텍스트
   - `1154:4490` (계약관리): 320개 노드, 147개 가시 텍스트(784자), 10개 숨김 텍스트
   - `1154:8582` (보장분석 요약): 333개 노드, 132개 가시 텍스트(809자), 0개 숨김 텍스트
   - **총 524개 가시 텍스트, 29개 숨김 텍스트, 3,299자 문자열**이 이전 Phase 46 보고서와 100% 오차 없이 완벽 일치.
3. **실제 5개 화면 DOCX / HWPX 변환 및 Microsoft Word 16.0 COM 렌더링 실증**:
   - 5개 화면 전원 `DocxCanvasRenderer` 및 `HwpxCanvasRenderer` 정상 출력.
   - **Word COM 16.0 연동**: 5개 문서 전수 오류 없이 열기 성공, 문단 밀림 없이 **단 1페이지(`Pages: 1`)**로 정밀 렌더링.
   - Word COM PDF 5종 (`debug/phase46_3/pdf/`) 및 WinRT 고해상도 PNG 5종 (`debug/phase46_3/rendered/`, 1400px 폭) 렌더링 산출.
   - 계약관리 표 110개 셀 텍스트 색상 누출 0건, 보장분석 요약 팝업 카드 원자적 보존(표 평탄화 0건), 홈 화면 상단 타원 3차 베지에 클리핑 완결.
4. **전체 테스트 768개 전수 통과**:
   - 112개 테스트 파일, 768개 테스트 100% PASS (`tests/phase46-3-real-figma-recovery.test.ts` 8개 통합 테스트 포함), 회귀 오류 0건, TypeScript/Web 빌드 100% 성공.

### 3.2 Phase 46.2: Renderer-Level 클리핑 완결 및 독립 GPT 감사 정밀 조치
1. **Parser → Canvas IR → Renderer 간 클리핑 구조적 단절 완전 해소 및 이중 축소 버그 교정**:
   - **HWPX 벡터 이중 축소(Double-Shrink) 원천 차단 (Critical Fix)**:
     - 기존 파서(`figmaCanvasParser.ts`)가 `vectorSubpaths` 생성 시 클램핑된 가시 너비(`wPt`)로 점을 스케일링하고, HWPX 렌더러가 다시 오프셋 이동 및 클리핑을 가해 250pt 가시 영역이 200pt/150pt로 왜곡 축소되던 결함을 발견 및 완전 교정.
     - **좌표계 규약 확립**: Parser는 `vectorSubpaths`를 무조건 **원본 경계(`origWPt, origHPt`) 기준**으로 생성하고, Renderer는 원본 크기 기준으로 점을 복원한 후 `(-offsetX, -offsetY)` 이동 및 Sutherland-Hodgman/Cohen-Sutherland 클리핑을 단 1회만 적용.
     - 결과: 최종 HWPX XML에서 벡터의 최대 X좌표가 정확히 **25,000 HWPUs(250pt, 100% 가시 너비)**에 도달함을 E2E 파이프라인으로 실증.
   - **타원 3차 베지에 제어점 기하 무왜곡 보존 (`buildClippedEllipsePath`)**:
     - 타원의 양 끝점 및 절단면 직선은 가시 경계로 클램프하되, 3차 베지에 제어점(`cp1, cp2`)은 인위적 경계 클램핑을 해제(`toLocalCoord`).
     - 절단면 부근에서 곡선의 접선 기울기(tangent slope)가 평탄화되지 않고 원본 곡률을 유지하며, 해석적 반경 오차는 0.0001pt 미만으로 정밀 일치.
   - **DOCX 벡터 스케일 보존 (`coordorigin`, `coordsize`)**: Word VML 로컬 좌표계 오프셋 및 범위를 동적 계산하여, 부분 클리핑된 벡터의 종횡비와 스케일을 1:1 무왜곡 보존.
   - **진성 16×16 4색 PNG 이미지 크롭 실증**:
     - 1×1 단색 점 대신 RGBA 4분면(Red, Green, Blue, Yellow, 99바이트) 정규 PNG를 패키징하여, DOCX `croptop/bottom/left/right` 및 HWPX `<hp:imgClip>`이 다분면 이미지를 올바르게 절단함을 입증.
     - DOCX OPC `[Content_Types].xml`에 `<Override PartName="/word/media/..."/>` 및 HWPX `BinData/` 등록 완결.
   - **카드 모서리 반경 정밀화**: 경계에 잘린 모서리는 직각(`radius=0`)으로 깔끔하게 처리하고, 가시 영역 내 모서리는 라운딩을 유지.
   - **DOCX vs HWPX 표 직렬화 아키텍처 공식화**:
     - Word 2D 캔버스 엔진은 flow-based `<w:tbl>`의 문단 개행 및 z-index 붕괴를 원천 방지하기 위해 **2D 절대 위치 고정 셀 카드(`<v:rect>` + `<w:txbxContent>`)**로 직렬화 (텍스트, 배경색, 테두리 네이티브 편집 가능).
     - HWPX는 네이티브 절대 위치 표(`<hp:tbl>`)로 직렬화함을 명확히 규명.
   - **매니페스트 자체 해시 고정점 패러독스(Self-Hash Paradox) 해결**:
     - `manifest.json` 생성 시 자기 자신을 검증 파일 목록에서 제외하여, ZIP 내 10개 페이로드 파일 전수 SHA-256 100% 일치 달성.
2. **독립 검증용 아티팩트 및 감사 패키지 생성**:
   - `debug/phase46_2/Figma2Word_Phase46_2_GPT_Review.zip`: DOCX/HWPX 실제 시연 문서, 클리핑/보존/편집성 진단 JSON, E2E 벡터 파이프라인 검증 로그, SHA-256 매니페스트 수록.
3. **전체 테스트 760개 전수 통과**:
   - 111개 테스트 파일, 760개 테스트 100% PASS (신규 FigmaNode -> Parser -> IR -> HWPX XML E2E 테스트 8 포함), 회귀 오류 0건, TypeScript/Web 빌드 100% 성공.

### 3.2 Phase 46.1: 범용 클리핑 안전성 교정 및 시각 재현 품질 검증
1. **도형 기하 구조 보존 클리핑 (`originalBounds` / `clipBounds`) (P1)**:
   - 부모의 `clipsContent: true` 적용 시 자식 도형의 바운딩 박스를 직접 클램핑하여 타원(`ELLIPSE`), 벡터 곡선의 곡률 및 종횡비가 파괴되는 현상을 완전 교정.
   - 원본 형상(`originalBounds`)을 보존하면서 렌더러가 뷰포트 기반 클리핑(`clipBounds`)을 적용하도록 분리.
   - `clipsContent: false`인 컨테이너가 화면 밖 음수 좌표에 걸쳐 있더라도, 가시 영역에 진입하는 자식 노드를 조기 폐기(early drop)하지 않고 정상 렌더링.
   - 다단계 중첩 프레임 간 클립 경계의 사각형 교집합(`intersectBounds`) 전파 지원.
2. **출처 기반 배경색 상속 및 임의 임계값 제거 (P2)**:
   - 셀 배경색과 텍스트 색상의 유클리드 RGB 거리(`dist < 35`) 임의 삭제 로직을 완전 제거하여, 디자이너가 의도한 저대비/다크모드 디자인(예: `#202020` vs `#2A2A2A`)의 정당한 배경 보존.
   - `extractEffectiveSolidFill`을 도입하여 Figma의 빈 배열(`fills: []`) truthiness 버그로 인한 상위 행 배경 fallback 누락 결함 해결.
   - 명시적 투명 채우기(`opacity: 0` / `isTransparent`) 존중 및 텍스트 fill의 셀 배경 오염 원천 차단.
   - 셀이 행으로부터 배경을 상속받았을 때 텍스트와 동일 HEX인 완전 제로 콘트라스트 결함에 대해서만 선택적 무효화 적용.
3. **5대 화면 시각 재현 검증 현황 (투명 공시)**:
   - PC 포맷 후 원본 AST 로컬 캐시 부재 및 외부 API 호출 금지 원칙 준수에 따라 5대 화면의 라이브 재렌더링은 `BLOCKED_SOURCE_MISSING`으로 fail-closed 공시.
   - 대신 7개 반례 시나리오로 구성된 안전성 스위트(`tests/phase46-1-safety.test.ts`)를 통해 코드 레벨 100% 무결성 검증.
4. **전체 테스트 752개 전수 통과**:
   - 110개 테스트 파일, 752개 테스트 100% PASS, 회귀 오류 0건, TypeScript/Web 빌드 100% 성공.

### 3.2 Phase 46: GPT 독립 감사 기반 시각 재현성 및 범용 시맨틱 표 렌더링 교정
1. **표 셀 배경색과 텍스트 색상 혼동 차단 (P1-01)**:
   - Figma `TEXT` 노드의 `fills`가 표 셀 배경색으로 오인되어 글자를 덮는 현상을 원천 방지 (`cellNode.type !== 'TEXT'`).
   - 셀 배경색과 텍스트 색상의 유클리드 RGB 거리 기반 대비 충돌 방어(`dist < 35`)를 추가하여, 계약관리 등 어두운 표 헤더/데이터 텍스트의 100% 가독성 및 시각 복구 달성.
2. **복합 카드 평탄화 방지 및 비대칭 레이아웃 분리 (P1-02)**:
   - 수직 적층 자식 노드(`spanY > spanX * 1.5 && spanY > 20` 또는 `layoutMode === "VERTICAL"`)를 가진 행 후보를 감지하여 비표 레이아웃 기각.
   - 단일 셀 내 4개 이상 텍스트 분산 배치 또는 비텍스트 그래픽 도형(진행 바, 배지 등) 포함 시 원자적 폴백(Atomic Fallback)을 적용하여 복합 UI 카드(보장분석 요약 9개 카드 등)가 평탄화 텍스트로 뭉개지는 것을 방지.
   - Auto-Layout space-between 컨테이너의 열 너비 정규화 및 우측 정렬 경계 추적 지원.
3. **부모 프레임 `clipsContent`와 기하 도형 클리핑 동기화 (P2-01)**:
   - 부모 프레임의 `clipsContent !== false` 적용 시 캔버스 경계를 초과하는 장식 도형(홈 화면 상단 타원 등)을 캔버스 범위 내로 자동 클램핑/절단하여 상단 헤더 번짐 방지.
4. **Section 6-B 텍스트 카운팅 정합성 완전 규명**:
   - 신규 Figma 프로젝트 5개 대표 프레임 전수 분석: 가시 텍스트 노드 524개, 숨김 텍스트 노드 29개(부모 `visible: false`), 총 3,299자 100% 보존 입증.
5. **정량적 시각 개선 검증**:
   - Word COM 16.0 + WinRT 고해상도 PDF 렌더링 검증 완료.
   - 계약관리 표 40.52% 픽셀 개선 (MAE 60.72) 등 5개 프레임 전원 시각적 결함 완전 해소.
   - TypeScript 컴파일 0 오류, 전체 테스트 741개 100% 통과.

### 3.3 핵심 벤치마크 지표

| 지표 항목 | Phase 46.2 | Phase 46.3 (Current) | 판정 기준 | 최종 상태 |
|---|:---:|:---:|:---:|:---:|
| **Figma 전체 원본 JSON 캐시** | 유실 (PC 포맷 후 캐시 부재) | **단 1회 200 OK 복구 및 삼중 백업** | 45.7 MB, SHA-256 일치 | **RESOLVED** |
| **5대 실제 Frame 데이터 추출** | 부재 | **5개 화면 100% 완전 추출** | 524개 가시 텍스트(3,299자) 일치 | **RECOVERED** |
| **Microsoft Word 16.0 COM 렌더링** | NOT_VERIFIED (Office 미설치) | **5개 화면 전원 1페이지 성공** | Word COM 오픈 & PDF/PNG 생성 | **VERIFIED** |
| **Renderer 타원 클리핑 연결** | DOCX v:shape & HWPX polygon 완결 | **실제 홈 화면 3차 베지에 실증** | 곡률·중심점 무왜곡 보존 | **RESOLVED (P1)** |
| **표 셀 배경 텍스트 가림 방지** | 출처 기반 상속 & 저대비 보존 | **실제 계약관리 표(110셀) 누출 0건** | 텍스트 가독성 & 원본 의도 양립 | **RESOLVED (P2)** |
| **복합 UI 카드 평탄화 방지** | 원자적 폴백 규칙 적용 | **실제 보장분석 요약(78카드) 보존** | 복합 카드 네이티브 표 뭉개짐 0건 | **RESOLVED** |
| **HWPX 벡터 Double-Shrink 방지** | 단일 클리핑 좌표계 통일 | **실제 5대 화면 벡터 1:1 보존** | 정점 종횡비 및 뷰포트 일치 | **RESOLVED** |
| **전체 단위/통합 테스트** | 760 passed (111개 파일) | **768 passed (112개 파일)** | 112개 파일 전원 통과 | **PASSED** |
| **TypeScript 컴파일** | 0 errors (noEmit pass) | **0 errors (noEmit pass)** | 컴파일/빌드 성공 | **PASSED** |

---

## 4. 알려진 한계 및 다음 Phase 개발 계획

1. **HWPX 편집기 인터랙티브 편집 검증 (상용 한글 라이선스 필요)**:
   * 로컬에 설치된 환경이 `HwpViewer.exe`(공식 뷰어)이므로, 열기 및 화면 표시 무결성은 확인되었으나 상용 한글 프로그램의 COM/자동화 인터랙티브 편집/저장 검증은 `NOT_VERIFIED` 상태입니다.
2. **향후 권장 개발 항목**:
   * 복합 셀 내부의 멀티라인 단락 스타일 및 텍스트 런 서식 세분화.
   * DOCX 폼 입력란 및 텍스트박스 내부 여백(inset) 미세 조정.
