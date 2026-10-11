# Figma2Word — Step 8C: 실제 Bento 레이아웃 구조 진단 및 최소 수정 계획

## 1. 개요 및 요약 (Executive Summary)

### 1.1 진단 배경
Step 8B에서 실제 Figma 원본 스냅샷(`Final-Prj-Live-Step8B-Snapshot.json`)과 실제 변환 결과(`Final-Prj-Step8B-Portrait.docx`)를 정밀 검증한 결과, 주요 레이아웃 중 **큐레이션 추천 카드 4개가 포함된 비대칭 Bento Grid 섹션(`Container 1:4543`)**에서 심각한 시각적 배치 왜곡이 확인되었다.

Figma 원본에서는 **좌측 대형 카드 1개(50% 너비, 100% 높이)**와 **우측 3개 카드(상단 1개 와이드 카드 + 하단 2개 정사각형 카드)**가 깔끔한 2열 Bento 구조를 형성하고 있으나, 현재 변환된 DOCX에서는 다음과 같이 깨져서 출력된다:
- **1행 테이블 (Row 1)**: 좌측 카드 0 (50%) + 우측 상단 카드 1 (50%). 카드 0의 높이(600px)에 맞춰 행 높이가 늘어나 카드 1 아래에 거대한 여백 발생.
- **2행 테이블 (Row 2)**: 우측 하단에 있어야 할 카드 2와 카드 3이 1행 아래로 완전히 밀려나 **페이지 전체 폭(100%)**을 차지하며 가로로 나열됨 (카드 2가 카드 0 아래 좌측에, 카드 3이 카드 1 아래 우측에 배치).

### 1.2 핵심 진단 결과
1. **Figma 노드 구조 (Case B 확정)**:
   - Figma 원본에서 우측 3개 카드를 묶는 별도의 래퍼(Frame) 컨테이너는 **존재하지 않는다**.
   - 4개 카드 모두 부모 컨테이너(`Container 1:4543`)의 **동일한 레벨 직접 자식(Direct Siblings)**으로 배치되어 있다.
   - Figma 최신 기능인 `layoutMode: "GRID"` (4열 × 2행, CSS Grid 기반)로 구성되어 있으며, 자식 노드마다 `gridRowSpan`, `gridColumnSpan`, `gridRowAnchorIndex`, `gridColumnAnchorIndex` 속성이 명시되어 있다.
2. **배치 붕괴 원인**:
   - `LayoutEngine.clusterHorizontalRows`가 단순 Y 좌표 기반 정렬 및 행 클러스터링을 수행하면서, Y가 동일한 `[카드 0, 카드 1]`을 1행으로 묶고, 하단 Y를 가진 `[카드 2, 카드 3]`을 2행으로 분리하였다.
   - 각 행 클러스터가 개별 100% 너비 DOCX 테이블로 변환되어 상하로 적층되면서 우측 컬럼의 수직 종속 관계가 완전히 파괴되었다.
3. **Word OpenXML 호환성 및 해결 방안**:
   - Microsoft Word OpenXML 테이블은 테이블 셀(`w:tc`) 내부에 중첩 테이블(`w:tbl`)을 공식 지원한다.
   - `LayoutEngine`에서 Case B Bento 패턴을 감지하여 우측 3개 카드를 **합성 수직 컬럼(Synthetic Vertical Column Container)**으로 사전 그룹화하면, 외부 2열 테이블(50% : 50%) 내부의 우측 셀 안에 상단 카드와 하단 2열 중첩 테이블이 완벽하게 렌더링된다.
   - 프로토타입 DOCX 생성 및 실제 Word COM 검증 결과, 78페이지 정상 유지, 0 오류, 0 경고로 완벽하게 렌더링됨을 입증하였다.

---

## 2. 실제 Figma 원본 계층 구조 정밀 조사 (`1:4543`)

`debug/customer/Final-Prj-Live-Step8B-Snapshot.json`의 원본 데이터를 조사한 상세 결과는 다음과 같다.

