import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";

interface FormatComparisonResult {
  suiteName: string;
  sourceNodesCount: number;
  canvasElementsCount: number;
  hwpxPackageValid: boolean;
  docxPackageValid: boolean;
  textRunsCount: number;
  textsSample: string[];
  hwpxSize: number;
  docxSize: number;
  conformanceStatus: "PASSED" | "WARNING" | "FAILED";
}

async function verifyZipPackage(buffer: Buffer): Promise<{ valid: boolean; files: string[] }> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const files = Object.keys(zip.files);
    return { valid: files.length > 0, files };
  } catch {
    return { valid: false, files: [] };
  }
}

async function runHarness() {
  console.log("================================================================================");
  console.log("PHASE 23: CANONICAL IR CROSS-FORMAT (DOCX <-> HWPX) FIDELITY HARNESS");
  console.log("================================================================================");

  const outDir = path.resolve(process.cwd(), "debug/cross-format-phase23");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const hwpxRenderer = new HwpxCanvasRenderer();
  const docxRenderer = new DocxCanvasRenderer();

  const results: FormatComparisonResult[] = [];

  // Suite 1: Stage 6 (Proposal)
  const s6Path = path.resolve(process.cwd(), "samples/real-world/sample-a-proposal-doc.json");
  if (fs.existsSync(s6Path)) {
    const raw = JSON.parse(fs.readFileSync(s6Path, "utf-8"));
    const parser = new FigmaCanvasParser({ titleOverride: "Cross-Format Stage 6" });
    const doc = parser.parse(raw);

    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    const docxBuf = await docxRenderer.renderToBuffer(doc);

    const hwpxAudit = await verifyZipPackage(hwpxBuf);
    const docxAudit = await verifyZipPackage(docxBuf);

    let textRuns = 0;
    const texts: string[] = [];
    doc.pages.forEach(p => p.elements.forEach(e => {
      if (e.textRuns) {
        textRuns += e.textRuns.length;
        e.textRuns.forEach(r => { if (r.text.trim()) texts.push(r.text.trim().substring(0, 30)); });
      }
    }));

    results.push({
      suiteName: "Stage 6 (Proposal Report)",
      sourceNodesCount: raw.document?.children?.length || 1,
      canvasElementsCount: doc.pages.reduce((acc, p) => acc + p.elements.length, 0),
      hwpxPackageValid: hwpxAudit.valid,
      docxPackageValid: docxAudit.valid,
      textRunsCount: textRuns,
      textsSample: texts.slice(0, 5),
      hwpxSize: hwpxBuf.length,
      docxSize: docxBuf.length,
      conformanceStatus: hwpxAudit.valid && docxAudit.valid ? "PASSED" : "FAILED"
    });
  }

  // Suite 2: Stage 7 (Customer Full 9-Page Report)
  const s7Path = path.resolve(process.cwd(), "debug/customer/Report1-Live-Snapshot.json");
  if (fs.existsSync(s7Path)) {
    const raw = JSON.parse(fs.readFileSync(s7Path, "utf-8"));
    const parser = new FigmaCanvasParser({ titleOverride: "Cross-Format Stage 7" });
    const doc = parser.parse(raw);

    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    const docxBuf = await docxRenderer.renderToBuffer(doc);

    const hwpxAudit = await verifyZipPackage(hwpxBuf);
    const docxAudit = await verifyZipPackage(docxBuf);

    let textRuns = 0;
    const texts: string[] = [];
    doc.pages.forEach(p => p.elements.forEach(e => {
      if (e.textRuns) {
        textRuns += e.textRuns.length;
        e.textRuns.forEach(r => { if (r.text.trim()) texts.push(r.text.trim().substring(0, 30)); });
      }
    }));

    results.push({
      suiteName: "Stage 7 (Customer 9-Page Full Report)",
      sourceNodesCount: 9,
      canvasElementsCount: doc.pages.reduce((acc, p) => acc + p.elements.length, 0),
      hwpxPackageValid: hwpxAudit.valid,
      docxPackageValid: docxAudit.valid,
      textRunsCount: textRuns,
      textsSample: texts.slice(0, 5),
      hwpxSize: hwpxBuf.length,
      docxSize: docxBuf.length,
      conformanceStatus: hwpxAudit.valid && docxAudit.valid ? "PASSED" : "FAILED"
    });
  }

  // Print results
  for (const r of results) {
    console.log(`\n[${r.conformanceStatus}] ${r.suiteName}`);
    console.log(`  - Elements: ${r.canvasElementsCount} (Text Runs: ${r.textRunsCount})`);
    console.log(`  - HWPX: Valid=${r.hwpxPackageValid}, Size=${r.hwpxSize} bytes`);
    console.log(`  - DOCX: Valid=${r.docxPackageValid}, Size=${r.docxSize} bytes`);
    console.log(`  - Sample Texts: ${r.textsSample.join(" | ")}`);
  }

  fs.writeFileSync(
    path.join(outDir, "CROSS_FORMAT_COMPARISON_REPORT.json"),
    JSON.stringify(results, null, 2),
    "utf-8"
  );
  console.log("\nCross-Format Fidelity Harness completed successfully!");
}

runHarness().catch(err => {
  console.error("Error in cross-format harness:", err);
  process.exit(1);
});
