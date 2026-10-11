# Figma2Word — Step 10C: 차트 및 벡터 도형 보존 복구 보고서

> **문서 상태**: 최종 완료 (Final)  
> **기준 커밋**: `c26cc76` (작업 트리 uncommitted 변경사항)  
> **대상 데이터**: `debug/customer/testnewpage.json` (SHA-256: `3bc2c8ed66455eb3925000570b6743b190f845a706ae88764b85d3f278be84e6`, 23,031,602 B)

---

## 1. 누락의 실제 근본 원인 (Root Cause Analysis)

Step 10B.1 정합성 감사에서 확인된 A4-3 차트 막대(6개) 및 그리드 선, A4-2 프로그레스 바 등의 누락 원인을 코드 레벨에서 추적한 결과는 다음과 같습니다:

1. **DOCX Renderer의 의도적 장식 도형 제거 (`src/renderer/docxRenderer.ts` `renderShape`)**
   - `renderShape`는 `shape.content`가 비어있는 텍스트 없는 순수 도형에 대해 `null`을 반환합니다.
   - 이는 `tests/decorative-shapes-minimization.test.ts` (Test A~E) 및 `empty-shape-no-table`에 의해 보호되는 설계 의도("불필요한 빈 표/장식 도형 최소화")였습니다.
   - 이로 인해 Figma에서 RECTANGLE, LINE, VECTOR로만 구성된 차트나 그래픽 위젯은 IR 단계까지 크기와 색상이 보존되었으나 렌더러 단계에서 100% 드롭되었습니다.
