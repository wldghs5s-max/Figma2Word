# Layout Strategy Decision (Phase 3)

## 1. 결정 배경 및 목표
Phase 2에서 식별된 P1-1(절대좌표 수평 적층), P1-2(오버레이/배경 분리), P1-3(1/N 균등 폭 왜곡)을 해결하기 위해 Layout Model 구조를 확장하되, Project Charter의 "단순하고 결정론적인 로컬 도구" 및 "Word 문서 편집 가능성 유지" 원칙을 철저히 준수하는 설계가 필요했습니다.

---

## 2. 채택된 아키텍처: Option B/C 결합 (전용 LayoutEngine 모듈화)

기존 파이프라인 전체를 전면 교체(Option D)하지 않고, **파서와 IR 사이에 독립적인 `LayoutEngine` 전처리 계층을 도입하고 IR을 최소한으로 확장(Option B/C)** 하였습니다.

```text
[ Figma AST / Fixture JSON ]
            ↓
    [ Figma Parser ]
            ↓
    [ LayoutEngine ]  <-- (Phase 3 신규 도입: 순수 함수형 룰 기반 엔진)
      ├─ 1. foldContainedOverlays (P1-2: 배경 사각형과 오버레이 노드 폴딩)
      ├─ 2. enrichSizingRatios    (P1-3: Fixed vs Fill / BoundingBox 가중치 산출)
      └─ 3. clusterHorizontalRows (P1-1: Y-overlap 기반 수평 행 클러스터링)
            ↓
[ Internal Document Model (IR) ] (ContainerElement.columnWidths?: number[] 추가)
            ↓
    [ DOCX Renderer ]            (테이블 렌더링 시 columnWidths 비율 적용)
            ↓
        [ .docx ]
```

---

## 3. 핵심 알고리즘 구현 상세

### 3.1 P1-1: Bounding Box Interval 기반 수평 행 클러스터링 (`clusterHorizontalRows`)
- **원리**: 동일 부모 내의 자식 노드들을 Y축 상단 좌표 기준으로 1차 정렬한 후, 인접 노드 간의 Y-축 겹침(Overlap) 비율을 검사합니다.
- **알고리즘**:
  $$\text{Overlap} = \max\left(0, \min(Y_{1\text{max}}, Y_{2\text{max}}) - \max(Y_{1\text{min}}, Y_{2\text{min}})\right)$$
  - 수직 겹침 비율이 기준 높이의 30% 이상이거나, 중심 좌표 편차가 임계값 이내인 경우 동일한 가상 행(`clusterFrame`, `layoutMode: 'HORIZONTAL'`)으로 묶습니다.
  - 묶인 행 내부의 자식들은 X축 좌표 오름차순으로 재정렬됩니다.

### 3.2 P1-2: 포함 관계 기반 오버레이 카드 폴딩 (`foldContainedOverlays`)
- **원리**: Figma에서 사각형(Rectangle/Frame)을 먼저 그리고 그 위에 텍스트나 버튼을 배치하는 패턴을 단일 카드로 변환합니다.
- **알고리즘**:
  - 배경 노드(박스)의 Bounding Box 내부에 완전히(또는 90% 이상) 포함되는 형제 노드들을 탐색합니다.
  - 배경 노드를 부모 컨테이너(`type: 'FRAME'`)로 승격하고, 포함된 노드들을 해당 배경의 `children`으로 이동(Folding)시킵니다.
  - 이를 통해 Word에서 배경 박스 따로, 텍스트 따로 분리되지 않고 하나의 카드형 레이아웃으로 렌더링됩니다.

### 3.3 P1-3: 비례 컬럼 너비 가중치 산출 (`enrichSizingRatios`)
- **원리**: 가로 레이아웃 컨테이너의 자식 노드들의 Bounding Box 폭을 기준으로 정규화된 백분율 컬럼 폭(`columnWidths`)을 계산합니다.
- **알고리즘**:
  - 자식들의 총 너비 합계를 구하고 각 자식의 폭 비율을 백분율(합계 100)로 변환하여 부모 컨테이너의 `columnWidths` 메타데이터에 주입합니다.
  - Word 렌더러는 균등 분할 대신 이 비율을 사용하여 셀 너비를 할당합니다.

---

## 4. 안전장치 및 결정론성 보장 (Infinite Recursion 방지)
- **가드 플래그(`_isProcessed: true`)**: 클러스터링을 통해 생성된 가상 노드와 이미 처리된 자식 노드들에 마킹하여, 재귀 파싱 시 중복 클러스터링 및 무한 루프가 발생하는 것을 원천 차단했습니다.
- **순수 규칙 기반(Rule-based)**: 휴리스틱이나 AI 추론 없이 좌표와 기하학적 인터벌 계산만으로 동작하여 100% 재현 가능한 결정론성을 보장합니다.

---

## 5. 남은 한계 (Known Limitations)
1. **복잡한 2D 겹침 (Partial Overlap)**: 한 노드가 다른 노드와 일부만 걸쳐 있는 디자인(예: 프로필 사진이 배너 경계선에 반쯤 걸친 디자인)은 완전 포함이 아니므로 오버레이 폴딩되지 않고 개별 행으로 분리될 수 있습니다.
2. **사선/회전 노드 (Rotated Elements)**: 회전된 노드의 바운딩 박스는 축 정렬 바운딩 박스(AABB)로 계산되므로 클러스터 판별이 왜곡될 수 있습니다.
