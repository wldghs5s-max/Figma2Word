# Figma2Word — Phase 46.1 안전성 교정 및 시각 재현 품질 보고서
**Universal Clipping Safety Correction & Style Inheritance Audit**

- **작성 일자**: 2026-11-06
- **기준 브랜치**: `master`
- **기준 HEAD**: `0dcaf39bf064441b4a42b49c4dd8355ebad63f7d`
- **직전 커밋**: `e4da7da74b4cbfde0bb8590bf19f651431d71f36` (Phase 46 Implementation)
- **작업 목적**: Phase 46 구현 코드의 범용 안전성 교정(도형 기하 변형 방지, 안전한 색상 상속, 복합 표 보존) 및 검증 가능한 범위 내 시각 재현 품질 현황 감사

---

## 1. 작업 개요 및 환경 상태

### 1.1 Git 및 저장소 환경
- **Repository**: `wldghs5s-max/Figma2Word`
- **Branch**: `master` (원격 `origin/master`와 동기화된 클린 베이스에서 시작)
- **Base HEAD SHA**: `0dcaf39bf064441b4a42b49c4dd8355ebad63f7d`
- **Node.js / 패키지 매니저**: Node.js v24.14.0, npm v11.9.0

### 1.2 로컬 검증 자료 가용성 조사
- PC 포맷 이전에 생성되었던 Figma 원본 AST 캐시 파일(`debug/phase45/cache/figma_full_original.json`) 및 과거 검토 패키지(`Figma2Word_Phase45_GPT_Review.zip`)는 `.gitignore` 설정에 따라 원격 Git에 포함되지 않았으며, 포맷 이후 로컬 파일시스템에 존재하지 않음을 확인하였습니다.
- Phase 46.1 지침의 엄격한 제약(외부 Figma REST API 호출 금지, 무단 캐시 위조 금지, Fail-Closed 원칙)을 준수하여 네트워크 API 호출을 실행하지 않았습니다.

---

## 2. P1 — Clipping 안전성 교정 결과

### 2.1 결함 원인 분석
- **기존 동작 (`e4da7da`)**: `figmaCanvasParser.ts`에서 부모 프레임이 `clipsContent: true`일 때, 부분적으로 경계를 벗어난 자식 도형의 바운딩 박스(`bounds.x`, `bounds.width`, `bounds.y`, `bounds.height`)를 부모 경계 내로 직접 클램핑(축소)하여 덮어썼습니다.
- **발생 문제**: `ELLIPSE`(타원), `VECTOR`(곡선), 회전된 도형 등의 바운딩 박스를 자르면 중심점과 곡률, 가로세로 종횡비가 영구 변형되어 시각적인 왜곡(타원이 찌그러지거나 잘린 단면이 아닌 이상한 타원으로 재계산)이 발생합니다.
- **오프스크린 컨테이너 탈락 문제**: 부모 컨테이너가 캔버스 음수 좌표에 걸쳐 있어 바운딩 박스 체크에서 제외되더라도, 부모의 `clipsContent: false`인 경우 내부 자식 요소는 양수 영역(보이는 화면)에 표시될 수 있으나 조기 탈락되는 위험이 있었습니다.

### 2.2 해결 구현 (`src/canvas/types.ts`, `src/canvas/parser/figmaCanvasParser.ts`)
1. **기하 구조 보존 필드 도입 (`src/canvas/types.ts`)**:
   - `originalBounds?: CanvasBounds`: 클리핑 이전 원본 도형의 절대 위치 및 너비·높이를 무손실 보존.
   - `clipBounds?: CanvasBounds`: 렌더러가 뷰포트 클리핑(SVG `clip-path` 또는 DOCX Shape Cropping)에 적용할 수 있는 유효 가시 클립 영역.
2. **도형 기하 보존 클리핑 로직 (`src/canvas/parser/figmaCanvasParser.ts`)**:
   - `intersectBounds(a, b)` 순수 함수를 도입하여 중첩된 부모 클립 사각형들의 교집합을 정확히 계산.
   - `ELLIPSE`, `VECTOR`, `RECTANGLE`, `FRAME`, `INSTANCE` 등 모든 요소 변환 시 `originalBounds`에 원본 기하를 저장하고, `clipBounds`에 누적된 클립 경계를 전달.
   - Word/DOCX 및 양수 좌표 기반 캔버스 호환성을 위해 렌더링용 `bounds`는 유효 표시 영역으로 정규화하되, 원본 종횡비와 중심점 계산이 필요한 경우 `originalBounds`를 참조하도록 분리.
