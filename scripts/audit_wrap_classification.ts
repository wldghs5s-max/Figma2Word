import fs from "fs";
import path from "path";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument, CanvasElement } from "../src/canvas/types.js";
import { classifyTextWrap, WrapClassificationResult } from "./lib/wrapClassifier.js";

async function main() {
  console.log("=== TASK B: WRAP CLASSIFICATION AUDIT (STAGE 6 & STAGE 7) ===");

  const parser = new FigmaCanvasParser();

  // 1. Stage 6: Proposal Doc
  const s6Raw = JSON.parse(fs.readFileSync("samples/real-world/sample-a-proposal-doc.json", "utf-8"));
  const s6Doc = parser.parse(s6Raw);

  // 2. Stage 7: Customer Full Report
  const s7Raw = JSON.parse(fs.readFileSync("debug/customer/Report1-Live-Snapshot.json", "utf-8"));
  const s7Doc = parser.parse(s7Raw);

  const auditDocument = (doc: CanvasDocument, stageName: string) => {
    const textElements: CanvasElement[] = [];
    for (const p of doc.pages) {
      for (const el of p.elements) {
        if (el.type === "text" || (el.textRuns && el.textRuns.length > 0)) {
          textElements.push(el);
        }
      }
    }

    const classifications: WrapClassificationResult[] = textElements.map((el) => classifyTextWrap(el));

    const singleLineCount = classifications.filter((c) => !c.isMultiLineBox).length;
    const multiLineCount = classifications.filter((c) => c.isMultiLineBox).length;

    console.log(`\n--- ${stageName} ---`);
    console.log(`Total Text Elements: ${textElements.length}`);
    console.log(`Classified as Single-Line (SQUEEZE): ${singleLineCount} (${((singleLineCount / textElements.length) * 100).toFixed(1)}%)`);
    console.log(`Classified as Multi-Line (BREAK): ${multiLineCount} (${((multiLineCount / textElements.length) * 100).toFixed(1)}%)`);

    // Sample multi-line objects
    const multiLineSample = classifications.filter((c) => c.isMultiLineBox).slice(0, 5);
    console.log(`Sample Multi-Line Objects:`);
    for (const m of multiLineSample) {
      console.log(`  - [${m.elementId}] "${m.name.slice(0, 30)}": lines=${m.metrics.estimatedLines}, chars=${m.metrics.totalChars}, reason=${m.reasons[0]}`);
    }

    return {
      stageName,
      totalCount: textElements.length,
      singleLineCount,
      multiLineCount,
      classifications,
    };
  };

  const s6Report = auditDocument(s6Doc, "Stage 6 (Proposal Document)");
  const s7Report = auditDocument(s7Doc, "Stage 7 (Customer Report 9-Pages)");

  const outDir = "research/rea-document-engine/phase24-layout-audit";
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const resultData = {
    generatedAt: new Date().toISOString(),
    stage6: {
      total: s6Report.totalCount,
      singleLine: s6Report.singleLineCount,
      multiLine: s6Report.multiLineCount,
      singleLineRatio: s6Report.singleLineCount / s6Report.totalCount,
      sampleMultiLine: s6Report.classifications.filter((c) => c.isMultiLineBox).map((c) => ({ id: c.elementId, name: c.name, reasons: c.reasons })),
    },
    stage7: {
      total: s7Report.totalCount,
      singleLine: s7Report.singleLineCount,
      multiLine: s7Report.multiLineCount,
      singleLineRatio: s7Report.singleLineCount / s7Report.totalCount,
      sampleMultiLine: s7Report.classifications.filter((c) => c.isMultiLineBox).slice(0, 15).map((c) => ({ id: c.elementId, name: c.name, reasons: c.reasons })),
    },
    authenticHwpxComparison: {
      authenticTotalTextboxes: 429,
      authenticSqueezeCount: 412,
      authenticBreakCount: 17,
      authenticSqueezeRatio: 412 / 429, // 96.0%
      stage7PredictedSqueezeRatio: s7Report.singleLineCount / s7Report.totalCount, // 96.9%
      alignmentDelta: Math.abs((412 / 429) - (s7Report.singleLineCount / s7Report.totalCount)),
    },
  };

  fs.writeFileSync(path.join(outDir, "wrap_classification_audit.json"), JSON.stringify(resultData, null, 2), "utf-8");
  console.log(`\nSaved wrap classification audit to ${path.join(outDir, "wrap_classification_audit.json")}`);
}

main().catch(console.error);

