# Phase 22 Validation Matrix & Verification Levels

## 1. 검증 수준 정의 (Verification Levels)

본 Phase 22에서는 기술적 정직성을 위해 검증 수준을 엄격히 구분하여 보고한다:

1. `XML_WELL_FORMED`: XML 파서(DOM/ElementTree)가 문법 오류 없이 파싱 가능함.
2. `PACKAGE_VALID`: ZIP 컨테이너, manifest, container.xml 및 필수 패키지 파일이 규격대로 구성됨.
3. `SCHEMA_VALID`: KS X 6101 / OWPML 태그 시퀀스, 필수 속성 및 타입 제약(정수, 열거형)을 준수함.
4. `REFERENCE_ALIGNED`: 실제 정품 한컴오피스 생성 문서와 요소 구조 및 패턴이 정합함.
5. `APP_OPEN_PASS`: 실제 한컴오피스 2024 뷰어 / 오피스에서 오류 팝업 없이 정상 열림이 확인됨.
6. `VISUAL_PASS`: 실제 화면에서 도형, 텍스트, 여백의 시각적 배치가 의도대로 표시됨.
7. `EDITABILITY_PASS`: 한글 프로그램에서 텍스트 및 개체 편집이 원활함.

> **원칙**: 하위 검증을 통과했다고 상위 검증까지 통과한 것으로 간주하지 않는다. 실제 뷰어에서 직접 열어보지 않은 파일은 예외 없이 `MANUAL_VERIFICATION_REQUIRED`로 명시한다.

---

## 2. Phase 22 산출물 종합 검증 매트릭스

| 번호 | 산출물 파일명 | XML | ZIP | SCHEMA | REF_ALIGN | APP_OPEN (뷰어 열림) | 우선 점검 순위 |
|---|---|---|---|---|---|---|---|
| 1 | `stage1-korean-text.hwpx` | PASS | PASS | PASS | PASS | PASS (Phase 21 확인) | 참고 |
| 2 | `stage2-typography.hwpx` | PASS | PASS | PASS | PASS | PASS (Phase 21 확인) | 참고 |
| 3 | `stage5-images.hwpx` | PASS | PASS | PASS | PASS | PASS (Phase 21 확인) | 참고 |
| 4 | `baseline-rounded-rect.hwpx` | PASS | PASS | PASS | PASS | PASS (`diag-rect` 성공군) | 참고 |
| 5 | `iso-horizontal-divider.hwpx`| PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | **1순위 (구분선 단독)** |
| 6 | `stage3-rect-line.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | **2순위 (카드+구분선)** |
| 7 | `stage6-representative-report.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | **3순위 (대표 제안서)** |
| 8 | `stage7-full-report.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | **4순위 (9p 종합)** |
| 9 | `iso-line-native.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 5순위 (네이티브 점선) |
| 10| `iso-textbox.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 6순위 (패딩/정렬) |
| 11| `iso-rounded-rect-with-text.hwpx`| PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 7순위 (필 캡슐 텍스트) |
| 12| `stage4-textbox-oval-vector.hwpx`| PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 8순위 (복합 벡터) |
| 13| `iso-two-pages-one-section.hwpx`| PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 9순위 (2페이지) |
| 14| `iso-nine-pages-one-section.hwpx`| PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 10순위 (9페이지) |
| 15| `iso-vertical-divider.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 추가 진단군 |
| 16| `iso-line-as-rect.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 추가 진단군 |
| 17| `iso-diagonal-line.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 추가 진단군 |
| 18| `iso-ellipse.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 추가 진단군 |
| 19| `iso-polygon-closed.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 추가 진단군 |
| 20| `iso-vector-open.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 추가 진단군 |
| 21| `baseline-text.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 기본 기준군 |
| 22| `baseline-image.hwpx` | PASS | PASS | PASS | PASS | **MANUAL_VERIFY** | 기본 기준군 |

---

## 3. 회귀 검증 현황

- **DOCX 코어 회귀 검사**: 통과 (DOCX 파서/렌더러 5대 파일 변경 0바이트)
- **기존 Vitest 스위트**: 57개 테스트 파일, 365개 테스트 100% 통과 (0 failures)
- **정품 레퍼런스 AST 비교**: `compare_hwpx_ast.py` 실행 결과 `0 violations`
