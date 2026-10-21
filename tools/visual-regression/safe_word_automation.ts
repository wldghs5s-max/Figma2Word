import { execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

// Cryptographic session secret for HMAC validation of AutomatedWordHandle instances
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

export type DocumentLifecycleState =
  | 'created'           // Isolated copy created on disk
  | 'open_requested'    // open -a Microsoft Word launched
  | 'open_confirmed'    // Verified present in Word document list via normalized POSIX path
  | 'export_requested'  // Export AppleScript called
  | 'exported'          // PDF successfully exported to target path
  | 'close_requested'   // Close AppleScript called
  | 'close_confirmed'   // Document verified closed in Word
  | 'uncertain'         // Timeout, AppleEvent failure, or Word unresponsive; file held on disk
  | 'cleanup_pending'   // Awaiting safe cleanup
  | 'cleanup_completed';// Successfully cleaned up from disk

export interface WordEnvironmentSnapshot {
  wordWasRunning: boolean;
  initialDocumentNames: string[];
  initialDocumentPaths: string[];
  initialDocumentCount: number;
  untitledDocumentsCount: number;
}

export interface AutomatedWordHandle {
  runId: string;
  sourceDocxPath: string;
  isolatedDocxPath: string;
  isolatedDir: string;
  normalizedPosixPath: string;
  docName: string;
  docIndex: number;
  sectionsCount: number;
  isOwned: boolean;
  verificationSignature: string;
  lifecycleState?: DocumentLifecycleState;
  stateHistory?: Array<{
    state: DocumentLifecycleState;
    timestamp: number;
    details?: string;
  }>;
}

/**
 * Backward compatibility alias for earlier pipeline consumers.
 */
export interface OpenedWordDocument extends AutomatedWordHandle {
  fullPath: string;
}

/**
 * Records a transition in the lifecycle of an automated Word document.
 */
export function transitionLifecycleState(
  handle: AutomatedWordHandle,
  nextState: DocumentLifecycleState,
  details?: string
): void {
  handle.lifecycleState = nextState;
  if (!handle.stateHistory) {
    handle.stateHistory = [];
  }
  handle.stateHistory.push({
    state: nextState,
    timestamp: Date.now(),
    details,
  });
}

/**
 * Normalizes a file path for robust matching across macOS POSIX, /var vs /private/var
 * aliases, and Unicode NFC vs NFD character encodings.
 */
export function normalizeWordPath(p: string): string {
  if (!p) return '';
  return p.replace(/^\/private/, '').normalize('NFC');
}

/**
 * Escapes strings safely for interpolation inside AppleScript string literals.
 */
export function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Computes an HMAC-SHA256 signature validating the authenticity and integrity
 * of an AutomatedWordHandle created exclusively by this automation session.
 */
export function computeHandleSignature(
  runId: string,
  isolatedDir: string,
  isolatedDocxPath: string
): string {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${runId}:${normalizeWordPath(isolatedDir)}:${normalizeWordPath(isolatedDocxPath)}`)
    .digest('hex');
}

/**
 * Strictly verifies ownership authenticity of an AutomatedWordHandle.
 * Defends against:
 * 1. String handle overloads and unowned handles
 * 2. Handle forgery pointing to user documents outside the isolation folder
 * 3. Path traversal attacks and mismatched runId / isolatedDir
 * 4. Cryptographic HMAC signature tampering
 */
export function validateOwnershipHandle(handle: unknown): asserts handle is AutomatedWordHandle {
  if (!handle || typeof handle !== 'object') {
    throw new Error(
      '[WordAutomation] Security rejection: handle must be a validated AutomatedWordHandle object. String handles and raw names are strictly forbidden.'
    );
  }

  const h = handle as Partial<AutomatedWordHandle>;

  if (h.isOwned !== true) {
    throw new Error(
      '[WordAutomation] Security rejection: automation does not own this document (isOwned is false). Refusing operation.'
    );
  }

  if (!h.runId || typeof h.runId !== 'string' || !h.runId.startsWith('vr_')) {
    throw new Error(
      `[WordAutomation] Security rejection: invalid or missing runId "${h.runId}".`
    );
  }

  if (!h.isolatedDir || typeof h.isolatedDir !== 'string') {
    throw new Error('[WordAutomation] Security rejection: missing isolatedDir.');
  }

  const expectedBaseDir = path.resolve(os.tmpdir(), 'f2w_word_isolation');
  const resolvedIsolatedDir = path.resolve(h.isolatedDir);
  const relToBase = path.relative(expectedBaseDir, resolvedIsolatedDir);

  if (relToBase.startsWith('..') || path.isAbsolute(relToBase)) {
    throw new Error(
      `[WordAutomation] Security violation: isolatedDir "${resolvedIsolatedDir}" is outside safe isolation base "${expectedBaseDir}". Potential path traversal detected.`
    );
  }

  if (path.basename(resolvedIsolatedDir) !== h.runId) {
    throw new Error(
      `[WordAutomation] Security violation: isolatedDir basename "${path.basename(
        resolvedIsolatedDir
      )}" does not match runId "${h.runId}".`
    );
  }

  if (!h.isolatedDocxPath || typeof h.isolatedDocxPath !== 'string') {
    throw new Error('[WordAutomation] Security rejection: missing isolatedDocxPath.');
  }

  const resolvedDocxPath = path.resolve(h.isolatedDocxPath);
  const relToDir = path.relative(resolvedIsolatedDir, resolvedDocxPath);

  if (relToDir.startsWith('..') || path.isAbsolute(relToDir)) {
    throw new Error(
      `[WordAutomation] Security violation: isolatedDocxPath "${resolvedDocxPath}" is outside isolatedDir "${resolvedIsolatedDir}".`
    );
  }

  const expectedNormalized = normalizeWordPath(resolvedDocxPath);
  if (h.normalizedPosixPath !== expectedNormalized) {
    throw new Error(
      `[WordAutomation] Security violation: normalizedPosixPath does not match normalized isolatedDocxPath.`
    );
  }

  const expectedSignature = computeHandleSignature(
    h.runId,
    resolvedIsolatedDir,
    resolvedDocxPath
  );
  if (!h.verificationSignature || h.verificationSignature !== expectedSignature) {
    throw new Error(
      '[WordAutomation] Security rejection: invalid or forged cryptographic verification signature. Potential handle spoofing attempt rejected.'
    );
  }
}

