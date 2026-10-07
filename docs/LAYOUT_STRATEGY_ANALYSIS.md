# Layout Strategy Analysis (Phase 3)

## 1. 개요 및 목적
Phase 2 스트레스 테스트를 통해 발견된 레이아웃 3대 핵심 결함(P1)을 해결하기 위해, 가능한 Layout Strategy 후보군을 체계적으로 비교 분석하고 가장 단순하고 안정적인 전략을 도출합니다.

### 대상 핵심 문제 (P1)
1. **P1-1 (Non-Auto Layout Horizontal Clustering)**: 절대 좌표(Absolute positioning) 기반 디자인에서 수평으로 나란히 배치된 요소들이 Y축 단순 정렬로 인해 DOCX에서 수직으로 쪼개져 적층되는 문제.
2. **P1-2 (Overlay / Z-Index Flattening)**: 카드 배경 사각형(Rectangle)과 그 위에 배치된 텍스트/버튼이 독립적인 세로 블록으로 렌더링되어 카드가 해체되는 현상.
3. **P1-3 (Fixed vs Fill Sizing Distortions)**: Auto Layout 내 요소들의 고정 폭(Fixed)과 가변 폭(Fill) 관계가 무시되고 단순 1/N 균등 분할로 왜곡되는 현상.

---

## 2. 레이아웃 전략 후보군 비교 (Strategy A ~ E)

| 후보 전략 | 핵심 개념 | 복잡도 | 결정론성 | 구현 용이성 | 장점 | 단점 / 채택 불가 사유 |
|---|---|---|---|---|---|---|
| **Strategy A: Simple Bounding Box Clustering** | 인접 노드의 Y좌표 겹침 범위가 일정 임계값(예: 50%) 이상이면 동일 Row로 그룹화 | 낮음 | 높음 | 높음 | 가볍고 구현이 명확함 | 높이가 크게 다른 요소나 지그재그 배치 시 오판 가능성 |
| **Strategy B: Flow-based Heuristic** | 웹 CSS Flow(인라인/블록) 모델을 모방하여 수평/수직 스트림 분할 | 중간 | 보통 | 중간 | 웹 친화적 사고방식 | Figma의 절대 좌표 및 임의 중첩 구조와 패러다임 불일치 |
| **Strategy C: Spatial Grid Inference** | 전체 노드의 X/Y 투영을 통해 2D 가상 그리드 매트릭스를 추론 | 높음 | 높음 | 낮음 | 복잡한 정렬망 복원 가능 | 복잡도 과다, 빈 셀(Spanning) 처리 등 엣지케이스 폭증 |
| **Strategy D: Word-native Layout Mapping** | OpenXML의 `w:drawing` 텍스트 래핑/부동 프레임을 직접 사용하여 자유 배치 | 매우 높음 | 낮음 | 매우 낮음 | 시각적 절대 위치 복원 우수 | **Project Charter 위반**: Word에서 편집 불가능한 깨지기 쉬운 부동 객체 남발 |
| **Strategy E: Hybrid Model (B+C)** | 컨테이너 판별은 포함 관계(Containment), 배치는 1D 수평 투영 클러스터링 | 중간 | 높음 | 높음 | **Charter의 편집 가능성 원칙과 구조적 단순성 최적 부합** | (선택됨) 극단적 2D 겹침 레이아웃에 대한 한계 존재 |

---

## 3. 7대 전용 Fixture 기반 검증 결과

| Fixture ID | 시나리오 및 검증 항목 | 기존 (Phase 2) 동작 | Strategy E (LayoutEngine) 적용 후 | 판정 |
|---|---|---|---|---|
| `layout-p1-horizontal-2.json` | 좌우 2컬럼 나란한 카드 (절대 좌표) | 세로로 2개 적층됨 (카드1 아래 카드2) | 2열 가로 행(Table)으로 정확히 묶여 횡방향 나열 | **통과 (Pass)** |
| `layout-p1-horizontal-3.json` | 좌/중/우 3컬럼 병렬 구조 | 세로로 3개 적층됨 | 3열 가로 행(Table)으로 정확히 묶임 | **통과 (Pass)** |
| `layout-p1-different-height.json` | 높이가 서로 다른 좌/우 카드 (H: 150 vs 80) | 세로 적층 | Y-overlap 인터벌 클러스터링을 통해 2열 행으로 보존 | **통과 (Pass)** |
| `layout-p1-offset-columns.json` | Y좌표가 미세하게 어긋난 병렬 카드 (Y: 10 vs 25) | 세로 적층 | 허용 오차 내 Y-overlap 계산으로 가로 2열 묶음 성공 | **통과 (Pass)** |
| `layout-p1-mixed-flow.json` | 헤더(수직) + 2컬럼(수평) + 푸터(수직) 혼합 | 전체 4개 블록 수직 나열 | 헤더 1열 -> 2열 그리드 -> 푸터 1열의 구조적 복원 완료 | **통과 (Pass)** |
| `layout-p1-overlay.json` | 배경 사각형 위에 제목/본문 텍스트가 얹힌 카드 | 배경 박스(빈칸) 후 텍스트가 아래로 떨어짐 | 사각형 바운딩 박스 내부 텍스트를 인식하여 단일 카드(Container)로 폴딩 | **통과 (Pass)** |
| `layout-p1-fixed-fill.json` | 60px Fixed 아이콘 + 240px Fill 텍스트 (총 300px) | 50% vs 50% 균등 분할로 아이콘 영역 과대 | `columnWidths: [20, 80]`으로 정확한 너비 비율 보존 | **통과 (Pass)** |

---

## 4. 최종 결론
기존 파이프라인의 안전성을 해치지 않으면서 P1 문제를 해결하기 위해 **Strategy E (Spatial Row Clustering + Containment Folding + Sizing Ratio Enrichment)** 기반의 전용 `LayoutEngine`을 파서 전처리 단계에 연동하고, IR의 `ContainerElement`에 `columnWidths?: number[]` 최소 필드를 추가하는 것이 최적의 해법으로 확정되었습니다.
