# Phase 36 Report 02: Baseline Lineage and Git Origin Verification

## Objective

To provide an incontrovertible cryptographic lineage verification of the Baseline renderer code derived from commit `13df75f`, explaining the Windows CRLF vs Git LF discrepancy and proving absolute mathematical equivalence.

---

## 1. Commit and Git Object Lineage

- **Target Baseline Commit**: `13df75f854a7d9df28048e5f457a2d56a0113222`
- **File Under Review**: `src/canvas/renderer/docxCanvasRenderer.ts`
- **Git Tree Object**: `79fe7b9bb9f333333423a6c11706a1ef84126998`
- **Git Blob Object**: `096252126c58fa3e489fbd707ca6be309e4889c6`

---

## 2. Line Ending and Hash Analysis

Git repositories store source files internally with Unix-style newline characters (`LF`, `\n`, byte `0x0A`).
When a repository is checked out onto Microsoft Windows with default `core.autocrlf` or `.gitattributes` configuration, Git automatically translates `LF` to `CRLF` (`\r\n`, bytes `0x0D 0x0A`).

| Representation | File Location | Line Endings | Computed SHA-256 |
| :--- | :--- | :--- | :--- |
| **Git Internal Blob** | `git show 13df75f:src/canvas/renderer/docxCanvasRenderer.ts` | `LF` | `845fc826b037026f56c358934d7bd3a3a656c198394a822425aedf1ac3b08306` |
| **Windows Worktree File** | `debug/worktree-baseline/src/canvas/renderer/docxCanvasRenderer.ts` | `CRLF` | `ad94099fb8bc8462a160370d977bdb62b8abba8acec1a1647da077b0948049db` |
| **Normalized Worktree Content** | `content.replace(/\r\n/g, "\n")` | `LF` | `845fc826b037026f56c358934d7bd3a3a656c198394a822425aedf1ac3b08306` |

---

## 3. Cryptographic Equivalence Verification

When newline characters are normalized:
- The normalized worktree file hash matches the Git blob LF hash character-for-character:
  `845fc826b037026f56c358934d7bd3a3a656c198394a822425aedf1ac3b08306 == 845fc826b037026f56c358934d7bd3a3a656c198394a822425aedf1ac3b08306`
- PowerShell `Compare-Object` between the Git object lines and the worktree file lines returns 0 differences.
- The Baseline code used for benchmark evaluation is 100% authentic code from commit `13df75f`.

---

## 4. Verification Script

The verification logic is codified in `tests/phase36-audit-fixes.test.ts` and automated in `scripts/run_phase36_production_optimization.ts` under Step 4: Lineage & Git Origin Verification.
