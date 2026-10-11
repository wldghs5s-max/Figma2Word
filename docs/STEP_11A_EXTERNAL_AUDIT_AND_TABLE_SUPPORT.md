# Figma2Word — Step 11A: Google AI Studio 독립 감사 검증 및 복합 데이터 표 지원 보고서

> **작성 일시**: 2026-10-11  
> **기준 Git 체크포인트**: `d219766` (`origin/master`와 동기화된 HEAD)  
> **검증 원칙**: 외부 AI의 지적을 맹목적으로 수용하지 않고 실제 소스 코드, 재현 테스트, Word COM 실제 렌더링 기반으로 사실 검증 및 최소 범위 구현.

---

## 1. Google AI Studio 지적 5건의 검증 결과 요약

| 감사 항목 | 외부 AI의 지적 내용 | 코드 확인 및 재현 결과 | 판정 | 이번 단계 조치 |
| :--- | :--- | :--- | :---: | :--- |
| **1. 복합 데이터 표** | Figma Parser에서 `TableElement`를 생성하는 경로 부재 | `TableElementSchema`와 `renderTable()`은 존재하나 파서에서 단 1회도 생성하지 않고 N개의 1행짜리 `<w:tbl>`로 분할 렌더링됨 확인 | **사실 (FACT)** | **제품 코드 구현 완료 (단일 네이티브 TableElement 지원)** |
| **2. Geometry Cluster** | 음수 상대좌표 및 `strokeAlign: OUTSIDE` 처리 시 버퍼 외곽 클리핑 위험 | 버퍼가 `0..w`, `0..h`로 고정되어 있어 부모 박스 밖으로 삐져나간 선이나 음수 좌표가 캔버스 경계에서 잘림 확인 | **사실 (FACT)** | 조사 완료, 이번 단계 수정 대상 제외 (후속 과제) |
| **3. A4 내부 카드 오탐** | A4 프레임 내부의 세로형 카드를 독립 모바일 화면으로 오인할 위험 | A4 세로 폭(595px)이 `pBox.width >= 600` 조건 미달로 폭 270px, 높이 650px인 2개 카드가 독립 화면으로 오탐 분리됨 확인 | **사실 (FACT)** | 재현 확인 완료, 이번 단계 수정 대상 제외 (후속 과제) |
| **4. 단일 텍스트 노드 개행** | 개행 문자(`\n`) 포함 시 단일 문단(`w:p`)으로 묶여 문단 간격 제어 한계 | 단일 텍스트 노드 내의 모든 텍스트가 1개의 `<w:p>`에 들어가 단락 간격 미세 조정 불가 확인 (단, 임의 분할 시 스타일 오프셋 깨짐 위험) | **부분 사실 (PARTIAL)** | 조사 완료, 이번 단계 수정 대상 제외 (후속 과제) |
| **5. 브라우저 메모리 점유** | Chrome에서 대용량 JSON 처리 시 React State 및 파서 메모리 중복 점유 | 23MB JSON 업로드 시 `jsonInput`, `loadedSnapshot`, `parseResult`, `docxBlob`가 힙에 동시 상주하여 수백 MB 힙 점유 확인 | **사실 (FACT)** | 조사 완료, 이번 단계 수정 대상 제외 (후속 과제) |

---

## 2. 외부 감사 상세 코드 분석 및 재현 결과

### A. 복합 데이터 표 경로 부재
- **코드 근거**: `src/model/elements.ts` 라인 134~151에 `TableElementSchema`, `TableRow`, `TableCell`가 정의되어 있고 `src/renderer/docxRenderer.ts` 라인 387에 `renderTable(elem: TableElement)`가 구현되어 있었으나, `src/parser/` 코드 전체에서 `TableElement` 타입이 참조되는 곳이 0건이었습니다 (`git grep -n "TableElement" src/` 결과).
- **재현 테스트**: 3열 × 2행 및 4열 × 5행 테이블 Figma 픽스처를 파싱했을 때, 부모 `ContainerElement` 내부에 2개 또는 5개의 `horizontal` `ContainerElement`가 생성되었습니다.
- **실제 영향**: Word OpenXML 변환 시 단일 표가 아니라 **행마다 독립된 1행짜리 `<w:tbl>`이 2~5개 연속 생성**되어 행 간 경계가 어긋나거나 중첩 테이블이 발생했습니다.

