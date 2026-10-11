# Figma2Word — Step 11B: A4 문서 내부 다단 레이아웃 오탐 수정 및 데이터 표 회귀 강화 보고서

## 1. 개요 및 작업 배경

Step 11A에서 복합 데이터 표 지원(`tryDataTable`)을 구현하고 외부 AI 감사의 지적 사항들을 객관적으로 검증했습니다.  
그러나 후속 조사에서 다음 2가지 실질적인 레이아웃 및 파싱 문제가 식별되었습니다:

1. **A4 문서 내부 세로형 카드의 모바일 화면 오탐**:
   - A4 세로 규격(595×842pt) 내부에서 좌우로 나란히 배치된 비교 카드(270×650pt) 2개가 `isIndependentScreen`의 부모 너비 임계값(`>= 600`) 미달로 인해 독립 모바일 화면(`isMobileScreen`)으로 오인되어 세로로 분리(2페이지 분할)되던 현상.
2. **`tryDataTable`의 카드 그리드 오탐(False Positive) 위험**:
   - 2열×3행 비교 카드 그리드나 3열×2행 KPI 메트릭 대시보드 배열과 같이 가로/세로 정렬이 균일한 다행 카드 그리드가 `tryDataTable()`에 의해 단일 데이터 표(`TableElement`)로 오탐되어 카드 내부 버튼·풍부한 서식이 표 셀로 왜곡될 위험.

본 Step 11B에서는 기존 Parser → IR → Layout → DOCX Renderer 아키텍처를 온전히 유지하면서, **A4 내부 세로 카드의 좌우 2단 배치 정상 복구**, **캔버스 상 독립 모바일 화면 격리 유지**, 그리고 **카드 그리드 배제 가드(`isCardGrid`)를 통한 안전한 컨테이너 Fallback**을 구현하고 Word COM을 통해 실제 시각 렌더링을 직접 검증했습니다.

---

## 2. A4 내부 다단 카드 오탐 수정 상세

### 2.1 원인 분석
- `src/layout/layoutEngine.ts`의 `isIndependentScreen()` 함수는 부모 컨텍스트 너비를 `pBox.width >= 600`으로 검사하고 있었습니다.
- ISO 표준 A4 세로 규격은 **595pt × 842pt**, US Letter 세로 규격은 **612pt × 792pt**입니다.
- 너비가 595pt인 A4 프레임은 `pBox.width >= 600` 가드를 통과하지 못해 `parent` 컨텍스트가 무시되었고, 내부의 270×650pt 카드가 독립 모바일 화면(너비 240~500pt, 높이 >= 450pt)으로 판별되어 가로 행 클러스터링(`_isRowCluster`)에서 배제되었습니다.

### 2.2 코드 수정 (`src/layout/layoutEngine.ts`)
부모 컨텍스트 가드 조건을 `pBox.width >= 500 && parent?.type !== "CANVAS" && parent?.type !== "DOCUMENT"`로 완화했습니다:

```typescript
// src/layout/layoutEngine.ts
private isIndependentScreen(box: FigmaBoundingBox, parent?: FigmaNode): boolean {
  const pBox = parent?.absoluteBoundingBox;
  if (pBox && pBox.width >= 500 && parent?.type !== "CANVAS" && parent?.type !== "DOCUMENT") {
    // Inside a wide container or document page (width >= 500px, e.g. A4 595px, Letter 612px, desktop >= 600px):
    // A child is an independent full-width section/screen ONLY if it spans almost the full parent width.
    // Columns, sidebars, cards, and comparison panels occupying a fraction of the width (< 85%)
    // are internal layout elements that should be eligible for horizontal clustering.
    return box.width >= pBox.width * 0.85;
  }
  ...
}
```

- **효과**:
  - A4 문서(595pt) 내부의 270pt 카드는 부모 너비의 약 45.4%(< 85%)이므로 독립 화면이 아닌 레이아웃 내부 요소로 정확히 분류되어 가로 행 클러스터(`_isRowCluster`)로 묶임.
  - 캔버스 레벨의 모바일 아트보드(375×812pt)는 부모가 CANVAS이거나 없으므로 가드가 적용되지 않고 독립 화면으로 분리 격리 유지.

---

## 3. 데이터 표 vs 카드 그리드 판별 가드 (`isCardGrid`)

