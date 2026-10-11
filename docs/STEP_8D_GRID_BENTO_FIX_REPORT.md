# Figma2Word — Step 8D: Figma Grid 메타데이터 기반 Bento 레이아웃 복구 보고서

## 1. 개요 (Overview)

본 보고서는 Step 8C 진단 결과를 바탕으로, Figma CSS Grid Auto Layout 메타데이터(`layoutMode: "GRID"`, `gridRowCount`, `gridColumnCount`, `gridRowSpan`, `gridColumnSpan`, `gridRowAnchorIndex`, `gridColumnAnchorIndex`)와 기하 좌표를 활용하여 비대칭 4-Card Bento Grid 레이아웃(`Container 1:4543`)의 붕괴 문제를 해결한 Step 8D 작업 결과를 기록한다.

기존 Row Cluster, Parser, Renderer의 전역 구조를 전혀 변경하지 않고, `LayoutEngine.processNodes`에 Figma Grid 기반 비대칭 Bento 감지 및 합성 수직 컬럼 생성(`foldGridBentoColumns`) 전처리만을 최소 범위로 추가하였다.

- **기준 Git 커밋**: `0292e58`
- **검증 환경**: Figma API 호출 0회 (순수 오프라인 재변환), 외부 네트워크 차단, 기존 Step 8A/8B 산출물 100% 보존, Git 커밋/Push 미수행

---

## 2. 실제 Figma Grid 메타데이터 확인 결과

`debug/customer/Final-Prj-Live-Step8B-Snapshot.json`의 대상 컨테이너 `1:4543` 및 그 자식들의 실제 키와 타입을 Node.js로 정밀 검증한 결과는 다음과 같다.

### 2.1 부모 컨테이너 (`1:4543`)
- `layoutMode`: `string = "GRID"`
- `gridRowCount`: `number = 2`
- `gridColumnCount`: `number = 4`
- `gridRowGap`: `number = 16`
- `gridColumnGap`: `number = 16`
- `gridColumnsSizing`: `string = "repeat(4,minmax(0,1fr))"`
- `gridRowsSizing`: `string = "repeat(2,minmax(0,1fr))"`
- `gridAutoTracks`: `string = "NONE"`
- `gridItemsPositioning`: `string = "MANUAL"`
- `absoluteBoundingBox`: `{ x: 14134, y: 2371.8, width: 1216, height: 600 }`

### 2.2 4개 자식 카드의 Grid 속성 및 점유 정보

| 자식 노드 ID | 명칭 / 대표 텍스트 | 좌표 (X / Y) 및 크기 (W / H) | gridRowAnchorIndex / gridColumnAnchorIndex | gridRowSpan / gridColumnSpan | 점유 영역 설명 |
|:---:|:---|:---:|:---:|:---:|:---|
| **`1:4544`** | `Container`<br>("개발자를 위한 낙원") | `x: 14134, y: 2371.8`<br>`w: 600, h: 600` | `row: 0`<br>`col: 0` | `rowSpan: 2`<br>`colSpan: 2` | 좌측 50% 폭 전체,<br>전체 높이 2개 행 점유 (Dominant Card) |
| **`1:4552`** | `Container`<br>("몰입을 위한 은신처") | `x: 14750, y: 2371.8`<br>`w: 600, h: 292` | `row: 0`<br>`col: 2` | `rowSpan: 1`<br>`colSpan: 2` | 우측 50% 폭 전체,<br>상단 1개 행 점유 (Wide Card) |
| **`1:4560`** | `Container`<br>("해변가") | `x: 14750, y: 2679.8`<br>`w: 292, h: 292` | `row: 1`<br>`col: 2` | `rowSpan: 1`<br>`colSpan: 1` | 우측 컬럼 내 좌측,<br>하단 1개 행 점유 (Small Card 1) |
| **`1:4564`** | `Container`<br>("도심의 활기") | `x: 15058, y: 2679.8`<br>`w: 292, h: 292` | `row: 1`<br>`col: 3` | `rowSpan: 1`<br>`colSpan: 1` | 우측 컬럼 내 우측,<br>하단 1개 행 점유 (Small Card 2) |

> **메타데이터 정합성 판정**: 속성명의 누락이나 불일치 없이, Figma 최신 CSS Grid Auto Layout 스펙에 따른 4열 × 2행 그리드 속성이 자식 노드마다 완벽하게 부여되어 있음을 확인하였다.

---

## 3. 수정 전 실패 테스트 (Test-First Reproduction)

`tests/bento-grid-layout.test.ts`에 실제 Bento 구조(1216×600, 4열×2행, 600×600 카드, 600×292 카드, 292×292 카드 2개)를 재현하는 테스트를 먼저 작성하여 실행하였다.

