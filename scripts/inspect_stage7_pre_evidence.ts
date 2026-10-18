import fs from "fs";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument, CanvasElement } from "../src/canvas/types.js";

const raw = JSON.parse(fs.readFileSync("debug/customer/Report1-Live-Snapshot.json", "utf-8"));
const parser = new FigmaCanvasParser();
const doc = parser.parse(raw);

console.log("=== STAGE 7 CANVAS IR PRE-EVIDENCE ===");
console.log(`Total Pages: ${doc.pages.length}`);

// 1. Inspect 7:980, 7:981, 7:1082
const targetIds = ["7:980", "7:981", "7:1082"];
for (const page of doc.pages) {
  for (const el of page.elements) {
    if (targetIds.includes(el.id)) {
      console.log(`\n--- Element ID: ${el.id} on Page ${page.pageNumber} ---`);
      console.log(`Name: ${el.name}`);
      console.log(`Type: ${el.type}`);
      console.log(`Bounds: ${JSON.stringify(el.bounds)}`);
      console.log(`ContentHeightPt: ${el.contentHeightPt}`);
      console.log(`TextAutoResize: ${el.textAutoResize}`);
      console.log(`VerticalAlign: ${el.verticalAlign}`);
      console.log(`Runs count: ${el.textRuns?.length}`);
      if (el.textRuns && el.textRuns[0]) {
        const r0 = el.textRuns[0];
        console.log(`Run[0]: text="${r0.text.slice(0, 50)}", fontSizePt=${r0.fontSizePt}, lineHeightPt=${r0.lineHeightPt}, font=${r0.fontFamily}`);
      }
    }
  }
}

// 2. Statistics across all text elements in Stage 7
let totalTextElements = 0;
let missingLineHeightCount = 0;
let contentHeightSetCount = 0;
let isMultiLineCount = 0;
let isSingleLineCount = 0;

for (const page of doc.pages) {
  for (const el of page.elements) {
    const hasText = el.type === "text" || (el.textRuns && el.textRuns.length > 0);
    if (!hasText) continue;
    totalTextElements++;

    if (el.contentHeightPt !== undefined && el.contentHeightPt > 0) {
      contentHeightSetCount++;
    }

    const hasExplicitLh = el.textRuns?.some(r => r.lineHeightPt && r.lineHeightPt > 0);
    if (!hasExplicitLh) {
      missingLineHeightCount++;
    }

    // DOCX isMultiLineBox logic
    const isAutoWidth = el.textAutoResize === "WIDTH_AND_HEIGHT";
    let isMultiLineBox = false;
    if (!isAutoWidth && el.textRuns && el.textRuns.length > 0) {
      const hasHardNewline = el.textRuns.some((r) => r.text && /[\r\n]/.test(r.text));
      const maxFontSize = Math.max(...el.textRuns.map((r) => r.fontSizePt || 12));
      const firstLineHeight =
        el.textRuns.find((r) => r.lineHeightPt)?.lineHeightPt || maxFontSize * 1.25;
      const evalHeight = el.contentHeightPt || el.bounds.height;
      const estimatedLines = evalHeight / firstLineHeight;
      const totalChars = el.textRuns.reduce((sum, r) => sum + (r.text?.length || 0), 0);

      isMultiLineBox =
        estimatedLines >= 1.45 ||
        hasHardNewline ||
        (totalChars >= 80 && el.textAutoResize === "HEIGHT");
    }

    if (isMultiLineBox) {
      isMultiLineCount++;
    } else {
      isSingleLineCount++;
    }
  }
}

console.log("\n=== STAGE 7 TOTAL TEXT METRICS ===");
console.log(`Total Text Elements: ${totalTextElements}`);
console.log(`Missing lineHeightPt: ${missingLineHeightCount} (${((missingLineHeightCount / totalTextElements) * 100).toFixed(1)}%)`);
console.log(`contentHeightPt set: ${contentHeightSetCount} (${((contentHeightSetCount / totalTextElements) * 100).toFixed(1)}%)`);
console.log(`DOCX isMultiLineBox = true (wrapStyle: square): ${isMultiLineCount} (${((isMultiLineCount / totalTextElements) * 100).toFixed(1)}%)`);
console.log(`DOCX isMultiLineBox = false (wrapStyle: none): ${isSingleLineCount} (${((isSingleLineCount / totalTextElements) * 100).toFixed(1)}%)`);
