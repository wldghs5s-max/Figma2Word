# Phase 22 Root Cause Forensic Evidence

## 1. 실패군 vs 성공군 상관관계 분석

Phase 21 산출물의 실제 한컴오피스 2024 뷰어 검증 결과는 명확한 패턴을 보였다.

| 산출물 | 뷰어 결과 | 포함된 도형 요소 | `secCnt` | 특징 |
|---|---|---|---|---|
| Stage 1 | **PASS** | rect(배경) 3 | 1 | 순수 텍스트, 라인 없음 |
| Stage 2 | **PASS** | rect(배경) 3 | 1 | 서식 텍스트, 라인 없음 |
| Stage 5 | **PASS** | rect 2, pic 3 | 1 | 이미지, 라인 없음 |
| `diag-rect-only.hwpx` | **PASS** | rect 3 | 1 | 카드, 필(라운드), 라인 없음 |
| Stage 3 | **FAIL** | rect 5, **line 2** | 1 | 구분선 및 점선 포함 |
| Stage 4 | **FAIL** | rect 3, **line 2**, ellipse 2, polygon 2 | 1 | 텍스트박스, 타원, 벡터선 |
| Stage 6 | **FAIL** | rect 7, **line 1**, pic 1 | 1 | 제안서 내 구분선 1개 포함 |
| Stage 7 | **FAIL** | rect 689, **line 83**, pic 16, poly 8, el 4 | **9** | 라인 83개, `secCnt="9"` |

**결론적 상관관계**:
1. 성공한 모든 파일(Stage 1, 2, 5, `diag-rect-only`)에는 `<hp:line>`이 단 1개도 존재하지 않는다.
2. 실패한 모든 파일(Stage 3, 4, 6, 7)에는 예외 없이 `<hp:line>`이 포함되어 있다.
3. Stage 6의 경우 다른 복합 요소가 거의 없고 오직 `line 1개`가 추가되었을 뿐인데 즉시 뷰어가 종료되었다.
4. Stage 7은 83개의 `line` 외에도 `secCnt="9"`라는 치명적 헤더 불일치를 보유하고 있었다.

---

## 2. 결함 심층 포렌식 및 스펙 대조

### 결함 1: OWPML LineType의 하위 태그 불일치 (RC-1)
- **발생 위치**: `src/canvas/renderer/hwpxCanvasRenderer.ts` -> `renderLineXml()`
- **기존 직렬화**:
  ```xml
  <hp:line id="3" ...>
    ...
    <hp:shadow type="NONE" .../>
    <hc:pt0 x="0" y="0"/>
    <hc:pt1 x="49500" y="200"/>
    <hp:sz width="49500" height="200" .../>
  </hp:line>
  ```
- **OWPML 공식 구현체 대조** (`kr.dogfoot.hwpxlib.writer.section_xml.object.LineWriter.java`):
  ```java
  xsb().openElement(ElementNames.hp_line);
  writeAttributeForDrawingObject(line);
  xsb().attribute(AttributeNames.isReverseHV, line.isReverseHV());
  writeChildrenForDrawingObject(line);
  if (line.startPt() != null) {
      point(ElementNames.hc_startPt, line.startPt());
  }
  if (line.endPt() != null) {
      point(ElementNames.hc_endPt, line.endPt());
  }
  writeChildrenForShapeObject(line);
  ```
- **규명된 사실**:
  - OWPML에서 선의 끝점 좌표 태그는 `<hc:startPt>`와 `<hc:endPt>`이다.
  - `<hc:pt0>`과 `<hc:pt1>`은 `<hp:rect>`나 `<hp:imgRect>`의 4개 꼭짓점(pt0~pt3)에만 유효한 태그다.
  - 한컴 파서는 `<hp:line>` 내부에서 `<hc:pt0>`을 발견하는 순간 미등록 하위 요소 예외를 발생시키고 종료된다.
  - 또한 수직/수평선의 방향 반전을 방지하는 `isReverseHV="0"` 속성이 필수다.

### 결함 2: 정품 한컴 문서의 구분선(Divider) 실제 구현
- **정품 한컴 레퍼런스 분석** (`완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`, 863개 도형):
  - 정품 문서 전체에서 `<hp:line>` 사용 빈도: **0건**
  - 높이 400 HWPU 이하의 얇은 직사각형 사용 빈도: **83건**
    - `w=51450, h=75` (수평 구분선, 두께 0.75pt)
    - `w=51450, h=150` (강조 구분선, 두께 1.5pt)
    - `w=75, h=2925` (수직 구분선)
  - 채우기: `<hc:fillBrush><hc:winBrush faceColor="#E4E4E7" .../></hc:fillBrush>`
  - 선 모양: `<hp:lineShape color="#000000" width="0" style="NONE" .../>`
- **시사점**:
  한컴 자체 소프트웨어도 문서 호환성과 렌더링 안정성을 위해 보고서 내의 수평/수직 구분선을 선 객체(`<hp:line>`)가 아닌 얇은 채움 사각형(`<hp:rect>`)으로 안전하게 직렬화하고 있다.

### 결함 3: 다중 페이지 문서의 `secCnt` 불일치 (RC-2)
- **발생 위치**: `hwpxCanvasRenderer.ts` -> `this.buildHeaderXml(..., doc.pages.length || 1)`
- **현상**: Stage 7은 9페이지 문서이므로 `secCnt="9"`가 기록됨.
- **실제 패키지 구조**:
  - `Contents/section0.xml` 단 1개 파일만 존재.
  - `Contents/content.hpf`의 `<opf:spine>`에도 `section0`만 등록됨.
- **파서 동작**:
  한컴오피스는 `secCnt="9"`를 읽으면 `section0.xml`부터 `section8.xml`까지 9개의 구역 파일을 순회하여 파싱을 시도한다. 파일이 없으므로 *"파일을 읽거나 저장하는 데 오류가 발생했습니다"*가 발생한다.
- **정품 레퍼런스 대조**: 정품 9페이지 보고서 또한 9개 페이지 전체가 `Contents/section0.xml` 1개에 담겨 있으며, `header.xml`의 `secCnt`는 명확히 `"1"`로 기록되어 있다.

### 결함 4: `charPrList.length === 0`일 때의 기본 문자 속성 결함 (RC-4)
- **현상**: 도형만 있고 텍스트가 없는 진단 문서에서 `hh:fontRef`만 방출되고 `hh:ratio`, `hh:spacing`, `hh:relSz`, `hh:offset`이 누락됨.
- **영향**: 독립 진단 파일의 스키마 유효성을 훼손함.