### 3.1 실패 재현 결과
```
FAIL tests/bento-grid-layout.test.ts > Step 8D: Figma Grid Metadata-driven Bento Layout Restoration > reconstructs 4-card asymmetric Bento Grid into outer 2-column table with nested right column
AssertionError: expected 2 to be 1 // Object.is equality

- Expected: 1 (outer 2-column horizontal row cluster)
+ Received: 2 (2 separate 100% width row clusters)

FAIL tests/bento-grid-layout.test.ts > Step 8D: Figma Grid Metadata-driven Bento Layout Restoration > supports mirror Bento (large card on right, stacked cards on left)
AssertionError: expected 2 to be 1
```

- 수정 전에는 `clusterHorizontalRows`가 Y가 같은 `[카드 0, 카드 1]`을 1행으로, `[카드 2, 카드 3]`을 2행으로 쪼개어 **2개의 독립된 테이블**을 생성함으로써 하단 카드들이 카드 0 아래로 밀려나는 현상이 정확히 재현되었다.

---

## 4. 구현 파일 및 변경 범위

### 4.1 변경 파일 목록
1. **`src/parser/types.ts`**:
   - `FigmaNode` 인터페이스에 Figma Grid Auto Layout 속성 추가:
     - `gridRowCount?: number;`
     - `gridColumnCount?: number;`
     - `gridRowGap?: number;`
     - `gridColumnGap?: number;`
     - `gridRowSpan?: number;`
     - `gridColumnSpan?: number;`
     - `gridRowAnchorIndex?: number;`
     - `gridColumnAnchorIndex?: number;`
   - `layoutMode` 타입에 `"GRID"` 허용.
2. **`src/layout/layoutEngine.ts`**:
   - `foldGridBentoColumns(nodes: FigmaNode[], parent?: FigmaNode): FigmaNode[]` 구현.
   - `processNodes`의 `clusterHorizontalRows` 호출 직전에 Step 1.5로 `foldGridBentoColumns` 연결.
3. **`tests/bento-grid-layout.test.ts`**:
   - Bento 복구, 미러 Bento, 2×2 균일 그리드 회귀 방지, 불완전 메타데이터 회귀 방지 등 8개 테스트 신규 작성.

### 4.2 Bento 전처리 알고리즘 상세 (`foldGridBentoColumns`)
1. **가드 조건**:
   - 자식 수 $\ge 3$.
   - 부모 `layoutMode === "GRID"` 또는 `gridRowCount >= 2`.
   - `gridRowCount >= 2` 및 `gridColumnCount >= 2`.
   - 모든 자식에 유효한 `absoluteBoundingBox` 존재.
2. **주(Dominant) 카드 판별**:
   - `gridRowSpan === rowCount && gridRowSpan >= 2 && gridColumnSpan < colCount`를 만족하는 카드가 **정확히 1개** 존재해야 함.
3. **적층(Stacked) 카드 판별 및 반대편 컬럼 검증**:
   - 나머지 $N \ge 2$개 카드가 주 카드의 반대편(우측 또는 좌측)에 위치해야 함 (`gridColumnAnchorIndex` 및 기하 X 좌표 기준).
   - 나머지 카드들이 최소 2개 이상의 서로 다른 `gridRowAnchorIndex`를 가져야 함 (단순 1행 나열이 아닌 수직 적층 검증).
   - 나머지 카드들의 Bounding Box 합집합 높이가 주 카드 높이의 $75\%$ 이상이어야 함.
4. **합성 수직 컬럼 프레임 생성**:
   - 적층된 카드들의 합집합 Bounding Box를 계산하고, `itemSpacing: parent.gridRowGap ?? 16`을 갖는 가상 프레임(`layoutMode: "VERTICAL"`)을 생성.
   - 고유 ID 부여: `bento-col-${parent.id}-${dominant.id}`.
   - 원본 노드는 복제나 변형 없이 자식 배열(`children`)로 보존.
   - 반환 순서: `isDominantOnLeft ? [dominant, syntheticColumn] : [syntheticColumn, dominant]`.

---

## 5. 최종 InternalDocument 구조

FigmaParser 파싱 결과, 부모 `Container 1:4543` 아래에 다음과 같은 계층적 `InternalDocument` 모델이 생성된다.

