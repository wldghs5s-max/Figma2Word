# 04. Word Automation Safety & Fail-Closed Invariants (Audit A4, A6, A7)

## 1. Remediation of the Fail-Open Close Defect (Audit A4)

### Defect Analysis
In Phase 30, `closeTargetDocOnly` in `tools/visual-regression/safe_word_automation.ts` contained:
```typescript
// Previous Vulnerable Code:
let stillOpen = false;
try {
  const checkState = captureWordState();
  stillOpen = checkState.initialDocumentPaths.includes(handle.normalizedPosixPath);
} catch {
  // If state check fails, be conservative
  stillOpen = false; // <-- CRITICAL DEFECT: Fails Open!
}

if (stillOpen) {
  transitionLifecycleState(handle, 'uncertain', '...');
  throw new Error('...');
}

transitionLifecycleState(handle, 'close_confirmed', 'Confirmed closed in Word');
```

When an exception occurred in `captureWordState()` (such as an AppleScript timeout or Word process contention):
1. `stillOpen` defaulted to `false`.
2. The check `if (stillOpen)` evaluated to false.
3. The handle falsely transitioned to `'close_confirmed'`.
4. Subsequent callers (e.g. `exportAndCloseTargetDocOnly`) called `safeCleanupIsolatedDirectory(handle)`, which proceeded to delete the directory on disk while Word might still have held an active lock or unsaved state.

### Phase 31 Fail-Closed Invariant
The logic was rewritten to strictly enforce fail-closed behavior:
```typescript
// Hardened Phase 31 Implementation:
let stillOpen = false;
try {
  const checkState = captureWordState();
  stillOpen = checkState.wordWasRunning && checkState.initialDocumentPaths.includes(handle.normalizedPosixPath);
} catch (err: any) {
  // P0 Fail-Closed: If querying Word state fails, we CANNOT confirm document closure.
  // Transition to 'uncertain' and throw error, strictly preserving files on disk!
  transitionLifecycleState(
    handle,
    'uncertain',
    `Unable to verify document closure in Word: ${err.message || String(err)}`
  );
  throw new Error(
    `[WordAutomation] Unable to verify closure with Word: ${err.message || String(err)}. Preserving files at "${handle.isolatedDir}".`
  );
}
```

Additionally, `safeCleanupIsolatedDirectory` now checks:
```typescript
if (handle.lifecycleState !== 'close_confirmed') {
  try {
    const state = captureWordState();
    if (!state.wordWasRunning) {
      // Word completely stopped, safe to clean up
    } else {
      transitionLifecycleState(handle, 'uncertain', `Refusing cleanup: state is '${handle.lifecycleState}' and Word is running`);
      return false;
    }
  } catch {
    transitionLifecycleState(handle, 'uncertain', 'Refusing cleanup: unable to query Word state');
    return false;
  }
}
```
If the state is `'uncertain'`, cleanup is unconditionally refused and the directory remains intact.
Verified by automated unit test in `tests/phase31-audit-verification.test.ts` (Test 5).

---

## 2. Container Staging Cleanup Guarantee (Audit A6)

### The Risk
Word for Mac writes staged PDFs to `~/Library/Containers/com.microsoft.Word/Data/tmp/` to bypass sandbox modal access prompts. If AppleScript timed out or the destination copy threw an error, intermediate staged PDFs risked accumulating in Word's sandbox directory.

### Phase 31 Solution
`exportTargetDocToPdfOnly` now encapsulates staging cleanup in a dedicated function invoked on both error and success:
```typescript
const cleanupStagedFile = () => {
  if (useContainerStaging && fs.existsSync(targetExportPath)) {
    try {
      fs.rmSync(targetExportPath, { force: true });
    } catch {}
  }
};
```
1. If `runAppleScript` throws: `cleanupStagedFile()` executes in the catch block.
2. If `res !== 'OK'`: `cleanupStagedFile()` executes before throwing.
3. On successful copy: `cleanupStagedFile()` executes in the `finally` block.
Zero orphaned files remain in Word's container temporary space.

---

## 3. Concurrency & Residual Directory Pruning (Audit A7)

`cleanResidualIsolationDirsSafely` in `safe_word_automation.ts`:
1. Queries `captureWordState()`. If Word is running and the query fails, it fails closed immediately (`return { scanned: 0, pruned: 0, preserved: 0 }`).
2. Only evaluates folders starting with the execution prefix `vr_`.
3. Bypasses any folder newer than `maxAgeMs` (default: 30 minutes).
4. Matches the normalized POSIX path against all currently open documents in Word. If any open document path resides inside the folder, it is skipped.
5. Only confirmed inactive, orphaned folders older than 30 minutes are safely unlinked.
