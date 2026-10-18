# Phase 23: REA Second Targeted Reverse Engineering Study

## 1. 정품 한컴 레퍼런스 HWPX 심층 분석

### 1.1 분석 대상
- 레퍼런스 문서: `완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`
- 총 개체 수: 837 rects, 429 drawTexts, 22 pics, 4 ellipses, 0 lines, 0 polygons.

### 1.2 핵심 발견 사항 (Key Findings)

#### 1) 투명 텍스트 박스의 `fillBrush` 직렬화
- 정품 한컴 문서는 배경색이 없는 텍스트 박스(`<hp:rect>`)에 대해 다음과 같이 직렬화함:
  ```xml
  <hc:fillBrush/>
  ```
- 반면 기존 엔진(Phase 22까지)은 다음과 같이 직렬화하고 있었음:
  ```xml
  <hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/></hc:fillBrush>
  ```
- **역공학 결론**: 한컴 뷰어 엔진은 `<hc:winBrush>` 요소가 자식으로 존재할 경우 `faceColor="none"`이라 할지라도 `hatchColor`와 알파 채널을 파싱하며, 일부 렌더링 파이프라인에서 사각형 외곽 경계 상자(1px 가이드선 또는 연회색 테두리)를 표시함. 반면 `<hc:fillBrush/>` (self-closing)로 직렬화할 경우 완전 투명 개체로 인식되어 테두리 잔상이 일체 나타나지 않음.

#### 2) `lineWrap` 속성과 한컴 텍스트 레이아웃
- 정품 레퍼런스 문서의 429개 `drawText` 조사 결과:
  - 100%의 `<hp:subList>` 요소가 `textDirection="HORIZONTAL"`을 가짐.
  - 정품 문서에서 너비가 제한된 본문 및 다중 행 텍스트는 `lineWrap="BREAK"` 또는 여유 너비(`textWidth`)를 가진 상태에서 `SQUEEZE`를 적용함.
  - Phase 22 엔진에서는 모든 요소에 일괄적으로 `lineWrap="SQUEEZE"`를 적용하여, Figma에서 추출된 너비가 글꼴 메트릭보다 1px이라도 좁을 경우 글자 간격(Tracking/Kerning)을 강제로 압축하여 글자가 한 줄로 겹치거나 수평으로 찌그러지는 현상이 발생함.
  - **역공학 결론**: 텍스트 박스에는 `lineWrap="BREAK"`를 기본 적용하여 박스 폭에 맞추어 단어 단위로 자연스럽게 줄바꿈되도록 해야 함.

#### 3) 수직 정렬(`vertAlign`) 및 텍스트 여백(`textMargin`)
- 정품 레퍼런스 문서 분석 결과:
  - `drawText`의 98% 이상이 `vertAlign="TOP"`을 사용하며, Figma 상의 실제 텍스트 Bounding Box Y 좌표(`vertOffset`)에 정확히 배치됨.
  - 상단 여백(`top`)은 텍스트의 실제 위치에 따라 0 또는 수 pt 단위의 오프셋만 유지함.
  - 부모 사각형과 함께 배치되는 텍스트의 경우, 텍스트 상자를 부모 사각형 크기로 강제 확장하지 않고 텍스트 본래의 크기로 유지함.