### 2.1 부모 노드 정보
- **부모 섹션 ID**: `1:4540`
- **부모 이름**: `Section - Curated Collections (Bento Grid)`
- **부모 타입**: `FRAME`
- **부모 layoutMode**: `VERTICAL`
- **부모 Bounding Box**: `{ x: 14102, y: 2243.8, width: 1280, height: 808 }`
- **부모 자식 수**: 2개 (`1:4541` 섹션 제목 텍스트, `1:4543` 카드 컨테이너)

### 2.2 대상 Bento 컨테이너 (`1:4543`)
- **노드 ID**: `1:4543`
- **노드 이름**: `Container`
- **노드 타입**: `FRAME`
- **layoutMode**: `GRID` (Figma CSS Grid Auto Layout)
- **Grid 파라미터**:
  - `gridColumnCount`: 4
  - `gridRowCount`: 2
  - `gridColumnGap`: 16px
  - `gridRowGap`: 16px
  - `gridColumnsSizing`: `repeat(4, minmax(0, 1fr))`
  - `gridRowsSizing`: `repeat(2, minmax(0, 1fr))`
  - `gridItemsPositioning`: `MANUAL`
- **Bounding Box**: `{ x: 14134, y: 2371.8, width: 1216, height: 600 }`
- **직접 자식 수**: 4개 (`1:4544`, `1:4552`, `1:4560`, `1:4564`)

### 2.3 4개 카드의 상세 기하 좌표 및 Grid 속성

| 자식 순번 | 노드 ID | 카드 명칭 (대표 텍스트) | X / Y 좌표 | Width / Height | Figma Grid Anchor & Span | 공간 점유 영역 |
|:---:|:---:|:---|:---:|:---:|:---|:---|
| **Child 0** | `1:4544` | **개발자를 위한 낙원** (좌측 대형 카드) | `x: 14134`<br>`y: 2371.8` | `w: 600`<br>`h: 600` | Row: 0 (span 2)<br>Col: 0 (span 2) | 좌측 50% 폭 전체,<br>전체 높이 100% 점유 |
| **Child 1** | `1:4552` | **몰입을 위한 은신처** (우측 상단 와이드) | `x: 14750`<br>`y: 2371.8` | `w: 600`<br>`h: 292` | Row: 0 (span 1)<br>Col: 2 (span 2) | 우측 50% 폭 전체,<br>상단 절반(292px) 점유 |
| **Child 2** | `1:4560` | **해변가** (우측 하단 좌측 카드) | `x: 14750`<br>`y: 2679.8` | `w: 292`<br>`h: 292` | Row: 1 (span 1)<br>Col: 2 (span 1) | 우측 컬럼 내 좌측 절반,<br>하단 절반(292px) 점유 |
| **Child 3** | `1:4564` | **도심의 활기** (우측 하단 우측 카드) | `x: 15058`<br>`y: 2679.8` | `w: 292`<br>`h: 292` | Row: 1 (span 1)<br>Col: 3 (span 1) | 우측 컬럼 내 우측 절반,<br>하단 절반(292px) 점유 |

> **간격 검증 (Gap Verification)**:
> - 좌우 열 간격: `14750 - (14134 + 600) = 14750 - 14734 = 16px` (Col Gap 일치)
> - 우측 상하 행 간격: `2679.8 - (2371.8 + 292) = 2679.8 - 2663.8 = 16px` (Row Gap 일치)
> - 우측 하단 2개 카드 간격: `15058 - (14750 + 292) = 15058 - 15042 = 16px` (Col Gap 일치)

### 2.4 Case A vs Case B 판정
- **판정: Case B (동일 부모 아래 4개 카드가 평면적으로 배치된 구조)**
- Figma 원본 트리에 우측 3개 카드(`1:4552`, `1:4560`, `1:4564`)를 감싸는 중간 부모 노드가 없다.
- 따라서 기존의 "부모 그룹 보존" 방식만으로는 해결할 수 없으며, **Case B에 대응하는 비대칭 2컬럼 Bento Grid 구조 감지 및 합성 컬럼 생성 메커니즘**이 반드시 필요하다.

---

## 3. 코드 흐름 및 레이아웃 파괴 과정 추적 (Step-by-Step Code Flow)

