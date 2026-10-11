# Figma2Word — Step 11C: Geometry Cluster 좌표계 및 클리핑 정확성 보정 보고서

## 1. 개요 및 작업 목적

Step 10C에서 도입된 Geometry Cluster 합성 기능(`geometryRaster.ts`)은 도형만으로 이루어진 차트 및 진행률 표시줄을 이미지로 보존하는 핵심 역할을 수행했습니다.  
그러나 Google AI Studio의 독립 감사 및 정밀 분석을 통해 다음 한계가 지적되었습니다:

1. **외곽 도형 및 돌출 자식 잘림**: 부모 프레임의 바운딩 박스 크기만을 기준으로 캔버스 크기를 결정하여 부모 밖으로 돌출된 자식 도형, 음수 상대 좌표가 잘려나감.
2. **OUTSIDE 테두리 잘림**: `strokeAlign="OUTSIDE"` 또는 "CENTER"로 인해 도형 경계 바깥으로 뻗어나간 테두리가 캔버스 경계 밖으로 나가 클리핑됨.
3. **Figma 클리핑 시맨틱 미반영**: `clipsContent=true`와 `clipsContent=false`가 구분되지 않고 무조건 부모 박스로 암묵적 클리핑이 적용됨.

본 Step 11C에서는 기존 Parser → IR → Layout → DOCX Renderer 아키텍처를 온전히 유지하면서, **Union AABB 계산**, **원점 상대 좌표계 보정**, **Figma `clipsContent` 계층적 클리핑 반영**, **스트로크 정렬별 외곽선 보존**을 구현하고 픽셀 단위 검증 및 Word COM 렌더링을 통해 시각적 정확성을 입증했습니다.

---

## 2. 기존 클리핑 오류의 실제 원인 분석

코드베이스 실사 결과 확인된 구체적 결함 원인은 다음과 같습니다:

1. **캔버스 크기 결정 기준의 협소함**:
   - `analyzeGeometryCluster()`에서 클러스터의 크기를 오직 루트 컨테이너의 바운딩 박스(`rootBox.width`, `rootBox.height`)로만 고정.
   - 자식 도형이 부모 경계 밖으로 돌출되어 있어도 캔버스가 확장되지 않음.
2. **상대 좌표 산출의 원점 고정 및 음수 클램핑**:
   - 자식 좌표를 `origin = { x: box.x - rootBox.x, y: box.y - rootBox.y }`로 단순 계산.
   - 자식이 부모보다 좌측/상단에 있으면 `origin.x < 0`, `origin.y < 0`이 발생.
   - `rasterizeOps()`의 픽셀 루프에서 `minX = Math.max(0, Math.floor(outer.x0))`, `minY = Math.max(0, Math.floor(outer.y0))`로 클램프되어 음수 영역이 렌더링되지 않고 소실됨.
3. **테두리 외곽 확장(`eo`) 캔버스 미반영**:
   - `rasterizeOps()` 내에서는 `eo`를 계산하여 테두리 링을 그렸으나, 캔버스 너비 `w`와 높이 `h`가 확장되지 않아 가장자리에 접한 도형의 OUTSIDE 테두리가 캔버스 경계 밖으로 잘려나감.
4. **`clipsContent` 속성 미참조**:
   - Figma 노드의 `clipsContent` 플래그를 전혀 읽지 않고 모든 컨테이너를 암묵적 `clipsContent=true`인 것처럼 처리함.

---

## 3. 수정 전 재현 결과 (`tests/geometry-cluster-coordinates.test.ts`)

구현 변경 전 픽스처 테스트를 작성하여 결함을 명확하게 재현했습니다:

| 테스트 케이스 | 테스트 조건 | 기대 결과 | 수정 전 실제 결과 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| **Case A** | 부모 100×50, 자식 x:98, w:106, `clipsContent=false` | 캔버스 너비 >= 106, 좌우 돌출 보존 | `cluster.width = 100` (돌출부 6px 잘림) | **FAIL (재현)** |
| **Case B** | 동일 형상, `clipsContent=true` | 캔버스 너비 100, 부모 경계 내로 클리핑 | `cluster.width = 100` (클리핑) | **PASS** |
| **Case C** | 사각형 100×50, `strokeWeight=4`, `strokeAlign=OUTSIDE` | 캔버스 너비 >= 108, 높이 >= 58 | `cluster.width = 100`, `height = 50` (외곽 테두리 4px 잘림) | **FAIL (재현)** |
| **Case D** | 100×50, `strokeWeight=6`, INSIDE vs CENTER vs OUTSIDE | INSIDE: 100, CENTER: 106, OUTSIDE: 112 | 모두 100×50으로 뭉개짐 | **FAIL (재현)** |

