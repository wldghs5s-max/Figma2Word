# 정품 OWPML 레퍼런스 실측 증거 분석 (Reference OWPML Forensic Evidence)

**문서 분류**: 독립 기술 감사(Independent Technical Audit) 자료 05  
**분석 대상 정품 파일**: `완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`  
**표준 규격**: 대한민국 국가표준 KS X 6101 (OWPML)  

---

## 1. 정품 레퍼런스 개요

`완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`는 한컴오피스 한글 정식 제품을 통해 최종 보정 및 검수되어 사용자가 시각적 충실도를 인정한 Ground Truth 레퍼런스 문서입니다.

이 문서를 직접 XML 파싱 및 통계 분석한 결과는 다음과 같습니다:
- **전체 사각형 도형 (`<hp:rect>`)**: 837개
- **표 (`<hp:tbl>`)**: 0개 (테이블 대신 사각형 조합 사용)
- **텍스트 그리기 객체 (`<hp:drawText>`)**: **429개**

---

## 2. 정품 문서의 `lineWrap` 분포 전수 조사

```text
정품 문서 전체 텍스트박스 (429개)
┌────────────────────────────────────────────────────────┬─────────┐
│ SQUEEZE: 412개 (96.0%)                                 │ BREAK:  │
│ - 단일행 라벨, 수치 메타, 배지, 칩, 테이블 헤더        │ 17개    │
│ - 가로 압축을 통해 단일행을 유지하고 수직 침범 원천 차단 │ (4.0%)  │
└────────────────────────────────────────────────────────┴─────────┘
```

- **`lineWrap="SQUEEZE"`**: **412개 (96.0%)**
- **`lineWrap="BREAK"`**: **17개 (4.0%)**
- **`lineWrap="NONE"`**: 0개

> **결정적 발견**:  
> 한컴오피스 정식 엔진으로 생성된 정품 레퍼런스에서는 **텍스트박스의 96%가 `SQUEEZE`를 사용**하고 있으며, **`BREAK`는 오직 4%의 장문 본문 문단에만 제한적으로 적용**되어 있었습니다.

---

## 3. 정품 문서의 `BREAK` 텍스트박스 17건 전수 분석

정품 문서에서 `lineWrap="BREAK"`가 적용된 17개 텍스트박스의 치수와 내용을 확인한 결과:

| 번호 | 너비 (HWPU / pt) | 높이 (HWPU / pt) | 텍스트 내용 발췌 | 특징 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | 48750 (487.5 pt) | 11925 (119.25 pt) | "해운대동신아파트(해운대) 1차 외벽 진단 결과, 단지 전체 CDI는..." | 5줄 장문 종합 의견 문단 |
| 2 | 42675 (426.75 pt) | 4101 (41.01 pt) | "전반적인 외벽 균열 상태는 안전 범주에 있습니다..." | 2줄 본문 요약 카드 |
| 3 | 48300 (483.00 pt) | 3375 (33.75 pt) | "진단 목적: 드론 촬영 데이터와 GSD 기반 AI 정밀 분석..." | 2줄 안내 문단 |
| 4 | 46950 (469.50 pt) | 3825 (38.25 pt) | "외벽 균열 보수 우선순위: 109동 > 108동 > 102동 순..." | 2줄 권고사항 문단 |
| 5 | 52350 (523.50 pt) | 3375 (33.75 pt) | "본 고해상도 이미지는 촬영 데이터의 일부이며..." | 2줄 캡션 설명 문단 |
| 6 | 49950 (499.50 pt) | 2775 (27.75 pt) | "본 진단 결과는 AI 알고리즘 분석 결과이며..." | 법적 고지 문단 |
| 7~16 | 35700 (357.00 pt) | 1611 (16.11 pt) | "균열밀도 지표 산출 산식: 가중치 0.7..." 등 산식 설명 | 357pt 폭의 넓은 보조 설명 박스 |
| 17 | 49950 (499.50 pt) | 2775 (27.75 pt) | "촬영 조건 및 이미지 GSD 특성에 따라 미세 균열..." | 하단 주석 문단 |

