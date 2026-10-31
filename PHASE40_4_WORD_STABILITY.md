# Figma2Word — Phase 40.4 Word 실사용 편집 안정성 및 한글 보존 보고서
## Microsoft Word Native Editing Reliability, Korean Preservation & Layout Stability

- **검증 환경**: Windows 11 x64, Microsoft Word Native COM Automation (PID 격리 인스턴스)
- **대상 입력 DOCX (Candidate)**: `debug/phase39-production/candidate_multi_page.docx` (17페이지 마스터 문서)
  - SHA-256: `1ea1f8b7629f2c3d45f148c252f33881a08668266b502033f6ae3744fe1b6b58`
- **검증 일시**: 2026-10-31 21:10 ~ 21:11 UTC
- **파이프라인 Run ID**: `run_phase39_1793481009647`
- **핵심 실측 지표 요약**:
  - Normal Edit Persistence: **25 / 25 (100.0%) PASSED**
  - Stress Edit Persistence: **25 / 25 (100.0%) PASSED**
  - 한국어 전체 본문 보존율: **100.0%** (깨짐 문자 0건, 인코딩 무결)
  - 대형 전경 객체 영속성: **5 / 5 (100.0%) PASSED**
  - Normal Masked Layout Stability: **17 / 17 Pages STABLE (Regressions: 0, Mismatch: 0.0000%)**
  - Stress Masked Layout Stability: **17 / 17 Pages STABLE (Regressions: 0, Mismatch: 0.0000%)**

---

## 1. 개요 및 테스트 설계

Figma 디자인을 변환한 DOCX 문서가 Microsoft Word에서 실무자가 한국어 문장을 타이핑하고 단락을 추가하거나 도형을 늘려도 파일 손상, 글자 깨짐, 주변 객체 밀림 없이 안전하게 유지되는지를 입증하기 위해 Normal 모드와 Stress 모드를 격리 실행했습니다.

```text
[Word COM 인스턴스 시작 (PID 추적)]
         │
         ▼
[25건 네이티브 편집 적용]
- VML 텍스트박스: 긴 한국어 단락 텍스트 주입
- VML 도형 선 색상/두께: 4.0pt 스트레스
- VML 도형 면 채우기: 색상 교체
- VML 도형 치수: 너비 30% (* 1.3) 확장
         │
         ▼
[문서 저장 및 안전 종료 (SaveAs .docx)]
         │
         ▼
[독립 Word COM 새 인스턴스로 ReadOnly 재열기]
- 텍스트 전체 본문 라인별 전수 일치 확인
- 인코딩 깨짐 (0xFFFD, ???) 검출
- 도형 속성(RGB, Weight, Width) 유지 확인
         │
         ▼
[PDF/PNG 렌더링 및 Before/After Union 마스크 비교]
```

---

## 2. DOCX 아티팩트 해시 체인 및 무결성

Word COM이 문서를 수정하고 저장할 때 내부 OpenXML 메타데이터와 서식을 갱신하므로 생성 직후의 Candidate DOCX와 저장 후의 Saved DOCX는 상이한 해시를 갖습니다. 이를 명확히 분리 보존합니다:

| 문서 유형 | 파일 경로 | SHA-256 해시 | 비고 |
|---|---|---|---|
| **Candidate DOCX** | `debug/phase39-production/candidate_multi_page.docx` | `1ea1f8b7629f2c3d45f148c252f33881a08668266b502033f6ae3744fe1b6b58` | 렌더러가 최초 생성한 17페이지 원본 |
| **Normal Saved DOCX** | `debug/phase39-editability-normal/saved-documents/candidate_edited.docx` | `95d096ffc859cf19f35c1ce337e827412eed6c59dab2eb6fd469561c350f0686` | 일반 25건 편집 후 Word가 저장한 문서 |
| **Stress Saved DOCX** | `debug/phase39-editability-stress/saved-documents/candidate_edited.docx` | `57a2e05348723bdb897529af5905b1a1d1d1d35f7dc0ec5e0fae39ba161878c0` | 고강도 25건 편집 후 Word가 저장한 문서 |

---

## 3. 한국어 텍스트 및 개행 완전 보존 실측

