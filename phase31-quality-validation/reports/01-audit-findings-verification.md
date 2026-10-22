# 01. External Audit Findings Cross-Verification (A1 ~ A8)

## 1. Executive Summary & Audit Adjudication Matrix

Following the completion of Phase 30, external audits (GPT-6 and Argon) raised 8 specific concerns regarding rendering fidelity, data integrity, and Word automation safety. Rather than blindly adopting proposed patches, Phase 31 independently reproduced, measured, and empirically evaluated each item against Microsoft Word for Mac (v16.114) and the codebase.

| Audit ID | Audit Claim / Finding | Severity | Phase 31 Verdict | Root Cause & Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **A1** | Synthetic PNG data corruption causes central image card to disappear | Critical | **CONFIRMED** | `BLUE_PNG_BASE64` in fixture had truncated IDAT and failed zlib checksum, causing image decoders to treat it as 100% transparent. Replaced with valid, programmatically generated solid blue PNG. |
| **A2** | VML `filled="f"` and image binding prevents Word from displaying images | Critical | **PARTIALLY REJECTED / REFINED** | Word for Mac **does** render `<v:imagedata>` with `filled="f"` when PNG is valid (verified by 84,800 blue pixels in Word output). However, `filled="t"` with fallback `fillcolor` was added when Figma specifies fill color. |
| **A3** | VML `arcsize` calculation doubles curvature and `v:shape` lacks geometry | Medium | **CONFIRMED** | Non-rounded images now correctly emit standard `<v:rect>` instead of pathless `v:shape`. Arcsize formula measured against Word for Mac and documented. |
| **A4** | `closeTargetDocOnly` fails-open when Word state query throws | High | **CONFIRMED & FIXED** | Catch block defaulted `stillOpen = false`, claiming `close_confirmed` and deleting files without verifying closure. Now transitions to `'uncertain'` and preserves files. |
| **A5** | HWPX drop shadow offset `0 || 2` overrides explicit zero with 2 | Medium | **CONFIRMED & FIXED** | Replaced `|| 2` with `?? 2` across all three HWPX shadow builders, preserving `offsetX="0"` and `offsetY="0"`. |
| **A6** | Staged PDF in Word container `Data/tmp/` leaks on export errors | Low | **CONFIRMED & FIXED** | Added `try ... finally` and error-path cleanup for staged PDF files matching the specific run nonce. |
| **A7** | Residual isolation folder cleanup has TOCTOU race conditions | Low | **PARTIAL / MITIGATED** | Hardened `cleanResidualIsolationDirsSafely` with active document PID/path checks and strict fail-closed behavior on state errors. |
| **A8** | HWPX lacks native corner radius image clipping | Informational | **CONFIRMED (LIMITATION)** | KS X 6101 `<hp:pic>` does not support arbitrary corner radius clipping natively in OWPML schema. Documented as architectural constraint. |

---

## 2. Methodology & Guiding Principles

1. **Empirical Proof Over Theoretical Debate**: Every claim was tested using Word for Mac (v16.114) on macOS 15.6. Pixel values and XML structures were measured directly.
2. **Failure Injection Without User Impact**: Automation failure modes were tested by injecting mocked state errors and inspecting lifecycle transitions, without terminating Word or modifying user documents.
3. **Zero Test Regressions**: All 70 test files (including 8 new Phase 31 tests) pass deterministically (447 passed, 2 skipped, 0 failed).
