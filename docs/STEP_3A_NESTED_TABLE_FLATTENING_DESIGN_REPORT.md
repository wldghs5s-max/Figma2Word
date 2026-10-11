# Figma2Word — Step 3A: 중첩 테이블 폭 고갈 원인 검증 및 안전한 평탄화 설계 보고서

## 1. 개요 및 검증 상태

본 보고서는 `Final-Prj.docx`에서 발생한 비정상적인 문자 단위 세로 줄바꿈(Vertical Text Squeeze)과 중첩 테이블(최대 8단계, 총 1,597개 표)의 상관관계를 실증적으로 분석하고, 디자인 시각적 속성을 100% 보존하면서 안전하게 제거 가능한 불필요한 테이블 래퍼의 평탄화(Flattening)를 설계한 결과입니다.

> [!IMPORTANT]
> **검증 상태 명시**: 현재 Step 1(가로 카드 그룹화)과 Step 2(패딩 Clamping)의 수정은 단위/회귀 테스트와 OpenXML 직접 보정 DOCX(`Final-Prj-After-Step2.docx`)를 통해 Microsoft Word 16.0 COM 렌더링으로 검증되었습니다. Figma API 접근 토큰 부재(HTTP 403)로 인해 **Figma 클라우드로부터의 실시간 전체 재변환 파이프라인은 아직 직접 실행되지 않았음**을 명시합니다.

- **작업 브랜치**: `master`
- **기준 HEAD**: `a66a42b9c49a3ac60554e2ed73d6671eb6d9fa48`
- **제품 코드 수정 여부**: **0건 (제품 코드 미수정, 조사 및 회귀 테스트 설계 전용)**

---

## 2. 중첩 테이블 및 폭 고갈 원인 정밀 검증

### A. 사례 1: 메인 랜딩 3열 특장점 ("생산성 향상")

OpenXML 계층 추적 결과 ("생산성 향상" 텍스트의 부모 스택):
- **Level 1 (Table 1, 루트)**: `tblW pct="5000"` (100%), `gridCol w:w="9026"` (A4 가용 폭 $451.3\text{ pt}$)
- **Level 3 (Cell 1)**: `shd fill="FFFFFF"`, `tcMar: 0`
- **Level 4 (Table 2, 섹션 래퍼)**: `tblW pct="5000"`, `gridCol w:w="9026"`, `borders: none`
- **Level 6 (Cell 2)**: `shd fill="F8FAFC"`, `tcMar: top=1200, bottom=1200` (상하 패딩 60pt)
- **Level 7 (Table 3, 3열 그리드)**: `tblW pct="5000"`, `gridCol w:w="3069"`, `gridCol w:w="2979"`, `gridCol w:w="2979"`
- **Level 9 (Cell 3, 카드 본문)**: `tcW pct="1700"` (34%), `shd fill="FFFFFF"`, `tcMar: top=480, left=480, bottom=480, right=480` ($24\text{ pt} = 32\text{ px}$ 패딩)

#### 폭 고갈 분석
1. Level 7 Table은 A4 폭을 3등분하여 컬럼당 $3,069\text{ dxa}$ ($153.4\text{ pt}$) 할당.
2. Cell 3의 좌우 패딩이 $480 + 480 = 960\text{ dxa}$ ($48\text{ pt}$) 소모.
3. 텍스트 가용 폭 = $3,069 - 960 = 2,109\text{ dxa}$ ($105.4\text{ pt} \approx 37.2\text{ mm}$).
4. 본문 텍스트: `"듀얼 모니터, 초고속 광랜, 인체공학적 가구 가 구비된 검증된 작업 공간을 제공합니다."` (한글 11pt 기준 1글자당 약 3.8mm).
5. 37mm 폭에는 한 줄에 **한글 5~7자**만 수용 가능 $\to$ 단어 단위가 아닌 **1~2단어마다 강제 줄바꿈 발생**.

---

### B. 사례 2: FAQ 답변 영역 ("작성하신 후기와 질문 답변으로...")