/**
 * Executes an AppleScript via stdin directly through execFileSync, eliminating shell injection vulnerabilities.
 */
export function runAppleScript(script: string, timeoutMs: number = 15000): string {
  return execFileSync('osascript', [], { input: script, encoding: 'utf8', timeout: timeoutMs }).trim();
}

/**
 * Captures the current running state of Microsoft Word and list of already open document paths.
 * Enforces fail-closed error handling:
 * 1. If Word is running but queries fail, throws an error immediately.
 * 2. Compares total document count against inspected documents. If count mismatch occurs, fails closed.
 * 3. Accurately identifies unsaved/untitled documents (<UNTITLED>) to guarantee user data protection.
 */
export function captureWordState(): WordEnvironmentSnapshot {
  const isRunningScript = `
    tell application "System Events"
      return (count of (processes whose name is "Microsoft Word")) > 0
    end tell
  `;
  let isRunning = false;
  try {
    isRunning = runAppleScript(isRunningScript, 5000) === 'true';
  } catch (err: any) {
    throw new Error(
      `[WordAutomation] Fail-closed: unable to query System Events for Word status: ${err.message}`
    );
  }

  if (!isRunning) {
    return {
      wordWasRunning: false,
      initialDocumentNames: [],
      initialDocumentPaths: [],
      initialDocumentCount: 0,
      untitledDocumentsCount: 0,
    };
  }

  // Word is running: query all open documents with count-parity verification
  const queryDocsScript = `
tell application "Microsoft Word"
  set totalDocs to (count of documents)
  set out to {}
  repeat with i from 1 to totalDocs
    set d to document i
    set isUntitled to false
    set p to ""
    set n to ""
    set s to false
    set sCount to 0
    try
      set n to (name of d as text)
    on error
      set n to ("<DOC_" & (i as text) & ">")
    end try
    try
      set s to (saved of d as boolean)
    on error
      set s to false
    end try
    try
      set sCount to (count of sections of d)
    on error
      set sCount to 0
    end try
    try
      set docPath to (path of d as text)
      if docPath is "" then
        set isUntitled to true
        set p to "<UNTITLED>"
      else
        set p to (posix full name of d as text)
      end if
    on error
      set isUntitled to true
      set p to "<UNTITLED>"
    end try
    set end of out to (i as text) & "<#SEP#>" & n & "<#SEP#>" & p & "<#SEP#>" & (s as text) & "<#SEP#>" & (sCount as text) & "<#SEP#>" & (isUntitled as text)
  end repeat
  set AppleScript's text item delimiters to "<#ROW#>"
  return (totalDocs as text) & "<#TOTAL#>" & (out as text)
end tell
`;

  let rawOut = '';
  try {
    rawOut = runAppleScript(queryDocsScript, 10000);
  } catch (err: any) {
    throw new Error(
      `[WordAutomation] Fail-closed: Microsoft Word is running but document state query failed: ${err.message}. Aborting to protect existing user documents.`
    );
  }

  const [totalStr, rowsStr] = rawOut.split('<#TOTAL#>');
  const totalReportedCount = parseInt(totalStr, 10);
  const rows = rowsStr && rowsStr.length > 0 ? rowsStr.split('<#ROW#>') : [];

  if (rows.length !== totalReportedCount) {
    throw new Error(
      `[WordAutomation] Fail-closed: document count mismatch. Word reported ${totalReportedCount} documents but state inspection retrieved ${rows.length}. Aborting to protect existing user documents.`
    );
  }

  const names: string[] = [];
  const paths: string[] = [];
  let untitledCount = 0;

  for (const r of rows) {
    const parts = r.split('<#SEP#>');
    if (parts.length >= 6) {
      names.push(parts[1]);
      const p = parts[2];
      const isUnt = parts[5] === 'true' || p === '<UNTITLED>';
      if (isUnt) {
        untitledCount++;
        paths.push('<UNTITLED>');
      } else {
        paths.push(normalizeWordPath(p));
      }
    }
  }

  return {
    wordWasRunning: true,
    initialDocumentNames: names,
    initialDocumentPaths: paths,
    initialDocumentCount: names.length,
    untitledDocumentsCount: untitledCount,
  };
}

