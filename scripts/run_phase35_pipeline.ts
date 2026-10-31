import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execSync } from "child_process";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { createPhase35CanvasDocument } from "./generate_phase35_benchmark_doc.js";
import { auditDocxEditability } from "../src/fidelity/editabilityAuditor.js";
import { compareImages } from "../src/fidelity/benchmarkEngine.js";
import { decodePng, encodePng } from "../src/fidelity/pngDecoder.js";

async function main() {
  const rootDir = process.cwd();
  const outDir = path.resolve(rootDir, "debug/phase35");
  fs.mkdirSync(outDir, { recursive: true });

  const docxPath = path.join(outDir, "phase35_baseline.docx");
  const pdfPath = path.join(outDir, "phase35_baseline.pdf");
  const pagesDir = path.join(outDir, "baseline_pages");
  fs.mkdirSync(pagesDir, { recursive: true });

  console.log("================================================================================");
  console.log(" Phase 35: Windows Native Word Rendering & Fidelity Pipeline");
  console.log("================================================================================");

  // 1. Generate DOCX
  console.log("[Phase 35] 1. Rendering 17-page CanvasDocument to DOCX...");
  const t0 = Date.now();
  const doc = createPhase35CanvasDocument();
  const renderer = new DocxCanvasRenderer();
  const docxBuf = await renderer.renderToBuffer(doc);
  fs.writeFileSync(docxPath, docxBuf);
  const docxDuration = Date.now() - t0;
  const docxSha256 = crypto.createHash("sha256").update(docxBuf).digest("hex");
  console.log(`[Phase 35] DOCX saved: ${docxPath} (${(docxBuf.length / 1024).toFixed(1)} KB, ${docxDuration}ms)`);
  console.log(`[Phase 35] DOCX SHA-256: ${docxSha256}`);

  // 2. Run Windows Word Automation & WinRT Rasterizer
  console.log("[Phase 35] 2. Running Word COM Automation & WinRT PDF Rasterization...");
  const psScript = path.resolve(rootDir, "tools/visual-regression/windows_word_automation.ps1");
  const tWord = Date.now();
  const psCmd = `powershell -ExecutionPolicy Bypass -File "${psScript}" -DocxPath "${docxPath}" -PdfPath "${pdfPath}" -ImagesDir "${pagesDir}" -ScaleFactor 1.3333333`;
  
  const psOutputRaw = execSync(psCmd, { encoding: "utf8" });
  const wordDuration = Date.now() - tWord;
  console.log(`[Phase 35] Word automation completed in ${wordDuration}ms`);
  const wordResult = JSON.parse(psOutputRaw.trim());

  if (!wordResult.success) {
    throw new Error(`Word automation failed: ${wordResult.error}`);
  }
  console.log(`[Phase 35] Word exported PDF: ${wordResult.pdfPath} (${wordResult.pageCount} pages, SHA: ${wordResult.pdfSha256.slice(0, 16)}...)`);
  console.log(`[Phase 35] Rasterized ${wordResult.renderedPages.length} PNG pages to ${pagesDir}`);

  // 3. Run Editability Audit
  console.log("\n[Phase 35] 3. Running DOCX Editability Audit...");
  const editability = await auditDocxEditability(docxBuf, docxPath, docxSha256);
  console.log(`[Phase 35] Average Editability Score: ${editability.globalSummary.averageEditabilityScore}/100`);
  console.log(`[Phase 35] Overall Verdict: ${editability.globalSummary.overallVerdict}`);
  console.log(`[Phase 35] Full Page Cover Cheats: ${editability.globalSummary.fullPageCoverCheatCount}`);

  // 4. Run Independent Fidelity Benchmark against 16 Genuine Figma References
  console.log("\n[Phase 35] 4. Comparing Genuine Figma Reference PNGs vs Word Rendered PNGs...");
  const figmaRefDir = path.resolve(rootDir, "debug/cache/figma_references/PQADsFQSbkiVHFWeJQavEf");
  const framesJson = JSON.parse(
    fs.readFileSync(
      path.resolve(rootDir, "research/rea-document-engine/phase26-visual-fidelity/exact-17-frames.json"),
      "utf8"
    )
  );

  const diffDir = path.resolve(rootDir, "debug/phase35/diff_heatmaps");
  fs.mkdirSync(diffDir, { recursive: true });

  const benchmarkResults: any[] = [];

  for (const f of framesJson) {
    const pageNum = f.pageNumber;
    const nodeId: string = f.frameId;
    const sanitizedId = nodeId.replace(":", "_");
    const refPngPath = path.join(figmaRefDir, `frame_${sanitizedId}.png`);
    const wordPngPath = path.join(pagesDir, `page-${pageNum.toString().padStart(3, "0")}.png`);

    if (nodeId === "759:1533" || !fs.existsSync(refPngPath)) {
      console.log(` - Page ${pageNum.toString().padStart(2, " ")} [${nodeId}] ${f.frameName}: REFERENCE_MISSING_VERSION_UNVERIFIED`);
      benchmarkResults.push({
        pageNumber: pageNum,
        nodeId,
        frameName: f.frameName,
        status: "REFERENCE_MISSING_VERSION_UNVERIFIED",
        figmaReferenceExists: false,
        wordPageExists: fs.existsSync(wordPngPath),
        ssim: null,
        mae: null,
        rmse: null,
        mismatchRatio: null,
      });
      continue;
    }

    const refBuf = fs.readFileSync(refPngPath);
    const wordBuf = fs.readFileSync(wordPngPath);
    const refDecoded = decodePng(refBuf);
    const wordDecoded = decodePng(wordBuf);

    const diffPngPath = path.join(diffDir, `diff-page-${pageNum.toString().padStart(3, "0")}.png`);
    const comp = compareImages(refDecoded, wordDecoded, {
      generateDiffImage: true,
    });

    if (comp.diffImage) {
      const diffPngBuf = Buffer.from(encodePng(comp.diffImage));
      fs.writeFileSync(diffPngPath, diffPngBuf);
    }

    console.log(
      ` - Page ${pageNum.toString().padStart(2, " ")} [${nodeId}] ${f.frameName}: SSIM=${comp.ssim.toFixed(4)}, MAE=${comp.mae.toFixed(2)}, RMSE=${comp.rmse.toFixed(2)}, Mismatch=${(comp.mismatchRatio * 100).toFixed(2)}% (BBox dW:${comp.contentBBoxDiff.dw})`
    );

    benchmarkResults.push({
      pageNumber: pageNum,
      nodeId,
      frameName: f.frameName,
      status: "VALID_BENCHMARK",
      figmaReferenceExists: true,
      wordPageExists: true,
      figmaResolution: { width: refDecoded.width, height: refDecoded.height },
      wordResolution: { width: wordDecoded.width, height: wordDecoded.height },
      metrics: {
        ssim: comp.ssim,
        mae: comp.mae,
        rmse: comp.rmse,
        mismatchRatio: comp.mismatchRatio,
        contentBBoxDiff: comp.contentBBoxDiff,
      },
      diffImagePath: diffPngPath,
    });
  }

  // Summary aggregation
  const evaluated = benchmarkResults.filter((r) => r.status === "VALID_BENCHMARK");
  const avgSsim = evaluated.reduce((sum, r) => sum + r.metrics.ssim, 0) / evaluated.length;
  const avgMae = evaluated.reduce((sum, r) => sum + r.metrics.mae, 0) / evaluated.length;
  const avgRmse = evaluated.reduce((sum, r) => sum + r.metrics.rmse, 0) / evaluated.length;
  const avgMismatch = evaluated.reduce((sum, r) => sum + r.metrics.mismatchRatio, 0) / evaluated.length;

  console.log("\n================================================================================");
  console.log(" RECOMPUTED BASELINE FIDELITY BENCHMARK SUMMARY");
  console.log("================================================================================");
  console.log(`Evaluated Frames: ${evaluated.length} / 17`);
  console.log(`Missing Reference Frames: 1 / 17 (Node 759:1533: REFERENCE_MISSING_VERSION_UNVERIFIED)`);
  console.log(`Recomputed Average SSIM: ${avgSsim.toFixed(4)}`);
  console.log(`Recomputed Average MAE: ${avgMae.toFixed(2)} / 255`);
  console.log(`Recomputed Average RMSE: ${avgRmse.toFixed(2)}`);
  console.log(`Recomputed Average Mismatch Ratio: ${(avgMismatch * 100).toFixed(2)}%`);

  const summaryData = {
    pipelineTimestamp: new Date().toISOString(),
    docxPath,
    docxSha256,
    docxDurationMs: docxDuration,
    pdfPath: wordResult.pdfPath,
    pdfSha256: wordResult.pdfSha256,
    wordDurationMs: wordDuration,
    totalPages: wordResult.pageCount,
    evaluatedFramesCount: evaluated.length,
    missingReferenceCount: 1,
    summaryMetrics: {
      averageSsim: Number(avgSsim.toFixed(4)),
      averageMae: Number(avgMae.toFixed(2)),
      averageRmse: Number(avgRmse.toFixed(2)),
      averageMismatchRatio: Number(avgMismatch.toFixed(4)),
    },
    editabilitySummary: editability.globalSummary,
    wordRenderedPages: wordResult.renderedPages,
    frames: benchmarkResults,
  };

  const summaryJsonPath = path.join(outDir, "phase35_baseline_summary.json");
  fs.writeFileSync(summaryJsonPath, JSON.stringify(summaryData, null, 2));
  console.log(`Saved baseline summary to: ${summaryJsonPath}`);
}

main().catch(console.error);
