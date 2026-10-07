# Figma → Word 변환 지원 매트릭스 (CONVERSION_SUPPORT_MATRIX)

- **갱신 일시**: 2026-10-07 (Phase 4.1 실제 Figma 호환성 및 LayoutEngine 안정화 완료 기준)

본 문서는 Figma2Word 변환 엔진의 노드 타입 및 스타일 속성별 실제 지원 수준과 변환 전략을 명시한다.

---

## 1. 노드 타입 지원 현황

| Figma Node Type | 지원 상태 | 변환 전략 (Conversion Strategy) | 비고 / 한계점 |
|---|:---:|---|---|
| **CANVAS** | `Supported` | **Phase 4.1 신규**: 하위 프레임 및 디자인 요소 전수 재귀 탐색 | `node-id=0-1` 등 캔버스 단위 진입 시에도 모든 자식 정상 파싱 |
| **TEXT (제목 계열)** | `Supported` | Word 네이티브 `Heading` (Level 1~3) | 폰트, 크기, 굵기, 색상, 정렬 보존. **Phase 4.1**: 여백 폭발 방지 spacing 최적화 |
| **TEXT (일반 본문)** | `Supported` | Word 네이티브 `Paragraph` & `TextRun` | 텍스트 완전 편집 가능. **Phase 4.1**: 여백 폭발 방지 spacing 최적화 |
| **FRAME (Auto Layout: HORIZONTAL)** | `Supported` | Word 네이티브 1행 N열 `Table` | 고정/가변 폭 비례 컬럼 너비(`columnWidths`) 반영 |
| **FRAME (Auto Layout: VERTICAL)** | `Supported` | Word Flow `Paragraph` / 1x1 Shaded `Table` | 카드 음영, 내부 패딩, 테두리 보존 |
| **FRAME (Non-Auto Layout / 절대좌표)** | `Supported` | Bounding Box Interval 수평 클러스터링 | 나란한 2~3열 카드가 다열 테이블로 자동 복원 |
| **CONTAINMENT OVERLAY (카드/헤더)** | `Supported` | **Phase 4.1 개선**: 다단 카드 가로 배치 보존 + 헤더 오버레이 가로 자동 추론 및 X축 정렬 | 배경 사각형 위에 올라간 복합 레이아웃 온전 보존 |
| **GROUP** | `Supported` | 자식 요소 컨테이너화 (`ContainerElement`) | 계층 구조 및 상대 위치 보존 |
| **RECTANGLE (IMAGE Fill / S3)** | `Supported` | Word 네이티브 `ImageRun` | REST API를 통한 원격 S3 이미지 자동 다운로드 및 임베딩 |
| **RECTANGLE (Solid Fill / Card Box)** | `Supported` | Word 1x1 Shaded `Table` (Card Box) | 겹쳐진 텍스트를 카드 내부로 폴딩 |
| **LINE** | `Supported` | Word 네이티브 문단 테두리 구분선 | 단색 선 굵기 및 색상 보존 |
| **COMPONENT / INSTANCE** | `Supported` | 내부 자식 렌더링 컨테이너 | 중첩 구조 및 인스턴스 오버라이드 보존 |
| **SECTION** | `Supported` | 논리적 상위 컨테이너로 매핑 | 문서 섹션 분할에 활용 |
| **VECTOR / POLYGON / STAR** | `Fallback` | 기본 배경 Shape 또는 대체 도형 | 복잡한 패스는 일반 사각형으로 근사 |
| **BOOLEAN_OPERATION / SLICE** | `Unsupported` | 안전 스킵 및 미지원 리포팅 | 크래시 없이 건너뜀 |

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

## 3. 요약 통계 기준 및 빈 문서 보호

- **빈 문서 보호 (Empty Document Guard)**: 변환 가능한 가시적 요소가 0개일 경우, 10KB 크기의 의미 없는 빈 DOCX를 생성하지 않고 사용자에게 원인과 권장 조치를 명확히 고지합니다.
- 변환 완료 시 통계 리포트 반환: `Total Nodes`, `Supported`, `Partially Supported`, `Unsupported`, `Fallback`.
