# Phase 31 Quality Validation Dossier

This directory contains the complete verification evidence, empirical experiment logs, and audit reports for Phase 31 of `Figma2Word`.

## Directory Structure

```
phase31-quality-validation/
├── reports/
│   ├── 01-audit-findings-verification.md  # Comprehensive adjudication of audit items A1 ~ A8
│   ├── 02-png-integrity.md                # Byte-level analysis of PNG corruption and fix
│   ├── 03-vml-experiments.md              # Empirical Word rendering of VML image binding variants
│   ├── 04-word-automation-safety.md       # Fail-closed lifecycle state machine & directory safety
│   ├── 05-hwpx-validation.md              # HWPX drop shadow offset fix and OWPML compliance
│   ├── 06-figma-pipeline-validation.md    # Figma-to-Canvas IR image fill conversion trace
│   ├── 07-native-rendering.md             # Real Word for Mac rendering measurements (before vs after)
│   ├── 08-regression-results.md           # 70/70 test files passed (447 tests passed)
│   └── 09-final-assessment.md             # Established quality baseline for Phase 32
├── evidence/
│   ├── before/                            # Rendered artifacts prior to fix (page-001-corrupt-png.png)
│   ├── after/                             # Rendered artifacts after fix (page-001-fixed.png, DOCX, HWPX, PDF)
│   ├── vml-experiments/                   # Artifacts from variants A, B, C1, C2
│   ├── docx-xml/                          # Raw extracted XML from fixed DOCX package
│   ├── hwpx-xml/                          # Raw extracted XML from fixed HWPX package
│   └── logs/                              # Full regression test execution log
└── README.md
```

## Quick Verification Commands

```bash
# 1. Run all regression tests (70 test files, 447 tests)
npm test

# 2. Run dedicated Phase 31 audit verification tests
npx vitest run tests/phase31-audit-verification.test.ts

# 3. Run real Microsoft Word for Mac visual pipeline
npx tsx scripts/run_phase30_visual_pipeline.ts
```
