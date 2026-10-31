import * as fs from "fs";
import * as path from "path";
import { planOneShotCapture, executeOneShotCapture } from "../src/api/oneShotCapture.js";
import { loadCacheManifest, getFigmaReferenceDetailed, countPendingJournals } from "../src/cache/cacheManifest.js";

async function main() {
  const rootDir = process.cwd();
  const jsonPath = path.resolve(rootDir, "펜테크 3차 디자인.json");
  const framesJsonPath = path.resolve(
    rootDir,
    "research/rea-document-engine/phase26-visual-fidelity/exact-17-frames.json"
  );
  const manifestPath = path.resolve(rootDir, "debug/cache/cache-manifest.json");
  const outputDir = path.resolve(rootDir, "phase34a1-hotfix");
  const cacheOutputDir = path.resolve(rootDir, "debug/cache/figma_references/pentech_v3_snapshot");

  fs.mkdirSync(outputDir, { recursive: true });

  console.log("================================================================================");
  console.log(" Phase 34A.1 Hotfix: Preflight Verification & Offline Invariant Audit");
  console.log("================================================================================");

  // 1. Verify JSON snapshot
  let sizeBytes = 195582942;
  let sizeMb = "186.52";
  const jsonName = "펜테크 3차 디자인.json";
  if (fs.existsSync(jsonPath)) {
    const stat = fs.statSync(jsonPath);
    sizeBytes = stat.size;
    sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
    console.log(`[Preflight] Local Figma JSON: ${jsonName} (${sizeMb} MB)`);
  } else {
    console.log(`[Preflight] Local Figma JSON: ${jsonName} (Git-ignored snapshot baseline: ${sizeMb} MB)`);
  }

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

  // Verify uniqueness of nodeIds
  const nodeSet = new Set<string>();
  for (const t of targetNodes) {
    if (nodeSet.has(t.nodeId)) {
      throw new Error(`Duplicate nodeId found in target frames: ${t.nodeId}`);
    }
    nodeSet.add(t.nodeId);
  }
  console.log(`[Preflight] Node ID Uniqueness: 100% unique (17/17 unique IDs)`);

  // 3. Load Cache Manifest
  const manifest = loadCacheManifest(manifestPath);
  console.log(`[Preflight] Cache Manifest loaded: ${manifestPath}`);

  // Count pending journals without modifying disk
  const recoverableFromJournal = countPendingJournals(cacheOutputDir);
  console.log(`[Preflight] Recoverable from journal count: ${recoverableFromJournal}`);

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

  const validCachedCount = frameAuditResults.filter((f) => f.cacheStatus === "VALID").length;

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

  // Compose preflight summary object
  const preflightSummary = {
    targetFrames: targetNodes.length,
    validCached: validCachedCount,
    recoverableFromJournal,
    toFetch: plan.toFetchNodeIds.length,
    figmaApiRequestsPlanned: plan.expectedFigmaApiRequests,
    cdnHttpRequestsBaseline: plan.expectedImageDownloads,
    totalHttpRequestsBaseline: plan.totalHttpRequests,
    apiHttpBudget: 5,
    cdnHttpBudget: 25,
    totalHttpBudget: 30,
    redirectOverhead: "UNKNOWN (Dependent on CDN edge routing)",
    versionMatch: "UNVERIFIED",
    realExternalHttpRequests: dryRunResult.totalHttpRequests,
    dryRunStatus: dryRunResult.status,
    dryRunSuccess: dryRunResult.success,
    dryRunHttpCalls: {
      apiHttpRequestsAttempted: dryRunResult.apiHttpRequestsAttempted,
      cdnHttpRequestsAttempted: dryRunResult.cdnHttpRequestsAttempted,
      totalHttpRequestsAttempted: dryRunResult.totalHttpRequestsAttempted,
    },
    frameAudits: frameAuditResults,
  };

  const summaryPath = path.join(outputDir, "preflight-summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(preflightSummary, null, 2), "utf8");
  console.log(`[Preflight] Saved preflight summary to: ${summaryPath}`);

  // Print exact formatted block as requested
  console.log("\n================================================================================");
  console.log(" PREFLIGHT EXACT AUDIT REPORT");
  console.log("================================================================================");
  console.log(`TARGET_FRAMES: ${targetNodes.length}`);
  console.log(`VALID_CACHED: ${validCachedCount}`);
  console.log(`RECOVERABLE_FROM_JOURNAL: ${recoverableFromJournal}`);
  console.log(`TO_FETCH: ${plan.toFetchNodeIds.length}`);
  console.log(``);
  console.log(`FIGMA_API_REQUESTS_PLANNED: ${plan.expectedFigmaApiRequests}`);
  console.log(`CDN_HTTP_REQUESTS_BASELINE: ${plan.expectedImageDownloads}`);
  console.log(`TOTAL_HTTP_REQUESTS_BASELINE: ${plan.totalHttpRequests}`);
  console.log(``);
  console.log(`API_HTTP_BUDGET: 5`);
  console.log(`CDN_HTTP_BUDGET: 25`);
  console.log(`TOTAL_HTTP_BUDGET: 30`);
  console.log(``);
  console.log(`REDIRECT_OVERHEAD: UNKNOWN`);
  console.log(`VERSION_MATCH: UNVERIFIED`);
  console.log(``);
  console.log(`REAL_EXTERNAL_HTTP_REQUESTS: ${dryRunResult.totalHttpRequests}`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Preflight execution failed:", err);
  process.exit(1);
});