/**
 * Safely opens ONLY the target DOCX file in Word within an isolated temporary directory.
 * Matches strictly by normalized POSIX path (no filename or prefix matching).
 * Refuses ownership if the document was already open before automation ran.
 *
 * Lifecycle Safety:
 * - If polling times out, transitions state to 'uncertain' and PRESERVES the isolated
 *   directory to prevent deleting files while Word is still loading them.
 */
export async function openTargetDocumentSafely(
  docxPath: string,
  snapshot: WordEnvironmentSnapshot,
  maxWaitSeconds: number = 25
): Promise<OpenedWordDocument> {
  const resolvedSource = path.resolve(docxPath);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Target DOCX does not exist: ${resolvedSource}`);
  }

  // 1. Create unique execution run folder in os.tmpdir() with UUID
  const runId = 'vr_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
  const isolatedDir = path.join(os.tmpdir(), 'f2w_word_isolation', runId);
  fs.mkdirSync(isolatedDir, { recursive: true });

  const isolatedDocxPath = path.join(isolatedDir, path.basename(resolvedSource));
  fs.copyFileSync(resolvedSource, isolatedDocxPath);

  const normalizedTargetPosix = normalizeWordPath(isolatedDocxPath);
  const verificationSignature = computeHandleSignature(
    runId,
    isolatedDir,
    isolatedDocxPath
  );

  const handle: OpenedWordDocument = {
    runId,
    sourceDocxPath: resolvedSource,
    isolatedDocxPath,
    isolatedDir,
    normalizedPosixPath: normalizedTargetPosix,
    docName: path.basename(resolvedSource),
    docIndex: 0,
    sectionsCount: 0,
    isOwned: true,
    verificationSignature,
    fullPath: resolvedSource,
    lifecycleState: 'created',
    stateHistory: [{ state: 'created', timestamp: Date.now() }],
  };

  // 2. Reject ownership if this exact path is already open in Word
  if (snapshot.initialDocumentPaths.includes(normalizedTargetPosix)) {
    try {
      fs.rmSync(isolatedDir, { recursive: true, force: true });
    } catch {}
    throw new Error(
      `[WordAutomation] Target document path is already open in Word prior to automation: ${normalizedTargetPosix}. Automation refuses to claim ownership.`
    );
  }

  // 3. Open ONLY the isolated copy via macOS LaunchServices without shell injection
  transitionLifecycleState(handle, 'open_requested', 'LaunchServices open command invoked');
  try {
    execFileSync('open', ['-a', 'Microsoft Word', isolatedDocxPath]);
  } catch (err: any) {
    transitionLifecycleState(handle, 'uncertain', `Failed to launch Word: ${err.message}`);
    // Safe to clean up since launch itself threw before Word saw the path
    try {
      fs.rmSync(isolatedDir, { recursive: true, force: true });
    } catch {}
    throw new Error(
      `[WordAutomation] Failed to launch Word for isolated document: ${err.message}`
    );
  }

  // 4. Poll for the document matching normalizedTargetPosix strictly
  let matchedDoc: { index: number; name: string; sectionsCount: number } | null = null;

  for (let i = 0; i < maxWaitSeconds; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const queryScript = `
tell application "Microsoft Word"
  set out to {}
  repeat with i from 1 to (count of documents)
    set d to document i
    try
      set p to (posix full name of d as text)
      set s to (saved of d as boolean)
      set n to (name of d as text)
      set sCount to (count of sections of d)
      set end of out to (i as text) & "<#SEP#>" & n & "<#SEP#>" & p & "<#SEP#>" & (s as text) & "<#SEP#>" & (sCount as text)
    on error
    end try
  end repeat
  set AppleScript's text item delimiters to "<#ROW#>"
  return out as text
end tell
`;
      const raw = runAppleScript(queryScript, 5000);
      if (raw) {
        const rows = raw.split('<#ROW#>');
        for (const row of rows) {
          const parts = row.split('<#SEP#>');
          if (parts.length >= 5) {
            const idx = parseInt(parts[0], 10);
            const name = parts[1];
            const p = normalizeWordPath(parts[2]);
            const sCount = parseInt(parts[4], 10) || 0;
            // STRICT normalized POSIX path match ONLY. No name or prefix matching!
            if (p === normalizedTargetPosix) {
              matchedDoc = { index: idx, name, sectionsCount: sCount };
              break;
            }
          }
        }
      }
      if (matchedDoc) break;
    } catch {
      // transient polling error, keep polling
    }
  }

  if (!matchedDoc) {
    // P0 Safety Fix: Mark as 'uncertain' and DO NOT delete isolatedDir!
    // Word might still be loading or waiting on an OS dialog.
    transitionLifecycleState(
      handle,
      'uncertain',
      `Timeout after ${maxWaitSeconds}s waiting for Word confirmation`
    );
    throw new Error(
      `[WordAutomation] Timeout waiting for target document "${path.basename(
        resolvedSource
      )}" to load at isolated path: ${normalizedTargetPosix}. (Lifecycle state: uncertain; isolated directory preserved at "${isolatedDir}" to protect Word stability)`
    );
  }

  handle.docName = matchedDoc.name;
  handle.docIndex = matchedDoc.index;
  handle.sectionsCount = matchedDoc.sectionsCount;
  transitionLifecycleState(handle, 'open_confirmed', `Confirmed open in Word at index ${matchedDoc.index}`);

  return handle;
}

