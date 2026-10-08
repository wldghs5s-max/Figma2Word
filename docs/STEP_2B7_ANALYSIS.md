# STEP 2-B-7 Analysis

작성일: 2026-10-08
기준 Git Commit: `b7f5e6f` (`chore(phase-4.2): checkpoint step-2b6 and handover`)
대상 문서: Sh 영업지원시스템 (ODS) 스토리보드 39개 화면 (`output/figma-step2b6.docx` 기반)
원칙: `Visual fidelity > table count reduction`

---

## 1. 목적

본 문서의 목적은 Phase 4.2 STEP 2-B-6 완료 시점에 남아 있는 **3,062개의 DOCX Table 구조**를 코드(`src/renderer/docxRenderer.ts`)와 OpenXML 관점에서 정밀 분석하여, 다음 단계(STEP 2-B-7)에서 **시각적 손실(Visual Fidelity Loss) 없이 실제로 안전하게 제거 또는 단순화할 수 있는 구조적 공통 패턴**이 존재하는지 검증하는 것이다.

본 분석 단계에서는 코드를 일절 수정하지 않으며, 임의의 수치 목표(예: "표 개수를 1,000개 이하로 줄이자", "깊이를 3으로 제한하자")에 맞추기 위한 무리한 flatten 규칙 도입을 원천 차단한다. 분석 결과 안전한 후보가 없을 경우 `NO SAFE CANDIDATE`로 명확히 결론을 내린다.

---

## 2. 분석 기준

후보 선정 및 안전성 검증은 아래의 **6대 무손실 검증 기준**을 엄격히 적용한다. 하나라도 불만족하거나 위험이 존재하는 패턴은 구현 후보로 채택하지 않는다.

1. **조건 1 — 텍스트 보존 (Text Preservation)**
   - `w:t` 태그 수 및 비어있지 않은 실제 텍스트 노드 수(3,934개)가 변환 전후 100% 일치해야 함.
   - 단 하나의 글자나 런(Run) 서식도 누락되거나 순서가 뒤바뀌지 않아야 함.
2. **조건 2 — 이미지 보존 (Image Preservation)**
   - Drawing(63개), Blip(63개), 미디어 PNG 파일(20개), Relationship(20개)이 100% 무손실 보존되어야 함.
   - 대체 텍스트나 인라인 이미지 배치가 깨지지 않아야 함.