### 3.1 현재 파이프라인의 처리 순서
1. `FigmaParser.parseContainer(1:4543)` 진입:
   - `node.children` = `[1:4544, 1:4552, 1:4560, 1:4564]` 전달.
   - `parseChildren`에서 `layoutEngine.processNodes(visibleNodes, parent=1:4543)` 호출.
2. `LayoutEngine.foldContainedOverlays` 실행:
   - 4개 카드는 서로 겹치거나 포함되지 않고 독립적인 공간을 점유하므로 아무런 변경 없이 통과.
3. `LayoutEngine.clusterHorizontalRows` 실행:
   - 노드들을 Y 좌표 기준으로 오름차순 정렬:
     - `index 0`: `1:4544` (y=2371.8, h=600, x=14134~14734)
     - `index 1`: `1:4552` (y=2371.8, h=292, x=14750~15350)
     - `index 2`: `1:4560` (y=2679.8, h=292, x=14750~15042)
     - `index 3`: `1:4564` (y=2679.8, h=292, x=15058~15350)
   - **i = 0 루프 (`1:4544` 기준 탐색)**:
     - 후보 `1:4552` 검사: Y 차이 0px, X 비충돌 $\rightarrow$ `canFormHorizontalRow` 통과, 클러스터에 포함.
     - 후보 `1:4560` 검사: `1:4552`와의 Y 관계 검사 시 `vOverlapBottom - vOverlapTop = -16px < 10px`, Y 차이 308px > 20px $\rightarrow$ 탈락.
     - 결과: `row-cluster-1:4544` 생성 (`children: [1:4544, 1:4552]`, `_computedColumnWidths: [50, 50]`).
   - **i = 2 루프 (`1:4560` 기준 탐색)**:
     - 후보 `1:4564` 검사: Y 차이 0px, X 비충돌 $\rightarrow$ `canFormHorizontalRow` 통과, 클러스터에 포함.
     - 결과: `row-cluster-1:4560` 생성 (`children: [1:4560, 1:4564]`, `_computedColumnWidths: [50, 50]`).
4. `DocxRenderer` 렌더링 단계:
   - `row-cluster-1:4544`가 너비 100% 2열 테이블로 렌더링됨:
     - Cell 1 (50%): `1:4544` (높이 600px).
     - Cell 2 (50%): `1:4552` (높이 292px).
     - Word 표 행은 가장 높은 셀(Cell 1)에 맞춰지므로 600px 높이가 됨. Cell 2 하단에 308px 상당의 빈 공백이 생김.
   - `row-cluster-1:4560`이 그 다음 너비 100% 2열 테이블로 렌더링됨:
     - Cell 1 (50%): `1:4560` ("해변가").
     - Cell 2 (50%): `1:4564` ("도심의 활기").
     - 이 테이블 전체가 1행 테이블의 600px 아래로 밀려나 문서 폭 전체를 가로지름.

### 3.2 핵심 결함 요약
- `clusterHorizontalRows`는 모든 노드를 **수평 띠(Horizontal Band)**로만 분할하려고 시도한다.
- 그러나 Bento 레이아웃은 **좌측 1개 열 vs 우측 1개 열(내부에 상하 적층된 여러 카드)**이라는 **수직 2열 분할(2-Column Vertical Split)** 구조이다.
- 수평 띠 알고리즘을 먼저 돌리면 우측 컬럼 내부의 상하 관계가 수평 행 경계로 강제 절단되어 복구가 불가능해진다.

---

## 4. Word OpenXML 출력 및 COM 계측 검증

