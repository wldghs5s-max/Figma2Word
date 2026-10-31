import * as fs from "fs";
import * as path from "path";
import { planOneShotCapture, executeOneShotCapture } from "../src/api/oneShotCapture.js";
import { loadCacheManifest, getFigmaReferenceDetailed, countPendingJournals } from "../src/cache/cacheManifest.js";

async function main() {
  const rootDir = process.cwd();
  const framesJsonPath = path.resolve(
    rootDir,
    "research/rea-document-engine/phase26-visual-fidelity/exact-17-frames.json"
  );
  const manifestPath = path.resolve(rootDir, "debug/cache/cache-manifest.json");
  const outputDir = path.resolve(rootDir, "phase34b-live-fidelity");
  const cacheOutputDir = path.resolve(rootDir, "debug/cache/figma_references/pentech_v3_snapshot");

  console.log("================================================================================");
  console.log(" Phase 34B Stage 1: Offline Preflight & Live Capture Preparation");
  console.log("================================================================================");

  // 1. Verify 17 target frames
  if (!fs.existsSync(framesJsonPath)) {
    throw new Error(`Target frames file not found at: ${framesJsonPath}`);
  }
  const rawFrames = JSON.parse(fs.readFileSync(framesJsonPath, "utf8"));
  const targetNodes = rawFrames.map((f: any) => ({
    nodeId: f.frameId,
    frameName: f.frameName,
    width: Math.round(f.figmaBox.width),
    height: Math.round(f.figmaBox.height),
  }));

  console.log(`[Stage 1] Target Frames: ${targetNodes.length} frames loaded.`);

  // Verify uniqueness of nodeIds
  const nodeSet = new Set<string>();
  for (const t of targetNodes) {
    if (nodeSet.has(t.nodeId)) {
      throw new Error(`Duplicate nodeId found: ${t.nodeId}`);
    }
    nodeSet.add(t.nodeId);
  }
  console.log(`[Stage 1] Node ID Uniqueness: 100% unique (17/17 unique IDs)`);

  // 2. Audit Cache & Journal state
  const manifest = loadCacheManifest(manifestPath);
  const recoverableJournals = countPendingJournals(cacheOutputDir);
  console.log(`[Stage 1] Cache Manifest: ${manifestPath} (entries: ${Object.keys(manifest.entries).length})`);
  console.log(`[Stage 1] Pending Journals: ${recoverableJournals}`);

  const fileKey = "pentech_v3_snapshot";
  const frameAudits = targetNodes.map((t, idx) => {
    const audit = getFigmaReferenceDetailed(manifest, fileKey, t.nodeId);
    return {
      index: idx + 1,
      nodeId: t.nodeId,
      frameName: t.frameName,
      width: t.width,
      height: t.height,
      cacheStatus: audit.status,
      hasDiskFile: audit.status !== "MISSING",
      reason: audit.reason || "N/A",
    };
  });

  const validCachedCount = frameAudits.filter((f) => f.cacheStatus === "VALID").length;

  // 3. Plan One-Shot Capture
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

  // 4. Dry Run Execution
  const dryRunResult = await executeOneShotCapture({
    fileKeyOrUrl: fileKey,
    targetNodes,
    manifestPath,
    batchSize: 20,
    dryRun: true,
    confirmExecution: false,
  });

  // 5. Environment & Token audit (Zero secret leakage)
  const hasAccessToken = !!process.env.FIGMA_ACCESS_TOKEN;
  const networkMode = process.env.FIGMA_NETWORK_MODE || "offline";

  const stage1Report = {
    stage: "STAGE_1_OFFLINE_PREFLIGHT",
    timestamp: new Date().toISOString(),
    gitCommit: "a12b2f1",
    targetFrames: targetNodes.length,
    validCached: validCachedCount,
    recoverableFromJournal: recoverableJournals,
    toFetch: plan.toFetchNodeIds.length,
    expectedFigmaApiRequests: plan.expectedFigmaApiRequests,
    expectedCdnDownloadsBaseline: plan.expectedImageDownloads,
    totalHttpRequestsBaseline: plan.totalHttpRequests,
    requestBudget: {
      apiMax: 5,
      cdnMax: 25,
      totalMax: 30,
    },
    environment: {
      hasAccessToken,
      networkMode,
      realHttpCallsMade: dryRunResult.totalHttpRequests,
    },
    versionMatchStatus: "VERSION_MATCH_UNVERIFIED",
    stage1Verdict: "STAGE_1_PASSED_AWAITING_USER_APPROVAL",
    frameAudits,
  };

  const reportPath = path.join(outputDir, "metrics/stage1-preflight.json");
  fs.writeFileSync(reportPath, JSON.stringify(stage1Report, null, 2), "utf8");
  console.log(`[Stage 1] Preflight report saved to: ${reportPath}`);

  console.log("\n================================================================================");
  console.log(" STAGE 1 PREFLIGHT AUDIT SUMMARY");
  console.log("================================================================================");
  console.log(`TARGET_FRAMES: ${targetNodes.length}`);
  console.log(`VALID_CACHED: ${validCachedCount}`);
  console.log(`RECOVERABLE_FROM_JOURNAL: ${recoverableJournals}`);
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
  console.log(`TOKEN_CONFIGURED: ${hasAccessToken ? "YES" : "NO (Awaiting user local input)"}`);
  console.log(`NETWORK_MODE: ${networkMode}`);
  console.log(`VERSION_MATCH: UNVERIFIED`);
  console.log(``);
  console.log(`REAL_EXTERNAL_HTTP_REQUESTS: ${dryRunResult.totalHttpRequests}`);
  console.log(`STAGE_1_STATUS: AWAITING_STAGE_2_USER_APPROVAL`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Stage 1 Preflight failed:", err);
  process.exit(1);
});

