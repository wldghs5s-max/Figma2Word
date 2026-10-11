# Figma2Word — Step 6A: Figma 프레임 좌우 배치 보존 및 레이아웃 엔진 구조 진단 보고서

## 1. 개요 및 배경

- **기준 체크포인트**: `8a41124` (`feat(docx): isolate adjacent tables and support page orientation selection`)
- **작업 원칙**: **제품 코드 수정 없음**, 진단 및 최소 수정 설계 전용, 커밋 및 푸시 금지.
- **사용자 제기 핵심 문제**:
  > *"Word 용지를 가로형으로 변경했지만, 원래 좌우에 있어야 할 콘텐츠가 여전히 분리되어 있고, 잘못 배치된 요소들이 더 넓은 공간을 차지한다."*

가로형 용지(Landscape)로 변경하면 가용 폭이 **451.3pt에서 697.9pt로 +54.6% 확장**됩니다. 그럼에도 불구하고 원래 좌우 2열/다열로 나란히 배치되어야 할 콘텐츠가 여전히 한 줄씩 세로로 적층되고 서로 다른 페이지로 밀려나는 현상의 구조적 원인을 정밀 분석합니다.

---

## 2. 실제 문제 사례 분석 (최소 2개 사례)

### 사례 1: 메인 랜딩 큐레이션 추천 카드 (4개 카드 수직 적층 및 페이지 분할)
- **대상 콘텐츠**:
  - 카드 1: "개발자를 위한 낙원" (다중 모니터, 초고속 인터넷...) + 219pt 일러스트 이미지
  - 카드 2: "몰입을 위한 은신처" (중요한 프로젝트에 집중...) + 이미지
  - 카드 3: "해변가" + 이미지
  - 카드 4: "도심의 활기" + 이미지
- **Figma 원본 의도 (추정 및 시각적 검증)**:
  - 데스크톱(1440px) 메인 랜딩 섹션 내에 2×2 그리드 또는 가로 4열로 나란히 배치된 카테고리 큐레이션 카드.
- **현재 파이프라인 처리 결과**:
  1. 각 카드가 단일 `Row Cluster`로 묶이지 못하고, 각각 독립된 컨테이너로 파싱됨.
  2. `docxRenderer.renderContainerBody`에서 각 카드가 배경색/테두리를 가진 **1×1 Table (`width: 100%`)**로 변환됨.
  3. 이미지 역시 가로폭 450pt(`cx=5715000`)의 독립 단락으로 변환됨.
- **Word COM 실측 렌더링 결과**:
  - **Portrait (세로형)**:
    - Page 4: 카드 1 텍스트 (폭 451.3pt) + 대형 이미지 (폭 450pt, 높이 219pt)
    - Page 5: 카드 2 텍스트 (폭 451.3pt) + 카드 3 텍스트 + 카드 4 텍스트
  - **Landscape (가로형)**:
    - 각 카드가 가로 가용 폭 **697.9pt(100%)** 전체로 거대하게 팽창함.
    - Page 4: 카드 1 이미지 단독 (높이 219pt로 인해 페이지 하단 점유)
    - Page 5: 카드 1 텍스트 + 카드 2 텍스트 (가로 698pt로 길게 늘어짐)
    - Page 6: 카드 3 텍스트 + 카드 4 텍스트
  - **사용자 체감**: "좌우 배치는 안 되고, 잘못 배치된 카드가 698pt 전체를 차지하여 더 거대해졌으며 3개 페이지로 쪼개짐."

---

### 사례 2: 데스크톱 2열 비대칭 레이아웃 (계정 설정 / 대시보드 2열 분리)
- **대상 콘텐츠**:
  - 좌측: 사이드바 내비게이션 (폭 280px, 높이 600px: "프로필 설정", "보안", "알림" 등)
  - 우측: 메인 설정 폼 / 대시보드 콘텐츠 (폭 800px, 높이 650px: 계정 정보, "회원 탈퇴하기" 등)
- **Figma 원본 의도**:
  - 1440px 데스크톱 화면의 전형적인 좌-우 2열 화면 (Left 280px + Right 800px = 1080px 중앙 정렬).
- **현재 파이프라인 처리 결과**:
  1. `LayoutEngine.canFormHorizontalRow` 실행 시 `isIndependentScreen` 가드 검사:
     - 좌측 사이드바: `box.width >= 240 && box.width <= 500 && box.height >= 600 && aspect >= 1.6` 조건에 걸려 **"모바일 독립 화면"으로 오탐**.
     - 우측 메인 폼: `box.width >= 600 && box.height >= 500` 조건에 걸려 **"데스크톱 독립 화면"으로 오탐**.
  2. `canFormHorizontalRow`가 `false`를 반환하여 두 요소를 가로 행(`Row Cluster`)으로 묶는 것을 전면 거부.
  3. 사이드바가 100% 폭 테이블로 먼저 렌더링되고, 메인 폼이 그 아래에 100% 폭 테이블로 순차 렌더링됨.