3. **조건 3 — PageBreak 보존 (Screen Boundary Preservation)**
   - 39개 독립 화면 사이를 분할하는 38개의 `PageBreakElement`(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`)가 정확히 유지되어야 함.
4. **조건 4 — Table Width 및 열 너비 보존 (Column Width Preservation)**
   - Multi-column 구조에서 각 열 너비 비율(`columnWidths`, `toColumnPercents`)의 합(100%)과 Word Table GridCol 계산이 왜곡되지 않아야 함.
   - 래퍼 제거로 인해 열 너비의 기준 좌표계가 흔들리거나 음수/0% 너비가 발생하지 않아야 함.
5. **조건 5 — 스타일 보존 (Style & Chrome Preservation)**
   - 배경색(`w:shd`), 테두리(`w:tcBorders`/`w:tblBorders`/`w:pBdr`), 패딩(`w:tcMar`), 정렬이 시각적으로 왜곡되지 않아야 함.
   - 부모와 자식의 스타일이 불일치하는 경우 무조건 flatten 금지.
6. **조건 6 — 공간 및 계층 관계 보존 (Spatial Layout Preservation)**
   - 이미지+텍스트 복합 배치, 다중 문단 카드, 상하 계층형 중첩 구조의 시각적 경계가 훼손되지 않아야 함.

---

## 3. Current DOCX Metrics

현재 프로젝트 베이스라인(`output/figma-step2b6.docx` / Commit `b7f5e6f`)의 공식 측정 지표는 다음과 같다.

| 항목 (Metric) | 수치 | 상태 / 비고 |
| --- | ---: | --- |
| **대상 디자인** | Sh 영업지원시스템 (ODS) | 캔버스: 스토리보드, 노드 ID: `1154-2208` |
| **분석 대상 화면 수 (Screens)** | 39개 | 화면별 LayoutEngine 격리 완료 |
| **총 Table 수 (<w:tbl>)** | **3,062개** | 2-B-2(3,067) → 2-B-5(3,064) → 2-B-6(3,062) |
| **Nested Table 수 (중첩 표)** | 3,023개 | 98.7%가 상위 테이블/컨테이너 내부 중첩 |
| **최대 Table Depth** | 11 | 가로 다열과 1×1 카드가 교대로 중첩된 경로 |
| **총 Paragraph 수 (<w:p>)** | 5,153개 | 비어있지 않은 문단 및 구조적 문단 |
| **총 Text Node 수 (<w:t>)** | 3,934개 | 100% 무손실 유지 중 |
| **Images / Drawings** | 63개 | Drawing 63, Blip 63, Media PNG 20, Rel 20 |
| **PageBreaks** | 38개 | 39개 화면 격리용 (Screen Count - 1) |
| **word/document.xml 크기** | 6,109,292 bytes | 2-B-2 대비 약 4KB 추가 최적화 |
| **DOCX ZIP 전체 크기** | 16,156,307 bytes | 약 16.15 MB |
| **Malformed XML** | 0건 | 정밀 XML 파싱 검증 완료 |
| **Broken Relationships** | 0건 | 이미지 릴레이션 전원 정상 |
| **Negative / Zero Width** | 0건 | 열 너비 가드 100% 작동 중 |

---

## 4. Existing STEP 2-B Findings

이전 단계(STEP 2-B-1 ~ STEP 2-B-6)에서 수행된 테이블 분류 및 최적화 성과는 다음과 같다.

### 4.1 테이블 수 변화 추이
- **Baseline (2-B-2 직전)**: 4,093 Tables / Depth 11
- **STEP 2-B-2 (단일 텍스트 칩/버튼 음영 문단화)**: 4,093 → 3,067 Tables (**-1,026개 감소**)
- **STEP 2-B-5 (측정된 SAFE 래퍼 3개 제거)**: 3,067 → 3,064 Tables (**-3개 감소**)
- **STEP 2-B-6 (배경 전용 텍스트 칩 행 2개 병합)**: 3,064 → 3,062 Tables (**-2개 감소**)

### 4.2 STEP 2-B-3 상호 배타 6대 카테고리 분포 (3,067개 기준)
1. **Category A (Horizontal layout 1×N 다열 구조)**: **1,661개** (54.2%)
   - 가로 2열 이상 배치된 레이아웃 테이블. Word에서 가로 배치를 표현하기 위한 필수 구조.
2. **Category F (Nested-only 1×1 shell)**: **767개** (25.0%)
   - 오직 자식 테이블만 감싸고 있는 1×1 래퍼 쉘.
3. **Category Z (Empty 1×1 box)**: **378개** (12.3%)
   - 텍스트나 자식 요소가 없는 순수 시각적 장식 박스, 구분선, 컬러 띠(Frame).
4. **Category B (Text + child table 복합 카드)**: **177개** (5.8%)
   - 카드 헤더 텍스트와 하위 표가 공존하는 복합 패널 컨테이너.
5. **Category D (Text-only 1×1 다중 문단 컨테이너)**: **43개** (1.4%)
   - 2개 이상의 문단을 가진 1×1 카드.
6. **Category C (Image 1×1 컨테이너)**: **41개** (1.3%)
   - 이미지를 포함하거나 감싸는 1×1 컨테이너.

### 4.3 STEP 2-B-4 단일 자식 래퍼(F 계열) 711개 위험도 분석 결과
- **SAFE (3개)**: 부모와 자식이 완전히 동일한 사양을 2중으로 그린 경우 (2-B-5에서 전원 제거 완료).
  - SAFE-A (2개): 부모 흰색(`#FFFFFF`), 테두리 없음, 패딩 0 / 자식 흰색(`#FFFFFF`), 자체 테두리 보유.
  - SAFE-B (1개): 부모 테두리(`#A1B0BF`), 패딩 0 / 자식 빈 상자(`#A1B0BF`).
- **CONDITIONAL (644개)**: 자식이 2열 이상의 1×N 다열 구조인 경우.
  - 2-B-6에서 배경만 있고 패딩/테두리가 없는 57개를 재검토하여, 이미지(29개)와 shape(26개)를 제외한 순수 텍스트 칩 행 2개만 `tblPr` 음영으로 병합 완료.
  - 잔여 CONDITIONAL: **642개**.
- **UNSAFE (64개)**: 부모/자식 배경색 불일치, 양쪽 모두 테두리 보유, 이미지 포함 등으로 인해 제거 시 즉시 시각적 파괴가 일어나는 구조.

---

## 5. Candidate Patterns

현재 남아 있는 3,062개 테이블 구조 중, 추가 단순화 가능성 여부를 검증하기 위해 선정한 3가지 구조 패턴 후보는 다음과 같다.

1. **Candidate #1 (CONDITIONAL 1×N 다열 행 부모 래퍼 확장 단순화)**
   - 642개 남은 CONDITIONAL 래퍼 중, 이미지/도형/패딩을 포함한 복합 행을 추가로 펼칠 수 있는지 검토.
2. **Candidate #2 (Category Z: 378개 빈 1×1 컨테이너의 음영 문단화 변환)**
   - 내용이 없는 1×1 Frame Table을 Word 문단(`<w:p>`)의 테두리/음영으로 대체 가능한지 검토.
3. **Candidate #3 (Category D: 43개 다중 문단 1×1 카드의 문단 인라인화)**
   - 텍스트만 들어있는 1×1 카드 컨테이너를 표 없이 문단 연속으로 펼칠 수 있는지 검토.

---

## 6. Candidate #1

### Pattern
- **구조**: Outer 1×1 Table (Container) → 1 Cell → Inner 1×N Table (Horizontal Row).
- **현재 대상**: STEP 2-B-6 이후 남아 있는 642개의 CONDITIONAL 단일 자식 래퍼.

### Why it appears redundant
- 바깥의 1×1 Table이 가로 배치 행(1×N) 전체를 한 번 더 감싸고 있어 2단계 깊이를 소모함.

### Required conditions
1. 부모 컨테이너의 `padding`이 상하좌우 0이어야 함 (`isZeroPadding`).
2. 부모 컨테이너에 테두리가 없어야 함 (`!hasVisibleBorder`).
3. 부모 컨테이너의 배경색을 자식 표의 `w:tblPr/w:shd`로 승계할 때, 각 열의 배경 및 시각적 요소와 충돌하지 않아야 함.
4. 자식 열들에 개별 배경색, 테두리, 또는 불투명 도형이 없어야 함.
5. 자식 열들에 이미지가 포함되어 있지 않아야 함.

### Potential benefit
- 예상 Table 감소: 0 ~ 수 개 (이론상 최대 642개이나 실제 조건 만족 수량 극소).

### Risks
1. **패딩 소실 및 열 너비 왜곡**:
   - 642개 중 대다수는 부모 컨테이너에 여백(`padding > 0`)을 가지고 있음.
   - Word OpenXML에서 부모 셀의 `w:tcMar`를 제거하고 자식 테이블 셀로 여백을 밀어 넣으면, 각 열 내부 마진이 늘어나 실제 컬럼 너비 비율(`columnWidths`)이 왜곡되고 레이아웃이 깨짐.
2. **테두리 파편화 (Borders Fragmentation)**:
   - 부모에 외곽 테두리가 있는 경우, 이를 자식 셀들로 복사하면 다열 사이에 원치 않는 세로 구분선이 생김.
3. **이미지 셀 투과 및 리플로우 결함**:
   - 이미지를 포함한 29개 행의 경우, 투명 PNG 배경으로 부모 음영이 원치 않게 투과되거나 셀 크기 제약이 무너짐.
4. **이미 STEP 2-B-6에서 완전 무손실 2개는 수확 완료됨**:
   - 57개의 배경 전용 행 중 무손실이 보장되는 것은 정확히 2개(`01 고객 발굴` / `02 FC 배정` / `03 배정결과` 행)뿐이었으며 이미 처리됨. 남은 것은 모두 이미지(29) 또는 shape(26)를 동반함.

### Why it is safe / unsafe
- **UNSAFE TO IMPLEMENT (위험 - 구현 불가)**.
- 남은 642개는 외곽 여백 보호, 테두리 일체화, 이미지 크기 유지를 위해 1×1 부모 셀이 반드시 필요함. 일괄 또는 규칙 기반 제거 시 열 너비 찌그러짐 및 테두리 파편화 발생.

### Required test
- 컬럼 비율 유지 테스트, 내부 테두리 미발생 테스트, 이미지 포함 행 보호 테스트.

### Recommendation
**DO NOT IMPLEMENT**

---

## 7. Candidate #2

### Pattern
- **구조**: Category Z (378개) — 내용물(`children: []`)이 없는 1×1 Container Table.
- **현재 대상**: Figma에서 배경색(Fill)이나 테두리(Stroke)를 가진 빈 사각형 Frame으로 작성된 378개의 100% 폭 Table.

### Why it appears redundant
- 자식 텍스트도 없고 자식 표도 없는 빈 상자인데 1×1 Table로 생성되어 테이블 개수(378개)를 크게 차지함.
- STEP 2-B-1에서 빈 ShapeElement는 이미 `null`로 제거되었으나, Frame에서 파싱된 ContainerElement는 여전히 1×1 Table을 생성하고 있음.

### Required conditions
1. 피그마에서 해당 요소가 의도한 시각적 높이(예: 2px 구분선, 8px 색상 바, 24px 여백 박스)가 유지되어야 함.
2. 요소를 완전히 삭제하면(2-B-1 empty shape처럼) 배경색 자체가 사라져 **Visual Fidelity 위반**.
3. 표 대신 빈 문단(`<w:p>`)의 `w:pPr/w:shd` 및 `w:pBdr`로 대체 시 높이와 너비가 왜곡되지 않아야 함.

### Potential benefit
- 예상 Table 감소: 이론상 최대 378개 (3,062 → 2,684).

### Risks
1. **문단 높이 강제 확장 결함 (Height Blow-up)**:
   - Word OpenXML에서 빈 문단(`<w:p/>`)에 음영(`w:shd`)을 주면, Word 렌더러는 기본 글꼴 크기(11pt / 약 14~18px) 미만으로 높이를 줄이지 못함.
   - 피그마에서 2px 또는 4px 얇은 액센트 바로 의도된 요소가 Word에서 18px 두께의 거대한 띠로 부풀어 오름.
2. **너비 왜곡 (Width Stretching)**:
   - Figma에서 24×24 크기의 작은 색상 블록/아이콘 배경으로 사용된 프레임이 문단으로 변환되면 페이지 전체 너비(100%)로 가로질러 뻗어나감.
3. **모서리 및 테두리 렌더링 결함**:
   - `w:pBdr`는 Word에서 테이블 셀 테두리(`w:tcBorders`)와 달리 단락 여백(`w:ind`)에 종속되어 상하단 접합부가 어긋나는 렌더링 아티팩트가 빈번함.

### Why it is safe / unsafe
- **NEEDS VISUAL VALIDATION (시각적 검증 필수 / 현 시점 안전성 미보장)**.
- 표 개수를 378개 줄일 수 있는 유혹적인 후보이나, 실제 Word 렌더링에서 구분선과 장식 바의 높이가 수 배로 부풀어 레이아웃이 붕괴될 위험이 매우 큼.

### Required test
- 빈 컨테이너 높이/두께 보존 테스트, 배경색 유지 테스트, 다단 배치 내부 빈 박스 너비 테스트.

### Recommendation
**DO NOT IMPLEMENT AT STEP 2-B-7 (보류 및 시각적 검증 선행 필요)**

---

## 8. Candidate #3

### Pattern
- **구조**: Category D (43개) — 텍스트 문단만 2개 이상 포함된 1×1 컨테이너 (Text-only 1×1).
- **현재 대상**: 내부에 자식 표나 이미지가 없으나, 2개 이상의 문단 또는 제목+문단을 가진 1×1 Card Table.

### Why it appears redundant
- 자식 요소가 오직 문단뿐이므로, 바깥의 1×1 Table을 벗겨내고 문단들을 직접 나열하면 표 1개를 절약할 수 있어 보임.

### Required conditions
1. 컨테이너에 배경색이 없거나, 연속된 문단들에 동일 배경을 주었을 때 하나의 상자로 보여야 함.
2. 컨테이너에 테두리가 없어야 함.
3. 컨테이너에 패딩이 없어야 함.

### Potential benefit
- 예상 Table 감소: 최대 43개 (3,062 → 3,019).

### Risks
1. **카드 시각성 붕괴 (Card Framing Broken)**:
   - Category D에 속한 43개 컨테이너는 모두 배경색(`background`) 또는 테두리(`border`)를 가진 **카드(Card/Panel)** 컴포넌트임 (배경/테두리가 없는 컨테이너는 이미 `renderSequence`를 통해 표를 만들지 않고 문단으로 직접 방출됨).
2. **문단 간 배경 단절 현상 (Shading Separation)**:
   - Word에서 여러 문단에 각각 `w:shd`를 적용하면, 문단 상하 간격(`spacing.after`/`spacing.before`) 부분에 배경색이 끊겨 연속된 하나의 카드가 아니라 여러 개의 띠로 분리됨.
3. **테두리 중복 발생**:
   - 카드 테두리를 하위 문단 2개에 각각 복사하면, 하나의 큰 외곽 상자가 그려지는 대신 2개의 작은 네모 상자가 위아래로 나뉘어 그려짐.

### Why it is safe / unsafe
- **UNSAFE TO IMPLEMENT (위험 - 구현 절대 불가)**.
- 카드의 시각적 정체성을 완전히 파괴하는 퇴행(Regression)을 초래함.

### Required test
- 카드 배경 연속성 테스트, 다중 문단 외곽 테두리 단일화 검증.

### Recommendation
**DO NOT IMPLEMENT**

---

## 9. Structures That Must Not Be Flattened

향후 어떠한 최적화 프롬프트나 자동화 리팩토링에서도 **절대로 Flatten하거나 제거해서는 안 되는 구조**를 아래와 같이 명시한다. 본 목록은 시각적 충실도를 수호하는 영구적 보호 장치다.

1. **Multi-column Layout Table (Category A, 1,661개)**
   - 가로 배치(2열 이상)를 형성하는 핵심 테이블. Word OpenXML에서 다열 정렬을 표현하는 유일한 표준 수단이므로 절대 flatten 불가.
2. **Visual Card / Panel Containers (Category B & D, 220개)**
   - 배경색, 테두리, 내부 여백을 지닌 단일/복합 카드. 제거 시 카드의 시각적 프레임이 해체됨.
3. **Parent/Child Style Mismatch Wrappers (UNSAFE 64개)**
   - 부모 배경색과 자식 배경색이 다른 다층 카드. 부모 제거 시 바깥 색상 영역 영구 소실.
4. **Padding-bearing Wrappers (CONDITIONAL 다수)**
   - 컨테이너 패딩(`padding > 0`)을 가진 래퍼. 부모 셀 여백(`w:tcMar`) 없이 내부 열 너비와 상하 간격을 유지할 수 없음.
5. **Border-bearing Compound Containers**
   - 부모와 자식 모두 테두리를 갖거나, 다열 자식에 외곽 테두리만 있는 경우. 하위 셀로 이동 시 열 사이 내부 구분선이 생김.
6. **Image-containing Tables / Wrappers (Category C 41개 및 29개 행)**
   - 이미지를 포함한 셀. 래퍼 제거 시 이미지 크기 제한, 정렬, 캡션 관계 붕괴 위험.
7. **Screen Root & PageBreak Boundary Structures (39개 Screen, 38개 PageBreak)**
   - 화면 경계를 보존하는 최상위 컨테이너 구조. 화면 혼합 방지 필수.

---

## 10. Required Regression Tests

만약 향후 어떠한 단순화 규칙이라도 제안될 경우, 사전에 반드시 통과해야 하는 회귀 방지 테스트 세트:

- **Test 1 — Text Completeness**: 전체 문서 내 `w:t` 노드 수 3,934개 및 문자열 일치 100% 무손실 검증.
- **Test 2 — Image & Drawing Completeness**: Drawing 63개, Blip 63개, 미디어 PNG 20개 무손실 검증.
- **Test 3 — Screen Isolation & PageBreak**: 39개 화면 간 38개 PageBreak 위치 및 개수 불변 검증.
- **Test 4 — Multi-column Width Preservation**: 1×N 테이블 열 너비 비율 합 100% 및 개별 너비 보존 검증.
- **Test 5 — Shading Isolation**: `w:tblPr/w:shd`, `w:tcPr/w:shd`, `w:pPr/w:shd` 간 색상 누출/간섭 방지 검증.
- **Test 6 — Border Seam Protection**: 다열 레이아웃 평탄화 시 원치 않는 내부 세로선 미발생 검증.
- **Test 7 — Card Padding Preservation**: 카드 컴포넌트의 내부 여백 축소/소멸 방지 검증.
- **Test 8 — Deterministic XML**: `word/document.xml` 결정론적 렌더링 100% 일치 검증 (`tests/determinism.test.ts`).

---

## 11. Recommendation

### 판정: **NO SAFE CANDIDATE TO IMPLEMENT AT THIS TIME**

### 상세 권고 사유:
1. **수확 가능한 잉여 표는 이미 전원 제거 완료**:
   - STEP 2-B-1 (빈 도형 24개), STEP 2-B-2 (단일 텍스트 칩 1,026개), STEP 2-B-5 (SAFE 래퍼 3개), STEP 2-B-6 (배경 행 2개)를 통해 **시각적 위험이 0인 구조적 잉여 표는 100% 완벽히 제거**되었다.
2. **현재 남아 있는 3,062개 테이블은 모두 시각적 의미를 가진 구조**:
   - 가로 배치(1,661개), 카드 배경/테두리(220개), 이미지 래퍼(41개), 빈 장식 블록(378개), 여백/테두리를 지닌 복합 래퍼(642개)는 모두 피그마 원본 디자인의 시각적 형태를 유지하기 위해 OpenXML 상에서 고유한 역할을 수행하고 있다.
3. **추가 강제 제거는 Visual Fidelity 훼손 초래**:
   - "표 개수가 3,000개나 되니 더 줄이자"는 동기로 Candidate #1, #2, #3을 무리하게 구현할 경우, 열 너비 찌그러짐, 구분선 부풀림, 카드 테두리 파편화 등 심각한 시각적 퇴행(Regression)이 필연적으로 발생한다.
4. **차기 프롬프트 방향 권고**:
   - STEP 2-B-7로서의 테이블 추가 flatten 구현은 즉시 중단한다.
   - 다음 단계는 테이블 개수 줄이기가 아니라, **실제 생성된 DOCX의 Word 가독성, 화면별 렌더링 무결성, 스크롤 성능을 직접 확인하는 시각적/성능 검증(VISUAL VALIDATION)**으로 전환할 것을 강력히 권고한다.

---

## 12. Conclusion

1. 현재 남아 있는 3,062개의 Table은 모두 Figma 디자인의 다열 레이아웃, 카드 외곽선, 배경색, 여백, 이미지를 표현하기 위한 정당한 구조적 근거를 가지고 있다.
2. 현 시점에서 시각적 손실 없이 안전하게 제거할 수 있는 추가 후보(SAFE Candidate)는 **0개**이다.
3. 프로젝트의 최우선 원칙인 `Visual fidelity > table count reduction`에 따라, 현재의 안정된 구조를 보존하고 무리한 flatten 코드 수정을 전면 거부한다.