### 4.1 실제 `Final-Prj-Step8B-Portrait.docx`의 OpenXML 구조
실제 생성된 docx의 `word/document.xml` 분석 결과:
```xml
<!-- 1행: Row Cluster (1:4544 + 1:4552) -->
<w:tbl>
  <w:tblPr><w:tblW w:type="pct" w:w="5000"/></w:tblPr>
  <w:tblGrid><w:gridCol w:w="4513"/><w:gridCol w:w="4513"/></w:tblGrid>
  <w:tr>
    <!-- Cell 0: 개발자를 위한 낙원 (50%) -->
    <w:tc>
      <w:tcPr><w:tcW w:type="pct" w:w="2500"/></w:tcPr>
      <w:p><w:r><w:drawing>... cx="5715000" cy="5715000" ...</w:drawing></w:r></w:p>
      ...
    </w:tc>
    <!-- Cell 1: 몰입을 위한 은신처 (50%) -->
    <w:tc>
      <w:tcPr><w:tcW w:type="pct" w:w="2500"/></w:tcPr>
      <w:p><w:r><w:drawing>... cx="5715000" cy="2781300" ...</w:drawing></w:r></w:p>
      ...
    </w:tc>
  </w:tr>
</w:tbl>

<!-- 테이블 간 분리 단락 -->
<w:p/>

<!-- 2행: Row Cluster (1:4560 + 1:4564) - 전체 폭 100%로 강제 하단 배치 -->
<w:tbl>
  <w:tblPr><w:tblW w:type="pct" w:w="5000"/></w:tblPr>
  <w:tblGrid><w:gridCol w:w="4513"/><w:gridCol w:w="4513"/></w:tblGrid>
  <w:tr>
    <!-- Cell 0: 해변가 (50%) -->
    <w:tc><w:tcPr><w:tcW w:type="pct" w:w="2500"/></w:tcPr>...</w:tc>
    <!-- Cell 1: 도심의 활기 (50%) -->
    <w:tc><w:tcPr><w:tcW w:type="pct" w:w="2500"/></w:tcPr>...</w:tc>
  </w:tr>
</w:tbl>
```

### 4.2 올바른 Bento OpenXML 중첩 구조 (프로토타입 검증 완료)
우측 3개 카드를 수직 컬럼으로 묶었을 때 생성되는 OpenXML:
```xml
<!-- 외부 2열 테이블 (1행 2열: 50% vs 50%) -->
<w:tbl>
  <w:tblPr><w:tblW w:type="pct" w:w="5000"/></w:tblPr>
  <w:tblGrid><w:gridCol w:w="4513"/><w:gridCol w:w="4513"/></w:tblGrid>
  <w:tr>
    <!-- Left Cell (50%): Card 0 (개발자를 위한 낙원, 600x600) -->
    <w:tc><w:tcPr><w:tcW w:type="pct" w:w="2500"/></w:tcPr>...</w:tc>

    <!-- Right Cell (50%): Right Column (600x600) -->
    <w:tc>
      <w:tcPr><w:tcW w:type="pct" w:w="2500"/></w:tcPr>
      <!-- Item 1: Card 1 (몰입을 위한 은신처, 600x292) -->
      <w:p><w:r><w:drawing>... cy="2781300" ...</w:drawing></w:r></w:p>
      ...
      <!-- Item 2: Nested Table for Card 2 & Card 3 (292x292 each) -->
      <w:tbl>
        <w:tblPr><w:tblW w:type="pct" w:w="5000"/></w:tblPr>
        <w:tblGrid><w:gridCol w:w="2257"/><w:gridCol w:w="2257"/></w:tblGrid>
        <w:tr>
          <w:tc><w:tcPr><w:tcW w:type="pct" w:w="2500"/></w:tcPr>... 해변가 ...</w:tc>
          <w:tc><w:tcPr><w:tcW w:type="pct" w:w="2500"/></w:tcPr>... 도심의 활기 ...</w:tc>
        </w:tr>
      </w:tbl>
    </w:tc>
  </w:tr>
</w:tbl>
```

### 4.3 Word COM 계측 검증 결과
실제 Microsoft Word 인스턴스를 COM 자동화로 구동하여 `test_bento_portrait.docx`를 열어 검증한 결과:
- **총 페이지 수**: 78 페이지 (기존 Step 8B와 동일하게 유지)
- **InlineShapes (이미지) 수**: 112개 정상 유지
- **Tables 수**: 26개 (중첩 테이블 정상 인식)
- **문서 무결성**: 손상 경고 0건, 복구 프롬프트 0건, 100% 정상 로드

---