```
ContainerElement (1:4543)
 └── ContainerElement (row-cluster-1:4544) [layoutDirection: "horizontal", columnWidths: [50, 50]]
      ├── [Cell 0 (50%)]: ContainerElement (1:4544) - "개발자를 위한 낙원" (Large Card, 600x600)
      │    ├── ImageElement (cx=5715000, cy=5715000)
      │    └── ContainerElement (Card Body, Shading #000000)
      └── [Cell 1 (50%)]: ContainerElement (bento-col-1:4543-1:4544) [layoutDirection: "vertical"]
           ├── Item 0: ContainerElement (1:4552) - "몰입을 위한 은신처" (Wide Card, 600x292)
           │    ├── ImageElement (cx=5715000, cy=2781300)
           │    └── ContainerElement (Card Body, Shading #000000)
           └── Item 1: ContainerElement (row-cluster-1:4560) [layoutDirection: "horizontal", columnWidths: [50, 50]]
                ├── Sub-Cell 0 (50% of Cell 1 = 25% of Page): ContainerElement (1:4560) - "해변가" (292x292)
                └── Sub-Cell 1 (50% of Cell 1 = 25% of Page): ContainerElement (1:4564) - "도심의 활기" (292x292)
```

---

## 6. OpenXML 중첩 테이블 구조

실제 생성된 `Final-Prj-Step8D-Portrait.docx`의 `word/document.xml` 분석 결과:

```xml
<!-- 외부 1행 2열 테이블 (50% vs 50%) -->
<w:tbl>
  <w:tblPr><w:tblW w:type="pct" w:w="5000"/></w:tblPr>
  <w:tblGrid><w:gridCol w:w="4513"/><w:gridCol w:w="4513"/></w:tblGrid>
  <w:tr>
    <!-- Left Cell (50%): Card 0 (개발자를 위한 낙원) -->
    <w:tc>
      <w:tcPr><w:tcW w:type="pct" w:w="2500"/></w:tcPr>
      <w:drawing>... cx="5715000" cy="5715000" ...</w:drawing>
      <w:tbl>... 개발자를 위한 낙원 ...</w:tbl>
    </w:tc>

    <!-- Right Cell (50%): Bento Right Column -->
    <w:tc>
      <w:tcPr><w:tcW w:type="pct" w:w="2500"/></w:tcPr>
      <!-- Item 0: Card 1 (몰입을 위한 은신처) -->
      <w:drawing>... cx="5715000" cy="2781300" ...</w:drawing>
      <w:tbl>... 몰입을 위한 은신처 ...</w:tbl>

      <!-- Item 1: 중첩 1행 2열 테이블 (우측 셀 내부의 하단 2개 카드) -->
      <w:tbl>
        <w:tblPr><w:tblW w:type="pct" w:w="5000"/></w:tblPr>
        <!-- 각 열 폭이 2257 dxa (우측 셀 폭 4513 dxa의 정확히 절반) -->
        <w:tblGrid><w:gridCol w:w="2257"/><w:gridCol w:w="2257"/></w:tblGrid>
        <w:tr>
          <w:tc>
            <w:tcPr><w:tcW w:type="pct" w:w="2500"/></w:tcPr>
            ... 해변가 (292x292) ...
          </w:tc>
          <w:tc>
            <w:tcPr><w:tcW w:type="pct" w:w="2500"/></w:tcPr>
            ... 도심의 활기 (292x292) ...
          </w:tc>
        </w:tr>
      </w:tbl>
    </w:tc>
  </w:tr>
</w:tbl>
```

- **핵심 개선**: Step 8B에서 페이지 전체 폭(4513 dxa)으로 1행 아래로 밀려났던 카드 2와 3이, Step 8D에서는 **우측 셀 내부의 2257 dxa 폭 중첩 테이블** 안으로 완벽히 안착되었다.

---

## 7. 실제 Word COM 렌더링 계측 및 Step 8B vs Step 8D 비교

실제 Microsoft Word 프로세스를 구동하여 COM API로 문서를 열고 통계를 측정한 결과:

| 산출물 파일명 | 페이지 수 (Pages) | 단락 수 (Paragraphs) | 단어 수 (Words) | 이미지 수 (InlineShapes) | 테이블 수 (Tables) | Word COM 상태 |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| `Final-Prj-Step8B-Portrait.docx` | 78 p | 1,907 | 4,475 | 112 | 26 | **OK** |
| `Final-Prj-Step8D-Portrait.docx` | **77 p (-1p)** | **1,907 (동일)** | **4,475 (동일)** | **112 (동일)** | **26 (동일)** | **OK** |
| `Final-Prj-Step8B-Landscape.docx` | 108 p | 1,907 | 4,475 | 112 | 26 | **OK** |
| `Final-Prj-Step8D-Landscape.docx` | **108 p (동일)** | **1,907 (동일)** | **4,475 (동일)** | **112 (동일)** | **26 (동일)** | **OK** |

