import * as fs from "fs";
import * as path from "path";
import { executeOneShotCapture, maskToken } from "../src/api/oneShotCapture.js";
import { loadCacheManifest } from "../src/cache/cacheManifest.js";

async function main() {
  const rootDir = process.cwd();
  const fileKey = "PQADsFQSbkiVHFWeJQavEf";
  const accessToken = process.env.FIGMA_ACCESS_TOKEN;

  if (!accessToken || accessToken.trim().length === 0) {
    throw new Error("FIGMA_ACCESS_TOKEN environment variable is missing.");
  }

  const framesJsonPath = path.resolve(
    rootDir,
    "research/rea-document-engine/phase26-visual-fidelity/exact-17-frames.json"
  );
  const manifestPath = path.resolve(rootDir, "debug/cache/cache-manifest.json");
  const outputDir = path.resolve(rootDir, `debug/cache/figma_references/${fileKey}`);

  console.log("================================================================================");
  console.log(" Phase 34B Stage 2: Approved Live One-Shot Capture");
  console.log("================================================================================");
  console.log(`[Stage 2] FileKey: ${fileKey}`);
  console.log(`[Stage 2] Token: ${maskToken(accessToken)}`);
  console.log(`[Stage 2] Manifest Path: ${manifestPath}`);
  console.log(`[Stage 2] Output Directory: ${outputDir}`);

  // 1. Load target frames
  const rawFrames = JSON.parse(fs.readFileSync(framesJsonPath, "utf8"));
  const targetNodes = rawFrames.map((f: any) => ({
    nodeId: f.frameId,
    frameName: f.frameName,
    width: Math.round(f.figmaBox.width),
    height: Math.round(f.figmaBox.height),
  }));

  console.log(`[Stage 2] Loaded ${targetNodes.length} target frames.`);

  // 2. Execute Live Capture inside try/finally to guarantee offline restore
  let captureResult;
  try {
    process.env.FIGMA_NETWORK_MODE = "online";

    captureResult = await executeOneShotCapture({
      fileKeyOrUrl: fileKey,
      accessToken,
      targetNodes,
      networkMode: "online",
      dryRun: false,
      confirmExecution: true,
      batchSize: 20,
      maxApiCallLimit: 5,
      maxCdnCallLimit: 25,
      maxTotalHttpLimit: 30,
      outputDir,
      manifestPath,
    });
  } finally {
    // INVIOLABLE: Strictly restore offline network mode immediately!
    process.env.FIGMA_NETWORK_MODE = "offline";
    console.log("[Stage 2] Restored FIGMA_NETWORK_MODE to 'offline'.");
  }

  console.log("\n================================================================================");
  console.log(" LIVE CAPTURE EXECUTION RESULT");
  console.log("================================================================================");
  console.log(`Status: ${captureResult.status}`);
  console.log(`Success: ${captureResult.success}`);
  console.log(`Actual Figma API Calls: ${captureResult.actualFigmaApiCalls}`);
  console.log(`Actual CDN Downloads: ${captureResult.actualCdnDownloads}`);
  console.log(`Total HTTP Requests: ${captureResult.totalHttpRequests}`);
  console.log(`CDN Redirect Hops: ${captureResult.cdnRedirectHops}`);
  console.log(`Images Downloaded Successfully: ${captureResult.imagesDownloadedSuccessfully}`);
  console.log(`Images Failed: ${captureResult.imagesFailed}`);
  console.log(`Images Reused From Cache: ${captureResult.imagesReusedFromCache}`);
  console.log(`Captured Entries Count: ${captureResult.capturedEntries.length}`);

  if (captureResult.errors.length > 0) {
    console.log("\nErrors encountered:");
    for (const err of captureResult.errors) {
      console.log(` - ${err}`);
    }
  }

  // 3. Save Capture Log
  const reportsDir = path.resolve(rootDir, "phase34b-live-fidelity/reports");
  const metricsDir = path.resolve(rootDir, "phase34b-live-fidelity/metrics");
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(metricsDir, { recursive: true });

  const captureLogData = {
    timestamp: new Date().toISOString(),
    fileKey,
    status: captureResult.status,
    success: captureResult.success,
    actualFigmaApiCalls: captureResult.actualFigmaApiCalls,
    actualCdnDownloads: captureResult.actualCdnDownloads,
    totalHttpRequests: captureResult.totalHttpRequests,
    cdnRedirectHops: captureResult.cdnRedirectHops,
    imagesDownloadedSuccessfully: captureResult.imagesDownloadedSuccessfully,
    imagesFailed: captureResult.imagesFailed,
    imagesReusedFromCache: captureResult.imagesReusedFromCache,
    capturedNodes: captureResult.capturedEntries.map((e) => ({
      nodeId: e.nodeId,
      frameName: e.frameName,
      width: e.width,
      height: e.height,
      imagePath: e.imagePath,
      sha256Hash: e.sha256Hash,
      fileSizeBytes: e.fileSizeBytes,
      verificationStatus: e.verificationStatus,
    })),
    errors: captureResult.errors,
  };

  const logJsonPath = path.join(metricsDir, "live-capture-result.json");
  fs.writeFileSync(logJsonPath, JSON.stringify(captureLogData, null, 2), "utf8");
  console.log(`[Stage 2] Saved live capture metrics to: ${logJsonPath}`);

  // 4. Verify Cache Manifest
  const manifest = loadCacheManifest(manifestPath);
  console.log(`[Stage 2] Manifest verification: total entries = ${Object.keys(manifest.entries).length}`);

  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Live Capture failed:", err);
  process.exit(1);
});

