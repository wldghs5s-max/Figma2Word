# Phase 21 Stage Artifacts Inventory & Deliverables Specification

## 1. 개요

Phase 21의 산출물은 다음 디렉터리에 독립적으로 체계화되어 보존된다.
- **기준군 백업본**: `debug/hwpx-phase20-baseline/` (Phase 20 시점의 실측 실패/성공 원본 보존)
- **Phase 21 복구 완료본**: `debug/hwpx-phase21/` (하드닝이 적용된 신규 빌드 및 마이크로 진단 파일)
- **최신 활성 배포본**: `debug/hwpx-recovery/` (최신 실행 환경용 동기화 완료)

---

## 2. 산출물 상세 인벤토리

### A. Stage 1: Minimal Korean Text (`stage1-korean-text.hwpx`)
- **파일 크기**: 5,375 bytes
- **페이지 수**: 1 페이지 (A4 Portrait, 595.28 x 841.89 pt)
- **도형 구성**: 배경 `<hp:rect>` 1개, 텍스트 `<hp:rect>` 2개
- **검증 내용**: `<hp:secPr>` 위치, 단일 `<hp:p>` 내 텍스트 런 연속성, 맑은 고딕 160% 줄간격, 대문자 언어 코드.
- **상태**: **BASELINE_PASS** (한컴 뷰어 실측 검증 완료)

### B. Stage 2: Typography & Styling (`stage2-typography.hwpx`)
- **파일 크기**: 5,474 bytes
- **페이지 수**: 1 페이지 (A4 Portrait)
- **도형 구성**: 배경 `<hp:rect>` 1개, 텍스트 `<hp:rect>` 2개
- **검증 내용**: 굵은 글씨(Bold 700), 기울임꼴(Italic), 밑줄(Underline), 취소선(Strikeout), 자간 확장(+2pt), 다양한 색상 혼합.
- **상태**: **BASELINE_PASS** (한컴 뷰어 실측 검증 완료)

### C. Stage 3: Rectangles, Cards & Lines (`stage3-rect-line.hwpx`)
- **파일 크기**: 5,582 bytes
- **페이지 수**: 1 페이지 (A4 Portrait)
- **도형 구성**: 배경 rect 1개, 텍스트 rect 1개, 솔리드/대시 line 2개, 카드/필/다크패널 rect 3개
- **주요 수정 사항**:
  - `s3_card1`: 테두리 1pt(`#3B82F6`), 배경색(`#EFF6FF`), 모서리 반경 8pt. (`undefined` 속성 완전 제거)
  - `s3_pill`: 승인 완료 배지, 모서리 반경 16pt (ratio 50 캡핑 적용).
  - `s3_card2`: 다크 테마 패널 (`#1E293B`).
  - `s3_line1`, `s3_line2`: `isReverseHV` 제거된 순수 표준 `<hp:line>` 적용.
- **상태**: **RECOVERED** (치명적 속성 오류 제거 완료)

### D. Stage 4: Textbox, Oval & Vector (`stage4-textbox-oval-vector.hwpx`)
- **파일 크기**: 5,703 bytes
- **페이지 수**: 1 페이지 (A4 Portrait)
- **도형 구성**: 배경 rect 1개, 텍스트/패딩 card 2개, ellipse 2개, vector 3개
- **주요 수정 사항**:
  - `<hp:oval>` -> KS X 6101 정품 규격 `<hp:ellipse>`로 완전 치환.
  - `s4_circle`: 90x90 pt 정원, 파란색 채우기 및 테두리.
  - `s4_ellipse`: 135x75 pt 타원, 핑크색 채우기.
  - `s4_textbox`: 상하 10pt, 좌우 15pt 명시적 내부 패딩(`<hp:textMargin>`) 적용.
  - `s4_check`, `s4_triangle`, `s4_poly`: SVG 패스 파싱 기반 다각형(`<hp:polygon>`) 및 연결선.
- **상태**: **RECOVERED** (미등록 태그 치환 및 기하 좌표 정상화 완료)

### E. Stage 5: Images & Cropping (`stage5-images.hwpx`)
- **파일 크기**: 5,778 bytes
- **페이지 수**: 1 페이지 (A4 Portrait)
- **도형 구성**: 배경 rect 1개, 텍스트 rect 1개, pic 3개
- **검증 내용**: 1x1 투명 PNG 및 색상 차트 PNG, FIT 종횡비 계산, 상하좌우 10% 명시적 크롭(`<hp:imgClip>`).
- **상태**: **BASELINE_PASS** (한컴 뷰어 실측 검증 완료)

### F. Stage 6: Representative Multi-Page Report (`stage6-representative-report.hwpx`)
- **파일 크기**: 6,675 bytes
- **페이지 수**: 1 페이지 (A4 Portrait, Proposal Doc)
- **도형 구성**: 배경 rect 1개, 정보 카드/텍스트 rect 7개, divider line 1개, pic 1개
- **주요 수정 사항**: 제안서 내 다수의 헤더 박스, 통계 카드, 구분선 전체의 `undefined` 속성 제거.
- **상태**: **RECOVERED**

### G. Stage 7: Full Customer Multi-Page Report (`stage7-full-report.hwpx`)
- **파일 크기**: 14,216,304 bytes (약 14.2 MB)
- **페이지 수**: 9 페이지 종합 실측 리포트
- **도형 구성**:
  - 직사각형(`<hp:rect>`): 689개 (KPI 카드, 표 셀, 헤더 바, 배경)
  - 선(`<hp:line>`): 83개
  - 타원(`<hp:ellipse>`): 4개 (도넛 차트 원형)
  - 다각형(`<hp:polygon>`): 8개 (복합 차트 및 화살표)
  - 그림(`<hp:pic>`): 16개 (실제 고객 로고 및 차트 캡처 이미지)
- **주요 수정 사항**: 9개 페이지 전체에 걸친 797개 모든 드로잉 객체의 `undefined` 유출 박멸 및 타원 태그 정상화.
- **상태**: **RECOVERED**

---

## 3. 마이크로 진단 파일 (Micro Diagnostics)

- `diag-rect-only.hwpx` (5,455 bytes): 순수 직사각형/카드 전용
- `diag-line-only.hwpx` (5,401 bytes): 순수 직선 전용
- `diag-ellipse-only.hwpx` (5,487 bytes): 순수 타원/원형 전용
- `diag-polygon-only.hwpx` (5,419 bytes): 순수 다각형 벡터 전용

