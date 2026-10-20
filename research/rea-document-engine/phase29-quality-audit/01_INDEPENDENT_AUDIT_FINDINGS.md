# Phase 29: Independent Audit Findings & Remediation Plan

## 1. Executive Summary

Following the completion of Phase 28 (commit `7b00c44`), an independent audit was performed on `phase28-gpt-review.zip` by GPT-6. While Phase 28 made substantial progress in isolating Microsoft Word automation through UUID temporary workspaces, normalized POSIX path comparisons, and metric disentanglement, four critical safety and quality concerns were flagged:

1. **Problem A — Document Index Reuse across AppleScript Executions**: In `exportAndCloseTargetDocOnly` and `cleanupTargetDocOnly`, finding the document matching the target path returned an integer index, which was subsequently passed to a separate AppleScript execution (`close (document ${idx})`). If documents were closed, opened, or reordered between these calls, Word could close the wrong document.
2. **Problem B — Ownership Handle Bypass & Forgery**: String path arguments remained accepted in certain code paths, allowing callers to circumvent handle verification. Furthermore, handle objects lacked cryptographic proof of origin, meaning a forged object could theoretically claim ownership of arbitrary user files.
3. **Problem C — Snapshot Error Swallowing & Untitled Document Blindspots**: In `captureWordState()`, an `on error` block silently skipped documents that threw errors during POSIX path inspection (specifically untitled, unsaved documents created via Cmd+N where POSIX path is empty or invalid).
4. **Problem D — Premature Temporary Directory Cleanup**: Deleting the isolated folder immediately upon returning from AppleScript could clash with Word still releasing its file locks.
5. **Real-world Conversion Quality Gaps**: Absence of drop shadow support in Canvas IR / DOCX / HWPX, potential Korean text ascender/descender clipping in tight line-height textboxes, and lack of visual tolerance buffer for non-auto single-line labels.

---

## 2. Key Remediation Architecture

| Issue ID | Root Cause | Phase 29 Solution | Verification Status |
| :--- | :--- | :--- | :--- |
| **SEC-01** | Document index reuse race condition | Atomic AppleScript loop operating directly on object reference `d` (find $\rightarrow$ re-verify $\rightarrow$ export $\rightarrow$ close in 1 execution) | **VERIFIED** |
| **SEC-02** | Handle spoofing / String overloads | Strict `validateOwnershipHandle` rejecting string paths, path traversal outside `/tmp/f2w_word_isolation`, and validating HMAC-SHA256 signature with `SESSION_SECRET` | **VERIFIED** |
| **SEC-03** | Silent snapshot skip of untitled docs | AppleScript returns `totalDocs<#TOTAL#>rows...`; validates `totalDocs === rows.length`, explicitly tags untitled docs as `<UNTITLED>` | **VERIFIED** |
| **SEC-04** | Temp deletion race condition | Grace period sleep (150ms) before `rmSync` to let Word release file descriptors | **VERIFIED** |
| **REN-01** | Drop shadow missing in IR & renderers | Added `CanvasShadow` to `CanvasStyle`; parsed from Figma `DROP_SHADOW` effects; rendered via `<v:shadow>` in DOCX and `<hp:shadow type="DROP">` in HWPX | **VERIFIED** |
| **REN-02** | Korean ascender/descender clipping | Emits `w:lineRule="atLeast"` for tight line heights and applies horizontal breathing buffer for single-line labels | **VERIFIED** |

---

## 3. Strict Development Invariants Maintained

- **Zero Data Loss Guarantee**: Microsoft Word user documents are never inspected with write intent, never saved over, and never closed.
- **Fail-Closed Operation**: Any anomaly during Word status querying aborts the automation pipeline before touching Word.
- **Schema Compliance**: DOCX conforms to OpenXML ECMA-376 Part 1 & VML; HWPX conforms to KS X 6101 OWPML.
- **Full Test Parity**: All 68 test suites (430 passed, 2 skipped, 0 failed) and all production builds pass cleanly.
