# Phase 21 Ground Truth Analysis & Forensic Audit

## 1. 개요 및 배경

본 분석은 사용자가 직접 한컴오피스 2024 뷰어(Hancom Office 2024 Viewer)에서 수행한 실측 검증 결과를 최우선 진실(Primary Ground Truth)로 삼아 진행되었다.

자동화 테스트의 통과 여부와 관계없이 실제 애플리케이션에서 발생한 동작 차이를 분석하여, 왜 어떤 문서는 정상 열리고 어떤 문서는 즉시 비정상 종료(Crash)되었는지 그 기술적 메커니즘을 규명한다.

---

## 2. Stage별 실측 결과와 XML 구성 대조표

| Stage | 문서 내용 | 사용자 실측 결과 | 총 도형 수 | 주요 요소 구성 |
|---|---|---|---|---|
| **Stage 1** | Minimal Korean Text | **PASS (정상 열림)** | 3 | 배경 rect 1, 텍스트 rect 2 |
| **Stage 2** | Typography & Styling | **PASS (정상 열림)** | 3 | 배경 rect 1, 텍스트 rect 2 |
| **Stage 3** | Rectangles, Cards & Lines | **FAIL (오류 후 종료)** | 7 | 배경 rect 1, 텍스트 rect 1, line 2, 채우기/테두리 card 3 |
| **Stage 4** | Textbox, Oval & Vector | **FAIL (오류 후 종료)** | 9 | 배경 rect 1, 텍스트 card 2, oval 2, vector 3 |
| **Stage 5** | Images & Cropping | **PASS (정상 열림)** | 5 | 배경 rect 1, 텍스트 rect 1, pic 3 |
| **Stage 6** | Representative Report (Proposal) | **FAIL (오류 후 종료)** | 9 | 배경 rect 1, 텍스트/카드 rect 7, line 1, pic 1 |
| **Stage 7** | Customer Full Report (9 pages) | **FAIL (오류 후 종료)** | 797 | rect 689, line 83, oval 4, poly 8, pic 16 |

---

## 3. 정상군(Stage 1, 2, 5)과 실패군(Stage 3, 4, 6, 7)의 구조적 차이

### A. Stage 1, 2, 5가 성공한 이유
1. **공통 XML 프레임워크의 유효성 검증**:
   - `<hp:secPr>`이 `<hp:p>`의 첫 번째 `<hp:run charPrIDRef="0">` 내부에 정확히 위치함.
   - `<hh:head>` 내 폰트페이스의 언어 코드(`lang="HANGUL"`, `LATIN`, `HANJA` 등)가 대문자로 올바르게 직렬화됨.
   - 단락 속성(`<hh:paraPr>`) 및 글자 속성(`<hh:charPr>`)의 참조 ID가 올바름.
2. **도형 복잡도의 부재**:
   - Stage 1과 Stage 2의 모든 텍스트 요소는 `hasStroke = false`, `hasFill = false` 상태였음.
   - 사각형 직렬화 시 `lineShape`의 속성에 `width="undefined"`가 들어갔음에도 불구하고, 실제 테두리가 없었기 때문에 한컴 뷰어의 드로잉 파서가 GDI/DirectX 펜 객체를 할당하는 로직을 건너뜀.
3. **Stage 5 이미지 직렬화의 정확성**:
   - Phase 20에서 구현된 `<hp:imgRect>` 내 `<hc:pt0>~<hc:pt3>`, `<hp:imgClip>`, `<hp:inMargin>`, `<hp:imgDim>`, `<hc:img binaryItemIDRef="BIN0001">` 구조가 한컴 정품 규격과 100% 일치하여 완벽하게 렌더링됨.

---

### B. Stage 3이 실패한 이유: `undefined` 속성 유출

Phase 20의 `stage3-rect-line.hwpx`의 `section0.xml`을 역공학하여 추출한 실제 XML 스니펫:
```xml
<hp:rect id="5" zOrder="4" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="5" ratio="7">
  ...
  <hp:lineShape color="#undefined" width="undefined" style="undefined" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
  <hc:fillBrush><hc:winBrush faceColor="#EFF6FF" hatchColor="#999999" alpha="0"/></hc:fillBrush>
  <hp:drawText lastWidth="23000" name="s3_card1" editable="1"> ... </hp:drawText>
  ...
</hp:rect>
```

#### 발생 메커니즘
1. `s3_card1`은 `hasStroke = true` (테두리 1pt, 색상 `#3B82F6`) 및 `hasFill = true` (배경색 `#EFF6FF`)를 가짐.
2. `hwpxCanvasRenderer.ts` line 840에서 `renderRectXml`을 호출할 때 속성명을 `colorHex`, `width`, `style`로 넘겼으나, `renderRectXml` 메서드는 `lineColorHex`, `lineWidth`, `lineStyle`을 읽도록 구현되어 있었음.
3. 이로 인해 메서드 내부에서 세 변수가 모두 `undefined`로 평가되어 문자열 템플릿에 그대로 삽입됨:
   - `color="#undefined"`
   - `width="undefined"`
   - `style="undefined"`
