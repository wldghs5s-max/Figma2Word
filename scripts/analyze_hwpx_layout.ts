import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { parseXmlString, findDescendants, findChild, getAttribute } from "./lib/xmlUtils.js";

export interface HwpxFontEntry {
  id: string;
  face: string;
  type?: string;
  isEmbedded?: boolean;
}

export interface HwpxCharPr {
  id: string;
  fontSizePt: number;
  textColor: string;
  bold: boolean;
  italic: boolean;
  fontRef: Record<string, string>; // lang -> fontId
  spacing: number;
  ratio: number;
}

export interface HwpxParaPr {
  id: string;
  horizontalAlign: string;
  verticalAlign: string;
  lineSpacingType: string;
  lineSpacingValue: number;
  lineSpacingUnit: string;
  lineWrap: string;
  breakLatinWord: string;
  breakNonLatinWord: string;
  marginPt: { left: number; right: number; top: number; bottom: number };
}

export interface HwpxRunInfo {
  text: string;
  charPrId: string;
  fontSizePt: number;
  fontFaceHangul: string;
  fontFaceLatin: string;
  bold: boolean;
}

export interface HwpxTextBoxAnalysis {
  sectionIndex: number;
  rectId: string;
  zOrder: number;
  name: string;
  boundsPt: { x: number; y: number; width: number; height: number };
  lineWrap: string;
  vertAlign: string;
  textMarginPt: { left: number; right: number; top: number; bottom: number };
  paraPrId: string;
  lineSpacingType: string;
  lineSpacingValue: number;
  lineSpacingUnit: string;
  lineHeightPt: number;
  runs: HwpxRunInfo[];
  fullText: string;
  charCount: { total: number; hangul: number; latin: number; digits: number; spaces: number };
  estimatedMetrics: {
    estimatedTextWidthPt: number;
    estimatedLineCount: number;
    estimatedTextHeightPt: number;
    remainingBottomClearancePt: number;
    hazardFlags: string[];
    isEstimation: true;
  };
}

export interface HwpxLayoutAnalysisReport {
  filePath: string;
  fileName: string;
  pageCount: number;
  pageSizePt: { width: number; height: number; orientation: string };
  headerSummary: {
    fontCount: number;
    charPrCount: number;
    paraPrCount: number;
    fontsByLang: Record<string, HwpxFontEntry[]>;
    lineSpacingDistribution: Record<string, number>;
  };
  totalTextBoxCount: number;
  wrapDistribution: { SQUEEZE: number; BREAK: number; other: number };
  textboxes: HwpxTextBoxAnalysis[];
  collisionHazards: Array<{
    rectId: string;
    name: string;
    hazardFlags: string[];
    details: string;
  }>;
}

