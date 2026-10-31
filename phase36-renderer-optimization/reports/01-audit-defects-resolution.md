# Phase 36 Report 01: Audit Defects Resolution (Part A)

## Executive Summary

In Phase 35.2, four specific defects and ambiguities were flagged during independent audit review:
1. **A-01: Independent Current Measurement**: Ensure strictly separated pipelines for Baseline (`13df75f`), Current (`77fea13`), and Candidate (Phase 36) without DOCX sharing or metric borrowing.
2. **A-02: Baseline Git Origin Verification**: Resolve line ending discrepancies (Git LF vs Windows worktree CRLF) for `13df75f:src/canvas/renderer/docxCanvasRenderer.ts` through normalized hash verification.
3. **A-03: Editability Auditor Page Mapping Defect**: Correct paragraph-level `<w:sectPr>` parsing in `auditDocxEditability` which caused Page 1 to be falsely classified as `EMPTY_PAGE, Score 0` despite containing 72 elements and achieving 0.9446 SSIM.
4. **A-04: Non-Zero Process Exit Code on Gate Failure**: Enforce explicit non-zero exit codes (`process.exitCode = 1`) and throwing exceptions when Provenance Gate or Measurement Integrity Gate fails, verified by automated unit tests.

All four defects have been completely resolved, verified, and hardened in Phase 36.

---

## Detailed Resolutions

### 1. A-01: Three Independent Pipelines
- **Baseline Pipeline**: Uses commit `13df75f` checked out at `debug/worktree-baseline`. It invokes `BaselineParser` and `BaselineRenderer` to generate `local-fidelity-artifacts/baseline/actual.docx` (SHA-256: `38dd5dea07...`), which converts to PDF and PNGs independently.
- **Current Pipeline**: Uses commit `77fea13` checked out at `debug/worktree-current`. It invokes `CurrentParser` and `CurrentRenderer` to generate `local-fidelity-artifacts/current/actual.docx` (SHA-256: `ead96931b5...`), which converts to PDF and PNGs independently.
- **Candidate Pipeline**: Uses the Phase 36 optimized working tree. It invokes `CandidateParser` and `CandidateRenderer` to generate `local-fidelity-artifacts/candidate/actual.docx` (SHA-256: `c5468ec280...`), which converts to PDF and PNGs independently.
- **Outcome**: Each pipeline has unique source code, unique DOCX hashes, unique PDF hashes, and unique PNG hashes. No metrics are shared or assumed.

### 2. A-02: Baseline Lineage & Hash Verification
- In Git, commit `13df75f` stores `src/canvas/renderer/docxCanvasRenderer.ts` as blob object `096252126c58fa3e489fbd707ca6be309e4889c6`.
- The raw Git blob hash using LF line endings is:
  `845fc826b037026f56c358934d7bd3a3a656c198394a822425aedf1ac3b08306`
- When checked out onto a Windows filesystem, Git converts LF to CRLF, resulting in file hash:
  `ad94099fb8bc8462a160370d977bdb62b8abba8acec1a1647da077b0948049db`
- Normalizing newlines (`content.replace(/\r\n/g, "\n")`) yields an exact 100% hash match with the Git LF blob (`845fc826...`).

### 3. A-03: Editability Auditor Section Parsing Correction
- In Word OpenXML (ECMA-376), each page break except the last is encoded as `<w:sectPr>` inside `<w:pPr>` of the concluding paragraph of that section:
  `<w:p><w:pPr><w:sectPr>...</w:sectPr></w:pPr><w:r>...runs of this section...</w:r></w:p>`
- Previously, `editabilityAuditor.ts` split raw XML at `indexOf("</w:sectPr>")`. This sliced the document between `<w:pPr>` and `<w:r>`, dumping Page 1's content runs into Section 2 and leaving Section 1 with 0 text nodes (`EMPTY_PAGE, Score 0`).
- **Fix**: The section boundary is now tracked by identifying if `<w:sectPr>` is inside an active `<w:p>`, extending the chunk boundary to the closing `</w:p>` of that enclosing paragraph. Standalone `<w:sectPr>` elements at `<w:body>` level terminate the final section.
- **Verification**: Section 1 now correctly reports 1 text node and 3 vector shapes, achieving an editability score of 100/100 (`FULLY_EDITABLE`). Zero empty pages exist.

### 4. A-04: Non-Zero Process Exit Code on Gate Failure
- Added `assertGatePassed(name, result)` in `src/fidelity/integrityGate.ts`.
- If `!result.passed`, `process.exitCode = 1` is explicitly set and an Error is thrown with violation details.
- Added comprehensive unit tests in `tests/phase36-audit-fixes.test.ts` verifying that gate failures trigger exceptions and set exit code 1.
