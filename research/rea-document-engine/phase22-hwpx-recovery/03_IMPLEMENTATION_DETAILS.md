# Phase 22 Implementation Details & Canonical Architecture

## 1. 코드 변경 개요

Phase 22의 모든 구현은 수정 금지 원칙을 철저히 준수하여 진행되었다:
- **수정 금지 파일 5종**: `docxCanvasRenderer.ts`, `figmaCanvasParser.ts`, `docxCanvasParser.ts`, `svgPathParser.ts`, `types.ts` -> **0 edits (완전 무수정 보존)**
- **수정된 핵심 파일**: [`src/canvas/renderer/hwpxCanvasRenderer.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/hwpxCanvasRenderer.ts)
- **동기화된 테스트 파일**:
  - [`tests/hwpx-schema-conformance.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/hwpx-schema-conformance.test.ts)
  - [`tests/phase16-1-remediation.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/phase16-1-remediation.test.ts)
  - [`tests/phase17-quality-integration.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/phase17-quality-integration.test.ts)

---

## 2. 세부 구현 내역

### 2.1 구분선 캐노니컬 표현 (Divider Line as Canonical Thin Rect)
정품 한컴 레퍼런스 문서에서 수평/수직 구분선에 사용된 기법을 HWPX 렌더러에 공식 채택하였다.
- **적용 조건**: `elem.type === "line"`이며 수평선(`bounds.height <= 4` 또는 `width >= height * 2`) 또는 수직선(`bounds.width <= 4` 또는 `height >= width * 2`)이고 점선이 아닌 경우(`!elem.style.strokeDashed`).
- **직렬화 방식**:
  - `w`: 수평선은 `wHwpu`, 수직선은 선 두께(`strokeHwpu = Math.max(75, Math.round(strokeWidth * 100))`).
  - `h`: 수평선은 선 두께(`strokeHwpu`), 수직선은 `hHwpu`.
  - `fillColorHex`: `elem.style.strokeColor`.
  - `lineColorHex`: `"000000"`, `lineWidth`: `"0"`, `lineStyle`: `"NONE"`, `ratio`: `0`.
- **효과**: 이미 실측 검증된 `<hp:rect>` 경로를 재사용함으로써 구분선으로 인한 뷰어 크래시 가능성을 완전히 차단.

### 2.2 네이티브 `<hp:line>` 정밀 직렬화
대각선, 점선, 벡터 열린 경로 등 사각형으로 치환할 수 없는 선 요소를 위해 OWPML LineType 공식 규격을 정확히 구현하였다.
- **속성**: `isReverseHV="0"` 부여.
- **좌표 하위 요소**: `<hc:startPt x="..." y="..."/>` 및 `<hc:endPt x="..." y="..."/>` 방출.
- **파라미터 하이브리드 지원**: `startPt/endPt` 및 레거시 `p0/p1`을 모두 안전하게 수용.

### 2.3 다각형 폐합 및 꼭짓점 무결성 (Polygon Closure)
- `renderPolygonXml`: 꼭짓점 목록(`closedPts`)이 3개 이상일 때, 시작점과 끝점 좌표가 일치하지 않으면 시작점(`closedPts[0]`)을 끝에 자동으로 추가하여 완전 폐합 보장.

### 2.4 다중 페이지 `secCnt` 일관성 복구
- `buildZip()` 내부에서 `Contents/header.xml` 생성 시 `secCnt`를 하드코딩된 페이지 수가 아니라 실제 패키지에 기록되는 구역 파일 수인 `1`로 전달.
- 이를 통해 9페이지인 Stage 7에서도 `secCnt="1"`이 기록되어 누락된 구역 파일 참조 오류 해결.

### 2.5 기본 `hh:charPr` 스키마 완전성
- `charPrList.length === 0`일 때:
  ```xml
  <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="1" useKerning="1" symMark="NONE" borderFillIDRef="1">
    <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
    <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
    <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
    <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
    <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
    <hh:underline type="NONE" shape="SOLID" color="#000000"/>
    <hh:strikeout shape="NONE" color="#000000"/>
  </hh:charPr>
  ```

### 2.6 도형 내부 텍스트 여백 및 수직 정렬 보정
- `innerPaddingPt`가 지정되지 않은 라운드 사각형(`cornerRadius > 0`)에 대해 코너 곡률에 비례한 안전 여백(`defaultPadL = cornerRadius * 0.4`, `defaultPadT = cornerRadius * 0.3`)을 자동 산출하여 `hp:textMargin`에 반영.
- 높이 36pt 이하의 캡슐/뱃지/필 형태 도형은 수직 중앙 정렬(`vertAlign="CENTER"`)을 자동 적용하여 텍스트가 상단으로 치우치거나 도형 밖으로 벗어나는 시각적 결함 보정.