4. 한컴오피스 2024 뷰어가 `s3_card1`을 파싱할 때, `hasStroke`에 따라 테두리를 그리기 위해 `width` 값을 정수(`unsignedInt`)로 변환 시도:
   - `"undefined"` 문자열은 유효한 정수가 아니므로 OWPML XSD 스키마 검증기 또는 내부 C++ 파서(`_wtoi`)에서 파싱 예외 발생.
   - 열거형 `style="undefined"` 역시 허용된 상수(`NONE`, `SOLID`, `DASH` 등)와 일치하지 않아 예외 발생.
5. 치명적 XML 파싱 오류로 인해 대화상자 *"파일을 읽거나 저장하는 데 오류가 발생했습니다"*가 출력되고 뷰어 프로세스가 즉시 종료됨.

---

### C. Stage 4가 실패한 이유: `<hp:oval>` 태그 불일치

Phase 20의 `stage4-textbox-oval-vector.hwpx`의 실제 XML:
```xml
<hp:oval id="3" zOrder="3" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="3" intervalDirty="0" hasArcPr="0" arcType="NORMAL">
  ...
  <hc:center x="4500" y="4500"/>
  <hc:ax1 x="4500" y="0"/>
  <hc:ax2 x="9000" y="4500"/>
  <hc:start1 x="0" y="0"/>
  <hc:end1 x="0" y="0"/>
  <hc:start2 x="0" y="0"/>
  <hc:end2 x="0" y="0"/>
  ...
</hp:oval>
```

#### 한컴 정품 HWPX 파일(`완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`) 역공학 대조
한컴오피스가 직접 생성한 파일 내의 실제 타원 객체:
```xml
<hp:ellipse intervalDirty="0" hasArcPr="0" arcType="NORMAL" id="276" zOrder="19" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="276">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="600" height="600"/>
  <hp:curSz width="600" height="600"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="300" centerY="300" rotateimage="1"/>
  <hp:renderingInfo>
    <hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:lineShape color="#000000" width="0" style="NONE" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
  <hc:fillBrush><hc:winBrush faceColor="#639922" hatchColor="#FFFFFF" alpha="0"/></hc:fillBrush>
  <hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>
  <hc:center x="300" y="300"/>
  <hc:ax1 x="600" y="300"/>
  <hc:ax2 x="300" y="600"/>
  <hc:start1 x="600" y="300"/>
  <hc:end1 x="600" y="300"/>
  <hc:start2 x="600" y="300"/>
  <hc:end2 x="600" y="300"/>
  <hp:sz width="600" height="600" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="1" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="31350" horzOffset="4500"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
</hp:ellipse>
```

#### 대조 결과
1. **태그명 불일치**: KS X 6101 및 한컴 OWPML의 정식 요소명은 `<hp:ellipse>`이며, `<hp:oval>`은 존재하지 않는 불법 태그임.
2. **좌표 체계 차이**: 정품 한컴 타원의 경우 시작/끝점(`start1`, `end1`, `start2`, `end2`)이 `(0, 0)`이 아니라 장축의 우측 끝점인 `(cx + rx, cy) = (width, cy)`로 지정됨.
3. 따라서 한컴 뷰어가 `<hp:oval>`을 만나는 순간 스키마 오류로 문서 로딩을 중단하고 종료됨.

---

### D. Stage 6 및 Stage 7이 실패한 이유: 복합 결함의 누적

- **Stage 6 (제안서 1페이지)**: 7개의 카드 및 패널 전체에 `width="undefined"`, `style="undefined"`, `color="#undefined"`가 포함되어 있었음.
- **Stage 7 (고객 9페이지 종합 리포트)**:
  - 689개의 직사각형/카드 전체에 `undefined` 속성 유출.
  - 4개의 도넛 차트 원형이 `<hp:oval>`로 직렬화되어 불법 태그 발생.
  - 83개의 구분선에 비표준 `isReverseHV="0"` 주입.
  - 수백 개의 스키마 오류가 중첩되어 한컴 뷰어가 첫 페이지를 렌더링하기도 전에 즉각 충돌함.

---

## 4. 정품 한컴 문서의 구분선(Divider Line) 표현 포렌식 결과

정품 한컴 문서(`report-1차-진단-편집가능-최종보정.hwpx`) 전체 837개 도형을 역공학한 결과:
- **총 직사각형(`<hp:rect>`)**: 837개
- **높이 400 HWPU 이하의 얇은 직사각형**: **55개** (높이 75 HWPU = 1pt, 높이 150 HWPU = 2pt)
- **독립 선(`<hp:line>`)**: **0개**

한컴오피스 자체도 실제 문서 서식이나 디자인 템플릿의 가로/세로 구분선(Divider)을 `<hp:line>` 대신 **채워진 얇은 직사각형(`<hp:rect>`)**으로 구성하고 있음을 확인하였다.
이는 직사각형 객체가 모든 OWPML 호환 뷰어 및 편집기에서 가장 안정적이고 부작용 없이 렌더링되기 때문이다.
Phase 21에서는 일반 `<hp:line>`을 순수 표준 규격으로 복구함과 동시에, 사각형 기반 구분선과의 상호 운용성을 확보하였다.