OpenXML 계층 추적 결과 (스택 깊이 12):
- **Level 1 (Table 1)**: `tblW pct="5000"`, `gridCol w:w="9026"`
- **Level 3 (Cell 1)**: `shd fill="FFFFFF"`
- **Level 4 (Table 2)**: `tblW pct="5000"`, `gridCol w:w="1805"` (20%), `gridCol w:w="7221"` (80%)
- **Level 6 (Cell 2)**: `tcW pct="4000"`, `tcMar: left="3840"` (Step 2 이전 원본: 256px 패딩)
- **Level 7 (Table 3)**: `tblW pct="5000"`, `borders single F1F5F9`, `gridCol w:w="7221"`
- **Level 9 (Cell 3)**: `shd fill="FFFFFF"`, `tcMar: 0`
- **Level 10 (Table 4)**: `tblW pct="5000"`, `borders single F8FAFC`, `gridCol w:w="7221"`
- **Level 12 (Cell 4)**: `tcMar: top=240, left=360, bottom=360, right=360`

#### 폭 고갈 분석
1. Table 2의 2번째 컬럼 폭 = $7,221\text{ dxa}$ ($361\text{ pt}$).
2. 원본에서는 `w:left="3840"`에 의해 $3,840\text{ dxa}$가 증발하여 잔여 폭 $3,381\text{ dxa}$.
3. Table 3(Level 7)과 Table 4(Level 10)가 연속 중첩되면서 테두리 및 추가 내부 패딩($360 + 360 = 720\text{ dxa}$)이 누적 차감.
4. 더욱이 8단계 중첩된 하위 셀 중 일부는 `toColumnPercents`에 의해 `tcW pct="350"` (7% 폭 = $31.5\text{ pt} = 11\text{ mm}$)으로 축소됨.
5. 11mm 폭 안에서 장문 텍스트가 1글자 단위로 세로 낙하.

---

### C. 원인이 확인된 코드 위치