- **Word COM 실측 렌더링 결과**:
  - 사이드바(Page 12 in Portrait / Page 15 in Landscape)와 메인 폼이 세로로 분리되어, 사이드바 아래로 70% 공백이 발생하고 메인 폼은 다음 페이지로 밀려남.
  - 가로형 문서에서는 사이드바가 698pt 폭의 휑한 단일 행으로 늘어나는 기형적 레이아웃 초래.

---

## 3. 원본 데이터 분석: 확인된 사실 vs 추정 항목

| 항목 | 확인된 사실 (Confirmed via OpenXML & Word COM) | 추정 항목 (Inferred from Layout Logic) |
|---|---|---|
| **큐레이션 카드 (사례 1)** | - OpenXML 상에서 4개 카드 텍스트가 모두 `<w:tbl>` (width 100%, 9026 dxa in Port / 13958 dxa in Land)로 렌더링됨.<br>- 카드 텍스트 테이블과 이미지 단락이 번갈아 배치됨.<br>- Word COM 실측 결과 3개 페이지로 분할 렌더링됨. | - Figma 원본에서 4개 카드가 Auto Layout 컨테이너 없이 절대 좌표로 2×2 또는 1×4 배치되었을 가능성 높음.<br>- 텍스트와 이미지가 단일 카드 프레임으로 그룹화되지 않고 형제 노드로 분리되어 있었을 가능성. |
| **데스크톱 2열 (사례 2)** | - 좌측 내비게이션 요소와 우측 콘텐츠가 독립 테이블로 분리됨.<br>- 가로형에서 각각 697.9pt(100%) 전체를 차지함.<br>- Page 12와 Page 14~15로 물리적 페이지가 분리됨. | - Figma 원본 노드 크기: 좌측 ~280×600px, 우측 ~800×650px.<br>- `isIndependentScreen` 절대 수치 가드에 정확히 적중하여 클러스터링 거부됨. |

---

## 4. 레이아웃 엔진 소스코드 정밀 진단

### A. 좌우 요소 높이가 다를 때 Row Cluster 실패 조건
- `LayoutEngine.canFormHorizontalRow`:
  ```ts
  const vOverlapTop = Math.max(mBox.y, cBox.y);
  const vOverlapBottom = Math.min(mBox.y + mBox.height, cBox.y + cBox.height);
  const hasVerticalOverlap = vOverlapBottom - vOverlapTop > 10;
  ```
  - 좌우 카드의 높이가 크게 다른 경우(예: 좌측 카드 H=400, 우측 칩/버튼 H=40), Y좌표 기준점이 조금만 어긋나면 `vOverlap <= 10`이 되어 가로 행 형성이 거부됨.

### B. 좌우 요소 Y좌표가 다를 때 Row Cluster 실패 조건
- `clusterHorizontalRows`:
  ```ts
  const sorted = [...nodes].sort((a, b) => aY - bY); // Y 오름차순 정렬
  ...
  if (candBox.y > maxClusterBottom + this.rowYThreshold + 40) {
    break; // 조기 탐색 종료
  }
  ```
  - `rowYThreshold` 기본값이 **20px**로 매우 협소함.
  - 디자이너가 좌우 카드의 상단을 정렬하지 않고 시각적 중앙 정렬이나 미세한 오프셋(예: 30px 단차)을 준 경우, Y 정렬 루프가 탐색을 조기 종료하거나 `canFormHorizontalRow`가 거부함.

### C. 부모 컨테이너의 방향 정보가 무시되는 경우
- `figmaParser.ts` lines 657-676 (`parseContainer`):
  ```ts
  const layoutDirection =
    node.layoutMode === "HORIZONTAL" ? "horizontal" :
    node.layoutMode === "VERTICAL" ? "vertical" : "none";

  return {
    type: "container",
    layoutDirection: layoutDirection === "none" ? "vertical" : layoutDirection,
  };
  ```
  - Figma에서 Auto Layout이 켜지지 않은(`layoutMode === "NONE"`) 프레임은 기하학적으로 자식들이 명백히 좌우에 있더라도 **무조건 `"vertical"`로 강제 할당**됨.
  - 부모의 방향 추론 로직이 부재하여, 오직 하위의 `clusterHorizontalRows` 휴리스틱에만 전적으로 의존함.

