# 06. Multi-Factor Collision Risk Report: Stage 6 & Stage 7

## 1. 개요 및 위험도 평가 체계

본 문서는 Stage 6 및 Stage 7 HWPX 문서에 대해 기하학적 BBox 교차, 폭 결손에 따른 강제 개행, 160% 행간 수직 팽창, 부모 기하학 전이, 폰트 폴백을 결합한 **다요인 시각적 충돌 위험도 분석 결과**입니다.

### 8대 위험 유형 정의:
1. `NARROW_SINGLE_LINE_WRAP_RISK`: 단일행 텍스트의 폭 결손으로 인한 강제 개행 위험.
2. `VERTICAL_OVERFLOW_COLLISION`: 개행 팽창으로 직하단 객체와의 간격을 초과하여 발생하는 수직 충돌.
3. `EXCESSIVE_LINE_SPACING_EXPANSION`: 160% 행간에 의한 카드 하단 돌출.
4. `INSUFFICIENT_BOX_HEIGHT`: 박스 높이가 폰트 크기보다 작은 결함.
5. `PARENT_GEOMETRY_INFLATION`: 부모 컨테이너 높이 팽창에 따른 baseline 처짐.
6. `FONT_FALLBACK_RISK`: 영문 서체 참조에 따른 한글 글리프 폭 확대 위험.
7. `ACTUAL_BBOX_INTERSECTION`: 텍스트 간 직접 2D BBox 겹침.
8. `INTENTIONAL_BACKGROUND_OVERLAY`: 배경 카드, 이미지, 컨테이너와의 의도적 중첩 (정상 판정).

---

## 2. 스테이지별 종합 충돌 위험도 통계

| 위험 분석 항목 | Stage 6 (제안서 1P) | Stage 7 (고객 보고서 9P) |
|---|---|---|
| **총 요소 수 / 텍스트 수** | 8개 / 5개 | 884개 / 424개 |
| **High Confidence 위험 객체** | **1개** (`1:40` 요약 본문) | **239개** |
| **- 수직 직하단 충돌 (`VERTICAL_OVERFLOW_COLLISION`)** | 1개 | **55개** (라벨-수치 충돌군 전수) |
| **- 부모 기하학 팽창 (`PARENT_GEOMETRY_INFLATION`)** | 0개 | **184개** (`7:1082` 포함) |
| **- 텍스트 간 직접 충돌 (`ACTUAL_BBOX_INTERSECTION`)** | 0개 | 0개 |
| **의도적 배경 중첩 필터링 (`INTENTIONAL_BACKGROUND_OVERLAY`)** | 1개 (정상 분리) | **462개 (정상 분리)** |

> **분석 정확도 평가**:
> 462개의 배경 카드 및 디자인 박스를 오류로 오인하지 않고 `INTENTIONAL_BACKGROUND_OVERLAY`로 완벽히 분리함으로써, 노이즈 없이 실제 치명적 충돌 239건을 정확히 포착했습니다.

---

## 3. Stage 7 핵심 고위험 충돌 객체 상세 목록

| 객체 ID | 텍스트 요약 | 위험 유형 | 신뢰도 | 직하단 충돌 객체 및 상세 근거 |
|---|---|---|---|---|
| **`7:980`** | `"균열밀도 (CDI)"` | `VERTICAL_OVERFLOW_COLLISION` | **HIGH** | 직하단 `7:981`("0.031%") 간격 6.0pt < 2줄 개행 팽창 13.2pt (**직접 겹침**) |
| **`7:984`** | `"건전성 지수 (BHI)"` | `VERTICAL_OVERFLOW_COLLISION` | **HIGH** | 직하단 `7:985`("84/100") 간격 6.0pt < 개행 팽창 13.2pt (**직접 겹침**) |
| **`7:988`** | `"정제 검출 균열"` | `VERTICAL_OVERFLOW_COLLISION` | **HIGH** | 직하단 `7:989`("1,248 개") 간격 6.0pt < 개행 팽창 13.2pt (**직접 겹침**) |
| **`7:992`** | `"순외벽면적"` | `VERTICAL_OVERFLOW_COLLISION` | **HIGH** | 직하단 `7:993`("36,910 ㎡") 간격 6.0pt < 개행 팽창 13.2pt (**직접 겹침**) |
| **`7:1082`** | `"품질 가공 단계: AI..."` | `PARENT_GEOMETRY_INFLATION` | **HIGH** | 박스 높이 11.99pt -> 37.48pt로 3.13배 팽창, baseline 카드 바닥 처짐 |
| **`7:998`** | `"전반적인 외벽 균열..."` | `EXCESSIVE_LINE_SPACING_EXPANSION` | **HIGH** | 160% 행간으로 2행 텍스트 높이 33.6pt, 카드 하단 여백 잠식 |
| **`7:1049`** | `"AIREKA Custom RTK..."` | `VERTICAL_OVERFLOW_COLLISION` | **HIGH** | 직하단 스펙 행(`7:1054`)과의 여백 부족 |
| **`7:1054`** | `"2026.03.10 ~ 2026..."` | `VERTICAL_OVERFLOW_COLLISION` | **HIGH** | 직하단 소프트웨어 행(`7:1059`)과의 여백 부족 |

---

## 4. 해석 시 주의 사항

> **중요 공지 (No False Truism)**:
> 계산된 추정 충돌 수치는 수학적 레이아웃 모델에 기반한 조기 경보 지표입니다.
> **추정 충돌이 0건이라고 해서 실제 한컴오피스 2024 뷰어에서 100% 겹침이 없다는 뜻이 아니며**, 반대로 추정 충돌이 감지된 요소라도 한컴오피스의 서체 렌더러가 자간을 극단적으로 줄여 1줄로 우겨넣는 경우 실제 화면에서는 겹치지 않을 수도 있습니다.
> 최종적인 시각적 판정은 반드시 사용자의 한컴 뷰어 육안 검증을 거쳐야 합니다.

