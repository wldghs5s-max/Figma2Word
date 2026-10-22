# Phase 32: Real Figma Fidelity Benchmark & Conversion Quality Improvement
## 05. Word Automation Safety Validation: TOCTOU & Staging PDF Lifecycle

### 1. Risk Modeling & Addressed Vulnerabilities

During Phase 31.1 review, independent auditing identified two residual edge cases in the Word automation lifecycle:
1. **Pre-Unlink TOCTOU Window in `cleanResidualIsolationDirsSafely`**:
   - A directory was inspected, but between inspection and `rmdirSync` or `rmSync`, a race condition or stale document could theoretically appear.
2. **Staging PDF Collisions in `cleanResidualStagingPdfsSafely`**:
   - Staging PDFs created by active or parallel automation runs could potentially be misidentified as residual files if another process queried the directory simultaneously.

---

### 2. Implemented Protections

#### A. Pre-Unlink TOCTOU Verification
Inside `cleanResidualIsolationDirsSafely` in `tools/visual-regression/safe_word_automation.ts`:
- Immediately before removing an isolated directory, the function queries Word's live open document table via `captureWordState()`.
- If the query fails or throws, the function fails closed and **preserves all files**.
- If any open Word document has a POSIX path pointing inside the candidate directory, deletion is immediately aborted and the directory is preserved.

#### B. Active Run Staging PDF Protection
Inside `cleanResidualStagingPdfsSafely`:
- Each staging PDF follows the naming convention `f2w_stage_${runId}_${timestamp}.pdf`.
- The cleaner parses `runId` from the filename.
- It checks if the corresponding isolation folder `os.tmpdir()/f2w_word_isolation/${runId}` currently exists on disk.
- It queries `captureWordState()` to verify if Word holds any open document associated with this `runId`.
- Staging PDFs belonging to active runs or uncertain Word states are **unconditionally preserved**.

---

### 3. Failure Injection Test Results

All 16 failure injection tests in `tests/phase31-1-word-safety.test.ts` pass with 100% compliance:
- **Test O1 (Pre-Request Failure)**: Word ownership rejected if target is already open.
- **Test O2 (HMAC Token Mismatch)**: Foreign Word documents are never claimed or closed.
- **Test O3 (Polling Timeout)**: Timeout leaves files intact and fails closed.
- **Test O4 (Query Failure During Open)**: Word query failure preserves files safely.
- **Test O5 (Confirmed Open)**: Normalized POSIX path match returns verified handle.
- **Test C1~C6 (Close Failures)**: Failure or timeout during close preserves files and logs diagnostic state.
- **Test D1~D3 (Staging PDF Lifecycle)**: Stale staging files pruned; active runs and user files preserved.
