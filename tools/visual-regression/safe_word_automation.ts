import { execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

export interface WordEnvironmentSnapshot {
  wordWasRunning: boolean;
  initialDocumentNames: string[];
  initialDocumentPaths: string[];
  initialDocumentCount: number;
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
 * Executes an AppleScript via stdin directly through execFileSync, eliminating shell injection vulnerabilities.
 */
export function runAppleScript(script: string, timeoutMs: number = 15000): string {
  return execFileSync('osascript', [], { input: script, encoding: 'utf8', timeout: timeoutMs }).trim();
}

/**
 * Captures the current running state of Microsoft Word and list of already open document paths.
 * Enforces fail-closed error handling: if Word is running but queries fail, throws an error
 * instead of assuming 0 documents to prevent accidental interference with user documents.
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
    };
  }

  // Word is running: query all open documents.
  // Fail-closed principle: if this query fails, DO NOT assume 0 documents!
  const queryDocsScript = `
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

  let rawOut = '';
  try {
    rawOut = runAppleScript(queryDocsScript, 10000);
  } catch (err: any) {
    throw new Error(
      `[WordAutomation] Fail-closed: Microsoft Word is running but document state query failed: ${err.message}. Aborting to protect existing user documents.`
    );
  }

  const names: string[] = [];
  const paths: string[] = [];
  if (rawOut) {
    const rows = rawOut.split('<#ROW#>');
    for (const r of rows) {
      const parts = r.split('<#SEP#>');
      if (parts.length >= 3) {
        names.push(parts[1]);
        paths.push(normalizeWordPath(parts[2]));
      }
    }
  }

  return {
    wordWasRunning: true,
    initialDocumentNames: names,
    initialDocumentPaths: paths,
    initialDocumentCount: names.length,
  };
}

/**
 * Safely opens ONLY the target DOCX file in Word within an isolated temporary directory.
 * Matches strictly by normalized POSIX path (no filename or prefix matching).
 * Refuses ownership if the document was already open before automation ran.
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
      `[WordAutomation] Timeout waiting for target document "${path.basename(resolvedSource)}" to load at isolated path: ${normalizedTargetPosix}`
    );
  }

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
    fullPath: resolvedSource,
  };
}

/**
 * Exports ONLY the target document to PDF and closes ONLY that document.
 * Requires an AutomatedWordHandle verifying that the automation owns the document.
 * Crucial: Existing user documents are strictly untouched.
 */
export function exportAndCloseTargetDocOnly(
  handle: AutomatedWordHandle | string,
  outPdfPath: string,
  timeoutSeconds: number = 600
): void {
  let targetNormalizedPath = '';
  let isolatedDir: string | undefined;

  if (typeof handle === 'object' && handle !== null) {
    if (!handle.isOwned) {
      throw new Error(`[WordAutomation] Cannot close document: automation does not own this document.`);
    }
    targetNormalizedPath = handle.normalizedPosixPath;
    isolatedDir = handle.isolatedDir;
  } else if (typeof handle === 'string') {
    if (path.isAbsolute(handle)) {
      targetNormalizedPath = normalizeWordPath(handle);
    } else {
      throw new Error(
        `[WordAutomation] Direct document name matching is forbidden in Phase 28. AutomatedWordHandle with verified POSIX path is required.`
      );
    }
  }

  const resolvedPdf = path.resolve(outPdfPath);
  const escapedPdf = escapeAppleScript(resolvedPdf);
  const escapedTarget = escapeAppleScript(targetNormalizedPath);

  // In AppleScript: find document matching targetNormalizedPath strictly
  const script = `
with timeout of ${timeoutSeconds} seconds
  tell application "Microsoft Word"
    set foundIndex to 0
    repeat with i from 1 to (count of documents)
      set d to document i
      try
        set p to (posix full name of d as text)
        if p is equal to "${escapedTarget}" then
          set foundIndex to i
          exit repeat
        end if
      end try
    end repeat

    if foundIndex > 0 then
      set d to document foundIndex
      save as d file name "${escapedPdf}" file format format PDF
      close d saving no
      return "OK"
    else
      return "TARGET_NOT_FOUND"
    end if
  end tell
end timeout
`;

  let res = '';
  try {
    res = runAppleScript(script, (timeoutSeconds + 10) * 1000);
  } catch (err: any) {
    throw new Error(`[WordAutomation] AppleScript error during PDF export: ${err.message}`);
  }

  if (res === 'TARGET_NOT_FOUND') {
    // Secondary check with Node-side normalization to resolve any symlink variance
    const verifyScript = `
tell application "Microsoft Word"
  set out to {}
  repeat with i from 1 to (count of documents)
    set d to document i
    try
      set p to (posix full name of d as text)
      set end of out to (i as text) & "<#SEP#>" & p
    on error
    end try
  end repeat
  set AppleScript's text item delimiters to "<#ROW#>"
  return out as text
end tell
`;
    const checkRaw = runAppleScript(verifyScript, 5000);
    let retryIndex = 0;
    if (checkRaw) {
      for (const row of checkRaw.split('<#ROW#>')) {
        const [idxStr, p] = row.split('<#SEP#>');
        if (normalizeWordPath(p) === targetNormalizedPath) {
          retryIndex = parseInt(idxStr, 10);
          break;
        }
      }
    }

    if (retryIndex > 0) {
      const retryScript = `
with timeout of ${timeoutSeconds} seconds
  tell application "Microsoft Word"
    if (count of documents) >= ${retryIndex} then
      set d to document ${retryIndex}
      save as d file name "${escapedPdf}" file format format PDF
      close d saving no
      return "OK"
    end if
    return "TARGET_NOT_FOUND"
  end tell
end timeout
`;
      res = runAppleScript(retryScript, (timeoutSeconds + 10) * 1000);
    }
  }

  // Always clean up isolated temporary directory
  if (isolatedDir && fs.existsSync(isolatedDir)) {
    try {
      fs.rmSync(isolatedDir, { recursive: true, force: true });
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
 * Matches strictly by normalized POSIX path and cleans up temporary isolation directory.
 * Never closes any other document.
 */
export function cleanupTargetDocOnly(handle: AutomatedWordHandle | string): void {
  if (!handle) return;
  let targetNormalizedPath = '';
  let isolatedDir: string | undefined;

  if (typeof handle === 'object' && handle !== null) {
    targetNormalizedPath = handle.normalizedPosixPath;
    isolatedDir = handle.isolatedDir;
  } else if (typeof handle === 'string') {
    if (path.isAbsolute(handle)) {
      targetNormalizedPath = normalizeWordPath(handle);
    } else {
      // Mock name or non-path: safe no-op
      return;
    }
  }

  if (!targetNormalizedPath) return;

  try {
    const checkScript = `
tell application "Microsoft Word"
  set out to {}
  repeat with i from 1 to (count of documents)
    set d to document i
    try
      set p to (posix full name of d as text)
      set end of out to (i as text) & "<#SEP#>" & p
    on error
    end try
  end repeat
  set AppleScript's text item delimiters to "<#ROW#>"
  return out as text
end tell
`;
    const checkRaw = runAppleScript(checkScript, 5000);
    if (checkRaw) {
      for (const row of checkRaw.split('<#ROW#>')) {
        const [idxStr, p] = row.split('<#SEP#>');
        if (normalizeWordPath(p) === targetNormalizedPath) {
          const idx = parseInt(idxStr, 10);
          const closeScript = `
tell application "Microsoft Word"
  if (count of documents) >= ${idx} then
    close (document ${idx}) saving no
  end if
end tell
`;
          runAppleScript(closeScript, 5000);
          break;
        }
      }
    }
  } catch {}

  if (isolatedDir && fs.existsSync(isolatedDir)) {
    try {
      fs.rmSync(isolatedDir, { recursive: true, force: true });
    } catch {}
  }
}
