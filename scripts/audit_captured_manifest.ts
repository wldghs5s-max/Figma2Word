import * as fs from "fs";
import * as path from "path";
import { loadCacheManifest, getFigmaReferenceDetailed } from "../src/cache/cacheManifest.js";

async function main() {
  const rootDir = process.cwd();
  const fileKey = "PQADsFQSbkiVHFWeJQavEf";
  const manifestPath = path.resolve(rootDir, "debug/cache/cache-manifest.json");
  const framesJsonPath = path.resolve(
    rootDir,
    "research/rea-document-engine/phase26-visual-fidelity/exact-17-frames.json"
  );

  const manifest = loadCacheManifest(manifestPath);
  const frames = JSON.parse(fs.readFileSync(framesJsonPath, "utf8"));

  console.log("================================================================================");
  console.log(" AUDIT OF 17 TARGET FRAMES AGAINST CAPTURED MANIFEST");
  console.log("================================================================================");

  let validCount = 0;
  let missingCount = 0;

  const results = [];

  for (const f of frames) {
    const detailed = getFigmaReferenceDetailed(manifest, fileKey, f.frameId);
    if (detailed.status === "VALID") {
      validCount++;
    } else {
      missingCount++;
    }

    results.push({
      nodeId: f.frameId,
      frameName: f.frameName,
      status: detailed.status,
      sizeBytes: detailed.entry ? detailed.entry.fileSizeBytes : 0,
      sha256: detailed.entry ? detailed.entry.sha256Hash?.substring(0, 16) + "..." : "N/A",
      path: detailed.entry ? detailed.entry.imagePath : detailed.reason,
    });
  }

  console.table(results);
  console.log(`\nTOTAL TARGET FRAMES: ${frames.length}`);
  console.log(`VALID FIGMA REFERENCES: ${validCount}`);
  console.log(`MISSING / FAILED: ${missingCount}`);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