### 정밀 분석
1. **페이지 수 감소 (Portrait 78p $\rightarrow$ 77p)**:
   - Step 8B에서는 1행 테이블에서 308px의 빈 공간이 발생하고 하단 2개 카드가 페이지 전체 폭을 차지하는 별도 테이블로 밀려나 추가 높이를 낭비했으나,
   - Step 8D에서는 하단 2개 카드가 우측 셀 내부의 남는 세로 공간에 결합되어 수직 낭비가 제거되었으며, 그 결과 총 페이지 수가 1페이지 감소하였다.
2. **콘텐츠 100% 무결성 보존**:
   - 단락 수: `1,907`개 (100% 일치, 0 누락)
   - 단어 수: `4,475`개 (100% 일치, 0 누락)
   - 이미지 수: `112`개 (100% 일치, 0 누락)
   - 테이블 수: `26`개 (중첩 테이블 정상 계산)
3. **기타 섹션 보존**:
   - FAQ 섹션: 3개 테이블, 폭 `6589 dxa`, Pill 배지 및 보더 정상 유지.
   - 독립 아트보드: 페이지 분리 및 경계 정상 유지.

---

## 8. 회귀 테스트 결과

신규 작성된 `tests/bento-grid-layout.test.ts` (8개 테스트)를 포함하여 전체 테스트 스위트를 검증한 결과:

- **총 테스트 파일**: **38개 파일** (모두 통과)
- **총 테스트 케이스**: **219개 테스트** (기존 211개 + 신규 8개, **100% PASS**)
- **빌드 검증**:
  - `npm run build` (tsc): **성공 (오류 0건)**
  - `npm run build:web` (vite client bundle): **성공 (오류 0건)**

### 검증된 회귀 항목 상세
1. **일반 2열 카드 그리드**: 자식 수 조건($n \ge 3$) 미달로 즉시 스킵 $\rightarrow$ 일반 1행 2열 유지.
2. **일반 3열 및 4열 카드 그리드**: 모든 카드가 1행이므로 dominant 조건 불일치 $\rightarrow$ 일반 3열/4열 행 클러스터 유지.
3. **좌우 사이드바 + 본문**: 폭 비율 및 2개 노드 조건으로 스킵 $\rightarrow$ 25%:75% 2열 행 클러스터 유지.
4. **수직 카드 목록**: X 좌표가 동일하고 Y가 적층된 목록 $\rightarrow$ 클러스터링 없이 3개 독립 단락/컨테이너 유지.
5. **독립 모바일 아트보드**: `isIndependentScreen` 가드에 의해 화면 격리 유지.
6. **FAQ 테이블**: 100% 기존 테이블 구조 및 너비 유지.
7. **Grid 메타데이터 없는 일반 컨테이너**: `foldGridBentoColumns` 즉시 스킵.
8. **불완전/모순된 Grid 메타데이터**: 에러 없이 기존 변환 방식으로 안전하게 폴백.
9. **좌우 반전(Mirror) Bento**: 우측 대형 1개 + 좌측 적층 3개 구조 완벽 지원.

---

## 9. 지원하지 않는 Grid 패턴의 안전 폴백

다음과 같은 Grid 패턴은 Bento 전처리 조건을 만족하지 않으므로, 기존의 안전한 Row Cluster 방식으로 폴백된다:
1. **균일 N×M 그리드** (예: 2행 2열에 4개 카드가 각각 1×1 점유):
   - 주(dominant) 카드가 없으므로 스킵 $\rightarrow$ 2개의 2열 Row Cluster로 안전하게 처리.
2. **1행 다열 그리드** (예: 1행 3열, 1행 4열, 1행 12열):
   - 행 수가 1이므로 스킵 $\rightarrow$ 1행 다열 Row Cluster로 안전하게 처리.
3. **불완전한 그리드** (예: gridRowCount가 1이거나 자식 수가 2개 이하):
   - 스킵 $\rightarrow$ 기존 로직 적용.

---

## 10. Git 커밋 적합성

- **작업 범위 준수**:
  - `src/parser/types.ts`: Grid 속성 인터페이스 추가
  - `src/layout/layoutEngine.ts`: `foldGridBentoColumns` 추가 및 연결
  - `tests/bento-grid-layout.test.ts`: 8개 전용 테스트
- **미커밋 안전장치 보존**:
  - `apps/web/src/App.tsx`, `src/api/figmaClient.ts`, `src/pipeline/index.ts`, `tests/figma-offline-snapshot.test.ts` (Step 8A 이미지 완전성 검사) 모두 온전히 보존됨.
- **제약 준수**:
  - Git 커밋 및 Push 미수행.
  - Figma API 및 외부 네트워크 호출 0건.
  - 사용자 지시에 따라 대기.

