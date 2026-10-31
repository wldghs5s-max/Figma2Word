# Phase 37 — Report 03: Automated Git Baseline Origin Verification & Lineage Integrity

## 1. Objective & Threat Model

In high-assurance benchmarking pipelines, baseline integrity is paramount. If baseline metrics or code can be tampered with on disk without detection, fidelity claims become invalid. Phase 37 introduces an automated, tamper-resistant Git object verification engine to ensure absolute lineage traceability back to direct baseline commit `aca7bd9`.

---

## 2. Verification Architecture

The module [`src/fidelity/gitOriginVerifier.ts`](file:///c:/Users/77/Documents/Figma2Word/src/fidelity/gitOriginVerifier.ts) interrogates Git's internal object store directly using standard Git plumbing commands:

```
[Local File on Disk]                [Git Object Database at commit aca7bd9]
        │                                             │
        ▼                                             ▼
 Read Local Bytes                            Execute `git show aca7bd9:<path>`
        │                                             │
        ▼                                             ▼
 Normalize Line Endings (CRLF -> LF)         Normalize Line Endings (CRLF -> LF)
        │                                             │
        ▼                                             ▼
 Compute SHA-256                             Compute SHA-256
        │                                             │
        └─────────────── Assert SHA Match ────────────┘
                              │
                    Fail-Closed on Mismatch
```

### Line-Ending Normalization
On Windows platforms, `git checkout` can convert repository LF (`\n`) to working-tree CRLF (`\r\n`). To prevent false negatives caused strictly by OS-specific line separators while guaranteeing cryptographic byte-level equivalence of code, both streams are strictly normalized to LF before SHA-256 hashing.

---

## 3. Production Pipeline Audit Results

During Step 2 of `run_phase37_production_pipeline.ts`, the verifier validated critical audit and gate enforcement files against commit `aca7bd9`:

| Target Path | Git Blob SHA-256 (LF) | Local File SHA-256 (LF) | Status |
| :--- | :--- | :--- | :--- |
| `src/fidelity/integrityGate.ts` | `d83c9200b602a2e6e3ba6c89139a04a434190fc6a40a2c9c7f66a0ae502b415a` | `d83c9200b602a2e6e3ba6c89139a04a434190fc6a40a2c9c7f66a0ae502b415a` | **MATCH (VERIFIED)** |
| `phase36-renderer-optimization/reports/01-audit-defects-resolution.md` | `89a11c74c2bd4253457d76a26cf6fbb9f9e30a597a760b4cae9772c72b220bb4` | `89a11c74c2bd4253457d76a26cf6fbb9f9e30a597a760b4cae9772c72b220bb4` | **MATCH (VERIFIED)** |

### Fail-Closed Assertion
If any byte in a verified file differs from the Git blob:
1. `verifyGitBaselineOrigin` returns `valid: false` with the exact mismatched hashes.
2. `assertGitBaselineLineage` immediately sets `process.exitCode = 1` and throws `[GIT_LINEAGE_FAILURE]`.
3. Execution halts before any benchmark calculations can run.

This mechanism was validated in [`tests/phase37-git-verification.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/phase37-git-verification.test.ts) across 4 comprehensive tests (valid origin, modified content detection, missing file handling, and fail-closed assertion).

