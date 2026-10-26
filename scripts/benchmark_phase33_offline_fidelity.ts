import * as fs from "fs";
import * as path from "path";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import {
  openTargetDocumentSafely,
  exportTargetDocToPdfOnly,
  closeTargetDocOnly,
  safeCleanupIsolatedDirectory,
  captureWordState,
} from "../tools/visual-regression/safe_word_automation.js";

async function run() {
  const rootDir = process.cwd();
  const jsonPath = path.resolve(rootDir, "펜테크 3차 디자인.json");

  console.log("[Phase 33 Benchmark] 1. Loading Figma JSON snapshot (Offline-first)...");
  const t0 = Date.now();
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  console.log(`[Phase 33 Benchmark] Loaded JSON in ${((Date.now() - t0) / 1000).toFixed(2)}s`);

  const parser = new FigmaCanvasParser({
    imageMap: raw.imageMap,
    scalePolicy: "fit-a4",
  });

  console.log("[Phase 33 Benchmark] 2. Parsing into Canonical Canvas IR...");
  const tParse = Date.now();
  const doc = parser.parse(raw);
  console.log(
    `[Phase 33 Benchmark] Parsed ${doc.pages.length} pages in ${((Date.now() - tParse) / 1000).toFixed(2)}s`
  );

  const outDir = path.resolve(rootDir, "debug/phase33-benchmark");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("[Phase 33 Benchmark] 3. Rendering DOCX with Universal Cascading Opacity...");
  const tDocx = Date.now();
  const docxRenderer = new DocxCanvasRenderer();
  const docxBuf = await docxRenderer.renderToBuffer(doc);
  const outDocx = path.join(outDir, "phase33_rendered.docx");
  fs.writeFileSync(outDocx, docxBuf);
  console.log(
    `[Phase 33 Benchmark] DOCX written (${(docxBuf.length / 1024 / 1024).toFixed(2)} MB) in ${((Date.now() - tDocx) / 1000).toFixed(2)}s`
  );

  console.log("[Phase 33 Benchmark] 4. Rendering HWPX with KS X 6101 Compliance...");
  const tHwpx = Date.now();
  const hwpxRenderer = new HwpxCanvasRenderer();
  const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
  const outHwpx = path.join(outDir, "phase33_rendered.hwpx");
  fs.writeFileSync(outHwpx, hwpxBuf);
  console.log(
    `[Phase 33 Benchmark] HWPX written (${(hwpxBuf.length / 1024 / 1024).toFixed(2)} MB) in ${((Date.now() - tHwpx) / 1000).toFixed(2)}s`
  );

  console.log("[Phase 33 Benchmark] 5. Opening in Microsoft Word for Mac & Exporting PDF...");
  const snapshot = captureWordState();
  console.log(
    `[Phase 33 Benchmark] Word status: running=${snapshot.wordWasRunning}, activeDocs=${snapshot.initialDocumentCount}`
  );

  let handle: any = null;
  try {
    handle = await openTargetDocumentSafely(outDocx, snapshot, 40);
    console.log(
      `[Phase 33 Benchmark] Word opened document: ${handle.runId}, sections=${handle.sectionsCount}`
    );

    const outPdf = path.join(outDir, "phase33_rendered.pdf");
    exportTargetDocToPdfOnly(handle, outPdf, 600);
    console.log(`[Phase 33 Benchmark] PDF exported: ${outPdf}`);
  } catch (err) {
    console.error("[Phase 33 Benchmark] Error during Word rendering or export:", err);
    if (handle) {
      try {
        closeTargetDocOnly(handle);
      } catch (closeErr) {
        console.error("[Phase 33 Benchmark] Warning: fail-closed during emergency doc close:", closeErr);
      }
      try {
        safeCleanupIsolatedDirectory(handle);
      } catch (cleanErr) {
        console.error("[Phase 33 Benchmark] Warning: fail-closed during emergency cleanup:", cleanErr);
      }
    }
    throw err;
  }

  closeTargetDocOnly(handle);
  safeCleanupIsolatedDirectory(handle);
  console.log("[Phase 33 Benchmark] Word document closed and cleaned up safely.");
}

run().catch((err) => {
  console.error("[Phase 33 Benchmark] Fatal execution error:", err);
  process.exit(1);
});
