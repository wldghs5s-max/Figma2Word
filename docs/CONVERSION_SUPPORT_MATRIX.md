# Figma → Word 변환 지원 매트릭스 (CONVERSION_SUPPORT_MATRIX)

본 문서는 현재 Figma2Word 변환 엔진의 기능별 지원 현황 및 매핑 전략을 명시한다.

---

## 1. 노드 타입 지원 현황

| Figma Node Type | 지원 상태 | 변환 전략 (Conversion Strategy) | 비고 |
|---|---|---|---|
| **TEXT (폰트크기 ≥ 16pt / Title)** | `Supported` | Word 네이티브 `Heading` (Level 1~3) | 폰트, 크기, 볼드, 색상, 정렬 완벽 보존 |
| **TEXT (일반 본문)** | `Supported` | Word 네이티브 `Paragraph` & `TextRun` | 텍스트 편집 및 스타일 유지 |
| **FRAME (Auto Layout: HORIZONTAL)** | `Supported` | Word 네이티브 1행 N열 `Table` | 반응형 가로 다단 컬럼 근사 |
| **FRAME (Auto Layout: VERTICAL)** | `Supported` | Word Flow `Paragraph` / 1x1 Shaded `Table` | 내부 패딩 및 배경 음영 보존 |
| **FRAME (Non-Auto Layout / 절대좌표)** | `Partially Supported` | Y축 오름차순 정렬 Flow 배치 (Hybrid) | 겹침 없는 순차 문서 흐름 보장 |
| **GROUP** | `Supported` | 자식 요소 컨테이너화 (`ContainerElement`) | 계층 구조 보존 |
| **RECTANGLE (IMAGE Fill)** | `Supported` | Word 네이티브 `ImageRun` | 이미지 크기 및 비율 보존 |
| **RECTANGLE (Solid Fill / Stroke)** | `Partially Supported` | Word 1x1 Shaded `Table` (Card Box) | 모서리 곡률(CornerRadius)은 직각 근사 |
| **LINE** | `Supported` | Word 네이티브 문단 하단 테두리 구분선 | 선 두께 및 색상 보존 |
| **VECTOR / POLYGON / STAR** | `Fallback` | 기본 배경 Shape 또는 SVG/PNG 대체 | 복잡한 패스는 일반 사각형/아이콘 근사 |
| **BOOLEAN_OPERATION** | `Fallback` | 단일 결합 Shape 대체 | 추후 이미지 내보내기 연동 예정 |
| **COMPONENT / INSTANCE** | `Supported` | 내부 자식 렌더링 컨테이너 | 인스턴스 오버라이드 반영 |

---

## 2. 스타일 및 효과 지원 현황

| Figma Style / Effect | 지원 상태 | 구현 방식 |
|---|---|---|
| **Font Family / Size / Weight** | `Supported` | Word 표준 글꼴 및 하프포인트 단위 매핑 |
| **Text Color (Solid)** | `Supported` | 6자리 16진수 HEX 컬러 매핑 |
| **Text Alignment (좌/중/우/양쪽)** | `Supported` | `AlignmentType` 1:1 매핑 |
| **Solid Background Fill** | `Supported` | Table Cell `Shading` (배경 음영) 매핑 |
| **Border Stroke (두께/색상)** | `Supported` | Word `TableBorder` (Single/Dashed/Dotted) |
| **Corner Radius** | `Partially Supported` | Word 오픈XML 테이블 특성상 직각으로 렌더링되나 박스 구조는 보존 |
| **Box Shadow (드롭 섀도우)** | `Partially Supported` | 경계선 강조 또는 옅은 테두리로 근사 |
| **Layer Blur / Background Blur** | `Unsupported` | Word OpenXML 표준 미지원 (MVP 스코프 제외) |
| **Blend Mode (Multiply, Overlay 등)** | `Unsupported` | 기본 불투명 색상으로 대체 (MVP 스코프 제외) |
| **Gradient Fill (그라디언트)** | `Fallback` | 대표 솔리드 색상(첫 번째 컬러 스탑)으로 근사 |

---

## 3. 요약 통계 기준

엔진은 변환을 마칠 때마다 사용자에게 아래와 같은 통계 리포트를 투명하게 반환한다:
- `Total Nodes`: 검사된 총 노드 수
- `Supported`: 네이티브 손실 없이 변환된 노드 수
- `Partially Supported`: 구조는 보존되나 세부 효과가 근사된 노드 수
- `Unsupported`: 생략된 미지원 노드 수
- `Fallback`: 대체 그래픽으로 우회 렌더링된 노드 수
