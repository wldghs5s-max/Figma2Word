# Figma2Word — Phase 40.4 엔지니어링 및 무결성 강화 보고서
## Production Word Editing Reliability & Content Integrity Hardening

- **수정 전 Git HEAD**: `22c0d1e2562aaebf988e5ab877208690be4da51c`
- **대상 고객사 원본 문서**: `펜테크 3차 디자인.json` (SHA-256: `390e774379c9ff9bdc72e0b1918c557e9ea9f3128662692456f8e84a82e0527a`, 186.52 MB)
- **최종 검증 Run ID**: `run_phase39_1793481009647`
- **최종 생산 품질 판정**: **PASSED (Approved: true, 9/9 Required Gates PASSED, Exit Code: 0)**

---

## 1. 개요 및 목적

Phase 40.3에서 벡터 형상 복원과 Normal/Stress 분리 체계를 구축했으나, GPT 독립 감사에서 다음 2가지 치명적 결함(P0-01, P0-02)이 확인되었습니다:

1. **P0-01 (Word Stress Edit의 한국어 인코딩 및 완전 보존 검증 결함)**:
   - Windows PowerShell 5.1 환경에서 UTF-8 BOM 부재로 인해 한글 리터럴이 시스템 ANSI(CP949)로 잘못 해석되어 깨진 문자열(`?ㅼ궗???띿뒪???섏젙`)로 주입되었던 문제.
   - Word COM 재열기 검증 시 긴 본문의 전체 일치를 확인하지 않고 첫 줄 마커(`[STRESS_x]`)만 일치해도 성공으로 승인하던 취약점.
2. **P0-02 (콘텐츠 보존 Gate의 허위 성공 가능성)**:
   - `objectTraceability.ts`에서 Shape의 기하가 누락되거나 이미지 미디어가 깨져 `contentVerified = false`가 되어도 `traceabilityVerdict`가 `VERIFIED`로 허위 승인될 수 있던 게이트 구멍.
3. **Stage B/C (Stress 레이아웃 마스크 왜곡 및 대형 전경 객체 변수 불일치)**:
   - 너비 30% 확장 스트레스 시 마스크 좌표가 `+ 4.0`으로 하드코딩되어 실제 확장 영역을 마스킹하지 못하고 불일치를 유발했던 결함.
   - 대형 전경 객체 카운터 변수명 불일치(`$largeForegroundTested` vs `$largeForegroundCount`)로 항상 0이 반환되던 버그.

Phase 40.4에서는 위 결함들을 실제 코드 수준에서 원천 교정하고, 고객사 원본 문서와 실제 Windows Word COM을 통한 전수 검증을 완료했습니다.

---

## 2. 결함별 정밀 수정 및 엔지니어링 구현 내역

### 2.1 P0-01: 한국어 완전 보존 및 인코딩 원천 교정
- **원인 규명**: Windows PowerShell 5.1 콘솔은 UTF-8 BOM이 없는 스크립트를 기본 CP949로 파싱하여 한글 문자열이 모지바케(깨짐) 상태로 Word COM에 주입되었음.
- **수정 구현**:
  1. `tools/visual-regression/windows_word_edit_test.ps1`:
     - 파일 인코딩을 UTF-8 with BOM으로 전면 전환.
     - 한글 문자열을 UTF-8 바이트 배열(`[System.Text.Encoding]::UTF8.GetString([byte[]]@(...))`) 기반 헬퍼 함수 `Get-KoreanText`로 정의하여 어떤 윈도우 로케일/PowerShell 버전에서도 100% 무결한 유니코드 한글로 복원.
     - 첫 줄 마커 의존 로직 완전 폐기: 주입된 3개 단락 긴 한글 본문의 모든 라인(`$op.expectedLines`)이 재열기된 텍스트에 온전히 존재하는지 정규화 후 전수 일치 검사.
     - 인코딩 깨짐 감지: 대체 문자(`\uFFFD`) 또는 비정상적인 물음표 치환(`???`) 발생 시 즉시 실패 판정.
