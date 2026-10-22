# Phase 31.1 Word Automation Safety & Failure Injection Dossier

This directory contains empirical verification evidence, low-level failure injection test suites, and audit reports addressing the remaining failure paths and VML geometry concerns raised after Phase 31.

## Structure

```
phase31.1-word-safety/
├── README.md
├── 01-open-failure-analysis.md       # Open exception path analysis & premature deletion remediation
├── 02-close-failure-injection.md      # Full-lifecycle close failure injection tests (C1 ~ C6)
├── 03-staging-pdf-lifecycle.md        # Word container PDF staging lifecycle & concurrency safety
├── 04-vml-arcsize-verification.md     # Empirical Word for Mac measurement of VML arcsize formula
├── 05-regression-results.md           # 71/71 test files passed (463 passed, 2 skipped, 0 failed)
├── 06-final-assessment.md             # Final readiness assessment and established invariants
└── evidence/
    ├── test-logs/                     # Full Vitest run log (463 tests)
    ├── word-rendering/                # Real Microsoft Word for Mac native rendering artifacts
    └── xml/                           # Extracted OpenXML document.xml files
```

## Quick Verification Commands

```bash
# 1. Run the dedicated Phase 31.1 failure injection test suite
npx vitest run tests/phase31-1-word-safety.test.ts

# 2. Run the complete regression suite (71 test files, 463 tests)
npm test

# 3. Run Word for Mac native visual pipeline
npx tsx scripts/run_phase30_visual_pipeline.ts
```