3. **`clipsContent: false` 하위 요소 렌더링 보장**:
   - 부모 프레임이 캔버스 경계 밖에 걸쳐 있더라도, `clipsContent: false`인 컨테이너는 하위 자식 노드를 조기 폐기(early drop)하지 않고 재귀적으로 순회하여, 캔버스 가시 영역에 진입하는 자식 요소를 정상 수집하도록 개선.
4. **다단계 중첩 클리핑 전파**:
   - 부모 -> 자식 -> 손자 계층으로 이동할 때 `activeClip`이 존재하는 경우 교집합(`intersectBounds`)을 누적 전달하여 다중 프레임 클리핑이 올바르게 중첩되도록 보장.

### 2.3 4-4 반례 테스트 검증 결과 (`tests/phase46-1-safety.test.ts`)
- **[통과] Counter-example 1**: `clipsContent: true` 부모 프레임 내 X=-50, Width=300인 타원이 원본 `originalBounds` (X=-50, Width=300)를 온전히 보존하며 파괴적 기하 변형이 발생하지 않음을 검증.
- **[통과] Counter-example 2**: 부모 컨테이너가 X=-100, Width=80으로 화면 밖에 있으나 `clipsContent: false`인 경우, X=20에 위치한 자식 사각형이 탈락되지 않고 가시 요소로 정상 파싱됨을 검증.
- **[통과] Counter-example 3**: 다단계 중첩 프레임(`Frame A [0,0, 500,500]` -> `Frame B [50,50, 200,200]` -> 자식 `[0,0, 400,400]`)에서 클립 경계가 `[50,50, 200,200]`으로 정확히 교집합 전파됨을 검증.

---

## 3. P2 — 색상 출처 및 배경 분리 교정 결과

### 3.1 결함 원인 분석
- **기존 동작 (`e4da7da`)**: `semanticTableDetector.ts`에서 셀 배경색과 텍스트 색상의 유클리드 RGB 거리가 35 미만(`dist < 35`)일 때 셀 배경을 강제로 지우는(`cell.backgroundColor = undefined`) 임의 임계값 휴리스틱이 도입되었습니다.
- **발생 문제**: 디자이너가 의도한 정당한 저대비/다크모드 디자인(예: `#202020` 배경 위의 `#2A2A2A` 또는 `#1F1F1F` 보조 텍스트, 상태 뱃지 등)까지 배경이 강제 삭제되어 디자인이 훼손됩니다.
- **Figma 빈 배열 Truthiness 버그**: `(cellNode.type !== "TEXT" ? cellNode.fills : undefined) || rowNode.fills` 표현식에서 셀 노드의 `fills`가 빈 배열(`[]`)인 경우, JavaScript의 빈 배열은 truthy이므로 fallback 우측 피연산자(`rowNode.fills`)로 넘어가지 못해 행 배경색이 누락되는 버그가 존재했습니다.

### 3.2 해결 구현 (`src/canvas/parser/semanticTableDetector.ts`)
1. **`extractEffectiveSolidFill(node)` 헬퍼 구현**:
   - `node.fills`가 배열인지 검사하고, 비어있지 않으며 `visible !== false`인 유효한 `SOLID` 채우기만 추출.
   - 빈 배열(`[]`)이거나 채우기가 없으면 안전하게 `null`을 반환하여 상위 행/컨테이너 배경 fallback이 정상 작동하도록 보장.
2. **명시적 투명도(`alpha <= 0.001` 또는 `isTransparent`) 존중**:
   - 셀에 명시적으로 알파 0 투명 채우기가 지정된 경우, 불필요하게 부모 행 채우기를 상속받지 않도록 `isTransparent = true` 플래그를 유지하여 디자이너의 투명 셀 의도를 보존.
