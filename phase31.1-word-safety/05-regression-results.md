# 05. Regression Test Results & Suite Health

## 1. Executive Summary

A complete, non-isolated regression run was executed across the entire `Figma2Word` test suite using Vitest v5.0.3 on macOS 15.6 (Darwin 25.6.0 arm64).

- **Total Test Files**: 71 (including 1 new suite: `phase31-1-word-safety.test.ts`)
- **Passed Test Files**: 71 (100%)
- **Failed Test Files**: 0 (0%)
- **Total Tests**: 465
- **Passed Tests**: 463 (99.57%)
- **Skipped Tests**: 2 (0.43%, intentional live Figma cloud network tests requiring API tokens)
- **Execution Duration**: 5.73 seconds
- **Verifiable Raw Log**: `phase31.1-word-safety/evidence/test-logs/full_test_log.txt`

---

## 2. Comparison with Previous Phases

| Metric | Phase 29 Baseline | Phase 30 Baseline | Phase 31 Baseline | Phase 31.1 Current | Change vs Phase 31 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Total Test Files** | 68 | 69 | 70 | **71** | +1 test suite |
| **Passed Test Files** | 68 (100%) | 69 (100%) | 70 (100%) | **71 (100%)** | 100% pass rate |
| **Total Tests** | 432 | 441 | 449 | **465** | +16 tests |
| **Passed Tests** | 430 | 439 | 447 | **463** | +16 tests |
| **Failed Tests** | 0 | 0 | 0 | **0** | Zero regressions |
| **Skipped Tests** | 2 | 2 | 2 | **2** | Cloud network tests |

---

## 3. Dedicated Phase 31.1 Failure Injection Test Suite

File: `tests/phase31-1-word-safety.test.ts` (16 tests passed, 5.51s duration)
- **Part B (Open Failure Path O1 ~ O5)**: 5 tests passed
- **Part C (Close Failure Path C1 ~ C6)**: 6 tests passed
- **Part D (PDF Staging Lifecycle D1 ~ D3)**: 3 tests passed
- **Part E (VML ArcSize Empirical Formula)**: 2 tests passed

---

## 4. Native Word for Mac Smoke Test Execution

- **Script**: `scripts/run_phase30_visual_pipeline.ts`
- **Word for Mac v16.114**: Executed successfully.
- **Result**:
  - Target loaded: `phase30_rendered.docx` (2 sections).
  - Target exported: `phase30_rendered.pdf` (166.7 KB).
  - High-res PNGs: 2 pages rendered.
  - Target closed cleanly: `close_confirmed`.
  - User documents: 2 existing user documents detected in Word remained protected and untouched throughout execution.
  - Image card center pixel: `#3662E3` (solid blue).
  - Blue pixels inside card bounds: 75,416 pixels.
  - Overlay white text: 52 high-contrast pixels.