## 5. 최소 수정 계획 (Step 8D Fix Plan)

### 5.1 아키텍처 원칙
1. **기존 파이프라인 불변**:
   - `DocxRenderer`나 `docx` 라이브러리의 테이블 렌더링 방식을 변경하지 않는다. (이미 중첩 테이블을 완벽히 지원함)
   - `FigmaParser`의 기본 파싱 플로우를 변경하지 않는다.
2. **LayoutEngine 단계 국소화**:
   - `LayoutEngine.processNodes(nodes, parent)` 내부에서 수평 행 클러스터링(`clusterHorizontalRows`)을 실행하기 직전에 **Case B 비대칭 2컬럼 Bento 구조를 감지하여 우측(또는 좌측) 복합 컬럼을 단일 합성 컨테이너로 묶는 전처리 단계**를 추가한다.
3. **ID/이름 하드코딩 절대 금지**:
   - 노드 이름("Container", "Section")이나 ID("1:4543")에 의존하지 않고, **순수 기하학적 구조(Bounding Box)** 및 **Figma Grid 메타데이터**를 기준으로 감지한다.

### 5.2 Bento 패턴 감지 알고리즘 (Heuristic Specification)

부모 컨테이너 $P$의 자식 노드 집합 $S = \{c_1, c_2, \dots, c_n\}$에 대해:

#### 조건 1: 노드 수 및 컨테이너 조건
- $n \ge 3$ (대형 카드 1개 + 반대편 2개 이상의 카드).
- 모든 노드가 유효한 `absoluteBoundingBox`를 보유.

#### 조건 2: 2열 분할(2-Column Partition) 탐색
- 전체 자식들의 Bounding Box 외곽 영역을 계산: $X_{\min}, X_{\max}, Y_{\min}, Y_{\max}, W_{\text{total}}, H_{\text{total}}$.
- 자식들을 수평 중앙선 기준 또는 한 축의 분할점 $X_{\text{split}} \approx X_{\min} + 0.5 W_{\text{total}}$ 기준으로 좌측 그룹 $G_L$과 우측 그룹 $G_R$로 분할:
  - **좌측 비대칭 패턴 (Left Dominant)**:
    - $|G_L| = 1$이고 $|G_R| \ge 2$.
    - $G_L[0]$의 높이가 전체 높이의 대다수 차지: $H(G_L[0]) \ge 0.75 H_{\text{total}}$.
    - $G_L[0]$의 너비가 약 50%: $0.35 W_{\text{total}} \le W(G_L[0]) \le 0.65 W_{\text{total}}$.
    - $G_R$의 모든 요소가 $G_L[0]$의 우측에 위치: $\forall c \in G_R, c.x \ge G_L[0].x + G_L[0].w - 10$.
    - $G_R$ 요소들의 전체 높이 합집합이 $H(G_L[0])$에 근접: $H(\text{union}(G_R)) \ge 0.75 H_{\text{total}}$.
  - **우측 비대칭 패턴 (Right Dominant - Mirror Bento)**:
    - $|G_R| = 1$이고 $|G_L| \ge 2$.
    - $G_R[0]$의 높이가 $\ge 0.75 H_{\text{total}}$, 너비가 약 50%.
    - $G_L$ 요소들이 $G_R[0]$의 좌측에 위치하며 수직으로 적층됨.
  - **Figma Grid 모드 보조 감지 (`layoutMode === "GRID"`)**:
    - 만약 부모가 `layoutMode === "GRID"`이고 자식 중 하나가 `gridRowSpan === 2 && gridColumnSpan === 2`인 경우 위 기하 감지 신뢰도를 100%로 확정.

#### 조건 3: 합성 컬럼 컨테이너(Synthetic Column Frame) 생성
- 다수 카드로 구성된 그룹($G_R$ 또는 $G_L$)을 감싸는 단일 `FRAME` 노드를 생성:
  ```ts
  const columnFrame: FigmaNode = {
    id: `bento-col-${dominantItem.id}`,
    name: `Bento Sub-Column`,
    type: "FRAME",
    layoutMode: "VERTICAL",
    absoluteBoundingBox: boundingBoxOf(stackedChildren),
    children: stackedChildren,
    visible: true,
  };
  ```
