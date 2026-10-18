# Phase 23.1 Reference OWPML Specification Analysis

## 1. 정품 레퍼런스 분석 개요
- **대조 파일**: `완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`
- **조사 목적**: 한컴오피스 2024에서 정상적으로 열리고 줄바꿈 및 레이아웃이 완벽하게 렌더링되는 정품 레퍼런스의 문단 속성(`hh:paraPr`), 텍스트박스 내부 여백(`textMargin`), 줄바꿈 속성(`lineWrap`)의 표준 직렬화 패턴을 추출함.

---

## 2. 정품 레퍼런스 실측 결과

### A. 문단 속성 (`hh:paraPr`) 전수 분석
레퍼런스 `Contents/header.xml` 내부의 55개 `hh:paraPr` 요소를 전수 분석한 결과:

1. **`snapToGrid` 속성**:
   - 55개 전체(100%)가 `snapToGrid="0"`으로 직렬화됨.
   - `snapToGrid="1"`은 단 1개도 존재하지 않음.
2. **`hh:breakSetting` 속성**:
   - 모든 문단에 다음 태그가 누락 없이 포함됨:
     ```xml
     <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
     ```
   - `breakNonLatinWord="BREAK_WORD"`가 핵심: 한글 텍스트는 어절 단위가 아니라 글자 단위로 자연스럽게 개행되어 줄 끝까지 너비를 채움.
   - `breakLatinWord="KEEP_WORD"`: 영문 단어는 중간에 잘리지 않고 단어 단위로 보존됨.
3. **`hh:autoSpacing` 속성**:
   - 모든 문단에 다음 태그가 포함됨:
     ```xml
     <hh:autoSpacing eAsianEng="0" eAsianNum="0"/>
     ```
   - 한글과 영문/숫자 간의 불필요한 자동 공백 확장을 0으로 차단함.
4. **문단 마진 (`hh:margin`)**:
   - 모든 문단에 기본적으로 0 마진이 명시됨:
     ```xml
     <hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>
     ```
5. **문단 테두리 (`hh:border`)**:
   - `<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>` 포함.

---

### B. 텍스트 내부 여백 (`hp:textMargin`) 실측 분석
레퍼런스 `Contents/section0.xml` 내부의 837개 사각형 도형(`hp:rect`) 전수 조사 결과:
- **`left="0"` 및 `right="0"` 비율: 837개 중 837개 (100.0%)**
- 좌우 내부 여백은 어떤 경우에도 인위적으로 부여되지 않으며, 도형의 전체 너비(`sz.width`)를 온전히 텍스트 가용 너비(`subList.textWidth`)로 사용함.
- 상단 마진(`top`)은 일부 제목 및 배지에서 시각적 수직 보정을 위해 256 또는 288 HWPU(약 2.5~2.8 pt)로 설정된 사례가 관찰됨.

---

### C. `lineWrap` 분포 분석
- **`lineWrap="BREAK"` (17건)**:
  - 본문 설명 문단, 주의사항 안내문, 요약 단락 등 **긴 다중 행 텍스트 전체에 예외 없이 `BREAK`가 적용됨**.
- **`lineWrap="SQUEEZE"` (412건)**:
  - 지표 수치("`0.031%`"), 단일행 배지("`1차 진단`"), 헤더 태그, 점수("`84/100`") 등 **단일행 라벨에만 선별 적용됨**.

---

## 3. OWPML 표준 엔진 반영 사양

| OWPML XML 요소 | 기존 엔진 (Phase 23) | 본 Phase 23.1 반영 | 근거 |
|---|---|---|---|
| `<hh:paraPr snapToGrid>` | `"1"` (격자 강제 스냅) | **`"0"` (스냅 해제)** | 정품 레퍼런스 55/55개 일치 |
| `<hh:breakSetting>` | 미생성 (한컴 기본 어절개행) | **`breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" lineWrap="BREAK"`** | 정품 레퍼런스 표준 |
| `<hh:autoSpacing>` | 미생성 (자동 간격 팽창) | **`eAsianEng="0" eAsianNum="0"`** | 정품 레퍼런스 표준 |
| `<hh:margin>` | 미생성 | **`intent="0" left="0" right="0" prev="0" next="0"`** | 정품 레퍼런스 표준 |
| `<hp:textMargin left/right>` | `defaultPadL`로 인위적 축소 | **`0` (명시적 패딩 없을 시)** | 정품 레퍼런스 837/837개 일치 |