### B. Geometry Cluster의 좌표 오프셋 및 클리핑
- **코드 근거**: `src/parser/geometryRaster.ts` 라인 111에서 `origin = { x: box.x - rootBox.x, y: box.y - rootBox.y }`로 상대 좌표를 계산하지만, 래스터라이즈 버퍼는 `rootBox.width x rootBox.height`로만 할당됩니다.
- **실제 영향**: 자식 도형이 부모 경계보다 음수 좌표에 있거나 `strokeAlign === "OUTSIDE"`로 인해 경계 밖으로 1~2px 튀어나간 테두리 선이 캔버스 모서리에서 잘리는 현상이 존재합니다.
- **판정 주의사항**: 외부 AI가 주장한 "부모 영역을 무조건 확장 렌더링해야 한다"는 위험하며, Figma의 `clipsContent: true/false` 설정에 맞추어 의도된 클리핑인지 판별해야 합니다.

### C. A4 내부 세로형 카드의 모바일 화면 오탐
- **코드 근거**: `src/layout/layoutEngine.ts` 라인 380:
  ```ts
  private isIndependentScreen(box: FigmaBoundingBox, parent?: FigmaNode): boolean {
    const pBox = parent?.absoluteBoundingBox;
    if (pBox && pBox.width >= 600) {
      return box.width >= pBox.width * 0.85;
    }
    const aspect = box.height / box.width;
    const isMobileScreen = box.width >= 240 && box.width <= 500 && box.height >= 600 && aspect >= 1.6;
    return isMobileScreen || isDesktopScreen;
  }
  ```
- **재현 검증**: 표준 A4 Portrait 폭은 **595pt**입니다. 따라서 `pBox.width >= 600` 조건이 거짓이 되어 아래의 `isMobileScreen` 체크로 진입합니다. 폭 270px, 높이 650px인 비교 카드는 `aspect = 2.41 >= 1.6` 조건을 충족하여 `isIndependentScreen === true`가 되어 가로 클러스터링(`canFormHorizontalRow`)에서 제외되고 개별 모바일 화면으로 분리되는 오탐이 실제로 발생합니다.

### D. 단일 텍스트 노드 개행 처리의 한계
- **코드 근거**: `src/parser/figmaParser.ts`의 `parseText`는 Figma의 단일 텍스트 노드를 1개의 `ParagraphElement`로 매핑하고, `docxRenderer.ts`의 `renderTextRun`은 하나의 단락(`<w:p>`) 내에서 런을 생성합니다.
- **실제 영향**: 1,765자의 긴 제안서 본문(A4-1)의 경우 `\n` 문자로 줄이 바뀌지만 OpenXML 상에서는 1개의 문단이므로 단락 전/후 간격(`w:spacing`)이나 단락별 들여쓰기가 줄마다 개별 적용되지 않습니다.
- **주의사항**: 이를 해결하기 위해 `\n` 기준으로 임의 분할하면 `characterStyleOverrides` 텍스트 범위 인덱스가 틀어지거나 Figma 원본에 없는 가짜 Heading이 생성될 위험이 있으므로 정밀한 오프셋 재계산 아키텍처가 선행되어야 합니다.

### E. 브라우저 메모리 중복 점유
- **코드 근거**: `apps/web/src/App.tsx`에서 대용량 파일 로드 시:
  1. `setJsonInput(text)` (23MB 문자열)
  2. `setLoadedSnapshot({ targetNode, imageMap })` (Figma AST 객체 트리 약 80MB)
  3. `setParseResult(result)` (IR 트리)
  4. `setDocxBlob(blob)` (바이너리 Blob)
- **실제 영향**: 23MB 스냅샷 파일 1개를 올렸을 때 브라우저 힙 메모리가 200MB~400MB 이상 점유되어 저사양 클라이언트나 탭 메모리 제한에 취약합니다.

---

## 3. 복합 데이터 표 지원 구현 상세

기존 Parser → IR → Layout → Renderer 파이프라인의 구조를 온전히 보존하면서, 논리적 데이터 표를 감지하고 단일 네이티브 Table로 변환하는 최소 변경을 적용했습니다.