---

## 4. 수정한 파일과 함수

### 4.1 `src/parser/types.ts`
- `FigmaNode` 인터페이스에 공식 속성 추가:
  - `clipsContent?: boolean;`
  - `strokeAlign?: "INSIDE" | "CENTER" | "OUTSIDE" | string;`

### 4.2 `src/parser/geometryRaster.ts`
- **인터페이스 확장**:
  - `ClipBox`: `{ x: number; y: number; w: number; h: number }` 추가
  - `BoxOp.clip?: ClipBox`: 각 오퍼레이션별 유효 클리핑 박스 추가
  - `GeometryCluster.offsetX?: number`, `offsetY?: number`: 원점 보정 오프셋 추가
- **`analyzeGeometryCluster()` 전면 리팩토링**:
  - `RawBoxOp` 중간 수집 단계 도입 (절대 좌표 및 스트로크를 포함한 `visualBounds` 추적).
  - 계층적 `parentClip` 전파를 통한 클리핑 스택 추적.
  - 루트의 `clipsContent`에 따른 **Union AABB 계산**:
    - `clipsContent !== true`: 루트 및 모든 표시 자식의 `visualBounds`를 포함하는 최소 외곽 직사각형 산출.
    - `clipsContent === true`: 루트 박스(및 루트 자체의 스트로크)로 경계 한정.
  - 새로운 원점 `(minX, minY)` 기준의 상대 좌표 재계산 (`absX - minX`, `absY - minY`).
  - 클리핑 사각형 상대 좌표 변환 및 `BoxOp.clip` 전달.
- **`rasterizeOps()` 래스터화 개선**:
  - `minX`, `maxX`, `minY`, `maxY` 계산 시 `op.clip` 경계와 교집합 적용.
  - 클리핑 영역 밖의 픽셀 순회를 원천 차단하여 깨끗한 클리핑 구현.

---

## 5. Union AABB 및 좌표 원점 처리 방식

```
[ Union AABB & Origin Offset Diagram ]

  (minX, minY)  <-- 새 캔버스 원점 (0, 0)
    +-----------------------------------------------+
    |  offsetX < 0                                  |
    |  <--->                                        |
    |       (rootBox.x, rootBox.y)                  |
    |       +-------------------------------+       |
    |  [Protruding Child]   | Root Container|       |
    |  [====================================]       |
    |       +-------------------------------+       |
    |                                               |
    +-----------------------------------------------+
                                                    (maxX, maxY)
```

1. **외곽 경계(AABB) 산출**:
   - 각 도형의 스트로크 돌출량 `eo`를 계산:
     - `INSIDE`: `eo = 0`
     - `CENTER`: `eo = weight / 2`
     - `OUTSIDE`: `eo = weight`
   - `visualBounds = [box.x - eo, box.y - eo, box.x + box.width + eo, box.y + box.height + eo]`
2. **원점 보정**:
   - `minX = Math.min(rootVisual.x0, ...childVisual.x0)`
   - `minY = Math.min(rootVisual.y0, ...childVisual.y0)`
   - 모든 자식의 로컬 좌표를 `op.x = absX - minX`, `op.y = absY - minY`로 설정하므로 음수 좌표가 발생하지 않음.
   - 캔버스 크기는 `width = ceil(maxX - minX)`, `height = ceil(maxY - minY)`로 정확히 확장됨.

---

## 6. 테두리 및 클리핑 검증 (테스트 결과)

### 6.1 테두리 정렬별 치수 검증 (`tests/geometry-cluster-coordinates.test.ts`)
- 기본 크기: 100×50, `strokeWeight = 6`
  - **INSIDE**: 100×50 유지 (테두리가 안쪽으로 그려짐) -> **PASS**
  - **CENTER**: 106×56 확장 (사방 3px씩 확장) -> **PASS**
  - **OUTSIDE**: 112×62 확장 (사방 6px씩 확장) -> **PASS**

### 6.2 픽셀 단위 검증
- **Case A (돌출 바)**:
  - `cluster.width = 106`, `cluster.height = 50`
  - 픽셀 버퍼 `midY` 위치에서 `x = 0` 픽셀의 Red 채널 값이 `255`임을 단언 (좌측 2px 돌출 영역 정상 렌더링). -> **PASS**