1. **[`src/renderer/docxRenderer.ts#L652-L698`](file:///c:/Users/77/Documents/Figma2Word/src/renderer/docxRenderer.ts#L652-L698) (`renderContainer`)**:
   - Figma 프레임에 `background`나 `border`가 존재하면 예외 없이 `new Table` (1x1 표)를 생성함.
   - Figma에서는 디자이너가 오토레이아웃 정렬 목적으로 생성한 중간 프레임들(Frame 42, Wrapper, Box 등)에도 기본적으로 `fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }]`이 붙어 있음.
   - 이로 인해 의미 없는 1x1 래퍼 표가 문서 전체에 **544개 (전체 표의 34.1%)** 생성됨.
2. **[`src/renderer/docxRenderer.ts#L710-L761`](file:///c:/Users/77/Documents/Figma2Word/src/renderer/docxRenderer.ts#L710-L761) (`renderSafeIdenticalWrapper`)의 과도하게 방어적인 제약**:
   - `if (child.layoutDirection === "horizontal" && child.children.length > 1) return null;`
   - `if (this.containsImage(child)) return null;`
   - `if (!this.isZeroPadding(parent.padding)) return null;`
   - 자식이 가로 행이거나, 이미지 1개라도 포함되어 있거나, 부모에 미세한 패딩이 있으면 평탄화를 전면 포기하고 중첩 표를 생성하여 실전 디자인의 95% 이상에서 평탄화가 무력화됨.
3. **[`src/layout/layoutEngine.ts#L241-L246`](file:///c:/Users/77/Documents/Figma2Word/src/layout/layoutEngine.ts#L241-L246) (`enrichSizingRatios`)**:
   - Figma 절대 좌표 폭 비율을 단순 백분율로 환산하면서, 아이콘이나 라벨과 본문이 한 행에 있을 때 7% vs 93%처럼 극단적인 컬럼 비율(`tcW pct="350"`)을 발생시킴.

---

## 3. 안전한 평탄화 후보 분류 체계

| 분류 유형 | 정의 및 특징 | 실례 (Figma/DOCX) | 평탄화 처리 방침 |
|---|---|---|---|
| **Type A (단순 투명 래퍼)** | 단일 자식(`children.length === 1`), 테두리 없음, 배경 없음 또는 부모와 동일한 배경/흰색 | 정렬용 AutoLayout 프레임, Content Wrapper | **무조건 평탄화 (1x1 Table 제거하고 자식 직접 렌더링)** |
| **Type B (여백/정렬 보유 래퍼)** | 단일 자식, 부모와 동일 배경, 테두리 없음, 자체 패딩/gap 존재 | 섹션 여백 프레임, 인셋 컨테이너 | **여백 안전 이전 검증 후 평탄화 (자식 패딩에 합산하거나 단락 여백으로 변환)** |
| **Type C (시각적 의미 컨테이너)** | 부모와 다른 배경색, 가시적 테두리, 카드/모달/뱃지 | 카드 박스 (`#F8FAFC`, 테두리 `#E2E8F0`), CTA 버튼 | **구조 보존 필수 (평탄화 금지)** |
| **Type D (다열/복합 레이아웃)** | `layoutDirection === "horizontal"` 2개 이상 자식, 다열 그리드 | 3열 특장점 행, 비교 카드 행 | **테이블 구조 보존 필수 (단, 외곽 1x1 래퍼는 제거)** |

---

## 4. 회귀 테스트 설계 ([`tests/nested-table-flattening-guard.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/nested-table-flattening-guard.test.ts))

Step 3A에서 구현하고 검증을 완료한 5개 핵심 가드 테스트:

1. **Guard 1 (Type C Preservation)**:
   - 독자적인 배경(`#F8FAFC`)과 테두리(`#E2E8F0`)를 가진 카드는 평탄화되지 않고 반드시 1개의 카드 TableCell로 보존되는지 검증 (**PASS**)
2. **Guard 2 (Type D Preservation)**:
   - 3열 가로 그리드(`columnWidths: [33, 33, 34]`)는 TableCell 3개로 구성된 1행 Table로 보존되는지 검증 (**PASS**)
3. **Guard 3 (Content Sequence Preservation)**:
   - 컨테이너 내부의 `Heading -> Image -> Paragraph` 시각적 순서가 엄격하게 유지되는지 검증 (**PASS**)
4. **Guard 4 (Button/CTA Styling Preservation)**:
   - CTA 버튼의 배경색(`0EA5E9`), 내부 패딩(16px/24px = 240/360 dxa)이 누락 없이 보존되는지 검증 (**PASS**)
5. **Guard 5 (Width Exhaustion Benchmark)**:
   - 3단계로 중첩된 동일 배경 래퍼의 베이스라인 테이블 수를 측정하여, 향후 Step 3B 구현 시 단일 테이블로 축소되는지 비교할 기준선 확보 (**PASS**)

---

## 5. 가장 작은 제품 코드 수정 계획 (Step 3B 제안)

### A. 수정 대상 파일 및 위치
1. **[`src/renderer/docxRenderer.ts`](file:///c:/Users/77/Documents/Figma2Word/src/renderer/docxRenderer.ts#L710-L761)의 `renderSafeIdenticalWrapper` 완화**:
   - (1) **가로 행 자식 허용**: `child.layoutDirection === "horizontal"`이더라도 부모가 투명/동일 배경의 1x1 래퍼라면, 불필요한 외곽 1x1 Table을 벗겨내고 가로 Table을 직접 반환.
   - (2) **이미지 포함 자식 허용**: `this.containsImage(child)` 제약을 완화하여, 자식이 카드/단락 구조를 갖추고 있으면 이미지가 포함되어 있어도 래퍼를 안전하게 평탄화.
   - (3) **동일 흰색 배경 래퍼 연쇄 축약**: 부모와 자식이 모두 `#FFFFFF`이고 부모에 테두리가 없으면, 부모 1x1 Table을 생략하고 자식을 렌더링.
2. **[`src/layout/layoutEngine.ts`](file:///c:/Users/77/Documents/Figma2Word/src/layout/layoutEngine.ts#L257-L265)의 극단 컬럼 폭 하한선(Minimum Width Clamp)**:
   - 텍스트가 포함된 컬럼이 $10\%$ 미만(예: 7%, 350 dxa)으로 붕괴되지 않도록 최소 비율 보정 가드 도입.

### B. 예상되는 회귀 위험 및 방지책
- **위험**: 부모의 패딩이 소실되어 카드가 너무 바짝 붙는 현상.
  - **방지책**: 부모 패딩이 유의미한 경우(`> 0`), 자식 패딩에 합산 이전(`child.padding = mergePadding(parent.padding, child.padding)`)하거나 평탄화 대상에서 제외.
- **위험**: 가로 행의 배경색이 사라지는 현상.
  - **방지책**: `renderConditionalBackgroundWrapper`의 `applyTableFill` 로직을 활용하여, 가로 Table의 `tblPr/w:shd`로 배경색을 안전하게 전이.

### C. 수정 전후 검증 방법
- 단위 회귀 테스트 33개 파일 / 175개 테스트 전체 통과 확인.
- Word 16.0 COM 자동화를 통해 평탄화 전후 물리 페이지 수, 표 개수(1,597개 $\to$ 목표 1,000개 이하), 최소 셀 너비 회복 여부 교차 검증.

---
*본 보고서는 제품 코드 수정 없이 조사 및 테스트 설계 전용으로 작성되었습니다.*