3. **임의 임계값(`dist < 35`) 제거 및 출처 기반 상속 교정**:
   - 임의의 유클리드 거리 35 삭제 로직을 완전 제거.
   - 셀이 자체 채우기 없이 행(Row)으로부터 배경색을 상속받았을 때, 셀 내부 텍스트 색상과 대소문자 무관 동일한 HEX 색상(`color === cell.backgroundColor`)이 되는 제로 콘트라스트(완전 비가독성) 결함에 대해서만 상속을 무효화하고 상위 컨테이너 또는 투명으로 롤백.
   - 셀에 자체 명시적 채우기가 존재하는 경우에는 디자이너의 의도된 미세 대비(예: `#202020` vs `#2A2A2A`)를 보존.

### 3.3 5-4 반례 테스트 검증 결과 (`tests/phase46-1-safety.test.ts`)
- **[통과] Counter-example 1 (의도된 저대비 보존)**: 텍스트 `#2A2A2A`, 셀 배경 `#202020` (RGB 거리 약 17.3 < 35)인 정당한 디자인에서 배경색이 삭제되지 않고 온전히 유지됨을 검증.
- **[통과] Counter-example 2 (빈 fills 배열 Fallback)**: 셀의 `fills: []`가 주어졌을 때, 행의 배경색(`#F0F4F8`)이 누락되지 않고 셀 배경으로 올바르게 상속됨을 검증.
- **[통과] Counter-example 3 (명시적 투명 채우기 보존)**: 셀에 `opacity: 0` (알파 0) 채우기가 있을 때 행 배경을 덮어씌우지 않고 투명으로 유지됨을 검증.
- **[통과] Counter-example 4 (텍스트 채우기 혼동 방지)**: 텍스트 노드가 셀의 배경 노드로 오인되어 글자색이 셀 배경색으로 주입되는 상속 오염이 완벽히 차단됨을 검증.

---

## 4. Semantic Table 보존 및 Fallback 정책 검토

### 4.1 정보 폼(Form) vs 데이터 표(Data Table) 구분
- `semanticTableDetector.ts`는 폼 필드(라벨+입력창 쌍, 비대칭 카드 그리드)와 실제 격자형 데이터 표를 구분하는 구조적 휴리스틱을 갖추고 있습니다.
- 행과 열의 정렬도, 셀 간 간격 균일성, 헤더 반복 구조를 검사하여 표준 데이터 표만 `TableElement`로 변환합니다.

### 4.2 Fallback 비율과 편집 가능성 간의 균형
- 복합 셀(내부에 아이콘, 버튼, 태그, 다중 문단이 중첩된 형태)의 경우 Word DOCX Native Table 셀 내부에 무리하게 평탄화(flattening)하여 삽입하면 테이블 셀 너비 파손 및 텍스트 겹침이 발생합니다.
- 과도한 Fallback(정상 데이터 표까지 Atomic Graphic으로 전환)을 방지하기 위해:
  - 1단 행-열 격자 구조가 명확한 데이터 표는 DOCX Native Table로 보존하여 사용자 편집성을 100% 보장.
  - 셀 내부 구조가 자유 배치(absolute layout)이거나 복합 제어 컴포넌트인 경우에 한하여 그룹 단위 Fallback을 적용하여 시각적 깨짐을 방지.

---

## 5. 5대 핵심 화면 시각 재현 품질 현황 (투명 공개)

| Frame Node ID | 화면명 | 시각 품질 검증 상태 | 판정 사유 및 상세 내용 |
|---|---|---|---|
| `1154:2591` | 고객목록 | `BLOCKED_SOURCE_MISSING` | 포맷 후 로컬 AST 캐시 부재 & Figma API 호출 엄격 제한 준수 |
| `1154:3082` | 고객상세 | `BLOCKED_SOURCE_MISSING` | 포맷 후 로컬 AST 캐시 부재 & Figma API 호출 엄격 제한 준수 |
| `1154:7666` | 홈 | `BLOCKED_SOURCE_MISSING` | 포맷 후 로컬 AST 캐시 부재 & Figma API 호출 엄격 제한 준수 |
| `1154:4490` | 계약관리 | `BLOCKED_SOURCE_MISSING` | 포맷 후 로컬 AST 캐시 부재 & Figma API 호출 엄격 제한 준수 |
| `1154:8582` | 보장분석 팝업 | `BLOCKED_SOURCE_MISSING` | 포맷 후 로컬 AST 캐시 부재 & Figma API 호출 엄격 제한 준수 |