// Estimate character visual advance in points based on typographic standard
function estimateCharAdvancePt(char: string, fontSizePt: number, isBold: boolean): number {
  const code = char.charCodeAt(0);
  const boldMult = isBold ? 1.05 : 1.0;

  // CJK / Hangul: full square (1.0 em)
  if (
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
    (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3000 && code <= 0x303f)    // CJK Symbols and Punctuation
  ) {
    return fontSizePt * 1.0 * boldMult;
  }

  // Digits: proportional ~0.55 - 0.6 em
  if (code >= 0x30 && code <= 0x39) {
    return fontSizePt * 0.55 * boldMult;
  }

  // Whitespace
  if (char === " " || char === "\t") {
    return fontSizePt * 0.3 * boldMult;
  }

  // Punctuation & symbols
  if (/[.,;:!?'"()\[\]{}\-_/\\|`~@#$%^&*+=<>]/.test(char)) {
    return fontSizePt * 0.35 * boldMult;
  }

  // Standard Latin uppercase vs lowercase
  if (code >= 0x41 && code <= 0x5a) {
    return fontSizePt * 0.65 * boldMult;
  }
  if (code >= 0x61 && code <= 0x7a) {
    return fontSizePt * 0.52 * boldMult;
  }

  // Fallback
  return fontSizePt * 0.6 * boldMult;
}

export async function analyzeHwpxLayout(filePath: string): Promise<HwpxLayoutAnalysisReport> {
  const fileBuf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(fileBuf);

  // 1. Read Contents/header.xml
  const headerXml = await zip.file("Contents/header.xml")!.async("string");
  const hdrDoc = parseXmlString(headerXml);

  // Parse fontfaces
  const fontRegistry: Record<string, Map<string, HwpxFontEntry>> = {};
  const fontsByLang: Record<string, HwpxFontEntry[]> = {};
  const fontfaceNodes = findDescendants(hdrDoc, (n) => n.name.endsWith("fontface"));

  for (const ff of fontfaceNodes) {
    const lang = getAttribute(ff, "lang") || "ALL";
    const fontMap = new Map<string, HwpxFontEntry>();
    const fontNodes = findDescendants(ff, (n) => n.name.endsWith("font"));
    for (const fn of fontNodes) {
      const id = getAttribute(fn, "id") || "0";
      const face = getAttribute(fn, "face") || "";
      const type = getAttribute(fn, "type");
      const isEmbedded = getAttribute(fn, "isEmbedded") === "1";
      fontMap.set(id, { id, face, type, isEmbedded });
    }
    fontRegistry[lang] = fontMap;
    fontsByLang[lang] = Array.from(fontMap.values());
  }

  // Parse charPr
  const charPrMap = new Map<string, HwpxCharPr>();
  const charPrNodes = findDescendants(hdrDoc, (n) => n.name.endsWith("charPr"));
  for (const cp of charPrNodes) {
    const id = getAttribute(cp, "id") || "0";
    const heightHwpu = parseInt(getAttribute(cp, "height") || "1000", 10);
    const fontSizePt = heightHwpu / 100;
    const textColor = getAttribute(cp, "textColor") || "#000000";
    const bold = getAttribute(cp, "bold") === "1";
    const italic = getAttribute(cp, "italic") === "1";

    const fontRefNode = findChild(cp, (n) => n.name.endsWith("fontRef"));
    const fontRef: Record<string, string> = {};
    if (fontRefNode) {
      for (const [k, v] of Object.entries(fontRefNode.attributes)) {
        fontRef[k.toLowerCase()] = v;
      }
    }

    const spacingNode = findChild(cp, (n) => n.name.endsWith("spacing"));
    const spacing = spacingNode ? parseInt(getAttribute(spacingNode, "hangul") || "0", 10) : 0;
    const ratioNode = findChild(cp, (n) => n.name.endsWith("ratio"));
    const ratio = ratioNode ? parseInt(getAttribute(ratioNode, "hangul") || "100", 10) : 100;

    charPrMap.set(id, { id, fontSizePt, textColor, bold, italic, fontRef, spacing, ratio });
  }

  // Parse paraPr
  const paraPrMap = new Map<string, HwpxParaPr>();
  const lineSpacingDistribution: Record<string, number> = {};
  const paraPrNodes = findDescendants(hdrDoc, (n) => n.name.endsWith("paraPr"));
  for (const pp of paraPrNodes) {
    const id = getAttribute(pp, "id") || "0";
    const alignNode = findChild(pp, (n) => n.name.endsWith("align"));
    const horizontalAlign = alignNode ? getAttribute(alignNode, "horizontal") || "LEFT" : "LEFT";
    const verticalAlign = alignNode ? getAttribute(alignNode, "vertical") || "BASELINE" : "BASELINE";

    const lsNode = findChild(pp, (n) => n.name.endsWith("lineSpacing"));
    const lineSpacingType = lsNode ? getAttribute(lsNode, "type") || "PERCENT" : "PERCENT";
    const lineSpacingValue = lsNode ? parseInt(getAttribute(lsNode, "value") || "160", 10) : 160;
    const lineSpacingUnit = lsNode ? getAttribute(lsNode, "unit") || "PERCENT" : "PERCENT";

    const lsKey = `${lineSpacingType}_${lineSpacingValue}_${lineSpacingUnit}`;
    lineSpacingDistribution[lsKey] = (lineSpacingDistribution[lsKey] || 0) + 1;

    const bsNode = findChild(pp, (n) => n.name.endsWith("breakSetting"));
    const lineWrap = bsNode ? getAttribute(bsNode, "lineWrap") || "BREAK" : "BREAK";
    const breakLatinWord = bsNode ? getAttribute(bsNode, "breakLatinWord") || "KEEP_WORD" : "KEEP_WORD";
    const breakNonLatinWord = bsNode ? getAttribute(bsNode, "breakNonLatinWord") || "BREAK_WORD" : "BREAK_WORD";

    const marginNode = findChild(pp, (n) => n.name.endsWith("margin"));
    let mLeft = 0, mRight = 0, mTop = 0, mBottom = 0;
    if (marginNode) {
      const leftChild = findChild(marginNode, (n) => n.name.endsWith("left"));
      if (leftChild) mLeft = (parseInt(getAttribute(leftChild, "value") || "0", 10)) / 100;
      const rightChild = findChild(marginNode, (n) => n.name.endsWith("right"));
      if (rightChild) mRight = (parseInt(getAttribute(rightChild, "value") || "0", 10)) / 100;
      const prevChild = findChild(marginNode, (n) => n.name.endsWith("prev"));
      if (prevChild) mTop = (parseInt(getAttribute(prevChild, "value") || "0", 10)) / 100;
      const nextChild = findChild(marginNode, (n) => n.name.endsWith("next"));
      if (nextChild) mBottom = (parseInt(getAttribute(nextChild, "value") || "0", 10)) / 100;
    }

    paraPrMap.set(id, {
      id,
      horizontalAlign,
      verticalAlign,
      lineSpacingType,
      lineSpacingValue,
      lineSpacingUnit,
      lineWrap,
      breakLatinWord,
      breakNonLatinWord,
      marginPt: { left: mLeft, right: mRight, top: mTop, bottom: mBottom },
    });
  }

  // 2. Read Contents/section*.xml
  const sectionFiles = Object.keys(zip.files).filter((f) => /^Contents\/section\d+\.xml$/.test(f));
  const textboxes: HwpxTextBoxAnalysis[] = [];
  const wrapDistribution = { SQUEEZE: 0, BREAK: 0, other: 0 };
  let pageSizePt = { width: 595.28, height: 841.89, orientation: "portrait" };
  let pageCount = 0;

  for (let sIdx = 0; sIdx < sectionFiles.length; sIdx++) {
    const sFile = sectionFiles[sIdx];
    const secXml = await zip.file(sFile)!.async("string");
    const secDoc = parseXmlString(secXml);

    // Read page size from first pagePr
    const pagePr = findDescendants(secDoc, (n) => n.name.endsWith("pagePr"))[0];
    if (pagePr) {
      const wHwpu = parseInt(getAttribute(pagePr, "width") || "59528", 10);
      const hHwpu = parseInt(getAttribute(pagePr, "height") || "84189", 10);
      const landscape = getAttribute(pagePr, "landscape") || "WIDELY";
      pageSizePt = {
        width: wHwpu / 100,
        height: hHwpu / 100,
        orientation: landscape === "NARROWLY" ? "landscape" : "portrait",
      };
    }

    // Count pages by pageBreak attribute or secPr
    const pElements = findDescendants(secDoc, (n) => n.name.endsWith("p"));
    let pBreakCount = 1;
    for (const p of pElements) {
      if (getAttribute(p, "pageBreak") === "1") {
        pBreakCount++;
      }
    }
    pageCount = Math.max(pageCount, pBreakCount);

    // Find all <hp:rect> with <hp:drawText>
    const rectNodes = findDescendants(secDoc, (n) => n.name.endsWith("rect"));
    for (const rect of rectNodes) {
      const drawText = findChild(rect, (n) => n.name.endsWith("drawText"));
      if (!drawText) continue;

      const rectId = getAttribute(rect, "id") || getAttribute(rect, "instid") || "0";
      const zOrder = parseInt(getAttribute(rect, "zOrder") || "0", 10);
      const name = getAttribute(drawText, "name") || "";

      // Position and size
      const szNode = findChild(rect, (n) => n.name.endsWith("sz"));
      const wHwpu = szNode ? parseInt(getAttribute(szNode, "width") || "0", 10) : 0;
      const hHwpu = szNode ? parseInt(getAttribute(szNode, "height") || "0", 10) : 0;

      const posNode = findChild(rect, (n) => n.name.endsWith("pos"));
      const xHwpu = posNode ? parseInt(getAttribute(posNode, "horzOffset") || "0", 10) : 0;
      const yHwpu = posNode ? parseInt(getAttribute(posNode, "vertOffset") || "0", 10) : 0;

      const boundsPt = {
        x: xHwpu / 100,
        y: yHwpu / 100,
        width: wHwpu / 100,
        height: hHwpu / 100,
      };

      // subList
      const subList = findChild(drawText, (n) => n.name.endsWith("subList"));
      const lineWrap = subList ? getAttribute(subList, "lineWrap") || "BREAK" : "BREAK";
      const vertAlign = subList ? getAttribute(subList, "vertAlign") || "TOP" : "TOP";

      if (lineWrap === "SQUEEZE") wrapDistribution.SQUEEZE++;
      else if (lineWrap === "BREAK") wrapDistribution.BREAK++;
      else wrapDistribution.other++;

      // textMargin
      const marginNode = findChild(drawText, (n) => n.name.endsWith("textMargin"));
      const textMarginPt = {
        left: marginNode ? parseInt(getAttribute(marginNode, "left") || "0", 10) / 100 : 0,
        right: marginNode ? parseInt(getAttribute(marginNode, "right") || "0", 10) / 100 : 0,
        top: marginNode ? parseInt(getAttribute(marginNode, "top") || "0", 10) / 100 : 0,
        bottom: marginNode ? parseInt(getAttribute(marginNode, "bottom") || "0", 10) / 100 : 0,
      };

      // Process runs & paragraphs inside subList
      const runs: HwpxRunInfo[] = [];
      let primaryParaPrId = "0";
      let fullText = "";

      const pNodes = subList ? findDescendants(subList, (n) => n.name.endsWith("p")) : [];
      for (const p of pNodes) {
        const paraPrId = getAttribute(p, "paraPrIDRef") || "0";
        if (primaryParaPrId === "0") primaryParaPrId = paraPrId;

        const runNodes = findDescendants(p, (n) => n.name.endsWith("run"));
        for (const run of runNodes) {
          const charPrId = getAttribute(run, "charPrIDRef") || "0";
          const cp = charPrMap.get(charPrId);
          const tNode = findChild(run, (n) => n.name.endsWith("t"));
          const text = tNode ? tNode.text || "" : "";
          fullText += text;

          // Lookup font face
          const hangulFid = cp?.fontRef["hangul"] || "0";
          const latinFid = cp?.fontRef["latin"] || "0";
          const fontFaceHangul = fontRegistry["HANGUL"]?.get(hangulFid)?.face || "";
          const fontFaceLatin = fontRegistry["LATIN"]?.get(latinFid)?.face || "";

          runs.push({
            text,
            charPrId,
            fontSizePt: cp?.fontSizePt || 10,
            fontFaceHangul,
            fontFaceLatin,
            bold: cp?.bold || false,
          });
        }
      }

      // ParaPr info
      const pp = paraPrMap.get(primaryParaPrId);
      const lineSpacingType = pp?.lineSpacingType || "PERCENT";
      const lineSpacingValue = pp?.lineSpacingValue || 160;
      const lineSpacingUnit = pp?.lineSpacingUnit || "PERCENT";

      // Compute primary fontSize
      const primaryFontSizePt = runs[0]?.fontSizePt || 10;
      let calculatedLineHeightPt = primaryFontSizePt * 1.25;
      if (lineSpacingType === "FIXED" && lineSpacingUnit === "HWPUNIT") {
        calculatedLineHeightPt = lineSpacingValue / 100;
      } else if (lineSpacingType === "PERCENT") {
        calculatedLineHeightPt = primaryFontSizePt * (lineSpacingValue / 100);
      }

      // Count characters
      let hangulCount = 0, latinCount = 0, digitCount = 0, spaceCount = 0;
      for (const c of fullText) {
        const code = c.charCodeAt(0);
        if ((code >= 0xac00 && code <= 0xd7a3) || (code >= 0x1100 && code <= 0x11ff)) hangulCount++;
        else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latinCount++;
        else if (code >= 0x30 && code <= 0x39) digitCount++;
        else if (c === " " || c === "\t") spaceCount++;
      }

      // Estimate text width
      let estWidthPt = 0;
      for (const run of runs) {
        for (const char of run.text) {
          estWidthPt += estimateCharAdvancePt(char, run.fontSizePt, run.bold);
        }
      }

      // Available width inside box (subtract margins)
      const availWidthPt = Math.max(1, boundsPt.width - (textMarginPt.left + textMarginPt.right));

      // Estimated line count
      const hardLines = fullText.split(/[\r\n]+/).length;
      const wrapRatio = estWidthPt / availWidthPt;
      const estLineCount = Math.max(hardLines, Math.ceil(wrapRatio));

      // Estimated text height
      const estTextHeightPt = estLineCount * calculatedLineHeightPt;
      const remainingClearancePt = boundsPt.height - estTextHeightPt;

      // Hazard flags
      const hazardFlags: string[] = [];
      if (remainingClearancePt < -1.0) {
        hazardFlags.push("NEGATIVE_CLEARANCE_OVERFLOW");
      }
      if (lineWrap === "BREAK" && estLineCount > 1 && hardLines === 1) {
        hazardFlags.push("SINGLE_LINE_WRAP_DEFICIT");
      }
      if (lineSpacingType === "PERCENT" && lineSpacingValue >= 160) {
        hazardFlags.push("EXCESSIVE_LINE_SPACING_160");
      }
      if (runs.some((r) => r.fontFaceHangul === "Inter" && r.text && /[가-힣]/.test(r.text))) {
        hazardFlags.push("HANGUL_FONT_FALLBACK_RISK");
      }

      textboxes.push({
        sectionIndex: sIdx,
        rectId,
        zOrder,
        name,
        boundsPt,
        lineWrap,
        vertAlign,
        textMarginPt,
        paraPrId: primaryParaPrId,
        lineSpacingType,
        lineSpacingValue,
        lineSpacingUnit,
        lineHeightPt: calculatedLineHeightPt,
        runs,
        fullText,
        charCount: {
          total: fullText.length,
          hangul: hangulCount,
          latin: latinCount,
          digits: digitCount,
          spaces: spaceCount,
        },
        estimatedMetrics: {
          estimatedTextWidthPt: parseFloat(estWidthPt.toFixed(2)),
          estimatedLineCount: estLineCount,
          estimatedTextHeightPt: parseFloat(estTextHeightPt.toFixed(2)),
          remainingBottomClearancePt: parseFloat(remainingClearancePt.toFixed(2)),
          hazardFlags,
          isEstimation: true,
        },
      });
    }
  }

  // Filter collision hazards
  const collisionHazards = textboxes
    .filter((tb) => tb.estimatedMetrics.hazardFlags.length > 0)
    .map((tb) => ({
      rectId: tb.rectId,
      name: tb.name,
      hazardFlags: tb.estimatedMetrics.hazardFlags,
      details: `Box h=${tb.boundsPt.height.toFixed(1)}pt, est text h=${tb.estimatedMetrics.estimatedTextHeightPt.toFixed(1)}pt, clearance=${tb.estimatedMetrics.remainingBottomClearancePt.toFixed(1)}pt, lineWrap=${tb.lineWrap}, lineSpacing=${tb.lineSpacingType} ${tb.lineSpacingValue}`,
    }));

  return {
    filePath,
    fileName: path.basename(filePath),
    pageCount,
    pageSizePt,
    headerSummary: {
      fontCount: Object.values(fontRegistry).reduce((sum, m) => sum + m.size, 0),
      charPrCount: charPrMap.size,
      paraPrCount: paraPrMap.size,
      fontsByLang,
      lineSpacingDistribution,
    },
    totalTextBoxCount: textboxes.length,
    wrapDistribution,
    textboxes,
    collisionHazards,
  };
}

export function formatAnalysisToMarkdown(report: HwpxLayoutAnalysisReport): string {
  let md = `# HWPX XML Layout Analysis Report: ${report.fileName}\n\n`;
  md += `**File**: \`${report.filePath}\`\n`;
  md += `**Pages**: ${report.pageCount} pages (${report.pageSizePt.width.toFixed(1)} x ${report.pageSizePt.height.toFixed(1)} pt, ${report.pageSizePt.orientation})\n`;
  md += `**Total Text Boxes Analyzed**: ${report.totalTextBoxCount}\n`;
  md += `**LineWrap Distribution**: SQUEEZE: ${report.wrapDistribution.SQUEEZE} (${((report.wrapDistribution.SQUEEZE / Math.max(1, report.totalTextBoxCount)) * 100).toFixed(1)}%), BREAK: ${report.wrapDistribution.BREAK} (${((report.wrapDistribution.BREAK / Math.max(1, report.totalTextBoxCount)) * 100).toFixed(1)}%)\n\n`;

  md += `## 1. LineSpacing Distribution in header.xml\n\n`;
  md += `| LineSpacing Config | Count | Note |\n|---|---|---|\n`;
  for (const [k, v] of Object.entries(report.headerSummary.lineSpacingDistribution)) {
    md += `| \`${k}\` | ${v} | ${k.includes("PERCENT_160") ? "⚠️ Default Fallback" : "Fixed HWPU"} |\n`;
  }

  md += `\n## 2. Collision & Layout Hazard Summary (Total: ${report.collisionHazards.length})\n\n`;
  if (report.collisionHazards.length === 0) {
    md += `*No estimated layout hazards found.*\n\n`;
  } else {
    md += `| Rect ID | Name / Text Snippet | Hazards Detected | Clearance & Geometry |\n|---|---|---|---|\n`;
    for (const h of report.collisionHazards.slice(0, 30)) {
      md += `| \`${h.rectId}\` | ${h.name.slice(0, 35)} | \`${h.hazardFlags.join(", ")}\` | ${h.details} |\n`;
    }
    if (report.collisionHazards.length > 30) {
      md += `| ... | *(${report.collisionHazards.length - 30} more hazards truncated)* | ... | ... |\n`;
    }
  }

  md += `\n## 3. Detailed Textbox Register (Sample Top 20)\n\n`;
  md += `| ID | Name | Bounds (x,y,w,h pt) | lineWrap | lineSpacing | Est. Width | Est. Lines | Est. Height | Clearance |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const tb of report.textboxes.slice(0, 20)) {
    md += `| \`${tb.rectId}\` | ${tb.name.slice(0, 20)} | ${tb.boundsPt.x.toFixed(1)}, ${tb.boundsPt.y.toFixed(1)}, ${tb.boundsPt.width.toFixed(1)}x${tb.boundsPt.height.toFixed(1)} | \`${tb.lineWrap}\` | \`${tb.lineSpacingType} ${tb.lineSpacingValue}\` | ${tb.estimatedMetrics.estimatedTextWidthPt}pt | ${tb.estimatedMetrics.estimatedLineCount} | ${tb.estimatedMetrics.estimatedTextHeightPt}pt | ${tb.estimatedMetrics.remainingBottomClearancePt}pt |\n`;
  }

  return md;
}

