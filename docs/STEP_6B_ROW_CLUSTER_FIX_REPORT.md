# Figma2Word — Step 6B: 부모 맥락 기반 Row Cluster 개선 및 실제 좌우 배치 복구 보고서

**작성일시**: 2026-10-11  
**기준 커밋**: `8a41124` (Step 5 완료 시점)  
**작업 성격**: 최소 코드 수정 및 9개 회귀 테스트 검증 (Git 커밋/푸시 미수행)

---

## 1. 수정 전후 원인 비교 (Step 6A 진단과의 연결)

### Step 6A에서 규명된 핵심 원인
1. **정적 크기 가드의 오탐**:
   - `src/layout/layoutEngine.ts`의 `isIndependentScreen` 함수는 Figma 노드의 절대 크기(`width >= 600 && height >= 500` 또는 `width 240~500 && height >= 600 && aspect >= 1.6`)만을 보고 독립 화면(Artboard)으로 판정했습니다.
2. **부모 맥락 손실**:
   - 1440px 데스크톱 웹 프레임 내부의 사이드바(280×600)나 본문(620×550), 섹션 내부의 375×812 모바일 목업 카드들이 독립 화면으로 오탐되어 `canFormHorizontalRow`에서 차단되었습니다.
3. **가로형 Word에서의 분리 및 줄바꿈 왜곡**:
   - Row Cluster로 묶이지 못한 개별 요소들은 Word 렌더러에서 각각 `w:w="5000"` (100% 폭 테이블)로 변환되었습니다.
   - 용지를 가로형(Landscape)으로 변경했을 때 사용 가능한 본문 폭이 451.7pt에서 698.8pt(+54.6%)로 확장되면서, 원래 좌우로 배치되어야 할 블록들이 각각 698.8pt를 독점하며 수직으로 길게 늘어지고 페이지가 분리되는 현상이 발생했습니다.

---

## 2. 구현 상세

### 2.1 부모 맥락 전달 경로 (`figmaParser.ts` → `layoutEngine.ts`)

```
figmaParser.parseContainer(node)
  └─ parseChildren(node.children, node.layoutMode, node) // parent=node 전달
       └─ layoutEngine.processNodes(visibleNodes, parent) // parent 전달
            └─ layoutEngine.clusterHorizontalRows(afterOverlay, parent) // parent 전달
                 └─ layoutEngine.canFormHorizontalRow(cluster, candidate, parent) // parent 전달
                      └─ layoutEngine.isIndependentScreen(box, parent) // parent 맥락 반영
```

### 2.2 독립 화면 판정 조건 개선 (`src/layout/layoutEngine.ts`)

```typescript
private isIndependentScreen(box: FigmaBoundingBox, parent?: FigmaNode): boolean {
  const pBox = parent?.absoluteBoundingBox;
  if (pBox && pBox.width >= 600) {
    // 600px 이상의 넓은 데스크톱/섹션 컨테이너 내부:
    // 부모 폭의 85% 이상을 차지하는 전폭 섹션만 독립 화면으로 간주.
    // 85% 미만을 차지하는 내부 컬럼, 사이드바, 목업 카드는 Row Cluster 대상이 됨.
    return box.width >= pBox.width * 0.85;
  }

  // 부모 정보가 없거나(캔버스 레벨) 일반/모바일 컨테이너인 경우 기존 보수적 가드 유지:
  const aspect = box.height / box.width;
  const isMobileScreen = box.width >= 240 && box.width <= 500 && box.height >= 600 && aspect >= 1.6;
  const isDesktopScreen = box.width >= 600 && box.height >= 500;
  return isMobileScreen || isDesktopScreen;
}
```

### 2.3 변경 파일 및 최소 변경 내역

