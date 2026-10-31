# Figma2Word — Phase 35.1 Deliverables Package
## Real-Document End-to-End Fidelity Recovery & Evidence-Based Renderer Optimization

**Version**: Phase 35.1  
**Date**: 2026-10-31  
**Status**: `PHASE 35.1 RECOVERY COMPLETE`

---

## 1. Directory Structure

```text
phase35-1-real-document-recovery/
├── README.md                                  (This index file)
├── reports/
│   ├── 01-previous-audit-findings.md          (5 major defects in Phase 35 analyzed & legacy metrics invalidated)
│   ├── 02-real-json-pipeline.md               (Real pipeline architecture & local workstation asset audit)
│   ├── 03-before-after-builds.md              (Independent Before/After build isolation rules)
│   ├── 04-word-native-rendering.md            (Windows Word 16.0 COM automation hardening & process safety)
│   ├── 05-fidelity-results.md                 (17 target frames status & honest benchmark reporting)
│   ├── 06-editability-results.md              (Docx editability auditor corrections & verification)
│   ├── 07-renderer-improvements.md            (Universal structural renderer enhancements in docxCanvasRenderer.ts)
│   ├── 08-integrity-gates.md                  (Provenance & Measurement Integrity Gates architecture)
│   ├── 09-regression-tests.md                 (Full test suite execution & quality gates results)
│   └── 10-final-assessment.md                 (Comprehensive assessment, final verdict block & Phase 36 roadmap)
├── metrics/
│   ├── measured-baseline.json                 (Baseline benchmark dataset or blocked manifest)
│   ├── measured-improved.json                 (Improved benchmark dataset or blocked manifest)
│   ├── measured-comparison.csv                (Frame-by-frame 1:1 metrics comparison table)
│   ├── editability.json                       (DOCX internal XML structure & editability audit)
│   └── provenance-manifest.json               (Strict pipeline provenance record & SHA-256 manifest)
└── evidence/
    ├── commands.md                            (Reproducible command log)
    ├── sanitized-execution-log.txt            (Sanitized CLI execution logs)
    ├── git-diff.patch                         (Clean patch of all Phase 35.1 changes)
    └── README.md                              (Evidence manifest)
```

---

## 2. Key Commands

```bash
# 1. Run all regression tests including new integrity gate suites
npx vitest run

# 2. Run TypeScript static verification
npx tsc --noEmit

# 3. Run production web app build
npm --prefix apps/web run build

# 4. Run recovery pipeline on customer JSON (demonstration on real file)
npx tsx scripts/run_phase35_1_real_recovery.ts --json debug/customer/Report1-Live-Snapshot.json

# 5. Run recovery pipeline when the 186.52MB JSON is placed
npx tsx scripts/run_phase35_1_real_recovery.ts --json "펜테크 3차 디자인.json"
```