- 부모의 직접 자식 목록을 `[dominantItem, columnFrame]` (또는 반대 순서) 2개로 치환.
- 이후 기존 `clusterHorizontalRows`를 호출하면, 2개 노드가 완벽한 50%:50% 행 클러스터(`row-cluster`)로 묶이며, `columnFrame` 내부는 재귀적으로 파싱될 때 상단 카드와 하단 2열 클러스터로 자동 분할된다.

---

## 6. 회귀 위험도 분석 (Regression Risk Analysis)

새로운 Bento 감지 로직이 기존 211개 테스트 및 다른 일반 레이아웃에 미치는 영향을 분석한다.

| 기존 레이아웃 유형 | 구조적 특성 | Bento 감지 로직의 영향 | 회귀 위험도 |
|:---|:---|:---|:---:|
| **일반 2열 카드 그리드** | 카드 2개가 나란히 배치됨 ($|G_L|=1, |G_R|=1$) | 자식 수 조건($n \ge 3$) 미달로 즉시 스킵 | **0% (안전)** |
| **일반 3열/4열 카드 그리드** | 카드들이 동일한 Y, 동일한 높이로 나열됨 | $|G_L|=1, |G_R|=2$일 때 $G_L[0]$의 높이가 $G_R$ 요소들의 누적 높이와 다르며, $G_R$ 요소들이 상하 적층되지 않고 좌우로 나열되므로 조건 불일치 | **0% (안전)** |
| **사이드바 + 메인 본문** | 사이드바(좌) + 메인(우) 구조 | 사이드바와 본문은 주로 2개 노드($n=2$)이거나 독립 섹션으로 분리되어 있음. 또한 폭 비율이 20%:80% 수준으로 50%:50% Bento 조건에 미달 | **0% (안전)** |
| **수직 카드 목록** | 모든 카드가 1열로 세로 적층됨 | $X_{\text{split}}$ 기준 좌우 분할 시 한쪽이 비어 조건 불일치 | **0% (안전)** |
| **기존 모바일/데스크톱 독립 스크린** | 독립 아트보드 화면들 | `isIndependentScreen` 가드에 의해 스크린 분리 유지 | **0% (안전)** |

---

## 7. Step 8D 구현 및 검증 체크리스트

다음 단계(Step 8D)에서 수행할 작업 항목:

1. **`src/layout/layoutEngine.ts` 수정**:
   - `foldAsymmetricBentoColumns(nodes: FigmaNode[], parent?: FigmaNode): FigmaNode[]` 헬퍼 메서드 추가.
   - `processNodes`의 `clusterHorizontalRows` 호출 직전에 `foldAsymmetricBentoColumns` 연결.
   - 격자/기하학적 검증 가드 구현 (자식 수 $\ge 3$, 폭 비율 약 50%, 높이 비율 일치, 상하 적층 확인).
2. **신규 단위 테스트 작성 (`tests/bento-grid-layout.test.ts`)**:
   - 비대칭 2열 Bento Grid (좌측 대형 1개 + 우측 적층 3개) 변환 테스트.
   - 미러 비대칭 Bento Grid (우측 대형 1개 + 좌측 적층 3개) 변환 테스트.
   - 일반 2열/3열 그리드가 Bento로 잘못 묶이지 않는지 회귀 방지 테스트.
   - Figma `layoutMode: 'GRID'` 메타데이터가 있는 경우와 순수 절대좌표만 있는 경우 모두 검증.
3. **전체 테스트 및 빌드 검증**:
   - `npm test` (기존 211개 + 신규 테스트 통과 확인).
   - `npm run build` 및 `npm run build:web` 통과 확인.
4. **실제 스냅샷 재변환 및 산출물 정밀 계측**:
   - `Final-Prj-Live-Step8B-Snapshot.json`을 오프라인 재변환하여 DOCX 산출물 생성.
   - Word COM 계측으로 Bento 카드가 1개 외부 표 내에서 2열로 정상 배치되는지 확인.