1. [src/layout/layoutEngine.ts](file:///c:/Users/77/Documents/Figma2Word/src/layout/layoutEngine.ts):
   - `processNodes(nodes: FigmaNode[], parent?: FigmaNode)`
   - `clusterHorizontalRows(nodes: FigmaNode[], parent?: FigmaNode)`
   - `canFormHorizontalRow(cluster: FigmaNode[], candidate: FigmaNode, parent?: FigmaNode)`
   - `isIndependentScreen(box: FigmaBoundingBox, parent?: FigmaNode)`
2. [src/parser/figmaParser.ts](file:///c:/Users/77/Documents/Figma2Word/src/parser/figmaParser.ts):
   - `parseChildren(nodes: FigmaNode[], parentLayoutMode?: string, parent?: FigmaNode)`
   - `parseContainer(node: FigmaNode)`에서 `this.parseChildren(node.children || [], node.layoutMode, node)` 호출

---

## 3. 테스트 검증 결과

### 3.1 신규 9개 시나리오 테스트 (`tests/parent-context-row-cluster.test.ts`)

| 시나리오 | 검증 내용 | 수정 전 | 수정 후 |
|:---|:---|:---:|:---:|
| **Scenario 1** | Y 좌표가 동일한 나란한 카드 (400×300) | 통과 | **통과** |
| **Scenario 2** | Y 좌표 40px 오차를 가진 비대칭 카드 | 통과 | **통과** |
| **Scenario 3** | 높이가 다른 카드 (H=450 vs H=220) | 통과 | **통과** |
| **Scenario 4** | 순차적으로 세로 배치된 독립 카드 (수직 분리 보존) | 통과 | **통과** |
| **Scenario 5** | 캔버스 최상위 375×812 모바일 화면 2개 (독립 화면 격리 보존) | 통과 | **통과** |
| **Scenario 6** | 1440px 프레임 내 280×600 사이드바 + 620×550 본문 | **실패 (2개 분리)** | **통과 (1개 Row Cluster로 복구)** |
| **Scenario 7** | 기존 3열 카드 그리드 (각 360×480) 클러스터링 | 통과 | **통과** |
| **Scenario 8** | 고정 폭 아이콘(40×40) + 텍스트 라벨(300×40) | 통과 | **통과** |
| **Scenario 9** | 1440px 데스크톱 섹션 내 375×812 모바일 목업 2개 나란히 배치 | **실패 (2개 분리)** | **통과 (1개 Row Cluster로 복구)** |

- **수정 전**: 9개 중 7개 통과, 2개 실패 (Scenario 6, 9)
- **수정 후**: 9개 중 **9개 전체 통과 (100%)**

### 3.2 전체 프로젝트 회귀 테스트

```bash
npm test -- --run
Test Files  36 passed (36)
Tests       198 passed (198)
Duration    2.91s
```
- 기존 189개 테스트 + 신규 9개 테스트 = **총 198개 테스트 전원 통과**
- 기존 35개 테스트 스위트에서 단 1건의 회귀도 발생하지 않음

---

## 4. 사이드 이펙트 분석

1. **캔버스 최상위 모바일/데스크톱 화면 격리 보존**:
   - `parent`가 전달되지 않는 캔버스 최상위 노드(`parseCanvasChildren`)에서는 기존의 `isMobileScreen` 및 `isDesktopScreen` 로직이 100% 동일하게 동작합니다.
   - Scenario 5 및 기존 `canvas-multi-screen-isolation.test.ts`, `desktop-screen-isolation.test.ts` 모두 완벽 통과.
2. **기존 3열 카드 및 콘텐트 그리드 보존**:
   - `pBox.width >= 600` 환경에서 3열 카드는 각각 약 30~33%의 폭을 가지므로, `box.width >= pBox.width * 0.85` 가드를 정상 통과하여 하나의 행 테이블로 클러스터링됩니다.
3. **진짜 세로 순차 블록의 분리 보존**:
   - Y 오프셋이 크거나 수직 밴드가 겹치지 않는 요소(Scenario 4)는 `canFormHorizontalRow`의 Y 근접성/겹침 조건에 의해 계속 분리된 채 유지됩니다.
4. **전폭 섹션의 세로 분리 유지**:
   - 데스크톱 프레임 내의 Hero Section(1440px)이나 Footer(1440px) 등 폭의 85% 이상을 차지하는 대형 컨테이너는 여전히 `isIndependentScreen`이 `true`를 반환하므로, 가로로 묶이지 않고 세로 순차 배치됩니다.

---

## 5. 빌드 검증

- `npm run build`: `tsc` 컴파일 성공 (0 errors)
- `npm run build:web`: Vite + React 웹 앱 번들링 성공 (0 errors)

---

## 6. Git 상태

```text
On branch master
Your branch is up to date with 'origin/master'.

Changes not staged for commit:
	modified:   src/layout/layoutEngine.ts
	modified:   src/parser/figmaParser.ts

Untracked files:
	docs/STEP_6A_FRAME_LAYOUT_DIAGNOSTIC.md
	docs/STEP_6B_ROW_CLUSTER_FIX_REPORT.md
	tests/parent-context-row-cluster.test.ts

no changes added to commit
```
> [!NOTE]
> 지침에 따라 일체의 Git commit 및 push 작업을 수행하지 않고 대기합니다.

---

## 7. 다음 단계 권장사항

1. 최신 웹 UI(`npm run dev:web` 또는 로컬 서버)를 통해 실제 사용자의 Figma 디자인을 세로형/가로형 DOCX로 재변환.
2. Word COM 스크립트를 통해 실제 재생성된 문서에서:
   - 좌우로 배치되어야 하는 프레임이 단일 다열 Table(`gridCol` 분할)로 생성되었는지 확인.
   - 각 블록이 100% 폭 테이블로 수직 분리되어 별도 페이지로 밀려나는 현상이 해소되었는지 검증.