### 3.1 기하학적 및 구조적 판별 원칙
| 항목 | 네이티브 데이터 표 (`TableElement`) | 카드 그리드 (`ContainerElement`) |
| :--- | :--- | :--- |
| **행 간격 (`rowSpacing`)** | 0px ~ 조밀 (<= 8px) | 넓은 간격 (>= 16px) |
| **평균 행 높이 (`avgRowHeight`)** | 컴팩트 (보통 20~60px, <= 100px) | 높음 (> 100px) |
| **셀 모서리 반경 (`cornerRadius`)** | 0px (직사각형 셀) | 둥근 모서리 (>= 8px 또는 >= 4px + 간격) |
| **셀 내부 자식 구성** | 단순 텍스트/숫자 (1~2개 자식) | 복합 UI (제목 + 본문 + 버튼 등 3개 이상 자식, 높이 >= 60px) |

### 3.2 구현 내용 (`src/parser/figmaParser.ts`)
`tryDataTable()` 메서드 내에서 균일 행/열 검사 직후 `isCardGrid` 검사를 배치하여 카드 그리드로 판별 시 즉시 `null`을 반환하고 일반 컨테이너로 Fallback시켰습니다:

```typescript
// src/parser/figmaParser.ts
private isCardGrid(
  node: FigmaNode,
  parsedRows: { rowNode: FigmaNode; cellNodes: FigmaNode[] }[]
): boolean {
  // 1. Large row spacing check: Table rows typically have minimal/no spacing (itemSpacing <= 8)
  const rowSpacing = node.itemSpacing ?? 0;
  if (rowSpacing >= 16) return true; // Large gap between rows -> Card Grid

  let totalHeight = 0;
  let complexCellCount = 0;
  let roundedCardCount = 0;
  let totalCells = 0;

  for (const pr of parsedRows) {
    const r = pr.rowNode;
    const h = r.absoluteBoundingBox?.height ?? 0;
    totalHeight += h;

    const colSpacing = r.itemSpacing ?? 0;
    for (const c of pr.cellNodes) {
      totalCells++;
      const cH = c.absoluteBoundingBox?.height ?? 0;
      const cRadius = c.cornerRadius ?? 0;

      // Rounded standalone cards with gutter (itemSpacing >= 8) or prominent radius (>= 8)
      if (cRadius >= 8 || (cRadius >= 4 && colSpacing >= 8)) {
        roundedCardCount++;
      }

      // Cell child complexity (e.g. Title + Body + Button, or Label + Value + Trend)
      const cellKids = (c.children || []).filter((k) => k.visible !== false);
      if (cellKids.length >= 3 && cH >= 60) {
        complexCellCount++;
      }
    }
  }

  const avgRowHeight = totalHeight / parsedRows.length;

  // 2. Average row height check: Table rows are compact (<= 100px)
  if (avgRowHeight > 100) return true;

  // 3. Medium height rows (>= 60px) with rounded card cells or gutters
  if (avgRowHeight >= 60 && roundedCardCount > 0) return true;

  // 4. Majority of cells are complex UI widgets (3+ children and height >= 60)
  if (totalCells > 0 && complexCellCount / totalCells >= 0.5) return true;

  // 5. Spaced rows (itemSpacing >= 10) with thick rows (>= 70px)
  if (rowSpacing >= 10 && avgRowHeight >= 70) return true;

  return false;
}
```

---

## 4. 6대 반례 시나리오 검증 결과

`tests/data-table-support.test.ts`에 추가된 6대 반례 및 회귀 시나리오 실행 결과:

| 시나리오 | 테스트 구성 | 기대 결과 | 실제 파싱 결과 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| **반례 1** | 2열 × 3행 비교 카드 그리드 (카드 290×200, rowSpacing 20, 제목+본문+버튼) | 표 오탐 방지 (`container`) | `container` (방지 성공) | **PASS** |
| **반례 2** | 3열 × 2행 KPI 메트릭 대시보드 카드 (카드 190×110, cornerRadius 8, Label+Value+Trend) | 표 오탐 방지 (`container`) | `container` (방지 성공) | **PASS** |
| **반례 3** | 비대칭 Bento 레이아웃 (너비 비대칭 행/열 구성) | 표 오탐 방지 (`container`) | `container` (방지 성공) | **PASS** |
| **정상 표 1** | 4열 × 5행 복합 데이터 표 (행 높이 36, rowSpacing 0, 100% 폭 분할) | 단일 네이티브 표 (`table`) | `table` (4열 균등 25%, 헤더 음영) | **PASS** |
| **정상 표 2** | 스타일 헤더 표 (3열 × 2행, 헤더 볼드+색상 상이, `<w:tblHeader>`) | 단일 네이티브 표 (`table`) | `table` (1행 `isHeader: true`) | **PASS** |
| **정상 표 3** | 낮은 텍스트 밀도 표 (4열 × 4행 사양표, 50% 셀만 텍스트 포함, 컴팩트 행) | 표 보존 (`table`) | `table` (밀도 35% 가드 통과) | **PASS** |

---

## 5. Word COM 실제 시각 렌더링 검증

