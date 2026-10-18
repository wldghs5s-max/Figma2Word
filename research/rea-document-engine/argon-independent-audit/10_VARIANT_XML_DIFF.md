# 10. Variant XML Diff & Structural Independence Audit

## 1. 개요

본 문서는 `debug/hwpx-overlap-mre/`에 생성된 기준 파일(`mre-A-baseline.hwpx`)과 5종의 변형 파일(`mre-B` ~ `mre-F`) 간의 **정확한 XML 바이트/속성 단위 Diff와 무결성 감사 결과**를 기록합니다.

---

## 2. 파일 메타데이터 및 무결성 전수 검사 결과

| 파일명 | 파일 크기 | 페이지 규격 | 방향 | `secPr` | 사각형 수 | 텍스트박스 수 | ZIP 유효성 |
|---|---|---|---|---|---|---|---|
| **`mre-A-baseline.hwpx`** | 7,156 bytes | 595.28 x 841.89 pt | `WIDELY` (세로) | 1 | 21개 | 11개 | 정상 |
| **`mre-B-wrap-only.hwpx`** | 7,169 bytes | 595.28 x 841.89 pt | `WIDELY` (세로) | 1 | 21개 | 11개 | 정상 |
| **`mre-C-lineheight-only.hwpx`** | 7,150 bytes | 595.28 x 841.89 pt | `WIDELY` (세로) | 1 | 21개 | 11개 | 정상 |
| **`mre-D-font-only.hwpx`** | 7,160 bytes | 595.28 x 841.89 pt | `WIDELY` (세로) | 1 | 21개 | 11개 | 정상 |
| **`mre-E-geometry-only.hwpx`** | 7,171 bytes | 595.28 x 841.89 pt | `WIDELY` (세로) | 1 | 21개 | 11개 | 정상 |
| **`mre-F-combined.hwpx`** | 7,163 bytes | 595.28 x 841.89 pt | `WIDELY` (세로) | 1 | 21개 | 11개 | 정상 |

> **무결성 판정**:
> 모든 파일의 페이지 치수(A4), 방향(`WIDELY`), 섹션 구조, 객체 수(21개), 텍스트박스 수(11개)가 100% 일치하며, 의도하지 않은 XML 드리프트나 레이아웃 변형은 0건으로 입증되었습니다.

---

## 3. 변종별 상세 XML Diff 분석

### 3.1 Variant B (`mre-B-wrap-only.hwpx`) vs Baseline A

- **격리 파일**: `Contents/section0.xml`만 변경 (`Contents/header.xml`은 A와 100% 동일)
- **변형 대상**: 단일행 텍스트박스 10개 (다중행 `7:998` 제외)

#### XML Diff (Before vs After):
```xml
<!-- Baseline A (Control Group) -->
<hp:drawText lastWidth="5398" name="균열밀도 (CDI)" editable="1">
  <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" ...>
    <hp:p id="0" paraPrIDRef="0" ...><hp:run charPrIDRef="0"><hp:t>균열밀도 (CDI)</hp:t></hp:run></hp:p>
  </hp:subList>
</hp:drawText>

<!-- Variant B (Wrap Mutated) -->
<hp:drawText lastWidth="5398" name="균열밀도 (CDI)" editable="1">
  <hp:subList id="" textDirection="HORIZONTAL" lineWrap="SQUEEZE" vertAlign="TOP" linkListIDRef="0" ...>
    <hp:p id="0" paraPrIDRef="0" ...><hp:run charPrIDRef="0"><hp:t>균열밀도 (CDI)</hp:t></hp:run></hp:p>
  </hp:subList>
</hp:drawText>
```

#### 변이 대상 객체 목록:
1. `diag:header:p1` (진단 헤더 1) -> `SQUEEZE`
2. `7:980` ("균열밀도 (CDI)") -> `SQUEEZE`
3. `7:981` ("0.031%") -> `SQUEEZE`
4. `7:982` ("안전 기준선 이하") -> `SQUEEZE`
5. `7:988` ("정제 검출 균열") -> `SQUEEZE`
6. `7:989` ("1,248 개") -> `SQUEEZE`
7. `7:990` ("노이즈 정제 완료") -> `SQUEEZE`
8. `7:997` ("A 등급") -> `SQUEEZE`
9. `diag:header:p2` (진단 헤더 2) -> `SQUEEZE`
10. `7:1082` ("품질 가공 단계...") -> `SQUEEZE`
- **보존 객체**: `7:998` ("전반적인 외벽 균열 상태는 안전 범주에 있습니다...") -> **`lineWrap="BREAK"` 유지**

---

### 3.2 Variant C (`mre-C-lineheight-only.hwpx`) vs Baseline A