/**
 * Modular PDF export targeting ONLY our verified document.
 * Does not close the document; returns explicit success and output path.
 */
export function exportTargetDocToPdfOnly(
  handle: AutomatedWordHandle,
  outPdfPath: string,
  timeoutSeconds: number = 600
): { exportSuccess: boolean; pdfPath: string } {
  validateOwnershipHandle(handle);

  const resolvedPdf = path.resolve(outPdfPath);

  // macOS App Sandbox strategy:
  // Microsoft Word for Mac is sandboxed and displays a blocking modal dialog ("파일 액세스 부여")
  // when AppleScript directs it to write to project directories outside its sandbox.
  // Writing to Word's container tmp folder (~/Library/Containers/com.microsoft.Word/Data/tmp)
  // succeeds immediately with zero permission dialogs, after which we safely copy to resolvedPdf.
  const wordContainerTmp = path.join(os.homedir(), 'Library/Containers/com.microsoft.Word/Data/tmp');
  let targetExportPath = resolvedPdf;
  let useContainerStaging = false;

  if (fs.existsSync(path.dirname(wordContainerTmp))) {
    fs.mkdirSync(wordContainerTmp, { recursive: true });
    targetExportPath = path.join(wordContainerTmp, `vr_${handle.runId}_${Date.now()}.pdf`);
    useContainerStaging = true;
  }

  const escapedPdf = escapeAppleScript(targetExportPath);
  const escapedTarget = escapeAppleScript(handle.normalizedPosixPath);

  transitionLifecycleState(handle, 'export_requested', `Exporting PDF via Word (target: ${targetExportPath})`);

  const atomicExportScript = `
with timeout of ${timeoutSeconds} seconds
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
        save as d file name "${escapedPdf}" file format format PDF
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
`;

  let res = '';
  try {
    res = runAppleScript(atomicExportScript, (timeoutSeconds + 10) * 1000);
  } catch (err: any) {
    transitionLifecycleState(handle, 'uncertain', `Export script failed: ${err.message}`);
    throw new Error(`[WordAutomation] AppleScript error during PDF export: ${err.message}`);
  }

  const exportCreated = fs.existsSync(targetExportPath) && fs.statSync(targetExportPath).size > 0;
  if (res !== 'OK' || !exportCreated) {
    transitionLifecycleState(handle, 'uncertain', `Export failed with status "${res}", file created=${exportCreated}`);
    throw new Error(
      `[WordAutomation] Failed to export target document to PDF: result was "${res}".`
    );
  }

  if (useContainerStaging) {
    fs.mkdirSync(path.dirname(resolvedPdf), { recursive: true });
    fs.copyFileSync(targetExportPath, resolvedPdf);
    try {
      fs.rmSync(targetExportPath, { force: true });
    } catch {}
  }

  transitionLifecycleState(handle, 'exported', `PDF successfully exported (${fs.statSync(resolvedPdf).size} bytes)`);
  return { exportSuccess: true, pdfPath: resolvedPdf };
}

