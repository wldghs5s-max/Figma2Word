# Phase 29: Word Automation Atomic Transactions & HMAC Ownership Verification

## 1. Problem Analysis: The Multi-Step Race Condition

In AppleScript for macOS Microsoft Word, document indexing is dynamic (`document 1`, `document 2`, ...). The index reflects the front-to-back Z-order of active document windows.

In earlier phases:
```applescript
-- Call 1: Find matching document index
repeat with i from 1 to (count of documents)
  if (posix full name of document i) is equal to targetPath then
    return i
  end if
end repeat

-- Node.js gap: 5ms - 50ms (User interacts with Word, or another window closes)

-- Call 2: Perform operation on index
tell application "Microsoft Word"
  close (document i) saving no -- RACE CONDITION! May close the wrong document!
end tell
```

### The Phase 29 Atomic Invariant
In Phase 29, document index passing across distinct AppleScript executions has been **completely eliminated**. Lookup, path re-verification, PDF export, and document closure are executed within a **single atomic AppleScript block** directly upon the document object reference `d`:

```applescript
with timeout of 600 seconds
  tell application "Microsoft Word"
    set targetFound to false
    repeat with i from 1 to (count of documents)
      set d to document i
      set matchConfirmed to false
      try
        set p to (posix full name of d as text)
        if p is equal to "${escapedTarget}" then
          set matchConfirmed to true
        end if
      end try

      if matchConfirmed then
        -- Atomically export and close ONLY this verified document object
        save as d file name "${escapedPdf}" file format format PDF
        close d saving no
        set targetFound to true
        exit repeat
      end if
    end repeat

    if targetFound then
      return "OK"
    else
      return "TARGET_NOT_FOUND"
    end if
  end tell
end timeout
```

---

## 2. Cryptographic HMAC-SHA256 Ownership Validation

To prevent handle spoofing, parameter tampering, or accidental invocation against user files, Phase 29 introduces cryptographic session tokens.

### Architecture:
1. **Module-Scoped Secret**: When `safe_word_automation.ts` is imported, a cryptographically secure 256-bit secret is generated:
   ```ts
   const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
   ```
2. **Signature Generation**: Upon safely creating the isolated DOCX in `/tmp/f2w_word_isolation/${runId}/`, the automation generates:
   ```ts
   export function computeHandleSignature(runId: string, isolatedDir: string, isolatedDocxPath: string): string {
     return crypto
       .createHmac('sha256', SESSION_SECRET)
       .update(`${runId}:${normalizeWordPath(isolatedDir)}:${normalizeWordPath(isolatedDocxPath)}`)
       .digest('hex');
   }
   ```
3. **Strict Validation Pipeline (`validateOwnershipHandle`)**:
   - `handle` must be a valid non-null object (`string` handles throw immediately).
   - `handle.isOwned === true`.
   - `handle.runId` must start with `vr_`.
   - `handle.isolatedDir` must be strictly inside `${os.tmpdir()}/f2w_word_isolation`.
   - Path traversal (`../`) is explicitly rejected.
   - Directory basename must match `runId` exactly.
   - `handle.isolatedDocxPath` must reside directly within `isolatedDir`.
   - `handle.normalizedPosixPath` must match normalized `isolatedDocxPath`.
   - `handle.verificationSignature` must match the HMAC computed with `SESSION_SECRET`.

Any tampering with paths, run IDs, or signatures triggers an immediate security rejection before Microsoft Word is ever contacted.

---

## 3. Snapshot Count Parity & Untitled Document Handling

In `captureWordState()`, Word queries now verify total count parity:
- Query reports `totalDocs` and iterates `1 to totalDocs`.
- For unsaved/untitled documents where `path of d as text` is empty or throws, the document is tagged as `<UNTITLED>` and tracked in `untitledDocumentsCount`.
- If `inspectedRows.length !== totalDocs`, the automation halts immediately with a fail-closed exception, protecting all open documents.