실제 Microsoft Word COM 인터페이스(`Word.Application`)와 Windows WinRT PDF 렌더러를 구동하여 생성된 DOCX를 PDF 및 고해상도 PNG(1400px 폭)로 렌더링하고 육안 검증을 완료했습니다.

### 5.1 A4 비교 카드 (2단 레이아웃 복구 검증)
- **생성 파일**: `debug/document-audit/Step11B-A4-Cards.docx`
- **Word COM 통계**: `pages = 1`, `tables = 1`, `inlineShapes = 0`
- **시각 확인 (`Step11B-A4-Cards-Page01.png`)**:
  - 좌측: "Basic Plan" 카드 (270pt 폭, 회색 배경)
  - 우측: "Premium Plan" 카드 (270pt 폭, 연청색 배경)
  - 두 카드가 수평으로 나란히 배치되어 **단 1장의 A4 페이지 안에 완벽하게 수납**됨을 육안 확인. (이전 2페이지 분할 버그 완전 해소)

### 5.2 4열 × 5행 견적서 데이터 표 (네이티브 표 검증)
- **생성 파일**: `debug/document-audit/Step11B-DataTable.docx`
- **Word COM 통계**: `pages = 1`, `tables = 1`, `inlineShapes = 0`
- **시각 확인 (`Step11B-DataTable-Page01.png`)**:
  - 최상단: "2026년도 클라우드 인프라 제안 견적서" 제목
  - 본문: 4열 × 5행의 단일 Word 네이티브 테이블 (`<w:tbl>`)
  - 1행 헤더: 짙은 파란색 음영(`3366CC`), 흰색 볼드 텍스트 (구분 | 항목명 | 수량/단위 | 단가(원))
  - 2~5행 데이터: 연회색 테두리와 25% 균등 분할된 열 폭 유지 확인.

### 5.3 사용자 실제 스냅샷 E2E 변환 검증 (`testnewpage.json`)
- **생성 파일**: `debug/document-audit/Step11B-TestNewPage.docx` (선택된 5개 A4 프레임 변환)
- **Word COM 통계**: `pages = 5`, `tables = 5`, `inlineShapes = 18`
- **시각 확인 (Page01 ~ Page05.png)**:
  - `Page01` (A4-1 표지): 개요 텍스트 정상 수납
  - `Page02` (A4-2 검색/목록): 검색 바, 옵션 리스트, 주황색 배너 정상 렌더링
  - `Page03` (A4-3 차트): 6개 막대 차트 및 격자선, 상단 별 아이콘이 Step 10C 지오메트리 클러스터로 완벽 보존
  - `Page04` (A4-4 캘린더): May 2025 달력 (Mon~Sun 7열 구조), 프로그레스 바(25%) 정상 렌더링
  - `Page05` (A4-5 브라우저): 상단 URL 입력바, Label, 기하학적 도형군 정상 렌더링
  - 5개 프레임이 각각 정확히 1페이지씩 5페이지로 1:1 대응됨을 확인.

---

## 6. 테스트 및 빌드 무결성

### 6.1 전체 테스트 결과
```bash
> vitest run --run

 Test Files  41 passed (41)
      Tests  250 passed (250)
   Start at  22:19:45
   Duration  2.45s
```
- 기존 244개 테스트 + Step 11B 신규 6개 시나리오 = **250개 테스트 전건 PASS** (회귀 0건).

### 6.2 빌드 검증
- `npm run build` (`tsc`): **0 에러, 성공**
- `npm run build:web` (`vite build`): **0 에러, 성공**

---

## 7. 변경 파일 목록 및 Git 준수 사항

### 7.1 수정된 소스 파일 (Working Tree)
- `src/layout/layoutEngine.ts`: `isIndependentScreen` 부모 너비 임계값 완화 (`pBox.width >= 500 && parent?.type !== "CANVAS" && parent?.type !== "DOCUMENT"`)
- `src/parser/figmaParser.ts`: `tryDataTable`에 `isCardGrid` 판별 가드 추가
- `src/renderer/docxRenderer.ts`: 테이블 셀 너비 백분율(`WidthType.PERCENTAGE`) 지원 유지 (Step 11A)
- `tests/data-table-support.test.ts`: 신규 반례 6종 및 A4 레이아웃/모바일 격리 테스트 추가

### 7.2 안전 규칙 준수
- **Git 커밋 및 원격 Push 미수행** (사용자의 명시적 지시 대기 상태 유지).
- 기존 소스 코드 아키텍처(Parser → IR → Layout → Renderer) 및 Step 10A~10D 변경사항 100% 보존.
- 외부 네트워크/API 호출 0건.
- 모든 시각 검증 결과는 생성된 이미지 파일을 직접 육안 확인하여 기술함.