### D. 절대 좌표가 Word 순차 문단으로 변환되며 2D 공간 정보 손실
- Word OpenXML은 2차원 절대 좌표(X, Y) 캔버스를 지원하지 않고, 상단에서 하단으로 흐르는 1차원 순차 스트림(Block Flow) 구조임.
- Figma에서 좌우에 배치된 요소가 `Row Cluster` 테이블(1개 행, N개 셀)로 묶이지 못하면, X축 정보가 완전히 소멸하고 Y 정렬 순서대로 1줄씩 순차 나열됨.

### E. 컬럼 폭이 Word 본문 전체 폭(100%)으로 불필요하게 확장되는 근본 이유
- `docxRenderer.ts` lines 673-678:
  ```ts
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    ...
  });
  ```
  - 클러스터링되지 못한 단일 카드는 자신이 독립된 전체 섹션인 것처럼 인식되어 `w:w="5000" (100%)` 테이블로 렌더링됨.
  - 가로형(Landscape) 모드에서는 본문 가용 폭이 **697.9pt**로 넓어졌기 때문에, 2열로 나뉘어야 할 카드가 **698pt 전체를 덮는 거대한 단일 카드**가 됨. 이것이 사용자가 목격한 **"잘못 배치된 요소들이 더 넓은 공간을 차지한다"**의 정확한 기술적 원인임.

### F. 프레임 내부 요소가 독립 아트보드로 오인되는 오탐 가드
- `layoutEngine.ts` lines 375-382 (`isIndependentScreen`):
  ```ts
  private isIndependentScreen(box: FigmaBoundingBox): boolean {
    const isMobileScreen = box.width >= 240 && box.width <= 500 && box.height >= 600 && aspect >= 1.6;
    const isDesktopScreen = box.width >= 600 && box.height >= 500;
    return isMobileScreen || isDesktopScreen;
  }
  ```
  - **부모 프레임의 맥락(Context)을 전혀 고려하지 않음.**
  - 1440px 데스크톱 화면 안에 있는 620×550px 콘텐츠 영역은 부모 너비의 43%에 불과한 '내부 컬럼'임에도, `width >= 600 && height >= 500` 조건을 만족하여 "독립 데스크톱 아트보드"로 판정되어 가로 결합이 차단됨.
  - 280×600px 사이드바 역시 "모바일 전체화면"으로 오탐됨.

---

## 5. 수정 전략 비교 및 평가

| 평가 기준 | 전략 1: Row Cluster 조건의 제한적 개선 (부모 맥락 인식) | 전략 2: 부모 컨테이너 기반 방향 추론 (`layoutMode: NONE` 해결) | 전략 3: 2D Spatial Grid 분할 (컬럼 밴딩) | 전략 4: 정규화 좌표 기반 가로폭 자동 분할 |
|---|---|---|---|---|
| **핵심 메커니즘** | `isIndependentScreen`에 부모 너비 대비 비율(예: 자식 너비 < 부모의 80%) 가드 추가, 비대칭 Y/H 허용치 현실화 | `layoutMode === "NONE"` 컨테이너에서 자식들의 X/Y 분포를 검사하여 가로 다열 구조 추론 | 캔버스 요소를 X축 인터벌 기준으로 Left/Right 컬럼 트렁크로 분리 후 묶음 | Figma X/Width 픽셀을 본문 폭 비율로 정규화하여 다열 표 강제 생성 |
| **코드 수정 범위** | **최소 (LayoutEngine 가드 로직 ~15줄)** | 보통 (FigmaParser 및 LayoutEngine 연계 ~40줄) | 큼 (2D 분할 알고리즘 신설 ~150줄) | 큼 (렌더러 레이아웃 엔진 전면 수정) |
| **실제 문제 해결력** | **높음** (사례 2 대형 컬럼 분리 즉시 해소) | 보통 (복합 프레임 오탐 위험 존재) | 높음 | 높으나 서식 깨짐 위험 |
| **모바일 화면 보호** | **완벽 유지** (실제 최상위 모바일 스크린은 100% 보존) | 양호 | 모바일 세로 흐름 붕괴 위험 | 모바일 레이아웃 왜곡 위험 |
| **기존 189개 테스트 안전성** | **회귀 위험 매우 낮음** (기존 가드 엄밀화) | 중간 (단일 래퍼 평탄화와 충돌 가능) | 위험 (복잡도 증가) | 위험 (테이블 구조 파편화) |
| **Word 호환성 / 편집성** | **우수** (표준 1행 다열 TableCell 유지) | 우수 | 중간 | 낮음 (빈 셀 다수 발생) |

