import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execSync } from "child_process";
import JSZip from "jszip";

async function main() {
  const rootDir = process.cwd();
  const zip = new JSZip();

  console.log("Packaging phase40-5-gpt-review.zip...");

  // 1. Git Diff
  const gitDiff = execSync("git diff HEAD", { encoding: "utf8" });
  zip.file("git-diff.patch", gitDiff);

  // 2. Key modified sources
  const srcFiles = [
    "src/canvas/parser/figmaCanvasParser.ts",
    "src/canvas/renderer/docxCanvasRenderer.ts",
  ];
  for (const f of srcFiles) {
    if (fs.existsSync(path.join(rootDir, f))) {
      zip.file(f, fs.readFileSync(path.join(rootDir, f), "utf8"));
    }
  }

  // 3. Tests
  const testFiles = [
    "tests/phase40-5-visual-fidelity.test.ts",
    "tests/phase40-2-fidelity.test.ts",
    "tests/phase40-3-fidelity.test.ts",
    "tests/phase40-4-content-integrity.test.ts",
  ];
  for (const f of testFiles) {
    if (fs.existsSync(path.join(rootDir, f))) {
      zip.file(f, fs.readFileSync(path.join(rootDir, f), "utf8"));
    }
  }

  // 4. Reports and Handoff
  const reportFiles = [
    "PHASE40_5_VISUAL_FIDELITY_REPORT.md",
    "PHASE40_5_WORD_REGRESSION_REPORT.md",
    "PROJECT_HANDOFF.md",
  ];
  for (const f of reportFiles) {
    if (fs.existsSync(path.join(rootDir, f))) {
      zip.file(f, fs.readFileSync(path.join(rootDir, f), "utf8"));
    }
  }

  // 5. Sanitized Metrics & Manifests (No raw customer document/images)
  const metricFiles = [
    "phase39-verification-foundation/metrics/gate-results.json",
    "phase39-verification-foundation/metrics/production-verification.csv",
    "phase39-verification-foundation/metrics/production-verification.json",
    "phase39-verification-foundation/metrics/run-manifest.json",
    "phase39-verification-foundation/metrics/verdict-summary.json",
    "phase39-verification-foundation/metrics/layout-stability.json",
    "phase39-verification-foundation/metrics/layout-stability-stress.json",
    "phase39-verification-foundation/metrics/object-coverage.json",
    "phase39-verification-foundation/metrics/word-edit-metrics-normal.json",
    "phase39-verification-foundation/metrics/word-edit-metrics-stress.json",
  ];
  for (const f of metricFiles) {
    if (fs.existsSync(path.join(rootDir, f))) {
      zip.file(f, fs.readFileSync(path.join(rootDir, f), "utf8"));
    }
  }

  // 6. Sanitized Evidence
  const evidenceFiles = [
    "phase39-verification-foundation/evidence/sanitized-execution-log.txt",
    "phase39-verification-foundation/evidence/reproducibility-commands.md",
  ];
  for (const f of evidenceFiles) {
    if (fs.existsSync(path.join(rootDir, f))) {
      zip.file(f, fs.readFileSync(path.join(rootDir, f), "utf8"));
    }
  }

  // Generate ZIP
  const content = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  const zipPath = path.join(rootDir, "phase40-5-gpt-review.zip");
  fs.writeFileSync(zipPath, content);

  // Also copy to artifact directory
  const artifactDir = "C:\\Users\\77\\.gemini\\antigravity\\brain\\10385409-384b-4d4c-9c0b-ac6e6ff22ff6";
  if (fs.existsSync(artifactDir)) {
    fs.writeFileSync(path.join(artifactDir, "phase40-5-gpt-review.zip"), content);
  }

  const sha256 = crypto.createHash("sha256").update(content).digest("hex");
  console.log(`Successfully generated phase40-5-gpt-review.zip`);
  console.log(`Path: ${zipPath}`);
  console.log(`Size: ${content.length} bytes`);
  console.log(`SHA-256: ${sha256}`);

  // Inspect contents to ensure no sensitive files
  console.log("\nPackage Contents:");
  const readZip = await JSZip.loadAsync(content);
  for (const fileName of Object.keys(readZip.files)) {
    console.log(`  - ${fileName}`);
  }
}

main().catch(console.error);

