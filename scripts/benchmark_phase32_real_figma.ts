import * as fs from 'fs';
import * as path from 'path';
import { FigmaCanvasParser } from '../src/canvas/parser/figmaCanvasParser.js';
import { DocxCanvasRenderer } from '../src/canvas/renderer/docxCanvasRenderer.js';
import { HwpxCanvasRenderer } from '../src/canvas/renderer/hwpxCanvasRenderer.js';
import {
  openTargetDocumentSafely,
  exportTargetDocToPdfOnly,
  closeTargetDocOnly,
  safeCleanupIsolatedDirectory,
  captureWordState,
} from '../tools/visual-regression/safe_word_automation.js';

async function run() {
  const rootDir = process.cwd();
  const jsonPath = path.resolve(rootDir, 'debug/phase25-web-ui-fidelity/pentech_v3_original.json');

  console.log('[Phase 32 Benchmark] 1. Loading Figma JSON snapshot...');
  const t0 = Date.now();
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`[Phase 32 Benchmark] Loaded JSON in ${((Date.now() - t0) / 1000).toFixed(2)}s`);

  const parser = new FigmaCanvasParser({
    imageMap: raw.imageMap,
    scalePolicy: 'fit-a4',
  });

  console.log('[Phase 32 Benchmark] 2. Parsing into Canonical Canvas IR...');
  const tParse = Date.now();
  const doc = parser.parse(raw);
  console.log(`[Phase 32 Benchmark] Parsed ${doc.pages.length} pages in ${((Date.now() - tParse) / 1000).toFixed(2)}s`);

  // Log summary of each page
  doc.pages.forEach((page, idx) => {
    const textCount = page.elements.filter((e) => e.type === 'text').length;
    const cardCount = page.elements.filter((e) => e.type === 'card').length;
    const imgCount = page.elements.filter((e) => e.type === 'image').length;
    const vecCount = page.elements.filter((e) => e.type === 'vector').length;
    console.log(
      `  Page ${idx + 1}: "${page.name}" (${page.bounds.width.toFixed(1)} x ${page.bounds.height.toFixed(1)} pt) - ${page.elements.length} elems (T:${textCount}, C:${cardCount}, I:${imgCount}, V:${vecCount})`
    );
  });

  const outDir = path.resolve(rootDir, 'debug/phase32-benchmark');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('[Phase 32 Benchmark] 3. Rendering DOCX...');
  const tDocx = Date.now();
  const docxRenderer = new DocxCanvasRenderer();
  const docxBuf = await docxRenderer.renderToBuffer(doc);
  const outDocx = path.join(outDir, 'phase32_rendered.docx');
  fs.writeFileSync(outDocx, docxBuf);
  console.log(`[Phase 32 Benchmark] DOCX written (${(docxBuf.length / 1024 / 1024).toFixed(2)} MB) in ${((Date.now() - tDocx) / 1000).toFixed(2)}s`);

  console.log('[Phase 32 Benchmark] 4. Rendering HWPX...');
  const tHwpx = Date.now();
  const hwpxRenderer = new HwpxCanvasRenderer();
  const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
  const outHwpx = path.join(outDir, 'phase32_rendered.hwpx');
  fs.writeFileSync(outHwpx, hwpxBuf);
  console.log(`[Phase 32 Benchmark] HWPX written (${(hwpxBuf.length / 1024 / 1024).toFixed(2)} MB) in ${((Date.now() - tHwpx) / 1000).toFixed(2)}s`);

  console.log('[Phase 32 Benchmark] 5. Opening in Microsoft Word for Mac & Exporting PDF...');
  const snapshot = captureWordState();
  console.log(`[Phase 32 Benchmark] Word status: running=${snapshot.wordWasRunning}, activeDocs=${snapshot.initialDocumentCount}`);

  const handle = await openTargetDocumentSafely(outDocx, snapshot, 40);
  console.log(`[Phase 32 Benchmark] Word opened document: ${handle.runId}, sections=${handle.sectionsCount}`);

  const outPdf = path.join(outDir, 'phase32_rendered.pdf');
  exportTargetDocToPdfOnly(handle, outPdf, 600);
  console.log(`[Phase 32 Benchmark] PDF exported: ${outPdf}`);

  closeTargetDocOnly(handle);
  safeCleanupIsolatedDirectory(handle);
  console.log('[Phase 32 Benchmark] Word document closed and cleaned up safely.');
}

run().catch(console.error);