- **실측 성과**:
  - Normal Edit: **25 / 25 (100.0%) PASSED** (한글 본문 완전 일치)
  - Stress Edit: **25 / 25 (100.0%) PASSED** (3단락 긴 한글 문단 및 개행 완전 일치)

### 2.2 P0-02: Fail-Closed 콘텐츠 보존 및 정밀 상태 분류 체계
- **원인 규명**: `objectTraceability.ts`에서 `isAllTextPreserved`만 검사하고 `preservedShapes === sourceShapes` 및 `preservedImages === sourceImages`를 게이트 조건에서 누락하여 기하/미디어 손실이 최종 성공으로 둔갑될 수 있었음.
- **수정 구현**:
  1. `src/fidelity/objectTraceability.ts`:
     - 정밀 상태 체계 도입: `DetailedContentState`
       - `CONTENT_VERIFIED`: 텍스트 완전일치, 도형 기하 및 스타일 검증 완료, 이미지 정품 미디어 확인
       - `APPROXIMATE_GEOMETRY`: 원본 SVG 패스 미제공 벡터의 정밀 근사 기하 객체
       - `OBJECT_PRESENT`: DOCX 상 객체는 존재하나 상세 내용 검증 미완료
       - `CONTENT_MISMATCH`: 텍스트 일부 손실, 기하 불일치
       - `CONTENT_UNVERIFIED`: 빈 Shape, 유효 경로 없는 벡터, 깨진 이미지 등
       - `INTENTIONAL_OMISSION`: 투명 래퍼 등 정상적 구조적 컨테이너 생략
     - Fail-Closed 판정식 강화:
       `isAllTextPreserved && isAllShapesPreserved && isAllImagesPreserved && overallTraceabilityRate >= 1.0`
       어느 하나라도 누락되거나 검증 실패 시 즉시 `FAILED`로 차단.
  2. `tests/phase40-4-content-integrity.test.ts`:
     - 텍스트 누락, 텍스트 뒤쪽 잘림, 빈 VML shape, 이미지 플레이스홀더 미디어 차단 등 5대 실패 주입 테스트 작성 및 100% 통과 (5/5).

### 2.3 Stage B: Before/After Union Bounding Box 및 Stress 레이아웃 규명
- **원인 규명**: 이전 버전에서는 너비 30% 확장(`* 1.3`) 시에도 Bounding Box에 `+ 4.0`만 기록하여, 실제 확장된 영역(예: 500pt -> 650pt 중 146pt)이 마스크 밖으로 노출되어 비편집 영역 불일치로 오인되었음 (Page 5 등).
- **수정 구현**:
  - 편집 전 Bounding Box(`beforeBox`)와 편집 후 Word COM 실측 속성(`afterBox`)을 각각 캡처.
  - 두 영역을 포괄하는 Union Bounding Box (`unionLeft`, `unionTop`, `unionRight`, `unionBottom`)를 마스크로 계산.
  - Stress 모드의 3단락 텍스트 확장 높이 및 1.3배 너비를 정확하게 반영.
- **실측 성과**:
  - Normal Layout Stability: **Unintended Regressions 0, Avg Mismatch 0.0000% (`VERIFIED`)**
  - Stress Layout Stability: **Unintended Regressions 0, Avg Mismatch 0.0000% (`VERIFIED`)**
  - 인위적 마스크 과대 확장 없이 실제 객체 변형 범위만을 정확하게 마스킹하여 오탐지를 원천 해소.

### 2.4 Stage C: 대형 전경 객체 변수 일치 및 단계별 실측
- **수정 구현**:
  - 변수명 불일치 해결: `$largeForegroundCount` vs `$largeForegroundTested`를 `$largeForegroundPersisted`로 일치.
  - 단계별 통계 집계: `candidateCount: 7`, `attemptedCount: 5`, `successfulCount: 5`, `persistedCount: 5`.
  - 5건의 실제 대형 전경 객체(카드, 사이드바 등)가 Word COM에서 성공적으로 수정되고 재열기 시 영속됨을 실측 확인.

