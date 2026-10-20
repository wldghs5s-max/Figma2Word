import { execSync } from 'child_process';
import * as path from 'path';

export interface WordEnvironmentSnapshot {
  wordWasRunning: boolean;
  initialDocumentNames: string[];
}

export interface OpenedWordDocument {
  docName: string;
  sectionsCount: number;
  fullPath: string;
}

/**
 * Captures the current running state of Microsoft Word and list of already open document names.
 * Never touches or closes any user documents.
 */
export function captureWordState(): WordEnvironmentSnapshot {
  try {
    const isRunningScript = `
      tell application "System Events"
        return (count of (processes whose name is "Microsoft Word")) > 0
      end tell
    `;
    const isRunning = execSync(`osascript -e '${isRunningScript}'`, { encoding: 'utf8', timeout: 5000 }).trim() === 'true';

    if (!isRunning) {
      return { wordWasRunning: false, initialDocumentNames: [] };
    }

    const docListScript = `
      tell application "Microsoft Word"
        set docList to {}
        repeat with d in documents
          try
            set end of docList to (name of d as text)
          end try
        end repeat
        return docList as text
      end tell
    `;
    // Note: docList might be comma-separated
    const out = execSync(`osascript -e '${docListScript}'`, { encoding: 'utf8', timeout: 5000 }).trim();
    const names = out ? out.split(',').map((s) => s.trim()).filter(Boolean) : [];
    return { wordWasRunning: true, initialDocumentNames: names };
  } catch (err) {
    // If Word is not running or queries fail, treat as not running
    return { wordWasRunning: false, initialDocumentNames: [] };
  }
}

/**
 * Safely opens ONLY the target DOCX file in Word without closing any existing user documents.
 * Polls specifically for the newly opened target document.
 */
export async function openTargetDocumentSafely(
  docxPath: string,
  snapshot: WordEnvironmentSnapshot,
  maxWaitSeconds: number = 25
): Promise<OpenedWordDocument> {
  const resolvedPath = path.resolve(docxPath);
  const targetBaseName = path.basename(resolvedPath);

  // Use macOS LaunchServices 'open -a' to grant Security-Scoped Bookmark without sandbox permission dialogs
  execSync(`open -a "Microsoft Word" "${resolvedPath}"`);

  let foundDocName = '';
  let sectionsCount = 0;

  for (let i = 0; i < maxWaitSeconds; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      // Find specifically the document whose name matches targetBaseName
      const findScript = `
        tell application "Microsoft Word"
          repeat with d in documents
            try
              set dName to (name of d as text)
              -- Check if this document matches our target base name
              if dName is equal to "${targetBaseName}" or dName starts with "${path.parse(targetBaseName).name}" then
                set sCount to (count of sections of d)
                return dName & "|" & (sCount as text)
              end if
            end try
          end repeat
          return "NOT_FOUND"
        end tell
      `;
      const res = execSync(`osascript -e '${findScript}'`, { encoding: 'utf8', timeout: 5000 }).trim();
      if (res !== 'NOT_FOUND' && res.includes('|')) {
        const parts = res.split('|');
        foundDocName = parts[0];
        sectionsCount = parseInt(parts[1], 10) || 0;
        break;
      }
    } catch {}
  }

  if (!foundDocName) {
    throw new Error(`Timeout waiting for target document "${targetBaseName}" to load in Microsoft Word.`);
  }

  return {
    docName: foundDocName,
    sectionsCount,
    fullPath: resolvedPath,
  };
}

/**
 * Exports ONLY the target document to PDF and closes ONLY that document.
 * Crucial: Existing user documents are strictly untouched.
 */
export function exportAndCloseTargetDocOnly(
  targetDocName: string,
  outPdfPath: string,
  timeoutSeconds: number = 600
): void {
  const resolvedPdf = path.resolve(outPdfPath);
  const script = `
    with timeout of ${timeoutSeconds} seconds
      tell application "Microsoft Word"
        set foundDoc to missing value
        repeat with d in documents
          try
            if (name of d as text) is equal to "${targetDocName}" then
              set foundDoc to d
              exit repeat
            end if
          end try
        end repeat

        if foundDoc is not missing value then
          save as foundDoc file name "${resolvedPdf}" file format format PDF
          close foundDoc saving no
          return "OK"
        else
          return "TARGET_NOT_FOUND"
        end if
      end tell
    end timeout
  `;

  const res = execSync(`osascript -e '${script}'`, { encoding: 'utf8', timeout: (timeoutSeconds + 10) * 1000 }).trim();
  if (res === 'TARGET_NOT_FOUND') {
    throw new Error(`Could not find target document "${targetDocName}" to export and close.`);
  }
  if (res !== 'OK') {
    throw new Error(`Unexpected Word export result: ${res}`);
  }
}

/**
 * Safely cleans up ONLY our target document if it remains open after an error.
 * Never closes any other document.
 */
export function cleanupTargetDocOnly(targetDocName: string): void {
  if (!targetDocName) return;
  try {
    const script = `
      tell application "Microsoft Word"
        repeat with d in documents
          try
            if (name of d as text) is equal to "${targetDocName}" then
              close d saving no
            end if
          end try
        end repeat
      end tell
    `;
    execSync(`osascript -e '${script}'`, { encoding: 'utf8', timeout: 5000 });
  } catch {}
}
