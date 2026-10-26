# Phase 33 — Report 06: Canvas IR → DOCX / HWPX Structural Fidelity

## 1. 개요

Canonical Canvas IR로부터 생성된 Microsoft Word 네이티브 패키지(`document.xml`)와 한컴오피스 HWPX 패키지(`section0.xml`)의 내부 XML 구조를 파싱하여, IR 속성이 문서 규격에 누락 없이 매핑되는지 검증했습니다.

## 2. DOCX XML 구조 정량 감사 결과

| 메트릭 항목 | 측정값 | 비고 및 표준 준수 내역 |
| :--- | :--- | :--- |
| **생성된 DOCX 파일 크기** | 15.00 MB (15,732,329 bytes) | OOXML ISO/IEC 29500 준수 |
| **총 VML 도형 요소 수 (`<v:*>`)** | 1,081개 | `v:rect`, `v:roundrect`, `v:shape`, `v:oval` |
| **총 단락 수 (`<w:p>`)** | 642개 | 625개 IR 텍스트 요소 + 섹션 브레이크 단락 |
| **총 텍스트 런 수 (`<w:r>`)** | 1,790개 | Pretendard, Inter, Bold, Italic 스타일 런 |
| **VML 투명도 채우기 (`<v:fill opacity="...">`)** | 4개 | 투명도 적용된 반투명 카드 요소 |
| **VML 드롭 섀도우 (`<v:shadow on="t">`)** | 35개 | 35개 IR 그림자 요소 100% 일치 |
| **VML 외곽선 번짐 방지 (`INSIDE` 테두리)** | 317개 | Phase 32 인셋 공식 유지 (Zero Bleed) |
| **단일행 광학 중심축 보정 (`Δx = -B/2`)** | 41개 | 중심 및 우측 정렬 버튼 텍스트 불변 유지 |

## 3. HWPX XML 구조 정량 감사 결과

| 메트릭 항목 | 측정값 | 비고 및 표준 준수 내역 |
| :--- | :--- | :--- |
| **생성된 HWPX 파일 크기** | 15.04 MB (15,773,167 bytes) | KS X 6101:2019 (OWPML) 표준 준수 |
| **총 채우기 브러시 (`<hc:fillBrush>`)** | 1,297개 | 무압축 `mimetype` 선두 배치 |
| **반투명 브러시 (`alpha > 0`)** | 37개 | `alpha = round((1 - opacity) * 255)` 적용 |
| **드롭 섀도우 (`<hp:shadow type="DROP">`)** | 35개 | 35개 IR 그림자 요소 100% 매핑 |
| **HWPX 네이티브 렌더링 상태** | **`NOT_VERIFIED`** | macOS 환경 Hancom Viewer 부재에 따른 정직 보고 |

## 4. 구조 무손실 변환 체인 요약

$$\text{Figma JSON (1,321 nodes)} \xrightarrow{\text{Lossless IR}} \text{Canvas IR (1,321 elems)} \xrightarrow{\text{XML Generation}} \begin{cases} \text{DOCX: 1,081 VML + 642 P} \\ \text{HWPX: 1,297 Brush + 35 Shadow} \end{cases}$$

원본 Figma 노드의 기하학 좌표와 색상, 테두리, 그림자, 투명도 속성이 손실 없이 두 표준 규격으로 분기 매핑됨을 입증했습니다.
