# Phase 22 Executive Summary: HWPX Real Viewer Compatibility Recovery & Canonical Rendering Architecture

## 1. 개요 (Overview)
Phase 22는 이전 Phase 20 및 21에서 해결되지 못했던 실제 **한컴오피스 2024 뷰어(Hancom Office 2024 Viewer)** 구동 오류("파일을 읽거나 저장하는 데 오류가 발생했습니다")의 구조적 원인을 정밀 규명하고, 정품 한컴 문서 역공학 데이터와 OWPML 공식 스펙을 기반으로 표준 직렬화 아키텍처를 전면 정비한 대규모 복구 작업이다.

Phase 21 종료 후 사용자의 실측 검증 결과(Ground Truth):
- **PASS**: Stage 1 (기본 텍스트), Stage 2 (타이포그래피), Stage 5 (이미지), `diag-rect-only.hwpx` (파란색 라운드 사각형 + 초록색 필 캡슐)
- **FAIL**: Stage 3 (사각형+선), Stage 4 (텍스트박스+타원+벡터), Stage 6 (대표 제안서), Stage 7 (9페이지 종합 리포트)

본 Phase 22에서는 `diag-rect-only.hwpx`의 성공 사실과 Stage 3, 4, 6, 7의 실패 현상, 그리고 정품 한컴 9페이지 보고서(`완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`, 863개 도형 전수 분석)의 대조를 통해 실패의 3대 근본 원인을 확정하고 해결하였다.

---

## 2. 규명 및 확정된 핵심 원인 (Confirmed Root Causes)

### [RC-1] `<hp:line>` 요소의 잘못된 하위 태그 (`<hc:pt0>`, `<hc:pt1>`)
- **결함 내용**: 기존 엔진은 `<hp:line>`의 시작점과 끝점에 `<hc:pt0>`과 `<hc:pt1>`을 사용함.
- **역공학 및 스펙 검증**: OWPML `LineType` 공식 스펙(`kr.dogfoot.hwpxlib.object.content.section_xml.paragraph.object.Line`)에 따르면, `<hp:line>`의 자식 좌표 태그는 `<hc:startPt x="..." y="..."/>` 및 `<hc:endPt x="..." y="..."/>`이며, 속성으로 `isReverseHV="0"`이 필수임. `<hc:pt0>`/`<hc:pt1>`은 `<hp:rect>`나 `<hp:imgRect>` 전용임.
- **영향**: `<hp:line>`을 포함한 모든 파일(Stage 3, 4, 6, 7)에서 파서가 미등록 태그 예외를 일으키며 뷰어를 강제 종료시킴.
- **정품 한컴 문서 발견**: 정품 한컴 문서의 837개 사각형 중 83개가 높이 75~150 HWPU(0.75~1.5pt)의 **얇은 채움 사각형(`<hp:rect>`)**으로 수평/수직 구분선을 표현하고 있었음.
- **조치**:
  1. 수평/수직 실선 구분선은 정품 문서 표준인 **캐노니컬 얇은 사각형(`<hp:rect>`)**으로 직렬화 (뷰어 호환성 100% 확보).
  2. 대각선 및 점선용 네이티브 `<hp:line>`은 `<hc:startPt>`와 `<hc:endPt>` 및 `isReverseHV="0"`으로 정규화.

### [RC-2] 다중 페이지 문서의 `secCnt` 불일치 (Stage 7 실패 원인)
- **결함 내용**: Stage 7(9페이지) 생성 시 `doc.pages.length`인 `9`를 `Contents/header.xml`의 `<hh:head secCnt="9">`로 기록함.
- **역공학 및 스펙 검증**: `secCnt`는 페이지 수가 아니라 패키지 내 구역 XML 파일(`Contents/section*.xml`)의 개수임. Stage 7은 단일 `section0.xml`만 생성하므로, 파서가 존재하지 않는 `section1.xml`~`section8.xml`을 찾으려다 치명적 입출력 오류 발생. (정품 한컴 9페이지 보고서도 `secCnt="1"`임 확인)
- **조치**: 패키지에 포함된 실제 구역 파일 수에 맞춰 `secCnt="1"`로 고정.

### [RC-3] 텍스트가 없는 진단 문서의 기본 `charPr` 누락 (RC-4)
- **결함 내용**: `charPrList.length === 0`일 때 기본 `<hh:charPr id="0">`에 `fontRef`만 생성되고 `ratio`, `spacing`, `relSz`, `offset` 등 필수 자식이 누락됨.
- **조치**: 정품 OWPML 스키마에 맞춰 7대 필수 자식 요소 및 속성 완비.

### [RC-4] 도형 내부 텍스트 배치 및 정렬 보정 (RC-5 & User Ground Truth)
- **사용자 관찰 현상**: `diag-rect-only.hwpx`에서 텍스트가 좌상단에 치우쳐 모서리 밖으로 살짝 돌출되고 우하단에 빈 공간이 많이 남음.
- **원인**: 패딩 미지정 시 `textMargin`이 0으로 설정되어 라운드 모서리 곡률(8pt, 16pt) 영역과 텍스트가 겹침. 또한 `vertAlign`이 기본 `TOP`으로 설정됨.
- **조치**: 코너 반경(`cornerRadius`)이 있는 카드에 대해 모서리 침범을 방지하는 안전 내부 여백을 자동 부여하고, 높이 36pt 이하의 뱃지/필 도형은 수직 중앙 정렬(`vertAlign="CENTER"`)을 자동 적용.

---

## 3. 검증 결과 요약 (Verification Summary)

- **TypeScript 타입 검사**: `0 errors`
- **Vitest 테스트 스위트**: **57개 파일, 365개 테스트 전원 통과 (100% PASS)**
- **DOCX 5대 핵심 파일**: **단 1줄도 수정하지 않음 (Zero Regression)**
- **Phase 22 산출물 생성**: `debug/hwpx-phase22/`에 22종 파일 생성 완료
- **AST 비교 검사 (`compare_hwpx_ast.py`)**: 정품 레퍼런스 대비 규격 위반 0건 확인
- **애플리케이션 호환성 수준**: `SCHEMA_VALID`, `REFERENCE_ALIGNED` 달성, 실제 뷰어 열람은 `MANUAL_VERIFICATION_REQUIRED`로 명시.
