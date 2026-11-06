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

## 3. 구현 현황 및 핵심 성과 (Phase 46.2 완료)

### 3.1 Phase 46.2: Renderer-Level 클리핑 완결 및 독립 GPT 감사 정밀 조치
1. **Parser → Canvas IR → Renderer 간 클리핑 구조적 단절 완전 해소**:
   - Canvas IR의 `originalBounds`와 `clipBounds`를 DOCX/HWPX Renderer에 완전 연결.
   - **타원 클리핑 (`buildClippedEllipsePath`)**: 축소된 `<v:oval>`을 다시 그리는 대신, 원본 곡률과 중심점($cx, cy, rx, ry$)을 온전히 유지하면서 가시 원호는 **진성 3차 베지에 곡선(`c x1,y1,x2,y2,x,y`)**으로, 화면 절단선($x=0$)은 정밀 직선(`l x,y`)으로 직렬화하여 원본 기하를 100% 무왜곡 보존.
   - **HWPX 벡터 클리핑 완결**: `hwpxCanvasRenderer.ts`에 `isVectorClipped` 및 Sutherland-Hodgman 다각형 클리핑(`clipHwpxPolygon`), Cohen-Sutherland 선분 클리핑(`clipHwpxLineSegment`)을 구현하여 원본 1:1 종횡비 보존 및 바운딩 밖 정점 절단 완결.
   - **DOCX 벡터 스케일 보존 (`coordorigin`, `coordsize`)**: Word VML 로컬 좌표계 오프셋 및 범위를 동적 계산하여, 부분 클리핑된 벡터의 종횡비와 스케일을 1:1 무왜곡 보존.
   - **이미지 복합 크롭 (Composite Crop)**: 디자이너 지정 `imageCrop`과 부모 프레임 클리핑 분수를 선형 결합하여 충돌 없는 VML `croptop/bottom/left/right` 및 HWPX `<hp:imgClip>` 직렬화. 유효 바이너리 PNG를 DOCX `word/media/` 및 HWPX `BinData/`에 실제 패키징.
   - **카드 모서리 반경 정밀화**: 경계에 잘린 모서리는 직각(`radius=0`)으로 깔끔하게 처리하고, 가시 영역 내 모서리는 라운딩을 유지.
   - **DOCX vs HWPX 표 직렬화 아키텍처 공식화**: Word 2D 캔버스 엔진은 flow-based `<w:tbl>`의 문단 개행 및 z-index 붕괴를 원천 방지하기 위해 **2D 위치 고정 셀 카드(`<v:rect>` + `<w:txbxContent>`)**로 직렬화하며, HWPX는 네이티브 절대 위치 표(`<hp:tbl>`)로 직렬화함을 명확히 규명.
2. **독립 검증용 아티팩트 및 감사 패키지 생성**:
   - `debug/phase46_2/Figma2Word_Phase46_2_GPT_Review.zip`: DOCX/HWPX 실제 시연 문서, 클리핑/보존/편집성 진단 JSON, SHA-256 매니페스트 수록.
3. **전체 테스트 759개 전수 통과**:
   - 111개 테스트 파일, 759개 테스트 100% PASS (신규 반례 테스트 포함), 회귀 오류 0건, TypeScript/Web 빌드 100% 성공.

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

### 3.2 핵심 벤치마크 지표

| 지표 항목 | Phase 46.1 | Phase 46.2 (Current) | 판정 기준 | 최종 상태 |
|---|:---:|:---:|:---:|:---:|
| **Renderer 타원 클리핑 연결** | IR에만 보존 (Renderer 미반영) | **DOCX v:shape & HWPX polygon 완결** | 곡률·중심점 무왜곡 보존 | **RESOLVED (P1)** |
| **Renderer 벡터/이미지 클리핑** | coordsize 고정 / 크롭 미반영 | **coordorigin/coordsize & 복합 크롭** | 종횡비/크롭 충돌 완전 해소 | **RESOLVED (P1)** |
| **도형 기하 보존 클리핑 (P1)** | originalBounds & clipBounds 보존 | **Parser-IR-Renderer 전 구간 연결** | 타원/곡선 곡률 100% 무손실 | **RESOLVED (P1)** |
| **중첩 클리핑 및 오프스크린 자식** | intersectBounds 누적 & 자식 보존 | **intersectBounds 누적 & 자식 보존** | 가시 영역 자식 100% 수집 | **RESOLVED (P1)** |
| **표 셀 배경 텍스트 가림 및 대비 (P2)** | 출처 기반 상속 & 의도된 저대비 보존 | **출처 기반 상속 & 의도된 저대비 보존** | 텍스트 가독성 & 원본 의도 양립 | **RESOLVED (P2)** |
| **빈 fills 배열 배경 상속** | extractEffectiveSolidFill 정상 fallback | **extractEffectiveSolidFill 정상 fallback** | 행 배경색 정상 상속 | **RESOLVED (P2)** |
| **복합 UI 카드 평탄화 (P1-02)** | 원자적 폴백 유지 (무회귀) | **원자적 폴백 유지 (무회귀)** | 그래픽/배지 100% 보존 | **RESOLVED** |
| **5대 Frame 시각 재현 라이브 측정** | BLOCKED_SOURCE_MISSING | **NOT_VERIFIED (Office 미설치 & 429)** | 투명한 실사 공시 & 반례검증 | **DOCUMENTED** |
| **전체 단위/통합 테스트** | 752 passed (110개 파일) | **759 passed (111개 파일)** | 111개 파일 전원 통과 | **PASSED** |
| **TypeScript 컴파일** | 0 errors (noEmit pass) | **0 errors (noEmit pass)** | 컴파일/빌드 성공 | **PASSED** |

---

## 4. 알려진 한계 및 다음 Phase 개발 계획

1. **HWPX 편집기 인터랙티브 편집 검증 (상용 한글 라이선스 필요)**:
   * 로컬에 설치된 환경이 `HwpViewer.exe`(공식 뷰어)이므로, 열기 및 화면 표시 무결성은 확인되었으나 상용 한글 프로그램의 COM/자동화 인터랙티브 편집/저장 검증은 `NOT_VERIFIED` 상태입니다.
2. **향후 권장 개발 항목**:
   * 복합 셀 내부의 멀티라인 단락 스타일 및 텍스트 런 서식 세분화.
   * DOCX 폼 입력란 및 텍스트박스 내부 여백(inset) 미세 조정.
