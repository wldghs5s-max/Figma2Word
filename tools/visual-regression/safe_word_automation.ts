import { execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

// Cryptographic session secret for HMAC validation of AutomatedWordHandle instances
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

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
}

/**
 * Backward compatibility alias for earlier pipeline consumers.
 */
export interface OpenedWordDocument extends AutomatedWordHandle {
  fullPath: string;
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
 * Returns a cryptographically signed AutomatedWordHandle.
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
  try {
    execFileSync('open', ['-a', 'Microsoft Word', isolatedDocxPath]);
  } catch (err: any) {
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
    try {
      fs.rmSync(isolatedDir, { recursive: true, force: true });
    } catch {}
    throw new Error(
      `[WordAutomation] Timeout waiting for target document "${path.basename(
        resolvedSource
      )}" to load at isolated path: ${normalizedTargetPosix}`
    );
  }

  const verificationSignature = computeHandleSignature(
    runId,
    isolatedDir,
    isolatedDocxPath
  );

  return {
    runId,
    sourceDocxPath: resolvedSource,
    isolatedDocxPath,
    isolatedDir,
    normalizedPosixPath: normalizedTargetPosix,
    docName: matchedDoc.name,
    docIndex: matchedDoc.index,
    sectionsCount: matchedDoc.sectionsCount,
    isOwned: true,
    verificationSignature,
    fullPath: resolvedSource,
  };
}

/**
 * Exports ONLY the target document to PDF and closes ONLY that document in a single
 * atomic AppleScript execution block.
 *
 * Eliminates race conditions:
 * - Does NOT pass document indices between separate AppleScript executions.
 * - Finds, verifies normalized POSIX path, executes PDF export, and closes saving no
 *   directly on the document object reference inside a single atomic loop.
 * - Validates ownership authenticity using cryptographic signature before touching Word.
 */
export function exportAndCloseTargetDocOnly(
  handle: AutomatedWordHandle,
  outPdfPath: string,
  timeoutSeconds: number = 600
): void {
  // 1. Strict ownership and cryptographic authenticity validation
  validateOwnershipHandle(handle);

  const resolvedPdf = path.resolve(outPdfPath);
  const escapedPdf = escapeAppleScript(resolvedPdf);
  const escapedTarget = escapeAppleScript(handle.normalizedPosixPath);

  // 2. Single atomic AppleScript execution:
  // Lookup -> Re-verify path -> Export PDF -> Close saving no on the SAME object reference 'd'
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
`;

  let res = '';
  try {
    res = runAppleScript(atomicExportScript, (timeoutSeconds + 10) * 1000);
  } catch (err: any) {
    throw new Error(
      `[WordAutomation] AppleScript error during PDF export: ${err.message}`
    );
  }

  // 3. Avoid race condition on filesystem temp deletion:
  // Allow Word a brief grace interval to release file locks before deleting the isolation folder
  try {
    execFileSync('sleep', ['0.15']);
  } catch {}

  if (handle.isolatedDir && fs.existsSync(handle.isolatedDir)) {
    try {
      fs.rmSync(handle.isolatedDir, { recursive: true, force: true });
    } catch {}
  }

  if (res !== 'OK') {
    throw new Error(
      `[WordAutomation] Failed to export and close target document: result was "${res}". No user documents were modified.`
    );
  }
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

  const escapedTarget = escapeAppleScript(handle.normalizedPosixPath);

  try {
    const atomicCloseScript = `
tell application "Microsoft Word"
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
      exit repeat
    end if
  end repeat
end tell
`;
    runAppleScript(atomicCloseScript, 5000);
  } catch {}

  // Safe isolated directory removal
  try {
    execFileSync('sleep', ['0.15']);
  } catch {}

  if (handle.isolatedDir && fs.existsSync(handle.isolatedDir)) {
    try {
      fs.rmSync(handle.isolatedDir, { recursive: true, force: true });
    } catch {}
  }
}
