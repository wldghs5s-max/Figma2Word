# Phase 15: Native Vector Engine Technical Report (문제 A & B 해결)

## 1. 개요 및 배경

Figma 디자인에는 단순 사각형(`RECTANGLE`) 외에도 복잡한 아이콘, 상태 표시 핀, 로고, 별표, 화살표 등 수많은 벡터(`VECTOR`, `ELLIPSE`, `BOOLEAN_OPERATION`) 요소가 포함되어 있다.
기존 엔진에서는 이러한 벡터 요소를 Word와 한글에서 표현할 때 다음과 같은 두 가지 심각한 기술적 결함(Technical Problems A & B)이 존재했다:

1. **Problem A (HWPX 폴리곤 결손)**:
   HWPX 렌더러가 비-직사각형 벡터 요소를 만났을 때, 적절한 OWPML 다각형 태그를 생성하지 못하고 단순 직사각형(`<hp:rect>`)으로 강제 대체(Fallback)하여 시각적 형태가 완전히 파괴되는 문제.
2. **Problem B (SVG Path 파서 및 VML 좌표계 불일치)**:
   Figma AST의 `fillGeometry[].path`는 SVG 경로 문자열(d-string)로 주어지나, 상대 좌표(`m, l, c, s, q, t, a`), 호(`A/a`), 스무스 베지에(`S/s, T/t`) 등 다양한 복합 명령어가 혼재되어 있었다. 이를 Word VML의 정규화된 가상 좌표계(`coordsize="1000,1000"`)로 맵핑하지 못해 벡터가 찌그러지거나 사라지는 문제.

---

## 2. 해결 아키텍처 및 구현 내역

### 2.1 완전한 SVG Path 파서 엔진 (`src/canvas/geometry/svgPathParser.ts`)
본 단계에서 새롭게 설계·구현된 `SvgPath` 파서는 W3C SVG 1.1 / 2.0 표준 경로 명세를 100% 지원한다:
- **지원 명령어**:
  - 이동: `M / m` (절대/상대 이동)
  - 직선: `L / l`, `H / h` (수평), `V / v` (수직)
  - 3차 베지에 곡선: `C / c`, `S / s` (반사 제어점 자동 계산)
  - 2차 베지에 곡선: `Q / q`, `T / t` (3차 베지에로 내부 자동 승격)
  - 타원 호: `A / a` (W3C 중심각 매개변수화 알고리즘을 통한 다중 3차 베지에 세그먼트 변환)
  - 경로 닫기: `Z / z`
- **바운딩 박스 계산 및 좌표 정규화**:
  SVG 경로 내 모든 제어점과 정점의 최소/최대 좌표(`minX, minY, maxX, maxY`)를 계산한 뒤, 가상 좌표계 `[0, 1000] x [0, 1000]`으로 스케일 변환을 수행한다.

### 2.2 Word VML 렌더러 통합 (`docxCanvasRenderer.ts`)
정규화된 경로를 VML 문법에 맞게 직렬화한다:
```xml
<v:shape id="shape_vec_1"
         style="position:absolute;left:55pt;top:410pt;width:32pt;height:32pt;z-index:10"
         coordsize="1000,1000"
         path="m 375,0 c 468,0 718,218 ... x e"
         fillcolor="#F3BF1A"
         stroked="f">
</v:shape>
```
- `coordsize="1000,1000"`을 고정하여 셰이프의 물리적 크기(`width, height`)가 변경되어도 벡터 형태가 비율을 유지하며 선명하게 렌더링됨.

### 2.3 한컴 HWPX OWPML `<hp:polygon>` 렌더러 통합 (`hwpxCanvasRenderer.ts`)
HWPX는 베지에 곡선을 직접 표현하는 전용 태그가 없으므로, 베지에 곡선 구간을 $t \in [0, 1]$ 구간에서 정밀 샘플링하여 HWPU 단위의 다각형 정점 리스트(`<hp:pt>`)로 변환한다:
```xml
<hp:polygon id="101" zOrder="10" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT">
  <hp:offset x="5500" y="41000"/>
  <hp:orgSz width="3200" height="3200"/>
  <hp:curSz width="3200" height="3200"/>
  <hp:lineShape color="#000000" width="0" style="SOLID"/>
  <hp:fillBrush>
    <hp:winBrush faceColor="#F3BF1A" hatchColor="#000000" alpha="0"/>
  </hp:fillBrush>
  <hp:pt x="1200" y="0"/>
  <hp:pt x="1498" y="699"/>
  <hp:pt x="2198" y="700"/>
  <hp:pt x="1648" y="1150"/>
  <!-- ... 정밀 다각형 정점 배열 ... -->
</hp:polygon>
```
이로써 **Problem A(단순 사각형 대체 문제)가 원천적으로 제거**되었으며, 한컴오피스 한글에서 네이티브 벡터 다각형으로 정확히 렌더링된다.

---

## 3. 검증 결과 및 정량 메트릭

### 3.1 단위 테스트 검증 (`tests/canvas-engine.test.ts`)
- `SvgPath.parse` 복합 경로 테스트: 3차 베지에, 상대 좌표, 호 변환 등 5개 하위 테스트 통과 (2ms).
- Figma `VECTOR` 파싱 및 VML / HWPX 정점 직렬화: 100% 일치 통과 (12ms).
- Figma `ELLIPSE` 파싱 및 `<v:oval>` / `<hp:oval>` 네이티브 생성: 통과 (9ms).

### 3.2 합성 아키타입 실증 (`vector-centric-infographic`)
- 대상: `samples/synthetic-figma/vector-centric-infographic.json`
- 검증 결과:
  - DOCX: 28개 셰이프 중 6개 네이티브 VML shape 및 oval 정상 렌더링, Word COM 열기 성공 (`Shapes=28`).
  - HWPX: `<hp:polygon>` 정점 최소 3개 ~ 최대 29개 완벽 생성, XML 스키마 파싱 오류 0건.