### 권장 수정 방향 (최소 수정 원칙): **전략 1 + 전략 2의 최소 결합**
1. **`isIndependentScreen` 부모 컨텍스트 주입**:
   - 부모 노드가 명시적인 데스크톱 프레임(너비 ≥ 900px)인 경우, 자식이 부모 너비의 75% 미만이면 독립 스크린 가드를 해제하여 좌우 2열 컬럼 클러스터링을 허용.
2. **`isContainerLike` 투명 컨테이너 수용**:
   - 배경색(`fills`)이 없더라도 자식들을 감싸고 있는 그룹/프레임이 2열 배치를 형성하고 있다면 이를 컨테이너로 보존.
3. **비대칭 높이 허용**:
   - 좌우 요소가 명확히 분리된 X축을 갖고(`hOverlap <= 5`) 수평 시각 대역을 공유하는 경우, 높이 차이가 있더라도 동일 행 클러스터링 허용.

---

## 6. 테스트 케이스 설계 (8대 핵심 검증 시나리오)

향후 Step 6B 구현 시 실패(Red) → 통과(Green)를 검증할 단위 테스트 8종을 설계합니다.

```ts
describe("Step 6: Frame Horizontal Layout Preservation & Clustering Guard Refinement", () => {
  // 1. 같은 Y좌표에 있는 좌우 카드 (기준 동작 보존)
  it("Scenario 1: clusters standard side-by-side cards with same Y (y=100, w=400, h=300)", () => { ... });

  // 2. Y좌표가 다른 비대칭 좌우 카드 (단차 30~50px 허용)
  it("Scenario 2: clusters horizontally adjacent cards with vertical offset (y1=100, y2=140, overlap > 100px)", () => { ... });

  // 3. 높이가 다른 좌우 카드 (비대칭 카드)
  it("Scenario 3: clusters cards with different heights (h1=450px, h2=220px, shared top region)", () => { ... });

  // 4. 실제로 위아래에 배치된 독립 카드 (가로 결합 방지 가드)
  it("Scenario 4: preserves vertical sequential separation for truly stacked cards (x1=100, x2=100, y2 > y1 + h1)", () => { ... });

  // 5. 375x812 모바일 독립 전체화면 (절대 분리 보존)
  it("Scenario 5: preserves strict isolation for 375x812px mobile fullscreen artboards", () => { ... });

  // 6. 1440px 데스크톱 웹 프레임 내부 2열 컬럼 (620x550px 대형 블록 클러스터링 허용)
  it("Scenario 6: clusters large 620x550px two-column content blocks inside 1440px desktop frame", () => { ... });

  // 7. 정상적인 3열 카드 그리드 (Step 1 동작 회귀 방지)
  it("Scenario 7: preserves 3-column cards grid layout (Table with 3 equal cells)", () => { ... });

  // 8. 의도적인 Spacer 및 고정 폭 아이콘/버튼 컬럼
  it("Scenario 8: preserves icon column + title column horizontal arrangement without collapsing", () => { ... });
});
```

---

## 7. 추가로 필요한 실제 Figma 데이터 및 확인 사항

1. **`Final-Prj` 메인 랜딩 큐레이션 섹션의 노드 계층 트리**:
   - "개발자를 위한 낙원" 카드들이 Figma 상에서 개별 `FRAME`으로 감싸져 있는지, 아니면 캔버스 직속 사각형/텍스트들의 단순 집합인지 확인 필요.
2. **Auto Layout 적용 비율**:
   - Figma 실무 작업물에서 Auto Layout(Shift+A)이 적용된 비율과 절대 좌표 배치(Drag & Drop) 비율 파악.

---

## 8. 결론 및 대기

- Step 6A의 진단 결과, 사용자가 목격한 **"가로형 용지에서 요소 분리 지속 및 비정상적 거대화"**의 정확한 기술적 원인이 규명되었습니다:
  1. `isIndependentScreen`의 맥락 없는 고정 절대 수치 가드로 인한 데스크톱 2열 컬럼 오탐 차단.
  2. 클러스터링 실패 시 `docxRenderer`의 무조건적인 100% 폭 테이블 할당으로 인한 가로형(698pt) 과도 팽창.
- 현재 코드는 **수정 없이 청결한 상태(`8a41124`)**를 유지하고 있으며, 본 보고서를 제출하고 사용자의 검토 및 다음 단계 지시를 대기합니다.

