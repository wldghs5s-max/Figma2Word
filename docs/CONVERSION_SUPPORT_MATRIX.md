# Figma → Word 변환 지원 매트릭스 (CONVERSION_SUPPORT_MATRIX)

- **갱신 일시**: 2026-10-07 (Phase 2 검증 반영)

본 문서는 Phase 2 스트레스 테스트 결과를 바탕으로 Figma2Word 변환 엔진의 기능별 실제 지원 수준을 명시한다.

---

## 1. 노드 타입 지원 현황

| Figma Node Type | 지원 상태 | 변환 전략 (Conversion Strategy) | 비고 / 한계점 |
|---|:---:|---|---|
| **TEXT (폰트크기 ≥ 16pt / Title)** | `Supported` | Word 네이티브 `Heading` (Level 1~3) | 폰트, 크기, 볼드, 색상, 정렬 보존 |
| **TEXT (일반 본문)** | `Supported` | Word 네이티브 `Paragraph` & `TextRun` | 텍스트 완전 편집 가능. 단, 글자별 개별 서식은 대표 스타일로 통합 |
| **FRAME (Auto Layout: HORIZONTAL)** | `Supported` | Word 네이티브 1행 N열 `Table` | 가로 다단 컬럼 유지. 현재 1/N 균등 너비 분할 (추후 가변 비율 고도화 예정) |
| **FRAME (Auto Layout: VERTICAL)** | `Supported` | Word Flow `Paragraph` / 1x1 Shaded `Table` | 카드 음영, 패딩, 테두리 보존 |
| **FRAME (Non-Auto Layout / 절대좌표)** | `Partially Supported` | Y축 오름차순 정렬 Flow 배치 | **한계**: 수평 병렬 요소가 세로로 순차 나열됨 (P1) |
| **GROUP** | `Supported` | 자식 요소 컨테이너화 (`ContainerElement`) | 계층 구조 및 상대 위치 보존 |
| **RECTANGLE (IMAGE Fill)** | `Supported` | Word 네이티브 `ImageRun` | 이미지 크기 및 비율 보존 |
| **RECTANGLE (Solid Fill / Stroke)** | `Partially Supported` | Word 1x1 Shaded `Table` (Card Box) | 모서리 곡률은 직각으로 근사 |
| **LINE** | `Supported` | Word 네이티브 문단 하단 테두리 구분선 | 100% 폭으로 렌더링됨 |
| **VECTOR / POLYGON / STAR** | `Fallback` | 기본 배경 Shape 또는 대체 도형 | 복잡한 패스는 일반 사각형으로 근사 |
| **BOOLEAN_OPERATION / SLICE** | `Unsupported` | 안전 스킵 및 미지원 리포팅 | 크래시 없이 건너뜀 |
| **COMPONENT / INSTANCE** | `Supported` | 내부 자식 렌더링 컨테이너 | 인스턴스 중첩 구조 보존 |

---

## 2. 스타일 및 효과 지원 현황

| Figma Style / Effect | 지원 상태 | 구현 방식 및 제약 사항 |
|---|:---:|---|
| **Font Family / Size / Weight** | `Supported` | Word 표준 글꼴 및 0.5pt 단위 매핑 |
| **Text Color (Solid)** | `Supported` | 6자리 16진수 HEX 컬러 매핑 |
| **Text Alignment (좌/중/우/양쪽)** | `Supported` | Word `AlignmentType` 1:1 매핑 |
| **Solid Background Fill** | `Supported` | Table Cell `Shading` (배경 음영) 매핑 |
| **Border Stroke (두께/색상/스타일)** | `Supported` | Word `TableBorder` (Single/Dashed/Dotted) 매핑 |
| **Corner Radius** | `Partially Supported` | Word 오픈XML 테이블 특성상 직각으로 렌더링됨 |
| **Box Shadow (드롭 섀도우)** | `Partially Supported` | 옅은 단색 테두리로 경계선 근사 |
| **Layer Blur / Background Blur** | `Unsupported` | Word OpenXML 표준 미지원 (스펙 한계) |
| **Blend Mode (Multiply, Overlay 등)** | `Unsupported` | 일반 불투명 솔리드 색상으로 대체 |
| **Gradient Fill (그라디언트)** | `Fallback` | 첫 번째 컬러 스탑 솔리드 색상으로 근사 |
| **Visible: false** | `Ignored` | 화면에 숨겨진 레이어는 완벽 배제 (누출 방지 검증 완료) |

---

## 3. 요약 통계 기준

엔진은 변환을 마칠 때마다 사용자에게 아래와 같은 통계 리포트를 투명하게 반환한다:
- `Total Nodes`: 검사된 총 노드 수
- `Supported`: 네이티브 손실 없이 변환된 노드 수
- `Partially Supported`: 구조는 보존되나 세부 효과가 근사된 노드 수
- `Unsupported`: 생략된 미지원 노드 수
- `Fallback`: 대체 그래픽으로 우회 렌더링된 노드 수
