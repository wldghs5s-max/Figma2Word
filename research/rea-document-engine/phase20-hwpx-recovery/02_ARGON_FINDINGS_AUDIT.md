# Phase 20 Audit of Web Argon Forensic Findings

웹 Argon이 제시한 HWPX 엔진 결함 가설(A~I)을 **정품 한컴오피스 2024 산출물(`완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`)**, **공식 OWPML / KS X 6101 스키마**, 그리고 **독립 오픈소스 구현체(`edwardkim/rhwp` Issue #1598)**와 대조 분석한 감사 결과이다.

---

## 1. 종합 판정 매트릭스 (Audit Matrix)

| 구분 | Argon 진단 항목 | 사실 여부 판정 | 조치 사항 | 근거 소스 |
|---|---|---|---|---|
| **A** | `hp:secPr`의 부모 위치 (`hp:p` 직하 오류) | **CONFIRMED** (확정) | `<hp:p>` 하위 `<hp:run charPrIDRef="0">` 내부로 캡슐화 | 정품 한컴 HWPX & OWPML Section.xsd |
| **A** | `hp:secPr` 부속 요소 누락 (`footNotePr` 등) | **CONFIRMED** (확정) | 8대 표준 자식 요소 및 `<hp:ctrl><hp:colPr>` 추가 | 정품 한컴 HWPX section0.xml |
| **B** | 도형 자식 요소의 엄격한 순서(Sequence) 오류 | **CONFIRMED** (확정) | `offset`부터 `outMargin`까지 15단계 순서 엄격 적용 | KS X 6101 & 정품 한컴 HWPX |
| **B** | `hp:shadow`, `hp:sz`, `hp:outMargin` 누락 | **CONFIRMED** (확정) | 모든 개체에 표준 속성 완비하여 직렬화 헬퍼 구축 | 정품 한컴 HWPX shape block |
| **C** | `hp:rect`의 `hc:pt0`~`hc:pt3` 기하 좌표 누락 | **CONFIRMED** (확정) | `<hc:pt0>`~`<hc:pt3>` 기하 좌표 자식 요소 명시 | 정품 한컴 HWPX `<hp:rect>` |
| **D** | `hp:oval`의 사각형 재사용 및 전용 지오메트리 부재 | **CONFIRMED** (확정) | `hc:center`, `hc:ax1`, `hc:ax2`, `hc:start1..end2` 전용 직렬화 | rhwp #1598 & OWPML Drawing.xsd |
| **E** | `hp:line`의 레거시 속성 `isReverseHWP97` | **CONFIRMED** (확정) | KS X 6101 표준 `isReverseHV="0"`으로 교정 | OWPML Line.xsd & Hancom 2024 |
| **E** | `hp:line` 좌표의 네임스페이스 (`hp:pt0` vs `hc:pt0`) | **CONFIRMED** (확정) | Core 네임스페이스인 `<hc:pt0>`, `<hc:pt1>`으로 정정 | OWPML HCDatatypes.xsd |
| **E** | `hp:polygon`의 `<hp:pt>` 네임스페이스 오류 | **CONFIRMED** (확정) | Core 네임스페이스인 `<hc:pt x="..." y="..."/>`로 정정 | OWPML HCDatatypes.xsd |
| **F** | 도형 ID의 문자열 생성 (`1_1`, `1_1_1`) | **CONFIRMED** (확정) | 순수 `unsignedInt` 발급기(`nextId()`)로 전면 교체 | OWPML `id` / `instid` XSD 타입 정의 |
| **G** | `hp:pic` 내 비표준 `binRef` 및 `<hp:inImgDim>` | **CONFIRMED** (확정) | `binRef` 및 `inImgDim` 삭제, `binaryItemIDRef` 유지 | 정품 한컴 HWPX section0.xml |
| **G** | `hp:pic`의 `imgRect` 속성 표기 오류 | **CONFIRMED** (확정) | `<hp:imgRect><hc:pt0..3/></hp:imgRect>` 자식 구조화 | 정품 한컴 HWPX `<hp:pic>` |
| **H** | 헤더 언어 대문자 열거형 (`lang="HANGUL"`) | **CONFIRMED** (확정) | 대문자 7개 열거형(`HANGUL`, `LATIN` 등) 반영 | 정품 한컴 HWPX header.xml |
| **H** | 헤더 루트 속성 `secCnt` 누락 | **CONFIRMED** (확정) | `<hh:head ... secCnt="${secCnt}">` 추가 | 정품 한컴 HWPX header.xml |
| **I** | 줄간격 단위 혼용 | **PROBABLE** (조건부) | 고정밀 Fixed는 `HWPUNIT`, 비율은 `PERCENT` 분기 유지 | 기존 렌더러 로직 유지 및 정밀도 보강 |

---

## 2. 상세 감사 및 대조 증거

### A. 섹션 구조 및 `<hp:secPr>` 위치
- **Argon 의견**: `<hp:secPr>`가 문단(`<hp:p>`)의 직계 자식으로 들어가면 스키마 위반이며, `<hp:run>` 안에 들어가야 한다.
- **실측 검증**: 정품 한컴 HWPX 파일 `완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`의 `Contents/section0.xml` 첫 행 실측:
  ```xml
  <hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0">
      <hp:secPr id="" textDirection="HORIZONTAL" ...>
        <hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>
        ...
      </hp:secPr>
      <hp:ctrl>
        <hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCnt="1" sameSz="1" sameGap="0"/>
      </hp:ctrl>
    </hp:run>
  ```
- **결론**: **Argon 의견이 100% 사실로 확인됨.** `<hp:p>`의 내용 모델은 `(hp:run)*`이므로 직계 자식으로 `hp:secPr`가 오면 XML 유효성 검사에서 파싱 실패를 유발함.

### B. 도형 공통 자식 요소 순서 (Element Sequence)
- **Argon 의견**: XML Schema sequence는 요소 순서가 엄격한데, 기존 렌더러는 `renderingInfo` 뒤에 바로 `pos`가 오거나 `lineShape`가 뒤섞여 있다.
- **실측 검증**: 정품 한컴 파일의 `<hp:rect>` 실측:
  1. `hp:offset`
  2. `hp:orgSz`
  3. `hp:curSz`
  4. `hp:flip`
  5. `hp:rotationInfo`
  6. `hp:renderingInfo`
  7. `hp:lineShape`
  8. `hc:fillBrush`
  9. `hp:drawText` (있을 경우)
  10. `hp:shadow`
  11. `hc:pt0`, `hc:pt1`, `hc:pt2`, `hc:pt3` (지오메트리)
  12. `hp:sz`
  13. `hp:pos`
  14. `hp:outMargin`
- **결론**: **Argon 의견이 100% 사실로 확인됨.** 해당 순서대로 모든 도형 직렬화 헬퍼(`renderRectXml`, `renderOvalXml`, `renderLineXml`, `renderPolygonXml`, `renderPicXml`)를 전면 재구축함.

### C & D. 타원 및 전용 지오메트리
- **Argon 의견**: 타원을 `hp:oval`로 태그만 바꾸면 안 되며, `hc:center`, `hc:ax1`, `hc:ax2`, `hc:start1..end2` 전용 지오메트리가 필요하다.
- **실측 검증**: `rhwp` Issue #1598 및 정품 한컴오피스 스키마 실측:
  - 타원 개체는 `intervalDirty="0"`, `hasArcPr="0"`, `arcType="NORMAL"` 속성을 가짐.
  - 지오메트리 요소:
    - `<hc:center x="cx" y="cy"/>`
    - `<hc:ax1 x="cx" y="0"/>` (수직 반경 축)
    - `<hc:ax2 x="w" y="cy"/>` (수평 반경 축)
    - `<hc:start1 x="0" y="0"/>`, `<hc:end1 x="0" y="0"/>`
    - `<hc:start2 x="0" y="0"/>`, `<hc:end2 x="0" y="0"/>`
- **결론**: **Argon 의견이 100% 사실로 확인됨.** 전용 지오메트리를 계산하여 방출하도록 구현함.

### E. 선과 다각형 및 네임스페이스
- **Argon 의견**: `hp:line`의 `isReverseHWP97`은 구형이며 `isReverseHV`가 표준이다. 좌표 태그는 `hp:`가 아닌 `hc:`다.
- **실측 검증**: KS X 6101 표준에서 2차원 좌표 타입은 Common Core 네임스페이스인 `hc:`를 사용함(`<hc:pt>`, `<hc:pt0>`, `<hc:pt1>`). HWP97 호환 속성은 OWPML 정식 규격에서 `isReverseHV`로 정의됨.
- **결론**: **Argon 의견이 100% 사실로 확인됨.** 기존 순환 테스트의 `<hp:pt0>` 단언을 `<hc:pt0>`으로 교정하고 반영함.

### F. 도형 ID 타입 (`unsignedInt`)
- **Argon 의견**: `1_1`, `1_1_1` 등의 문자열 ID는 스키마 위반이다.
- **실측 검증**: OWPML XSD에서 `id` 및 `instid`의 데이터 타입은 `xs:unsignedInt`(또는 `xs:integer`)임. 밑줄(`_`)이 포함된 문자열은 XSD 검증기에서 `Invalid integer format`으로 거부됨.
- **결론**: **Argon 의견이 100% 사실로 확인됨.** `nextId()` 정수 카운터를 통해 1부터 순차 증가하는 고유 정수 ID를 부여하도록 전면 수정함.

### G. 이미지 구조
- **Argon 의견**: `<hp:inImgDim>`과 `binRef`는 불필요하거나 오류이며, `imgRect`는 속성이 아닌 자식 좌표를 가져야 한다.
- **실측 검증**: 정품 한컴 HWPX 실측 결과:
  - `<hp:imgRect>` 내부에 `<hc:pt0>`~`<hc:pt3>`이 자식으로 위치함.
  - `<hc:img>`에는 오직 `binaryItemIDRef="BIN0001"`만 존재하고 `binRef`는 존재하지 않음.
  - `<hp:inImgDim>` 요소는 정품 문서에 전혀 존재하지 않음.
- **결론**: **Argon 의견이 100% 사실로 확인됨.** 불필요한 속성/태그를 제거하고 정품 한컴 구조와 100% 일치시킴.

### H. 헤더 XML 언어 코드
- **Argon 의견**: `lang="hangul"` 대신 대문자 열거형 `lang="HANGUL"`이 필요하다.
- **실측 검증**: 정품 한컴 HWPX `Contents/header.xml` 실측 결과:
  `<hh:fontface lang="HANGUL" fontCnt="17">`, `LATIN`, `HANJA`, `JAPANESE`, `OTHER`, `SYMBOL`, `USER` 모두 대문자로 선언되어 있음.
- **결론**: **Argon 의견이 100% 사실로 확인됨.** 대문자 열거형으로 교정 완료.