- **격리 파일**: `Contents/header.xml`만 변경 (`Contents/section0.xml`은 A와 100% 동일)
- **변형 대상**: 기본 문단 스타일 `paraPr` id 0, 1, 2, 3의 행간 속성 (총 4개)

#### XML Diff (Before vs After):
```xml
<!-- Baseline A (Control Group) -->
<hh:paraProperties itemCnt="5">
  <hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="0" ...>
    <hh:align horizontal="LEFT" vertical="BASELINE"/>
    <hh:lineSpacing type="PERCENT" value="160" unit="PERCENT"/>
  </hh:paraPr>
  <!-- ids 1, 2, 3 동일하게 PERCENT 160% -->
</hh:paraProperties>

<!-- Variant C (LineSpacing Mutated) -->
<hh:paraProperties itemCnt="5">
  <hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="0" ...>
    <hh:align horizontal="LEFT" vertical="BASELINE"/>
    <hh:lineSpacing type="FIXED" value="1125" unit="HWPUNIT"/>
  </hh:paraPr>
  <!-- ids 1, 2, 3 동일하게 FIXED 1125 HWPUNIT -->
</hh:paraProperties>
```

---

### 3.3 Variant D (`mre-D-font-only.hwpx`) vs Baseline A

- **격리 파일**: `Contents/header.xml`만 변경 (`Contents/section0.xml`은 A와 100% 동일)
- **변형 대상**: `charPr` id 0 ~ 7 전수 (총 8개)의 `fontRef` 한글/한자 바인딩

#### XML Diff (Before vs After):
```xml
<!-- Baseline A (Control Group - Inter mapped to all) -->
<hh:charPr id="0" height="825" textColor="#1E2022" ...>
  <hh:fontRef hangul="1" latin="1" hanja="1" japanese="1" other="1" symbol="1" user="1"/>
</hh:charPr>

<!-- Variant D (Font Mutated - Korean mapped to Malgun Gothic) -->
<hh:charPr id="0" height="825" textColor="#1E2022" ...>
  <hh:fontRef hangul="0" latin="1" hanja="0" japanese="1" other="1" symbol="1" user="1"/>
</hh:charPr>
```
*참조: `font id="0"`은 `face="맑은 고딕"`, `font id="1"`은 `face="Inter"`.*

---

### 3.4 Variant E (`mre-E-geometry-only.hwpx`) vs Baseline A

- **격리 파일**: `Contents/section0.xml`만 변경 (`Contents/header.xml`은 A와 100% 동일)
- **변형 대상**: 단일 객체 `7:1082` (중앙 정렬 배너, Rect id 21)

#### XML Diff (Before vs After):
```xml
<!-- Baseline A (Control Group) -->
<hp:rect id="21" zOrder="86" ...>
  <hp:orgSz width="30514" height="3748" />
  <hp:curSz width="30514" height="3748" />
  <hp:rotationInfo angle="0" centerX="15257" centerY="1874" rotateimage="1" />
  <hp:drawText lastWidth="30514" name="품질 가공 단계: AI 원검출 → 노이즈 제거 → 중첩 보정 → 정제 1,248개 기준" editable="1">
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" ...>
  ...
  <hp:sz width="30514" height="3748" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0" />
  <hp:pos vertOffset="49704" horzOffset="15632" vertAlign="TOP" horzAlign="LEFT" .../>
</hp:rect>

<!-- Variant E (Geometry Restored) -->
<hp:rect id="21" zOrder="86" ...>
  <hp:orgSz width="30514" height="1199" />
  <hp:curSz width="30514" height="1199" />
  <hp:rotationInfo angle="0" centerX="15257" centerY="600" rotateimage="1" />
  <hp:drawText lastWidth="30514" name="품질 가공 단계: AI 원검출 → 노이즈 제거 → 중첩 보정 → 정제 1,248개 기준" editable="1">
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" ...>
  ...
  <hp:sz width="30514" height="1199" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0" />
  <hp:pos vertOffset="50978" horzOffset="15632" vertAlign="TOP" horzAlign="LEFT" .../>
</hp:rect>
```

---

### 3.5 Variant F (`mre-F-combined.hwpx`) vs Baseline A

- **격리 파일**: `Contents/section0.xml` 및 `Contents/header.xml` 동시 변경
- **변형 내용**:
  1. `section0.xml`: Variant B와 100% 동일 (`hp:subList lineWrap="SQUEEZE"`, 10개 객체)
  2. `header.xml`: Variant C와 100% 동일 (`lineSpacing FIXED 1125 HWPUNIT`, 4개 `paraPr`)
  3. `header.xml`: Variant D와 100% 동일 (`hangul="0"` 맑은 고딕, 8개 `charPr`)
