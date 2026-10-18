import { CanvasElement } from "../../src/canvas/types.js";

export interface WrapClassificationResult {
  elementId: string;
  name: string;
  isMultiLineBox: boolean;
  recommendedLineWrap: "SQUEEZE" | "BREAK";
  reasons: string[];
  metrics: {
    isAutoWidth: boolean;
    hasHardNewline: boolean;
    fontSizePt: number;
    firstLineHeightPt: number;
    evalHeightPt: number;
    estimatedLines: number;
    totalChars: number;
    textAutoResize?: string;
  };
}

/**
 * Universal Single-line vs Multi-line Box Classifier for Canvas Elements.
 * Shared mathematical model between DOCX (wrapStyle none/square) and HWPX (lineWrap SQUEEZE/BREAK).
 */
export function classifyTextWrap(el: CanvasElement): WrapClassificationResult {
  const reasons: string[] = [];
  const textRuns = el.textRuns || [];
  const totalChars = textRuns.reduce((sum, r) => sum + (r.text?.length || 0), 0);

  const isAutoWidth = el.textAutoResize === "WIDTH_AND_HEIGHT";
  const hasHardNewline = textRuns.some((r) => r.text && /[\r\n]/.test(r.text));

  const fontSizes = textRuns.map((r) => r.fontSizePt || 12);
  const maxFontSize = fontSizes.length > 0 ? Math.max(...fontSizes) : 12;
  const firstLineHeight =
    textRuns.find((r) => r.lineHeightPt && r.lineHeightPt > 0)?.lineHeightPt || maxFontSize * 1.25;

  // Crucial: Use contentHeightPt if present to ignore parent frame inflation (e.g. 7:1082)
  const evalHeight = el.contentHeightPt !== undefined && el.contentHeightPt > 0
    ? el.contentHeightPt
    : el.bounds.height;

  const estimatedLines = evalHeight / Math.max(1, firstLineHeight);

  let isMultiLineBox = false;

  if (hasHardNewline) {
    isMultiLineBox = true;
    reasons.push("Explicit hard newline detected in text runs");
  } else if (isAutoWidth) {
    isMultiLineBox = false;
    reasons.push("Auto-width text (WIDTH_AND_HEIGHT) strictly preserved as single-line");
  } else {
    if (estimatedLines >= 1.45) {
      isMultiLineBox = true;
      reasons.push(`Box height ratio (${estimatedLines.toFixed(2)} >= 1.45 lines) indicates multi-line`);
    } else if (totalChars >= 80 && el.textAutoResize === "HEIGHT") {
      isMultiLineBox = true;
      reasons.push(`High character count (${totalChars} >= 80 chars) with HEIGHT resize indicates paragraph flow`);
    } else {
      isMultiLineBox = false;
      reasons.push(`Single-line box (lines=${estimatedLines.toFixed(2)} < 1.45, chars=${totalChars})`);
    }
  }

  // Pill / badge guard: height <= 26pt and single line is strictly single-line
  if (el.bounds.height <= 26 && !hasHardNewline && totalChars < 50) {
    if (isMultiLineBox) {
      reasons.push("Overridden to single-line by pill/badge height constraint (height <= 26pt)");
    }
    isMultiLineBox = false;
  }

  return {
    elementId: el.id,
    name: el.name,
    isMultiLineBox,
    recommendedLineWrap: isMultiLineBox ? "BREAK" : "SQUEEZE",
    reasons,
    metrics: {
      isAutoWidth,
      hasHardNewline,
      fontSizePt: maxFontSize,
      firstLineHeightPt: firstLineHeight,
      evalHeightPt: evalHeight,
      estimatedLines: parseFloat(estimatedLines.toFixed(2)),
      totalChars,
      textAutoResize: el.textAutoResize,
    },
  };
}