- **Case B (클리핑 바)**:
  - `cluster.width = 100`, `cluster.height = 50`, `offsetX = 0`
  - 부모 밖의 영역은 캔버스에 포함되지 않으며, `x = 0` 픽셀에 클리핑된 바의 Red 채널 `255` 존재. -> **PASS**
- **Case C (OUTSIDE 테두리)**:
  - `cluster.width = 108`, `cluster.height = 58`, `offsetX = -4`, `offsetY = -4`
  - 좌상단 픽셀 `(0, 0)`에 파란색 테두리(`rgba[2] = 255`) 확인.
  - 우하단 픽셀 `(107, 57)`에 파란색 테두리(`rgba[2] = 255`) 확인.
  - 내부 `(4, 4)`에 채우기 픽셀 확인. -> **PASS**

---

## 7. Word COM 시각 검증

Microsoft Word COM(`Word.Application`)과 WinRT PDF 엔진을 통해 생성된 DOCX를 PDF 및 1400px 폭의 PNG로 렌더링하여 이미지를 직접 육안 확인했습니다.

### 7.1 신규 검증 대상 (`Step11C-Geometry-Cases-Page01.png`)
- **Case A (Unclipped Protrusion)**:
  - 회색 컨테이너 바깥으로 빨간 막대가 좌우로 삐져나온 채 **외곽 잘림 없이 온전하게 표시**됨을 확인.
- **Case B (Clipped Protrusion)**:
  - 초록색 막대가 회색 컨테이너의 좌우 경계선에서 **수직으로 깔끔하게 클리핑**되어 밖으로 튀어나가지 않음을 확인.
- **Case C (Outside Stroke Box)**:
  - 연청색 사각형의 6px 파란색 OUTSIDE 테두리가 상하좌우 4면 모두 **단 1픽셀도 잘리지 않고 완벽하게 둘러싸여 렌더링**됨을 확인.

### 7.2 기존 회귀 대상 육안 확인
- **A4-2 프로그레스 바 (`Step11C-TestNewPage-Page02.png`)**:
  - 검은색 진행 바와 둥근 트랙이 외곽 잘림 없이 정상 유지됨 확인.
- **A4-3 막대 차트 (`Step11C-TestNewPage-Page03.png`)**:
  - 6개 막대 사각형과 수평 그리드선, 상단 별 모양 아이콘이 완벽하게 합성되어 렌더링됨 확인.
- **Step 11A 견적서 표 (`Step11C-DataTable-Page01.png`)**:
  - 4열 × 5행 단일 Word 네이티브 테이블 유지 확인.
- **Step 11B A4 비교 카드 (`Step11C-A4-Cards-Page01.png`)**:
  - 좌우 2단 배치가 단 1장의 A4 페이지 안에 완벽하게 수납 유지됨 확인.

---

## 8. 테스트 및 빌드 결과

### 8.1 Vitest 실행 결과
```bash
> vitest run --run

 Test Files  42 passed (42)
      Tests  257 passed (257)
   Start at  22:37:49
   Duration  2.54s
```
- 기존 250개 테스트 + 신규 Step 11C 7개 테스트 = **257개 테스트 전건 PASS** (회귀 0건, 스킵 0건).

### 8.2 빌드 무결성
- `npm run build` (`tsc`): **0 에러, 빌드 성공**
- `npm run build:web` (`vite build`): **0 에러, 번들 생성 성공**

---

## 9. 미해결 한계 및 Step 11D 권고 사항

1. **미해결 한계**:
   - **원점 오프셋(`offsetX < 0`)의 Word 흐름 배치 영향**:
     현재 Word 인라인 이미지 렌더링은 문단 내 좌측 정렬을 사용합니다. 좌측으로 크게 돌출된 도형의 경우 이미지가 커지면서 좌측 마진보다 약간 안쪽에 배치될 수 있습니다. (현재 대다수 차트/프로그레스 바는 1~6px 수준의 스트로크/캡 돌출이므로 레이아웃 붕괴 없음).
   - **비직사각형 복합 패스 클리핑**:
     원형(타원) 또는 자유형 벡터 패스로 클리핑하는 복합 마스크는 현재의 사각형 AABB 클리핑 범위를 벗어나므로 안전하게 Fallback됩니다.
2. **Step 11D 권고 사항**:
   - Step 11A~11C에 걸친 변경사항에 대한 통합 코드 리뷰 및 최종 체크포인트 관리.
   - 브라우저 대용량 JSON 파싱 시의 메모리 사용량 최적화 검토.

