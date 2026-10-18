# 04. Line Spacing & Font Metrics Empirical Audit

## 1. 개요

본 문서는 정품 상용 HWPX 레퍼런스(`report-1차-진단-편집가능-최종보정.hwpx`)의 55개 문단 스타일(`paraPr`)과 글꼴 참조(`charPr.fontRef`)를 역공학하여, **한컴오피스의 상용 행간 계산 공식과 다중 언어 글꼴 매핑 표준**을 도출한 기술 보고서입니다.

---

## 2. 정품 HWPX 행간(`lineSpacing`) 전수 분석

### 2.1 주요 발견
- **`PERCENT` 타입 전무 (0건)**: 정품 HWPX 문단 스타일 55개 중 `PERCENT` 타입은 단 한 건도 없습니다.
- **100% `FIXED HWPUNIT` 규격 사용**: 55개 전수가 고정값(Fixed HWPU)을 사용하고 있습니다.

### 2.2 글자 크기 대비 고정 행간 매핑 테이블

정품 HWPX에서 추출된 대표적인 폰트 크기 및 고정 행간 매핑입니다.

| 폰트 크기 (pt) | 폰트 크기 (HWPU) | 정품 고정 행간 (HWPU) | 포인트 환산 (pt) | 배율 (Multiplier) | 사용 용도 |
|---|---|---|---|---|---|
| **8.25 pt** | 825 HWPU | **990 HWPU** | 9.90 pt | **1.20배** | 지표 카드 소제목 라벨 (`7:980` 등) |
| **9.00 pt** | 900 HWPU | **1125 HWPU** | 11.25 pt | **1.25배** | 일반 안내 문구, 범례 텍스트 |
| **9.75 pt** | 975 HWPU | **1200 HWPU** | 12.00 pt | **1.23배** | 배너 텍스트 (`7:1082` 등) |
| **10.50 pt** | 1050 HWPU | **1275 HWPU** | 12.75 pt | **1.21배** | 일반 본문 문단 |
| **12.00 pt** | 1200 HWPU | **1460 HWPU** | 14.60 pt | **1.22배** | 다중행 요약 본문 (`7:998` 등) |
| **14.99 pt** | 1500 HWPU | **1800 HWPU** | 18.00 pt | **1.20배** | 주요 지표 수치 (`7:981` "0.031%" 등) |
| **18.00 pt** | 1800 HWPU | **2025 HWPU** | 20.25 pt | **1.13배** | 카드 대제목 |
| **28.00 pt** | 2800 HWPU | **3450 HWPU** | 34.50 pt | **1.23배** | 표지 대형 타이틀 |

> **경험적 공식 (Empirical Formula)**:
> 상용 한글 문서의 행간은 폰트 크기의 **1.15배 ~ 1.25배 (평균 1.20배)**를 `FIXED HWPUNIT`으로 선언하는 것이 표준입니다.

---

## 3. 우리 엔진의 `PERCENT 160%` 기본 행간 폐해 분석

우리 엔진은 Stage 7 전체 424개 텍스트 중 `lineHeightPt`가 없는 **412개(97.2%)에 `<hh:lineSpacing type="PERCENT" value="160" unit="PERCENT"/>`를 강제 부여**하고 있었습니다.

### 수직 팽창 수치 비교:
1. `7:980` 라벨 (8.25pt):
   - **정품 고정 행간**: `9.90 pt` (990 HWPU)
   - **우리 엔진 160%**: `8.25 * 1.6 = 13.20 pt` (1320 HWPU)
   - **행당 과다 팽창**: **+3.30 pt (+33.3%)**
2. 2줄 개행 시의 파괴적 영향:
   - 폭 부족으로 2줄이 되는 순간, 높이는 `13.20 * 2 = 26.40 pt`가 됨.
   - 직하단 `7:981`과의 간격(6.0pt)을 **20.4pt 초과 침범**하여 아래 숫자를 완전히 가림.

---

## 4. 폰트 매핑 및 글리프 폴백 메커니즘 감사

OWPML 규격은 7개 언어군(`HANGUL`, `LATIN`, `HANJA`, `JAPANESE`, `OTHER`, `SYMBOL`, `USER`)별로 글꼴을 분리 선언할 수 있도록 설계되어 있습니다.

### 4.1 정품 레퍼런스의 매핑:
```xml
<!-- header.xml -->
<hh:fontface lang="HANGUL" fontCnt="17">
  <hh:font id="15" face="Pentech NotoSansKR 400" .../>
  <hh:font id="16" face="Pentech NotoSansKR 700" .../>
</hh:fontface>
<hh:fontface lang="LATIN" fontCnt="17">
  <hh:font id="10" face="Pentech Inter 400" .../>
</hh:fontface>

<hh:charPr id="0" ...>
  <hh:fontRef hangul="15" latin="10" hanja="15" japanese="15" other="15" symbol="15" user="10"/>
</hh:charPr>
```
- 한글은 `NotoSansKR`, 영문/숫자는 `Inter`로 정밀 분리되어 글리프 누락이나 폴백이 전혀 없음.

### 4.2 우리 엔진의 현재 매핑 결함:
```xml
<!-- header.xml -->
<hh:fontface lang="HANGUL" fontCnt="5">
  <hh:font id="0" face="맑은 고딕" .../>
  <hh:font id="1" face="Inter" .../>
</hh:fontface>

<hh:charPr id="0" ...>
  <hh:fontRef hangul="1" latin="1" hanja="1" japanese="1" other="1" symbol="1" user="1"/>
</hh:charPr>
```
- `charPr`에서 `hangul="1"`로 지정하여 **한글 글꼴로 `Inter`를 참조**함.
- `Inter`에는 한글 완성형/조합형 글리프가 0개이므로, 한컴 뷰어가 시스템 기본 글꼴(바탕/굴림)로 폴백 렌더링함.
- 바탕/굴림의 전각 자간 폭은 `Inter`의 가변폭보다 넓어 단일행 라벨의 폭을 추가로 넓혀 2줄 개행을 강제 유발함.

---

## 5. 프로덕션 개선 권고안 (향후 구현용)

1. **기본 행간 정책**:
   - `lineHeightPt`가 없는 경우 `PERCENT 160%`를 버리고, `Math.round(fontSizePt * 120)`의 `FIXED HWPUNIT`을 적용.
2. **폰트 바인딩 정책**:
   - DOCX의 `resolveEastAsiaFont`와 동일하게, `fontRef`의 `hangul` 및 `hanja`에는 한국어 글리프가 완비된 `맑은 고딕`(font 0)을 할당하고, `latin`에만 원본 영문 폰트(`Inter`)를 바인딩.

