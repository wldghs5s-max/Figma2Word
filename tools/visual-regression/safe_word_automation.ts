import { execFileSync, execSync } from 'child_process';
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
  stagedPdfPath?: string;
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
  if (process.platform === 'win32') {
    let isRunning = false;
    try {
      const out = execSync('tasklist /FI "IMAGENAME eq WINWORD.EXE" /NH', { encoding: 'utf8' });
      isRunning = out.includes('WINWORD.EXE');
    } catch {
      isRunning = false;
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
    try {
      const psCmd = `powershell -Command "try { $w = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application'); if ($w) { $names = @($w.Documents | ForEach-Object { $_.FullName }); $names -join '|' } } catch {}"`;
      const psOut = execSync(psCmd, { encoding: 'utf8' }).trim();
      const docPaths = psOut ? psOut.split('|').filter(Boolean) : [];
      return {
        wordWasRunning: true,
        initialDocumentNames: docPaths.map((p: string) => path.basename(p)),
        initialDocumentPaths: docPaths,
        initialDocumentCount: docPaths.length,
        untitledDocumentsCount: 0,
      };
    } catch {
      return {
        wordWasRunning: true,
        initialDocumentNames: [],
        initialDocumentPaths: [],
        initialDocumentCount: 0,
        untitledDocumentsCount: 0,
      };
    }
  }
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

export interface WordAutomationOpenDeps {
  execOpen?: (cmd: string, args: string[]) => void;
  queryDocsScript?: (script: string, timeoutMs: number) => string;
}

/**
 * Safely opens ONLY the target DOCX file in Word within an isolated temporary directory.
 * Matches strictly by normalized POSIX path (no filename or prefix matching).
 * Refuses ownership if the document was already open before automation ran.
 *
 * Lifecycle Safety:
 * - If polling times out, transitions state to 'uncertain' and PRESERVES the isolated
 *   directory to prevent deleting files while Word is still loading them.
 * - If LaunchServices open command fails, transitions to 'uncertain' and strictly PRESERVES
 *   the isolated directory to prevent deleting files if Word was partially or asynchronously notified.
 */
export async function openTargetDocumentSafely(
  docxPath: string,
  snapshot: WordEnvironmentSnapshot,
  maxWaitSeconds: number = 25,
  deps?: WordAutomationOpenDeps
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
  // Safe to clean up since launch was never requested
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
    if (deps?.execOpen) {
      deps.execOpen('open', ['-a', 'Microsoft Word', isolatedDocxPath]);
    } else {
      execFileSync('open', ['-a', 'Microsoft Word', isolatedDocxPath]);
    }
  } catch (err: any) {
    // P0 Fail-Closed (Audit Phase 31.1):
    // Word open request was initiated or in-flight. We CANNOT guarantee Word did not receive
    // or will not asynchronously open the file. We MUST strictly preserve the isolated directory!
    transitionLifecycleState(handle, 'uncertain', `Failed to launch Word: ${err.message}`);
    throw new Error(
      `[WordAutomation] Failed to launch Word for isolated document: ${err.message}. Preserving files at "${handle.isolatedDir}".`
    );
  }

  // 4. Poll for the document matching normalizedTargetPosix strictly
  let matchedDoc: { index: number; name: string; sectionsCount: number } | null = null;
  const runQuery = deps?.queryDocsScript ?? runAppleScript;

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
      const raw = runQuery(queryScript, 5000);
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

export interface WordAutomationExportDeps {
  runAppleScript?: (script: string, timeoutMs?: number) => string;
}

/**
 * Modular PDF export targeting ONLY our verified document.
 * Does not close the document; returns explicit success and output path.
 */
export function exportTargetDocToPdfOnly(
  handle: AutomatedWordHandle,
  outPdfPath: string,
  timeoutSeconds: number = 600,
  deps?: WordAutomationExportDeps
): { exportSuccess: boolean; pdfPath: string } {
  validateOwnershipHandle(handle);

  const runScript = deps?.runAppleScript ?? runAppleScript;
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
    // Unique naming with strict prefix, runId, and timestamp to eliminate collisions
    targetExportPath = path.join(wordContainerTmp, `f2w_stage_${handle.runId}_${Date.now()}.pdf`);
    useContainerStaging = true;
    handle.stagedPdfPath = targetExportPath;
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

  const cleanupStagedFile = () => {
    if (useContainerStaging && fs.existsSync(targetExportPath)) {
      try {
        fs.rmSync(targetExportPath, { force: true });
      } catch {}
    }
  };

  let res = '';
  try {
    res = runScript(atomicExportScript, (timeoutSeconds + 10) * 1000);
  } catch (err: any) {
    cleanupStagedFile();
    transitionLifecycleState(handle, 'uncertain', `Export script failed: ${err.message}`);
    throw new Error(`[WordAutomation] AppleScript error during PDF export: ${err.message}`);
  }

  const exportCreated = fs.existsSync(targetExportPath) && fs.statSync(targetExportPath).size > 0;
  if (res !== 'OK' || !exportCreated) {
    cleanupStagedFile();
    transitionLifecycleState(handle, 'uncertain', `Export failed with status "${res}", file created=${exportCreated}`);
    throw new Error(
      `[WordAutomation] Failed to export target document to PDF: result was "${res}".`
    );
  }

  if (useContainerStaging) {
    try {
      fs.mkdirSync(path.dirname(resolvedPdf), { recursive: true });
      fs.copyFileSync(targetExportPath, resolvedPdf);
    } finally {
      cleanupStagedFile();
    }
  }

  transitionLifecycleState(handle, 'exported', `PDF successfully exported (${fs.statSync(resolvedPdf).size} bytes)`);
  return { exportSuccess: true, pdfPath: resolvedPdf };
}

export interface WordAutomationCloseDeps {
  runAppleScript?: (script: string, timeoutMs?: number) => string;
  captureWordState?: () => WordEnvironmentSnapshot;
}

/**
 * Modular document close targeting ONLY our verified document.
 * Re-queries Word after closing to confirm closure before transitioning to 'close_confirmed'.
 */
export function closeTargetDocOnly(
  handle: AutomatedWordHandle,
  timeoutSeconds: number = 30,
  deps?: WordAutomationCloseDeps
): { closeSuccess: boolean } {
  validateOwnershipHandle(handle);

  const runScript = deps?.runAppleScript ?? runAppleScript;
  const getState = deps?.captureWordState ?? captureWordState;

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

  let closeResult = '';
  try {
    closeResult = runScript(atomicCloseScript, (timeoutSeconds + 5) * 1000);
  } catch (err: any) {
    transitionLifecycleState(handle, 'uncertain', `Close script error: ${err.message}`);
    throw new Error(`[WordAutomation] AppleScript error during document close: ${err.message}`);
  }

  // Confirm document is truly no longer listed in Word
  let stillOpen = false;
  try {
    const checkState = getState();
    stillOpen = checkState.wordWasRunning && checkState.initialDocumentPaths.includes(handle.normalizedPosixPath);
  } catch (err: any) {
    // P0 Fail-Closed: If we cannot query Word state, we CANNOT confirm document closure.
    // Transition to 'uncertain' and throw error, strictly preserving files on disk!
    transitionLifecycleState(handle, 'uncertain', `Unable to verify document closure in Word: ${err.message || String(err)}`);
    throw new Error(
      `[WordAutomation] Unable to verify closure with Word: ${err.message || String(err)}. Preserving files at "${handle.isolatedDir}".`
    );
  }

  if (stillOpen) {
    transitionLifecycleState(handle, 'uncertain', 'Document still reported open in Word after close command');
    throw new Error(
      `[WordAutomation] Document close requested but Word still reports document open. Preserving files at "${handle.isolatedDir}".`
    );
  }

  // TARGET_NOT_FOUND handling:
  // If closeResult was TARGET_NOT_FOUND and document is NOT in Word's open paths,
  // it was already closed before our close command was issued.
  const note = closeResult === 'TARGET_NOT_FOUND'
    ? 'Document already closed (TARGET_NOT_FOUND) and verified absent from Word'
    : 'Confirmed closed in Word';
  transitionLifecycleState(handle, 'close_confirmed', note);
  return { closeSuccess: true };
}

/**
 * Safely removes the isolation directory only if the document is confirmed closed.
 */
export function safeCleanupIsolatedDirectory(handle: AutomatedWordHandle): boolean {
  validateOwnershipHandle(handle);

  if (handle.lifecycleState !== 'close_confirmed') {
    transitionLifecycleState(
      handle,
      'uncertain',
      `Refusing cleanup: state is '${handle.lifecycleState}' (expected 'close_confirmed')`
    );
    return false;
  }

  try {
    execFileSync('sleep', ['0.15']);
  } catch {}

  // P0 Staging Cleanup (Audit Phase 31.1):
  // Clean up staged PDF in Word container tmp if one was created during this handle's lifecycle
  if (handle.stagedPdfPath && fs.existsSync(handle.stagedPdfPath)) {
    try {
      fs.rmSync(handle.stagedPdfPath, { force: true });
    } catch {}
  }

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
 * Checks whether a target path is equal to or strictly located inside a parent directory,
 * respecting OS path separators and boundary rules.
 * Prevents false positives where /tmp/vr_123 would erroneously match /tmp/vr_1234.
 */
export function isPathInsideDirectory(targetPath: string, parentDir: string): boolean {
  const normTarget = normalizeWordPath(targetPath);
  const normParent = normalizeWordPath(parentDir);
  if (normTarget === normParent) return true;
  const rel = path.relative(normParent, normTarget);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Prunes residual isolation folders from previous runs safely.
 * Only deletes a directory if:
 * 1. Word is running and we CAN verify the path is not open in any Word document window.
 * 2. Or Word is completely not running.
 * 3. The directory is older than maxAgeMs (default: 30 minutes).
 * 4. TOCTOU Defense (Phase 32): Re-verifies Word lock immediately prior to directory removal.
 * 5. Boundary Defense (Phase 33): Strict directory boundary check prevents prefix collision (e.g. vr_123 vs vr_1234).
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

      // Check if any open document path in Word points to this directory (Phase 33 strict boundary)
      const normDir = normalizeWordPath(fullDir);
      const isLockedByWord = wordOpenPaths.some((p) => isPathInsideDirectory(p, normDir));
      if (isLockedByWord) {
        preserved++;
        continue;
      }

      // TOCTOU Defense (Phase 32 & 33): Re-query Word state immediately prior to unlinking with strict boundary
      try {
        const freshState = captureWordState();
        if (freshState.wordWasRunning) {
          const freshLocked = freshState.initialDocumentPaths.some((p) => isPathInsideDirectory(p, normDir));
          if (freshLocked) {
            preserved++;
            continue;
          }
        }
      } catch {
        // Fail-closed if re-verification query throws
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

/**
 * Safely prunes orphaned staging PDFs from Microsoft Word's container tmp directory
 * (~/Library/Containers/com.microsoft.Word/Data/tmp).
 *
 * Safety Invariants (Hardened in Phase 32):
 * 1. Only inspects and deletes files starting with 'f2w_stage_' and ending with '.pdf'.
 * 2. Never deletes user files, folders, or staging files younger than maxAgeMs.
 * 3. Never deletes staging PDFs belonging to active runs: verifies that the run's isolated
 *    directory is already gone and no active Word document is open for that runId.
 * 4. Fail-closed: handles missing directory or file access errors gracefully without throwing.
 */
export function cleanResidualStagingPdfsSafely(maxAgeMs: number = 30 * 60 * 1000): {
  scanned: number;
  pruned: number;
  preserved: number;
} {
  const wordContainerTmp = path.join(os.homedir(), 'Library/Containers/com.microsoft.Word/Data/tmp');
  if (!fs.existsSync(wordContainerTmp)) {
    return { scanned: 0, pruned: 0, preserved: 0 };
  }

  let wordOpenPaths: string[] = [];
  try {
    const state = captureWordState();
    if (state.wordWasRunning) {
      wordOpenPaths = state.initialDocumentPaths;
    }
  } catch {
    // Fail-closed: if we cannot query Word, do not prune any staging file
    return { scanned: 0, pruned: 0, preserved: 0 };
  }

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(wordContainerTmp);
  } catch {
    return { scanned: 0, pruned: 0, preserved: 0 };
  }

  const baseIsoDir = path.resolve(os.tmpdir(), 'f2w_word_isolation');
  let scanned = 0;
  let pruned = 0;
  let preserved = 0;
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.startsWith('f2w_stage_') || !entry.endsWith('.pdf')) continue;
    scanned++;
    const fullPath = path.join(wordContainerTmp, entry);
    try {
      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) continue;

      const age = now - stats.mtimeMs;
      if (age < maxAgeMs) {
        preserved++;
        continue;
      }

      // Extract runId: format is 'f2w_stage_${runId}_${timestamp}.pdf'
      // Where runId starts with 'vr_'
      const match = entry.match(/^f2w_stage_(vr_[^_]+_[^_]+)_\d+\.pdf$/);
      if (match) {
        const runId = match[1];
        // 1. Check if corresponding isolated directory still exists on disk
        const runIsoDir = path.join(baseIsoDir, runId);
        if (fs.existsSync(runIsoDir)) {
          // Active or uncertain run: strictly preserve staging PDF!
          preserved++;
          continue;
        }

        // 2. Check if any currently open Word document path references this runId
        const isRunOpenInWord = wordOpenPaths.some((p) => p.includes(runId));
        if (isRunOpenInWord) {
          preserved++;
          continue;
        }
      }

      fs.rmSync(fullPath, { force: true });
      pruned++;
    } catch {
      preserved++;
    }
  }

  return { scanned, pruned, preserved };
}