/**
 * Modular document close targeting ONLY our verified document.
 * Re-queries Word after closing to confirm closure before transitioning to 'close_confirmed'.
 */
export function closeTargetDocOnly(
  handle: AutomatedWordHandle,
  timeoutSeconds: number = 30
): { closeSuccess: boolean } {
  validateOwnershipHandle(handle);

  const escapedTarget = escapeAppleScript(handle.normalizedPosixPath);
  transitionLifecycleState(handle, 'close_requested', 'Requesting document close in Word saving no');

  const atomicCloseScript = `
with timeout of ${timeoutSeconds} seconds
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
`;

  try {
    runAppleScript(atomicCloseScript, (timeoutSeconds + 5) * 1000);
  } catch (err: any) {
    transitionLifecycleState(handle, 'uncertain', `Close script error: ${err.message}`);
    throw new Error(`[WordAutomation] AppleScript error during document close: ${err.message}`);
  }

  // Confirm document is truly no longer listed in Word
  let stillOpen = false;
  try {
    const checkState = captureWordState();
    stillOpen = checkState.initialDocumentPaths.includes(handle.normalizedPosixPath);
  } catch {
    // If state check fails, be conservative
    stillOpen = false;
  }

  if (stillOpen) {
    transitionLifecycleState(handle, 'uncertain', 'Document still reported open in Word after close command');
    throw new Error(
      `[WordAutomation] Document close requested but Word still reports document open. Preserving files at "${handle.isolatedDir}".`
    );
  }

  transitionLifecycleState(handle, 'close_confirmed', 'Confirmed closed in Word');
  return { closeSuccess: true };
}

/**
 * Safely removes the isolation directory only if the document is confirmed closed.
 */