// CLI runner
async function cli() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: npx tsx scripts/analyze_hwpx_layout.ts <file.hwpx> [--json <out.json>] [--md <out.md>]");
    process.exit(0);
  }

  const targetFile = args[0];
  const report = await analyzeHwpxLayout(targetFile);

  const jsonArgIdx = args.indexOf("--json");
  if (jsonArgIdx !== -1 && args[jsonArgIdx + 1]) {
    fs.writeFileSync(args[jsonArgIdx + 1], JSON.stringify(report, null, 2), "utf-8");
    console.log(`Saved JSON analysis to: ${args[jsonArgIdx + 1]}`);
  }

  const mdArgIdx = args.indexOf("--md");
  if (mdArgIdx !== -1 && args[mdArgIdx + 1]) {
    const md = formatAnalysisToMarkdown(report);
    fs.writeFileSync(args[mdArgIdx + 1], md, "utf-8");
    console.log(`Saved Markdown analysis to: ${args[mdArgIdx + 1]}`);
  }

  console.log(`\n=== HWPX LAYOUT ANALYSIS: ${report.fileName} ===`);
  console.log(`Total Textboxes: ${report.totalTextBoxCount}`);
  console.log(`LineWrap Distribution: SQUEEZE=${report.wrapDistribution.SQUEEZE}, BREAK=${report.wrapDistribution.BREAK}`);
  console.log(`Collision & Overflow Hazards Detected: ${report.collisionHazards.length}`);
}

if (process.argv[1] && process.argv[1].includes("analyze_hwpx_layout")) {
  cli().catch(console.error);
}

