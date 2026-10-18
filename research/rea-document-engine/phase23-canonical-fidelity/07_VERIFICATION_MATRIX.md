# Phase 23: Verification Matrix

## 1. 4단계 다층 검증 매트릭스

| 검증 단계 | 검증 도구 / 명령 | 통과 기준 | Phase 23 실측 결과 |
|---|---|---|---|
| **Level 1: 타입 및 린트 무결성** | `npx tsc --noEmit` | 에러 0건 | **PASS** (0 errors) |
| **Level 2: 단위 및 통합 회귀 테스트** | `npx vitest run` | 57개 파일, 365개 테스트 100% 통과 | **PASS** (57 files, 365 tests passed) |
| **Level 3: 정품 레퍼런스 AST 비교** | `python scripts/compare_hwpx_ast.py` | SPEC_VIOLATION 0건 | **PASS** (0 violations detected) |
| **Level 4: 크로스포맷 정합성 하네스** | `npx tsx scripts/run_cross_format_harness.ts` | DOCX/HWPX 패키지 동시 유효 및 텍스트 100% 보존 | **PASS** (Stage 6 & 7 모두 PASSED) |

---

## 2. 산출물 및 생성 검증 목록

| 산출물 파일 | 위치 | 규격 검증 | 크로스포맷 대응 |
|---|---|---|---|
| `stage1-korean-text.hwpx` | `debug/hwpx-phase23/` | SCHEMA_VALID | `stage1-korean-text.docx` |
| `stage2-typography.hwpx` | `debug/hwpx-phase23/` | SCHEMA_VALID | `stage2-typography.docx` |
| `stage3-rect-line.hwpx` | `debug/hwpx-phase23/` | SCHEMA_VALID | `stage3-rect-line.docx` |
| `stage4-textbox-oval-vector.hwpx` | `debug/hwpx-phase23/` | SCHEMA_VALID | `stage4-textbox-oval-vector.docx` |
| `stage5-images.hwpx` | `debug/hwpx-phase23/` | SCHEMA_VALID | `stage5-images.docx` |
| `stage6-representative-report.hwpx` | `debug/hwpx-phase23/` | SCHEMA_VALID | `stage6-representative-report.docx` |
| `stage7-full-report.hwpx` | `debug/hwpx-phase23/` | SCHEMA_VALID | `stage7-full-report.docx` |
