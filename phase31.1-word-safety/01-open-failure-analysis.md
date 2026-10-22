# 01. Word Open Exception Path Analysis & Remediation

## 1. Problem Statement

GPT-6 identified a critical lifecycle inconsistency in `tools/visual-regression/safe_word_automation.ts`:

```typescript
// Legacy Phase 31 code in openTargetDocumentSafely:
try {
  execFileSync('open', ['-a', 'Microsoft Word', isolatedDocxPath]);
} catch (err: any) {
  transitionLifecycleState(handle, 'uncertain', `Failed to launch Word: ${err.message}`);
  // Safe to clean up since launch itself threw before Word saw the path
  try {
    fs.rmSync(isolatedDir, { recursive: true, force: true });
  } catch {}
  throw new Error(`[WordAutomation] Failed to launch Word for isolated document: ${err.message}`);
}
```

### The Architectural Contradiction
1. When `open` throws (e.g. ETIMEDOUT, non-zero exit code, signal interrupt, or process contention), the handle transitioned to `'uncertain'`.
2. By project definition: `'uncertain'` means Word's actual status cannot be guaranteed and files on disk must be held to avoid race conditions.
3. However, `fs.rmSync(isolatedDir, ...)` immediately deleted the directory!
4. If LaunchServices had already queued or initiated process launch for Microsoft Word, Word could attempt to read from `isolatedDir` while or after it was being deleted, causing file lock errors, crashes, or data corruption.

---

## 2. Taxonomy of Open Failure Modes

We differentiate five distinct operational states:

1. **Pre-Request Failure (Definite Non-Execution)**:
   - Target is already open in Word prior to automation (`snapshot.initialDocumentPaths.includes(...)`).
   - Automation has NOT called `open`.
   - Action: Safe to clean up isolated folder because Word was never asked to open this isolated file.
2. **In-Flight / Launch Exception (Indeterminate State)**:
   - `execFileSync('open', ...)` fails or throws.
   - LaunchServices may or may not have notified Word.
   - Action: **Fail-Closed**. Transition to `'uncertain'`. Strictly PRESERVE `isolatedDir` on disk. Do NOT call `fs.rmSync`.
3. **Polling Timeout (Confirmed Word Unresponsiveness)**:
   - Word was launched, but polling loop exceeded `maxWaitSeconds`.
   - Action: **Fail-Closed**. Transition to `'uncertain'`. Strictly PRESERVE `isolatedDir` on disk.
4. **State Query Failure During Polling**:
   - AppleScript query fails or throws during polling.
   - Action: Handled as transient or transitions to `'uncertain'`. Directory preserved.
5. **Normal Confirmed Open**:
   - Matching normalized POSIX path found in Word document table.
   - Action: Transition to `'open_confirmed'`. Proceed to export/close stages.

---

## 3. Remediation & Code Changes

In `safe_word_automation.ts`:
- Removed `fs.rmSync(isolatedDir, ...)` from the launch catch block.
- Added dependency injection interface `WordAutomationOpenDeps` (`execOpen`, `queryDocsScript`) to allow deterministic failure simulation without terminating user applications.
- Documented fail-closed invariant: If an open request has been initiated, `isolatedDir` is preserved until safely pruned by `cleanResidualIsolationDirsSafely` (after 30 min of inactivity when Word no longer holds the path).

---

## 4. Verification Evidence

Automated unit tests in `tests/phase31-1-word-safety.test.ts`:
- **Test O1 (Pre-Request Failure)**: Verifies rejection without calling launch commands.
- **Test O2 (Post-Request Launch Exception)**: Injects launch error. Verifies `handle.lifecycleState === 'uncertain'`, `isolatedDir` exists on disk, and `safeCleanupIsolatedDirectory(handle)` refuses deletion (`false`).
- **Test O3 (Polling Timeout)**: Injects timeout. Verifies state is `'uncertain'` and files preserved.
- **Test O4 (Query Failure During Open)**: Injects query failure. Verifies fail-closed preservation.
- **Test O5 (Normal Open Success)**: Verifies normal open path succeeds cleanly (`'open_confirmed'`).
