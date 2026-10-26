import * as fs from "fs";
import * as path from "path";
import { planOneShotCapture, executeOneShotCapture } from "../src/api/oneShotCapture.js";
import { loadCacheManifest, getFigmaReferenceDetailed } from "../src/cache/cacheManifest.js";

async function main() {
  const rootDir = process.cwd();
  const jsonPath = path.resolve(rootDir, "펜테크 3차 디자인.json");
  const framesJsonPath = path.resolve(
    rootDir,
    "research/rea-document-engine/phase26-visual-fidelity/exact-17-frames.json"
  );
  const manifestPath = path.resolve(rootDir, "debug/cache/cache-manifest.json");
  const outputDir = path.resolve(rootDir, "phase34a-capture-hardening");
  const reportsDir = path.join(outputDir, "reports");
  const evidenceLogsDir = path.join(outputDir, "evidence/logs");

  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(evidenceLogsDir, { recursive: true });

  console.log("================================================================================");
  console.log(" Phase 34A: Preflight Verification & Dry Run (Offline-First Invariant)");
  console.log("================================================================================");

  // 1. Verify JSON snapshot
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Real Figma JSON snapshot not found at: ${jsonPath}`);
  }
  const stat = fs.statSync(jsonPath);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(`[Preflight] Local Figma JSON: ${path.basename(jsonPath)} (${sizeMb} MB)`);

  // 2. Load 17 target frames
  let targetNodes: Array<{ nodeId: string; frameName: string; width: number; height: number }> = [];
  if (fs.existsSync(framesJsonPath)) {
    const rawFrames = JSON.parse(fs.readFileSync(framesJsonPath, "utf8"));
    targetNodes = rawFrames.map((f: any) => ({
      nodeId: f.frameId,
      frameName: f.frameName,
      width: Math.round(f.figmaBox.width),
      height: Math.round(f.figmaBox.height),
    }));
  } else {
    throw new Error(`Target frames file not found at: ${framesJsonPath}`);
  }

  console.log(`[Preflight] Target Frames Count: ${targetNodes.length} frames`);

  // 3. Load Cache Manifest
  const manifest = loadCacheManifest(manifestPath);
  console.log(
    `[Preflight] Cache Manifest loaded: ${manifestPath} (version: ${manifest.manifestVersion})`
  );

  // 4. Detailed frame-by-frame cache audit
  const fileKey = "pentech_v3_snapshot";
  const frameAuditResults = targetNodes.map((t, idx) => {
    const audit = getFigmaReferenceDetailed(manifest, fileKey, t.nodeId);
    return {
      index: idx + 1,
      nodeId: t.nodeId,
      frameName: t.frameName,
      width: t.width,
      height: t.height,
      cacheStatus: audit.status,
      entryFound: !!audit.entry,
      hasDiskFile: audit.status !== "MISSING",
      reason: audit.reason || "N/A",
    };
  });

  // 5. Generate Dry Run Plan via planOneShotCapture
  const plan = planOneShotCapture(
    {
      fileKeyOrUrl: fileKey,
      targetNodes,
      manifestPath,
      batchSize: 20,
      dryRun: true,
      confirmExecution: false,
    },
    manifest
  );

  // 6. Execute Dry Run to verify absolute 0 HTTP calls
  const dryRunResult = await executeOneShotCapture({
    fileKeyOrUrl: fileKey,
    targetNodes,
    manifestPath,
    batchSize: 20,
    dryRun: true,
    confirmExecution: false,
  });

  // 7. Compose summary object
  const summary = {
    phase: "34A",
    timestamp: new Date().toISOString(),
    policy: {
      networkMode: "offline",
      dryRun: true,
      confirmExecution: false,
      realHttpCallsPermitted: false,
      actualHttpCallsMade: dryRunResult.totalHttpRequests,
      actualFigmaApiCalls: dryRunResult.actualFigmaApiCalls,
      actualCdnDownloads: dryRunResult.actualCdnDownloads,
    },
    figmaJsonSource: {
      fileName: path.basename(jsonPath),
      sizeBytes: stat.size,
      sizeMb: Number(sizeMb),
    },
    targetFramesSummary: {
      totalFrames: targetNodes.length,
      cachedFigmaReferences: plan.cachedFramesCount,
      framesToFetchForPhase34B: plan.toFetchNodeIds.length,
      toFetchNodeIds: plan.toFetchNodeIds,
    },
    requestBudgetPlan: {
      batchSize: plan.batchSize,
      expectedFigmaApiRequests: plan.expectedFigmaApiRequests,
      expectedImageDownloads: plan.expectedImageDownloads,
      expectedTotalHttpRequests: plan.totalHttpRequests,
      maxAllowedApiLimit: 5,
      maxAllowedCdnLimit: 25,
      maxAllowedTotalLimit: 30,
      withinBudgetCeiling: plan.totalHttpRequests <= 30,
    },
    frameAudits: frameAuditResults,
    dryRunExecution: {
      status: dryRunResult.status,
      success: dryRunResult.success,
      dryRun: dryRunResult.dryRun,
    },
  };

  const summaryPath = path.join(outputDir, "preflight-summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`[Preflight] Saved Preflight Summary to: ${summaryPath}`);

  // Display summary table
  console.log("\n--------------------------------------------------------------------------------");
  console.log(" Target Frames Preflight Audit Table (Total 17 Frames):");
  console.log("--------------------------------------------------------------------------------");
  console.table(
    frameAuditResults.map((r) => ({
      "#": r.index,
      "Node ID": r.nodeId,
      "Frame Name": r.frameName.substring(0, 20),
      Dimensions: `${r.width}x${r.height}`,
      "Cache Status": r.cacheStatus,
    }))
  );

  console.log("\n--------------------------------------------------------------------------------");
  console.log(" Preflight Verification Verdict:");
  console.log("--------------------------------------------------------------------------------");
  console.log(`- Zero Figma API Calls Made: ${dryRunResult.actualFigmaApiCalls === 0 ? "PASSED (0)" : "FAILED"}`);
  console.log(`- Zero CDN Image Downloads Made: ${dryRunResult.actualCdnDownloads === 0 ? "PASSED (0)" : "FAILED"}`);
  console.log(`- Expected Batches for Phase 34B: ${plan.expectedFigmaApiRequests} API calls (Batch size ${plan.batchSize})`);
  console.log(`- Expected CDN Downloads for Phase 34B: ${plan.expectedImageDownloads} images`);
  console.log(`- Within Safe Budget (<= 30 total HTTP): ${plan.totalHttpRequests <= 30 ? "PASSED" : "FAILED"}`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Preflight script failed:", err);
  process.exit(1);
});
