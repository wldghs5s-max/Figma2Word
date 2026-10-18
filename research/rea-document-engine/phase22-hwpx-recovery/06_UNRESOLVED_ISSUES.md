# Phase 22 Unresolved Issues & Technical Boundaries

## 1. 잔여 과제 및 기술적 제약

### 1.1 실제 한컴오피스 2024 뷰어 사용자 검증 대기 (`MANUAL_VERIFICATION_REQUIRED`)
- **현 상태**:
  - `XML_WELL_FORMED`: 100% 통과
  - `PACKAGE_VALID`: 100% 통과
  - `SCHEMA_VALID`: KS X 6101 및 OWPML 공식 스펙 일치
  - `REFERENCE_ALIGNED`: 정품 레퍼런스(`완성본-20261012/*.hwpx`)와 AST 구조 일치
- **제약 사항**:
  - 개발 환경의 제약으로 인해 한컴 뷰어의 GUI 화면을 직접 캡처하거나 육안 확인하지 못함.
  - 따라서 사용자가 실제 PC의 한컴 뷰어로 열람하기 전까지는 `APP_OPEN_PASS`를 확정 선언하지 않고 `MANUAL_VERIFICATION_REQUIRED`로 분류함.

### 1.2 복합 다중 구역 (Multi-Section) 분할 미구현
- **현 상태**:
  - Stage 7을 포함한 모든 다중 페이지 문서는 단일 구역(`Contents/section0.xml`) 내에 순차적으로 페이지를 배치함.
  - `header.xml`의 `secCnt="1"`로 일치시켜 파서 충돌을 방지함.
- **향후 확장 과제**:
  - 문서 내에서 가로(Landscape) 페이지와 세로(Portrait) 페이지가 혼합되는 경우, 구역 분할(`section1.xml`, `section2.xml` ...) 및 `<hp:secPr>` 다중화 지원이 필요할 수 있음.

### 1.3 복합 화살표 및 선 끝단 장식
- **현 상태**:
  - 네이티브 `<hp:line>`은 `headStyle="NORMAL"`, `tailStyle="NORMAL"`, `endCap="FLAT"`을 기본값으로 사용함.
- **향후 과제**:
  - 피그마에서 정의된 화살표(Arrowhead) 마커를 정밀하게 한컴 OWPML 화살표 스타일로 1:1 매핑하는 작업은 후속 Phase에서 고도화 가능.

---

## 2. 권고 조치 사항

1. 사용자는 시험 공부에 방해받지 않는 편한 시간에 `debug/hwpx-phase22/` 폴더의 우선순위 파일들을 한컴 뷰어로 가볍게 열어본다.
2. 만약 특정 파일에서 여전히 오류 팝업이 발생할 경우, 마이크로 분리 파일(`iso-*.hwpx`)을 통해 실패 요소(구분선, 텍스트박스, 타원 등)를 1초 만에 특정할 수 있도록 체계화되어 있다.