### (1) 수정 파일 및 함수
1. **`src/parser/figmaParser.ts`**:
   - `tryDataTable(node: FigmaNode): TableElement | null` 신규 구현
   - `isVerticalStack(nodes: FigmaNode[])`: 행들이 위에서 아래로 올바르게 수직 배치되었는지 검사 (동일 Y좌표 카드 오탐 방지 가드)
   - `isHorizontalRow(cells: FigmaNode[])`: 각 행 내부의 셀들이 수평 방향(X축)으로 정렬되었는지 검사
   - `isHeadingText`에서 `(node.name || "")` null-safe 방어 처리
2. **`src/renderer/docxRenderer.ts`**:
   - `renderTable(elem: TableElement)`: 각 셀에 `width: { size: colWidthPercent, type: WidthType.PERCENTAGE }`를 반영하여 열 너비가 Word에서 균일하게 고정되도록 개선

### (2) 엄격한 오탐 방지 (False-Positive Guards) 규칙
- **최소 2행 이상**: 단일 행(1 row)은 네비게이션/버튼 모음이므로 테이블에서 제외.
- **열 개수 엄격 일치**: 모든 행의 보이는 셀 개수가 `colCount >= 2`로 정확히 동일해야 함. (행마다 카드 수가 다른 비정형 레이아웃 제외)
- **행 형태 및 방향 검증**:
  - 각 행은 `layoutMode === "HORIZONTAL"` 이거나 셀들이 X축으로 순차 배치되어야 함.
  - 세로형 카드(높이가 너비의 1.5배 이상)는 행 후보에서 제외.
- **열 너비 패턴 일치**: 1행과 후속 행들의 각 열 너비 비율이 허용 오차(0.65 ~ 1.5배) 내에서 일치해야 함. (비대칭 Bento Grid 배제)
- **텍스트 밀도 검증**: 전체 셀 중 최소 35% 이상의 셀에 텍스트가 포함되어 있어야 함. (순수 도형 그리드나 색상 매트릭스 배제)

---

## 4. 변경 전후 비교 검증

### (1) 변경 전후 IR 구조 비교 (3열 × 2행 테이블)
```text
[변경 전 IR]
container (table-root, layout=vertical)
  ├── container (row-0, layout=horizontal, cols=3) -> Word에서 1행짜리 독립 Table
  └── container (row-1, layout=horizontal, cols=3) -> Word에서 1행짜리 독립 Table

[변경 후 IR]
table (table-root)
  ├── rows[0] (isHeader=true, cells=3, bg=#3366CC)
  └── rows[1] (isHeader=false, cells=3)
```

### (2) 변경 전후 Word OpenXML 구조 비교
```xml
<!-- 변경 전 OpenXML: 분리된 2개의 <w:tbl> 또는 중첩 테이블 -->
<w:tbl> ... <w:tr> (Header Row) </w:tr> </w:tbl>
<w:tbl> ... <w:tr> (Data Row) </w:tr> </w:tbl>

<!-- 변경 후 OpenXML: 단 1개의 네이티브 <w:tbl> -->
<w:tbl>
  <w:tr>
    <w:trPr><w:tblHeader/></w:trPr>
    <w:tc><w:tcPr><w:tcW w:w="33" w:type="pct"/></w:tcPr> ... </w:tc>
    <w:tc> ... </w:tc>
    <w:tc> ... </w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="33" w:type="pct"/></w:tcPr> ... </w:tc>
    <w:tc> ... </w:tc>
    <w:tc> ... </w:tc>
  </w:tr>
</w:tbl>
```

---

## 5. 실제 Word 렌더링 시각 검증 결과 (Rendered Visual Validation)

생성된 `debug/table-audit/Step11A-Table-Audit.docx`를 Word COM을 통해 실제 Word 엔진으로 PDF 변환 및 1400px 고해상도 PNG로 렌더링하여 **직접 이미지를 열어 육안 확인**했습니다.

- 산출물:
  - `debug/table-audit/Step11A-Table-Audit.docx` (10,639 bytes)
  - `debug/table-audit/Step11A-Table-Audit.pdf` (132,115 bytes)
  - `debug/table-audit/Step11A-Table-Audit-Page01.png`
  - `debug/document-audit/Step11A-Portrait-Page04.png` (실제 스냅샷 A4-4 캘린더 페이지)

