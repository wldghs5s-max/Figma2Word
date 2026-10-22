# 03. Word Container PDF Staging Lifecycle & Concurrency Hardening

## 1. Background & Architectural Constraint

Microsoft Word for Mac runs in an App Sandbox (`com.microsoft.Word`). Directing Word to export a PDF to an arbitrary project folder (e.g. `/Users/mac/projects/Figma2Word/...`) triggers a blocking modal security prompt ("Microsoft Word에서 파일에 접근하려고 합니다").

To ensure zero-interaction automated visual regression, `exportTargetDocToPdfOnly` stages PDF exports into Word's own container tmp folder:
`~/Library/Containers/com.microsoft.Word/Data/tmp`

---

## 2. Potential Race Conditions & Audit Inquiry

GPT-6 asked:
1. If AppleScript times out while Word is still writing the PDF, could intermediate staged PDFs appear after the catch block runs?
2. Could simultaneous runs with different handles collide on staging file names?
3. Could an unhandled exception leak files indefinitely in Word's sandbox tmp directory?

---

## 3. Implemented Hardening Measures

### 3.1 Cryptographically Unique Nonce Naming
Staging filenames are formatted with:
```typescript
targetExportPath = path.join(wordContainerTmp, `f2w_stage_${handle.runId}_${Date.now()}.pdf`);
```
Where `runId` includes both high-precision timestamp and a cryptographically random UUID slice:
`vr_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`.
This guarantees that:
- No two runs can ever share the same staging filename.
- Runs cannot overwrite or delete each other's staged files.

### 3.2 Staging Path Tracking on Handle
`handle.stagedPdfPath` is now stored directly on `AutomatedWordHandle`.
If Word finishes writing a staged PDF *after* an export timeout occurred:
- When `safeCleanupIsolatedDirectory(handle)` is later executed (upon confirmed closure), it inspects `handle.stagedPdfPath` and unlinks it.
- Delayed PDF generation is thus caught and cleaned during lifecycle completion.

### 3.3 Safe Residual Staging Pruning (`cleanResidualStagingPdfsSafely`)
Added an automated garbage collector function:
```typescript
export function cleanResidualStagingPdfsSafely(maxAgeMs: number = 30 * 60 * 1000): {
  scanned: number;
  pruned: number;
  preserved: number;
}
```
**Safety Invariants**:
1. Strictly filters files matching `^f2w_stage_vr_.*\.pdf$`.
2. NEVER touches user files (e.g. `ImportantNotes.pdf`) or non-f2w files in `Data/tmp/`.
3. Only prunes files whose `mtimeMs` is older than `maxAgeMs` (default: 30 minutes). Fresh in-flight files are strictly preserved.

---

## 4. Verification Evidence

Automated unit tests in `tests/phase31-1-word-safety.test.ts`:
- **Test D1 (Delayed Staging Cleanup)**: Creates mock staged PDF in container tmp, invokes `safeCleanupIsolatedDirectory(handle)`, verifies both isolated folder and staged PDF are deleted.
- **Test D2 (Non-Colliding Staging Paths)**: Runs two concurrent handles, verifies distinct staging paths containing distinct `runId`s.
- **Test D3 (cleanResidualStagingPdfsSafely)**: Creates stale f2w PDF (35 min old), fresh f2w PDF (0 min old), and user file (`ImportantUserDocument.pdf`). Runs pruner: verifies stale file is pruned, fresh file is preserved, and user file is 100% untouched.