2. **Parser의 단일 Solid Fill 추출 한계 (`src/parser/figmaParser.ts` `extractFillColor`)**
   - 차트의 6개 막대(`1:9065`~`1:9070`)는 배경 White(1.0) 위에 Black이 불투명도 0.15~0.9로 겹쳐진 **다중 Solid Fill** 구조였습니다.
   - 기존 파서는 첫 번째 Fill(White)만 가져와 막대가 모두 흰색(#FFFFFF)으로 처리되었습니다.
3. **선형 VECTOR의 직사각형 처리 한계**
   - 차트 그리드 선(`1:9073` 등)은 `absoluteBoundingBox` 높이가 0px인 스트로크 전용 노드였으며, 파서에서 높이 0의 RECTANGLE로 변환되어 사실상 소멸되었습니다.
4. **스냅샷 JSON 내 벡터 패스 데이터 부재**
   - `testnewpage.json`에는 `fillGeometry`, `strokeGeometry`, `vectorPaths`, `vectorNetwork` 속성이 전혀 포함되어 있지 않습니다 (0건).
   - 따라서 자유형 곡선/다각형 벡터의 윤곽을 임의로 복원할 수 없습니다.

---

## 2. 수정된 파일 및 함수

기존 아키텍처(Parser → IR → Layout → Renderer)와 `renderShape`의 보호 규칙을 파괴하지 않으면서, **순수 기하 도형으로만 구성된 위젯을 손실 없이 보존**하기 위해 아래 변경을 최소 범위로 적용했습니다.

### (1) `src/parser/geometryRaster.ts` (신규 파일, 브라우저 호환)
- **외부 의존성 없음**: Node.js `Buffer`, `zlib` 등에 의존하지 않는 순수 TypeScript 구현으로 웹 브라우저 번들(`apps/web`)에서도 완벽 동작.
- `analyzeGeometryCluster(root)`:
  - 대상 컨테이너(FRAME, GROUP, INSTANCE 등)의 보이는 하위 트리가 **정확히 기하학적으로 재현 가능한 요소**(RECTANGLE, 직교 직선 VECTOR/LINE, 모서리 반경이 있는 캡슐)로만 구성되어 있는지 검사.
  - TEXT, IMAGE 채우기, 그라디언트, 회전된 도형, 자유형 벡터가 포함되면 클러스터링을 거부(`null`).
  - 최대 면적 제한(250,000 px²)을 두어 전체 화면 프레임이 이미지화되는 것을 방지.
- `rasterizeGeometryCluster(cluster)`:
  - 다중 Solid Fill 알파 블렌딩, 안쪽/중앙/바깥쪽 스트로크, 모서리별 라운딩(`rectangleCornerRadii`)을 2x 스케일로 소프트웨어 래스터라이즈.
  - 내장 Deflate(LZ77 + Fixed Huffman) 및 PNG 인코더(`encodePng`)를 통해 Base64 Data URL 생성.

### (2) `src/parser/figmaParser.ts` (수정)
- `tryGeometryCluster(node)` 추가: FRAME/GROUP 파싱 시 기하 클러스터로 판정되면 단일 `ImageElement`(`${node.id}-geometry`)를 생성하고 `Fallback` 공지 기록.
- `extractShapeFill(fills)` 추가: 다중 Solid Fill을 아래에서 위로 합성하여 정확한 혼합 색상(Gray 램프) 추출.

---

## 3. 노드별 전/후 처리 경로 추적

| 대상 노드 | Figma 구조 | 이전 경로 (Step 10B) | 변경 후 경로 (Step 10C) | 최종 상태 |
| :--- | :--- | :--- | :--- | :--- |
| **A4-3 차트 (`1:9060`)**<br>467×288 | 18개 하위 도형<br>(가로/세로선 12개, 막대 6개) | Parser: 18개 개별 Shape<br>Layout: 5컬럼 Row Cluster<br>Renderer: 내용 없어 100% 드롭 | Parser: 기하 클러스터 감지<br>→ 467×288 PNG `ImageElement`<br>Renderer: 인라인 이미지 출력 | **시각적 복구 완료**<br>(막대 6개, 그리드 선 표시) |
| **A4-2 프로그레스 (`1:9050`)**<br>280×8 | 트랙(280×8) + 채움(232×8)<br>`rectangleCornerRadii` | Parser: 2개 Shape<br>Renderer: 내용 없어 드롭 (빈 박스) | Parser: 기하 클러스터 감지<br>→ 280×8 PNG `ImageElement`<br>Renderer: 인라인 이미지 출력 | **시각적 복구 완료**<br>(진행률 게이지 표시) |
| **A4-3 Reddit 아이콘 (`1:9055`)**<br>24×24 | 자유형 VECTOR 2개 | 패스 데이터 없음, 드롭 | 자유형 벡터로 클러스터 제외 | **미복구 (잔여 갭)**<br>패스 데이터 부재 |
| **A4-3 이미지 플레이스홀더 (`1:9083`)**<br>315×315 | 1개 대각선 VECTOR | 단일 도형, 드롭 (빈 박스 렌더링) | 단일 도형으로 클러스터 제외 | **테두리 박스 유지**<br>(내부 X선은 패스 부재) |
| **A4-2 검색 아이콘 (`1:9003`)**<br>10.3×10.3 | 1개 자유형 VECTOR | 패스 데이터 없음, 드롭 | 단일 자유형 벡터로 클러스터 제외 | **미복구 (잔여 갭)** |
| **A4-2 비활성 도트 (11개)** | `visible: false` | 파서에서 정상 스킵 | 파서에서 정상 스킵 | **정상 (비표시 대상)** |
| **A4-4 슬라이더 (`1:9243`)**<br>166×42 | 배경+채움+노브+**TEXT(25%)** | 레이아웃 복합 처리 | **TEXT 노드 포함으로 클러스터 제외** | **미복구 (잔여 갭)**<br>텍스트 래스터화 방지 원칙 |

---

## 4. Word 렌더링 시각적 검증 결과 (Rendered Visual Validation)

생성된 DOCX를 Word COM을 통해 PDF로 변환하고 고해상도 PNG(1400px)로 렌더링하여 **실제 화면을 직접 열어 확인**했습니다.

- 산출물:
  - `debug/document-audit/Step10C-A4-Portrait.docx` (32,658 bytes)
  - `debug/document-audit/Step10C-A4-Landscape.docx` (32,671 bytes)
  - `debug/document-audit/Step10C-Portrait-Page01..05.png`
  - `debug/document-audit/Step10C-Landscape-Page01..06.png`

### 페이지별 시각적 검증 요약:
1. **A4-3 (Page 3)**:
   - **차트 복구**: 6개의 막대 바가 좌측부터 우측까지 각기 다른 높이와 Gray 음영(연한 회색 → 짙은 검정)으로 명확히 렌더링됨.
   - **그리드 복구**: 배경의 격자 선(수평선 및 수직선)과 외곽 테두리가 차트 내부에 정확히 표시됨.
   - **이모지 보존**: 상단의 불꽃 이모지(`1:9080`) 정상 표시 유지.
   - **하단 요소**: 하단 `1:9083` 컨테이너는 얇은 사각형 테두리로 유지됨.
2. **A4-2 (Page 2)**:
   - 검색창 및 옵션 1~5 목록 하단에 **280×8 픽셀 크기의 검은색/흰색 프로그레스 바(진행률 게이지)**가 주황색 카드 상단에 선명하게 표시됨.
3. **A4-1 (Page 1)**: 단일 텍스트 노드(1,765자) 본문 정상 유지.
4. **A4-4 (Page 4)**: 5월 달력 표, 슬라이더 툴팁(25%), "Type here..." 입력 필드 정상 유지.
5. **A4-5 (Page 5)**: 15개 갤러리 이미지 및 상단 헤더 정상 유지.
6. **Figma 원본과의 픽셀 일치 여부**: Figma 캔버스 원본 화면 캡처가 사용자 환경에 부재하므로 **UNVERIFIED**로 표기.

---

## 5. 잔여 벡터 갭 (Remaining Vector Gaps)

1. **스냅샷 내 패스 데이터(`fillGeometry`) 없는 순수 벡터 아이콘**:
   - A4-2의 검색창 돋보기/아이콘(10.3px VECTOR 1개).
   - A4-3의 Reddit 로고(24×24 내 자유형 VECTOR 2개).
   - A4-4의 화살표/캐럿 아이콘(4.5×7.7 VECTOR 2개).
   - **원인**: Figma REST API 호출 시 `geometry=paths` 파라미터가 없으면 패스 좌표가 스냅샷에 포함되지 않음. 추후 스냅샷 추출 파이프라인 보강 필요.
2. **텍스트가 혼합된 위젯 (A4-4 슬라이더 `1:9243`)**:
   - 트랙 선과 노브 원형 위에 "25%"라는 실제 `TEXT` 노드가 함께 그룹화되어 있음.
   - "일반 텍스트를 이미지로 래스터라이즈하지 않는다"는 대원칙에 따라 클러스터링에서 제외되어 트랙 라인이 표시되지 않음.
3. **단일 선형 플레이스홀더 (`1:9083`)**:
   - 315×315 박스 내부의 대각선 교차선이 단일 벡터 노드로 되어 있어 테두리 박스만 렌더링됨.

---

## 6. 네이티브 요소 vs 이미지 대체 요소 구분

| 구분 | 포함된 요소 | 처리 방식 | 편집 가능 여부 |
| :--- | :--- | :--- | :--- |
| **Native Word 요소** | A4-1 전체 본문 텍스트, A4-4 달력 표, A4-2 검색 옵션 목록, 각 프레임 컨테이너 테두리 및 배경색 | Word Paragraph, Run, Table | **100% 편집 가능 (텍스트/표 수정 가능)** |
| **Image 대체 요소** | A4-3 막대 차트 (`1:9060`), A4-2 프로그레스 바 (`1:9050`), A4-5 갤러리 이미지(15개), A4-3 이모지(1개) | High-DPI PNG 인라인 이미지 | **이미지로 고정 (Word 차트로 수정 불가)** |

---

## 7. 테스트 및 빌드 결과

- **Vitest 테스트 스위트**:
  ```
  Test Files  40 passed (40)
       Tests  239 passed (239)
    Duration  2.59s
  ```
- **TypeScript 빌드 (`npm run build`)**: 에러 없이 컴파일 성공 (`tsc`).
- **Web 앱 빌드 (`npm run build:web`)**: 에러 없이 Vite 프로덕션 번들 빌드 성공 (`dist/` 생성).
- **Word 구조 측정 (Word COM)**:
  - Portrait: 페이지 5, 테이블 5, 인라인 이미지 18 (기존 대비 테이블 증가 없음, 차트/프로그레스 바가 인라인 이미지로 추가됨).
  - Landscape: 페이지 6, 테이블 5, 인라인 이미지 18.

---

## 8. 추가된 테스트 목록 (`tests/geometry-cluster.test.ts`)

1. `detects and rasterizes a simple rectangle cluster with valid PNG header and IDAT`: 기본 사각형 클러스터 감지, PNG 시그니처 및 Deflate 압축 무결성 검증.
2. `preserves horizontal and vertical thin lines at correct coordinates`: 높이/너비 0의 직선 벡터 좌표 및 두께 보존.
3. `handles stacked white + black@alpha fills to produce composite gray`: 다중 Solid Fill 알파 블렌딩 합성 색상(#808080) 검증.
4. `handles per-corner radii (Progress pill case)`: `rectangleCornerRadii` 각 모서리별 라운딩 처리 검증.
5. `is strictly deterministic`: 동일 입력에 대해 100% 동일한 Base64 PNG 바이트 생성 검증.
6. `rejects non-geometry clusters`: TEXT, 이미지 채우기, 회전 도형, 자유형 벡터 포함 시 클러스터 거부 검증.
7. `yields exactly one ImageElement in parser for a valid geometry cluster`: 파서 단계에서 단일 ImageElement 변환 검증.
8. `preserves A4-3 chart node 1:9060 as ImageElement from real snapshot`: 실제 스냅샷에서 차트 노드가 467×288 이미지 및 Fallback 공지로 생성됨을 검증.
9. `preserves Progress bar node 1:9050 in A4-2 as ImageElement from real snapshot`: 실제 스냅샷에서 프로그레스 바가 280×8 이미지로 생성됨을 검증.

---

## 9. 향후 개선 과제 (Future Improvements)

1. **Figma 스냅샷 추출기 파라미터 개선**:
   - Figma API 호출 시 `geometry=paths` 옵션을 활성화하여 벡터 노드의 SVG 패스(`vectorData`)를 스냅샷에 포함시켜 돋보기, Reddit 로고 등 단일 아이콘 복구 지원.
2. **복합 위젯(텍스트 + 기하도형) 분리 처리**:
   - A4-4 슬라이더처럼 기하 배경과 텍스트가 섞여 있는 경우, 기하 배경만 배경 이미지로 래스터라이즈하고 텍스트는 그 위에 오버레이하거나 인라인 배치하는 분리 파서 지원 검토.
3. **Office OpenXML DrawingML 네이티브 도형 출력 지원**:
   - 단순 사각형/원형/선의 경우 이미지를 거치지 않고 Word 네이티브 DrawingML `<wps:wsp>` 도형으로 직접 출력하여 용량 절감 및 선명도 향상.