---

## 3. 원본 형상 출처(Provenance) 및 무결성 통계

- **Figma 소스 노드 수**: 2,033개
- **Canvas IR 및 DOCX 변환 대상 객체**: 1,312개
- **DOCX 내 미해결(Unresolved) 객체**: **0건 (0.0%)**
- **텍스트 원문 보존율**: **628 / 628 (100.0%) 완전 일치** (`VERIFIED`)
- **도형 기하 보존율**: **327 / 327 (100.0%) 검증 완료** (`VERIFIED`)
- **이미지 미디어 보존율**: **19 / 19 (100.0%) 검증 완료** (`VERIFIED`)
- **정직한 출처(Provenance) 분류**:
  - `SOURCE_GEOMETRY`: 0
  - `LOCALLY_RECOVERED_GEOMETRY`: 175 (돋보기 렌즈/막대, 꺾쇠, 정렬 바 등 기하 복원)
  - `SEMANTIC_APPROXIMATION`: 60 (아이콘 의미론적 정밀 근사)
  - `GEOMETRIC_FALLBACK`: 3
  - `PRIMITIVE_SHAPE`: 1,074 (사각형 78, 선 4, 타원 7 등 원본 기본도형)
  - `UNRESOLVED`: **0**

---

## 4. 16개 프레임 시각적 충실도(SSIM) 벤치마크 결과

- **평균 SSIM**: **0.9492** (품질 게이트 임계치 `0.9400` 통과)
- **평균 MAE**: **2.53**
- **평균 RMSE**: **14.78**
- **평가 프레임 수**: 16 / 16 프레임 전수 평가 완료 (Figma 기준 PNG 대조)

---

## 5. 9대 품질 게이트 판정 결과

| 게이트 식별자 | 게이트 명칭 | 최종 상태 | 세부 평가 요약 |
|---|---|:---:|---|
| `GATE_PROVENANCE` | 입력 및 아티팩트 출처 게이트 | **PASSED** | 고객사 원본 및 디스크 아티팩트 해시 100% 일치 |
| `GATE_MEASUREMENT_INTEGRITY` | 측정 및 수학적 무결성 게이트 | **PASSED** | 수치 경계치, 비음수 오차, 수학적 일관성 검증 완료 |
| `GATE_OBJECT_TRACEABILITY` | 소스-Word 객체 추적성 게이트 | **PASSED** | 2033 노드 중 1312 객체 매핑, Text/Shape/Image 100% 보존, 미해결 0건 |
| `GATE_SECTION_PAGE_MAPPING` | 섹션-렌더링 페이지 대응 게이트 | **PASSED** | 17개 섹션과 17개 Word 렌더링 페이지 간 1:1 일치 |
| `GATE_EDITABILITY` | DOCX 네이티브 편집성 게이트 | **PASSED** | DOCX 네이티브 편집 점수 88/100 달성 |
| `GATE_MEDIA_RELATIONSHIPS` | 미디어 관계 무결성 게이트 | **PASSED** | 11개 이미지 관계 결함 0건 |
| `GATE_LAYOUT_STABILITY` | 마스크 기반 레이아웃 안정성 게이트 | **PASSED** | Normal 및 Stress 모두 비편집 영역 오차 0.0000%, 회귀 0건 |
| `GATE_WORD_EDIT_PERSISTENCE` | Word 네이티브 편집 영속성 게이트 | **PASSED** | Normal 25/25 (100%), Stress 25/25 (100%) 한글 본문 완전 보존 |
| `GATE_VISUAL_FIDELITY` | 시각 충실도 벤치마크 게이트 | **PASSED** | 16개 프레임 전수 평가, Mean SSIM 0.9492 >= 0.9400 달성 |

- **최종 품질 판정**: **APPROVED (`exitCode: 0`, 9/9 PASSED)**