### 관찰 사실 기록:
1. **인사정보 명부 표 (`Step11A-Table-Audit-Page01.png`)**:
   - **단일 표 결합**: 파란색 헤더 행(사원번호, 성명, 소속부서, 직책)과 4개의 사원 데이터 행이 중간 끊김이나 공백 문단 없이 **단 하나의 매끄러운 Word 표**로 연결됨.
   - **열 경계 정렬**: 사원번호 열, 성명 열, 소속부서 열, 직책 열의 4개 열 경계선이 헤더부터 마지막 행까지 수직선으로 완벽히 정렬됨.
   - **스타일 및 가독성**: 헤더의 짙은 파란색 음영과 흰색 굵은 텍스트, 짝수 행의 연한 회색 지브라 음영이 정확히 렌더링됨.
   - **페이지 및 편집성**: 불필요한 페이지 분할 없이 1페이지 내에 깔끔하게 수납되었으며, Word에서 각 셀의 텍스트를 직접 편집 가능.
2. **실제 스냅샷 A4-4 캘린더 (`Step11A-Portrait-Page04.png`)**:
   - 이전 Step 10C에서 6개의 분리된 1행 컨테이너로 출력되던 캘린더가 **단일 `TableElement`(`I1:9127;2381:15405`)**로 감지되어 7열 6행의 단일 표로 통합됨.
   - Mon~Sun 요일 헤더와 1~31 날짜 행의 열 정렬이 완벽하게 고정되었으며, 선택 날짜(17~21일, 22일)의 검은색 반전 셀 배경도 완벽히 유지됨.

---

## 6. 테스트 및 빌드 결과

1. **전체 Vitest 테스트 (`npm test -- --run`)**:
   ```text
   Test Files  41 passed (41)
        Tests  244 passed (244)
     Duration  2.45s
   ```
   - 기존 239개 테스트 회귀 없이 전건 통과
   - 신규 `tests/data-table-support.test.ts` 5개 테스트 전건 통과:
     - 3×2 데이터 표 단일 TableElement 및 OpenXML 검증 (PASS)
     - 4×5 복합 표 헤더 음영, 열 너비 일관성, `<w:tblHeader>` 검증 (PASS)
     - 열 개수가 다른 비정형 카드 리스트 오탐 방지 (PASS)
     - 나란히 배치된 세로형 가격 카드 오탐 방지 (PASS)
     - 텍스트 없는 아이콘/도형 매트릭스 오탐 방지 (PASS)
2. **TypeScript 빌드 (`npm run build`)**: 에러 없이 컴파일 성공 (`tsc`).
3. **Web 클라이언트 빌드 (`npm run build:web`)**: 에러 없이 Vite 프로덕션 번들 빌드 성공.

---

## 7. 미해결 위험 및 후속 개발 우선순위 (Step 11B 권장 과제)

이번 단계에서 확인된 사실을 바탕으로 향후 우선순위를 권장합니다:

1. **[Priority 1] A4 세로 폭(595px) 대응 화면 오탐 임계치 개선**:
   - `isIndependentScreen`의 `parent.width >= 600` 조건을 `parent.width >= 550` (또는 A4 너비 허용 범위)로 조정하여 A4 문서 내 2단 비교 카드가 모바일 화면으로 오탐 분리되는 문제 해결.
2. **[Priority 2] Geometry Cluster 클리핑 및 패딩 보정**:
   - `strokeAlign === "OUTSIDE"` 또는 1~2px 서브픽셀 오프셋이 있는 경우 래스터라이즈 캔버스에 최소 패딩을 부여하거나 `clipsContent` 플래그를 고려하여 테두리 잘림 방지.
3. **[Priority 3] 브라우저 대용량 JSON 메모리 관리 개선**:
   - 변환 완료 후 불필요한 거대 원본 문자열(`jsonInput`) 메모리 해제, 대용량 스냅샷 처리 시 메모리 풋프린트 최적화.
4. **[Priority 4] 단일 텍스트 노드 내 다중 문단 분할 설계**:
   - `\n` 기준으로 안전하게 단락을 분할하되, `characterStyleOverrides` 텍스트 범위 인덱스가 깨지지 않도록 오프셋 재계산 로직 설계.

---

## 8. Git 작업 트리 상태

- 사전 조건에 따라 **Git 커밋 및 Push는 수행하지 않았습니다**.
- 수정된 소스 파일(`src/parser/figmaParser.ts`, `src/renderer/docxRenderer.ts`) 및 신규 테스트 파일(`tests/data-table-support.test.ts`)이 작업 트리에 안전하게 보존되어 있습니다.