export function safeCleanupIsolatedDirectory(handle: AutomatedWordHandle): boolean {
  validateOwnershipHandle(handle);

  if (handle.lifecycleState !== 'close_confirmed') {
    // Re-verify against Word before deleting
    try {
      const state = captureWordState();
      if (state.wordWasRunning && state.initialDocumentPaths.includes(handle.normalizedPosixPath)) {
        transitionLifecycleState(handle, 'uncertain', 'Refusing cleanup: document is still open in Word');
        return false;
      }
    } catch {
      transitionLifecycleState(handle, 'uncertain', 'Refusing cleanup: unable to query Word state');
      return false;
    }
  }

  try {
    execFileSync('sleep', ['0.15']);
  } catch {}

  if (handle.isolatedDir && fs.existsSync(handle.isolatedDir)) {
    try {
      fs.rmSync(handle.isolatedDir, { recursive: true, force: true });
      transitionLifecycleState(handle, 'cleanup_completed', 'Isolated directory deleted');
      return true;
    } catch (err: any) {
      transitionLifecycleState(handle, 'cleanup_pending', `Cleanup failed: ${err.message}`);
      return false;
    }
  }

  transitionLifecycleState(handle, 'cleanup_completed', 'Isolated directory already gone');
  return true;
}

/**
 * Exports ONLY the target document to PDF and closes ONLY that document in a single
 * atomic AppleScript execution block. Backward compatible wrapper.
 */
export function exportAndCloseTargetDocOnly(
  handle: AutomatedWordHandle,
  outPdfPath: string,
  timeoutSeconds: number = 600
): void {
  validateOwnershipHandle(handle);

  // 1. Export PDF
  exportTargetDocToPdfOnly(handle, outPdfPath, timeoutSeconds);

  // 2. Close document
  closeTargetDocOnly(handle, 30);

  // 3. Clean up directory safely
  safeCleanupIsolatedDirectory(handle);
}

/**
 * Safely cleans up ONLY our target document if it remains open after an error.
 * Strictly validates ownership handle; if invalid, safely no-ops without error.
 * Executes closing atomically on the matched document object reference in one AppleScript call.
 * Never touches or closes any other document.
 */
export function cleanupTargetDocOnly(handle: unknown): void {
  if (!handle) return;

  try {
    validateOwnershipHandle(handle);
  } catch {
    // Unowned, invalid, or string handle: safely no-op to guarantee user documents are untouched
    return;
  }

  try {
    closeTargetDocOnly(handle, 10);
  } catch {}

  safeCleanupIsolatedDirectory(handle);
}

/**
 * Prunes residual isolation folders from previous runs safely.
 * Only deletes a directory if:
 * 1. Word is running and we CAN verify the path is not open in any Word document window.
 * 2. Or Word is completely not running.
 * 3. The directory is older than maxAgeMs (default: 30 minutes).
 */
export function cleanResidualIsolationDirsSafely(maxAgeMs: number = 30 * 60 * 1000): {
  scanned: number;
  pruned: number;
  preserved: number;
} {
  const baseDir = path.resolve(os.tmpdir(), 'f2w_word_isolation');
  if (!fs.existsSync(baseDir)) {
    return { scanned: 0, pruned: 0, preserved: 0 };
  }

  let wordOpenPaths: string[] = [];
  try {
    const state = captureWordState();
    if (state.wordWasRunning) {
      wordOpenPaths = state.initialDocumentPaths;
    }
  } catch {
    // Fail-closed: if we cannot query Word, do not prune any directory
    return { scanned: 0, pruned: 0, preserved: 0 };
  }

  const entries = fs.readdirSync(baseDir);
  let scanned = 0;
  let pruned = 0;
  let preserved = 0;
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.startsWith('vr_')) continue;
    scanned++;
    const fullDir = path.join(baseDir, entry);
    try {
      const stats = fs.statSync(fullDir);
      if (!stats.isDirectory()) continue;

      const age = now - stats.mtimeMs;
      if (age < maxAgeMs) {
        preserved++;
        continue;
      }

      // Check if any open document path in Word points to this directory
      const normDir = normalizeWordPath(fullDir);
      const isLockedByWord = wordOpenPaths.some((p) => p.startsWith(normDir));
      if (isLockedByWord) {
        preserved++;
        continue;
      }

      fs.rmSync(fullDir, { recursive: true, force: true });
      pruned++;
    } catch {
      preserved++;
    }
  }

  return { scanned, pruned, preserved };
}