### 공통적 특징:
1. **충분한 폭**: 모든 `BREAK` 텍스트박스는 너비가 최소 **357.0 pt에서 최대 523.5 pt**에 달합니다.
2. **충분한 높이**: 장문 문단은 높이가 **119.25 pt**에 달하여 문장이 5줄로 줄바꿈되어도 박스 높이 내에 완전히 수용됩니다.
3. **단일행 라벨 전무**: 좁은 라벨(폭 30~80pt)이나 KPI 수치 박스 중 `BREAK`가 적용된 것은 **단 1개도 존재하지 않았습니다**.

---

## 4. 정품 문서의 KPI 지표 텍스트박스 실제 XML

Stage 7에서 현재 겹침이 발생하는 동일한 KPI 블록에 대해, 정품 레퍼런스는 다음과 같이 직렬화하고 있습니다:

### `균열밀도 (CDI)` 실제 정품 XML:
```xml
<hp:rect id="16" zOrder="15" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES">
  <hp:sz width="5860" height="1425" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE"/>
  <hp:pos vertOffset="45750" horzOffset="5250"/>
  <hp:drawText lastWidth="5860" name="" editable="1">
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="SQUEEZE" vertAlign="TOP" textWidth="5860" textHeight="0">
      <hp:p id="0" paraPrIDRef="1">
        <hp:run charPrIDRef="2"><hp:t>균열밀도 (CDI)</hp:t></hp:run>
      </hp:p>
    </hp:subList>
    <hp:textMargin left="0" right="0" top="256" bottom="0"/>
  </hp:drawText>
</hp:rect>
```

### `0.031%` 실제 정품 XML:
```xml
<hp:rect id="17" zOrder="16" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES">
  <hp:sz width="6405" height="2025" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE"/>
  <hp:pos vertOffset="47325" horzOffset="5250"/>
  <hp:drawText lastWidth="6405" name="" editable="1">
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="SQUEEZE" vertAlign="TOP" textWidth="6405" textHeight="0">
      <hp:p id="0" paraPrIDRef="3">
        <hp:run charPrIDRef="4"><hp:t>0.031%</hp:t></hp:run>
      </hp:p>
    </hp:subList>
    <hp:textMargin left="0" right="0" top="0" bottom="0"/>
  </hp:drawText>
</hp:rect>
```

- **정품 문서의 동작 원리**:
  - `균열밀도 (CDI)`는 `lineWrap="SQUEEZE"`를 지정하여, 한글 엔진이 글자 자간과 장평을 미세하게 압축해 **반드시 1줄 안에 렌더링**하도록 강제합니다.
  - 따라서 높이가 14.25pt를 넘지 않고, 바로 아래 47.3pt에 위치한 `0.031%`와 **절대 충돌하지 않습니다**.

---

## 5. KS X 6101 OWPML 표준 명세서 규정

KS X 6101 표준 Part 1 Section 6.5.3 `<hp:subList>` 명세:

- **속성 `lineWrap`**: 텍스트 박스 경계에 도달했을 때의 줄바꿈 정책
  - `NONE`: 줄바꿈 처리 안 함 (텍스트가 가로로 계속 이어짐).
  - `SQUEEZE`: **텍스트를 박스 폭에 맞추어 장평/자간을 압축하여 한 줄에 수용**.
  - `BREAK`: **박스 폭에 도달하면 다음 행으로 줄바꿈**.

정품 한컴오피스는 디자인 레이아웃 상 아래 요소와 마진이 좁은 라벨형 객체에는 `SQUEEZE`를 적용하고, 폭과 높이가 충분한 본문 문단에만 `BREAK`를 적용하는 정교한 하이브리드 전략을 취하고 있음이 실증되었습니다.