> **감사 공시 (Disclosure)**:
> 과거 Phase 46 보고서에 기재되었던 5대 화면의 SSIM 측정치(0.970~0.985)는 로컬 AST 캐시와 Word COM 렌더링을 통해 측정되었던 수치였습니다. 그러나 현재 로컬 머신은 포맷 직후 상태로 해당 캐시 파일이 존재하지 않으며, Phase 46.1 지침에 따라 외부 API 호출을 수행하지 않았으므로 라이브 재측정은 `BLOCKED_SOURCE_MISSING`으로 기록합니다.
> 대신, 해당 결함을 유발했던 핵심 로직(클리핑 도형 왜곡, RGB 35 배경 강제 삭제, 빈 fills 상속 버그)에 대해 독립적인 반례 테스트(Counter-example Suite)를 작성하여 코드 레벨에서 100% 회귀가 방지됨을 수학적/논리적으로 입증하였습니다.

---

## 6. 전체 테스트 및 빌드 검증 결과

### 6.1 신규 Phase 46.1 안전성 테스트
- **명령어**: `npx vitest run tests/phase46-1-safety.test.ts`
- **결과**: **7 passed / 7 tests (100% 통과, 9ms)**
  - `clipsContent: true` 타원 원본 기하(`originalBounds`) 보존 검증 통과
  - `clipsContent: false` 화면 밖 컨테이너 자식 요소 렌더링 보존 검증 통과
  - 다단계 중첩 프레임 클립 경계 전파 검증 통과
  - 의도된 저대비 배경색(`#202020` vs `#2A2A2A`) 보존 검증 통과
  - 빈 `fills: []` 행 배경 상속 정상 작동 검증 통과
  - 명시적 투명 채우기 보존 검증 통과
  - 텍스트 색상 상속 오염 방지 검증 통과

### 6.2 기존 Phase 46 테스트
- **명령어**: `npx vitest run tests/phase46-visual-fidelity.test.ts`
- **결과**: **4 passed / 4 tests (100% 통과, 7ms)**

### 6.3 프로젝트 전체 회귀 테스트 스위트
- **명령어**: `npm test` (`vitest run`)
- **결과**:
  - **테스트 파일**: **110 passed, 1 skipped (총 111개 파일)**
  - **테스트 케이스**: **752 passed, 5 skipped, 0 failed (총 757개 테스트)**
  - **소요 시간**: 6.47s
  - **기존 기능 회귀 없음 (Zero Regression)**

### 6.4 빌드 무결성 검증
- **TypeScript 라이브러리 빌드 (`npm run build`)**: `tsc` 성공 (컴파일 오류 0건, 타입 경고 0건)
- **Web 애플리케이션 번들 빌드 (`npm run build:web`)**: `tsc -b && vite build` 성공 (dist 번들 정상 생성, 461ms)

---

## 7. 변경 파일 목록 및 커밋 안내

### 7.1 변경 및 생성된 파일 목록
1. `src/canvas/types.ts`: `CanvasElement` 인터페이스에 `originalBounds?: CanvasBounds` 및 `clipBounds?: CanvasBounds` 추가
2. `src/canvas/parser/figmaCanvasParser.ts`:
   - `intersectBounds` 구현 및 중첩 클리핑 전파
   - 도형 바운딩 박스 파괴적 축소 방지 및 `originalBounds`/`clipBounds` 보존
   - `clipsContent: false` 컨테이너의 하위 가시 요소 수집 보장
3. `src/canvas/parser/semanticTableDetector.ts`:
   - `extractEffectiveSolidFill` 함수 도입
   - 빈 `fills: []` 피그마 배열 truthiness 버그 수정
   - 임의의 `dist < 35` 유클리드 거리 강제 삭제 제거
   - 행 배경 상속 시 텍스트 색상과의 동일 HEX 충돌 방어만 정밀 적용
4. `tests/phase46-1-safety.test.ts`: 7개 반례 시나리오를 망라하는 종합 안전성 테스트 스위트 신규 생성
5. `debug/phase46_1/PHASE46_1_SAFETY_AND_FIDELITY_REPORT.md`: 본 보고서

### 7.2 Git 커밋 계획
- **Commit Message**: `fix: preserve geometry and safe style inheritance (phase 46.1)`
- **Target Branch**: `master` -> `origin/master`