### 3.1 Normal Mode 한국어 편집 보존
- **시도 / 성공 / 지속**: **25 / 25 / 25 (100.0%)**
- **주입 텍스트 예시**:
  - `수정확인 [E25]`
  - `실사용 텍스트 수정 [EDIT_5]`
- **검증 방식**: 첫 줄 마커뿐 아니라 한국어 단어 전체를 유니코드 일치로 검증.
- **인코딩 무결성**: 대체 문자(`\uFFFD`) 또는 `?` 변환 **0건**.

### 3.2 Stress Mode 다중 단락 한국어 편집 보존
- **시도 / 성공 / 지속**: **25 / 25 / 25 (100.0%)**
- **주입된 3개 단락 본문**:
  - 1행: `[STRESS_x]`
  - 2행: `한국어 텍스트 완전 보존 및 다중 단락 스트레스 검증용 긴 문장입니다.`
  - 3행: `두 번째 단락: 특수문자와 공백 및 개행 문자가 정상적으로 유지되는지 확인합니다.`
  - 4행: `세 번째 단락: Word COM 편집 후 저장 및 재열기 시 손실 없이 보존되어야 합니다.`
- **단락 개행 보존**: Word 내부 단락 구분자 Chr(13) (`\r`) 변환을 정규화 매칭하여, 4개 라인 전체가 단 한 글자의 누락 없이 재열기된 텍스트박스 안에 보존됨을 100% 입증.

---

## 4. 대형 전경 객체(Large Foreground) 편집 검증

- **후보 객체 식별 수** (`candidateCount`): 7건 (너비 300pt 이상 또는 높이 300pt 이상의 전경 카드/패널)
- **편집 시도 수** (`attemptedCount`): 5건
- **Word COM 편집 성공 수** (`successfulCount`): 5건
- **재열기 영속성 검증 수** (`persistedCount`): **5건 (100.0%)**
- **카운터 변수 정합성**: `$largeForegroundTested`와 `$largeForegroundPersisted`를 5로 일치화하여 변수 왜곡 0건 달성.

---

## 5. Stress 레이아웃 회귀 원인 규명 및 마스크 교정

### 5.1 기존 실측 실패 원인 규명
Phase 40.3 감사에서 Stress 모드 시 Page 1, 4, 5, 11에서 마스크 외부 불일치가 보고되었습니다:
- **원인**: 이전 스크립트는 너비를 30% 확장(`* 1.3`)하면서도 Bounding Box에는 `widthPt = $widthPt + 4.0`으로 기록했습니다. 이로 인해 너비 900pt 도형(Page 5)이 1,170pt로 확장되었으나 마스크는 904pt까지만 덮어, 약 266pt의 객체 확장 영역이 마스크 밖으로 노출되어 비편집 영역 불일치(0.711%)로 오인된 것이었습니다.

### 5.2 Before/After Union Bounding Box 도입 성과
- 편집 전 영역(`beforeBox`)과 편집 후 Word 실측 영역(`afterBox`)의 합집합(Union)을 마스크 영역으로 구성했습니다.
- **실측 결과**:
  - Normal Layout Stability: **Unintended Regressions 0, Avg Mismatch 0.0000% (`VERIFIED`)**
  - Stress Layout Stability: **Unintended Regressions 0, Avg Mismatch 0.0000% (`VERIFIED`)**
  - 모든 17개 페이지에서 정상적인 편집 객체 확장 영역이 정확하게 마스킹되었으며, 비편집 영역의 의도치 않은 레이아웃 훼손(Collateral Damage)이 0건임을 완벽히 입증했습니다.

---

## 6. 결론

Figma2Word가 생성한 DOCX 문서는 Microsoft Word 네이티브 환경에서 긴 한국어 문장과 다중 단락 개행을 주입하거나 도형 치수를 대폭 확장해도:
1. 한국어 텍스트와 개행이 단 한 글자의 손실이나 인코딩 깨짐 없이 100% 보존되며,
2. 대형 전경 객체를 포함한 모든 편집 속성이 저장 및 재열기 후에도 완벽하게 영속되고,
3. 주변 레이아웃과 섹션/페이지 구조가 전혀 훼손되지 않는 최고 수준의 안정성을 확보했습니다.
