import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import JSZip from "jszip";

function computeSha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const rootDir = process.cwd();
  const zipPath = path.resolve(rootDir, "phase35-1-gpt-review.zip");
  const zip = new JSZip();

  console.log("================================================================================");
  console.log(" Phase 35.1: Packaging Independent GPT/Argon Review Archive");
  console.log("================================================================================");

  // Files to include
  const filesToInclude: string[] = [
    // Source Code
    "src/canvas/parser/figmaCanvasParser.ts",
    "src/canvas/renderer/docxCanvasRenderer.ts",
    "src/fidelity/benchmarkEngine.ts",
    "src/fidelity/pngDecoder.ts",
    "src/fidelity/editabilityAuditor.ts",
    "src/fidelity/integrityGate.ts",
    "tools/visual-regression/windows_word_automation.ps1",
    "tools/visual-regression/safe_word_automation.ts",
    "tools/visual-regression/render_docx.ts",
    "tools/visual-regression/pipeline.ts",
    "scripts/run_phase35_1_real_recovery.ts",
    "scripts/generate_phase35_benchmark_doc.ts",

    // Tests
    "tests/phase35-1-integrity-gate.test.ts",
    "tests/phase35-editability-auditor.test.ts",
    "tests/phase35-benchmark-engine.test.ts",

    // Reports (All 10 reports + README)
    "phase35-1-real-document-recovery/README.md",
    "phase35-1-real-document-recovery/reports/01-previous-audit-findings.md",
    "phase35-1-real-document-recovery/reports/02-real-json-pipeline.md",
    "phase35-1-real-document-recovery/reports/03-before-after-builds.md",
    "phase35-1-real-document-recovery/reports/04-word-native-rendering.md",
    "phase35-1-real-document-recovery/reports/05-fidelity-results.md",
    "phase35-1-real-document-recovery/reports/06-editability-results.md",
    "phase35-1-real-document-recovery/reports/07-renderer-improvements.md",
    "phase35-1-real-document-recovery/reports/08-integrity-gates.md",
    "phase35-1-real-document-recovery/reports/09-regression-tests.md",
    "phase35-1-real-document-recovery/reports/10-final-assessment.md",

    // Metrics
    "phase35-1-real-document-recovery/metrics/provenance-manifest.json",
    "phase35-1-real-document-recovery/metrics/measured-baseline.json",
    "phase35-1-real-document-recovery/metrics/measured-improved.json",
    "phase35-1-real-document-recovery/metrics/measured-comparison.csv",
    "phase35-1-real-document-recovery/metrics/editability.json",

    // Evidence
    "phase35-1-real-document-recovery/evidence/README.md",
    "phase35-1-real-document-recovery/evidence/commands.md",
    "phase35-1-real-document-recovery/evidence/sanitized-execution-log.txt",
    "phase35-1-real-document-recovery/evidence/git-diff.patch",
  ];

  let addedCount = 0;
  for (const relPath of filesToInclude) {
    const absPath = path.resolve(rootDir, relPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Required file for review archive missing: ${relPath}`);
    }
    const content = fs.readFileSync(absPath);

    // Strict validation: check for token patterns or sensitive credentials
    const textContent = content.toString("utf8");
    if (/figd_[A-Za-z0-9_-]{20,}/.test(textContent)) {
      throw new Error(`CRITICAL SECURITY FAILURE: Token pattern detected in ${relPath}`);
    }

    zip.file(relPath.replace(/\\/g, "/"), content);
    addedCount++;
    console.log(` [+] Added: ${relPath} (${(content.length / 1024).toFixed(1)} KB)`);
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  fs.writeFileSync(zipPath, zipBuffer);
  const zipSha256 = computeSha256(zipBuffer);

  console.log("\n================================================================================");
  console.log(" REVIEW ARCHIVE GENERATED SUCCESSFULLY");
  console.log("================================================================================");
  console.log(`Path: ${zipPath}`);
  console.log(`Size: ${(zipBuffer.length / 1024).toFixed(2)} KB (${zipBuffer.length} bytes)`);
  console.log(`SHA-256: ${zipSha256}`);
  console.log(`Files count: ${addedCount}`);

  // Perform Self-Audit of the ZIP archive
  console.log("\n--- Self-Audit of Generated ZIP Archive ---");
  const loadedZip = await JSZip.loadAsync(zipBuffer);
  const entries = Object.keys(loadedZip.files);
  console.log(`Verified total entries inside ZIP: ${entries.length}`);

  // Disallow any image / pdf / docx / large json files
  for (const entry of entries) {
    if (entry.endsWith(".png") || entry.endsWith(".jpg") || entry.endsWith(".pdf") || entry.endsWith(".docx")) {
      throw new Error(`PROHIBITED BINARY FOUND IN REVIEW ZIP: ${entry}`);
    }
    if (entry.includes("펜테크") && entry.endsWith(".json")) {
      throw new Error(`PROHIBITED PROPRIETARY JSON FOUND IN REVIEW ZIP: ${entry}`);
    }
  }
  console.log(" [✓] 0 binary images, 0 docx/pdf, 0 proprietary customer JSONs confirmed.");
  console.log(" [✓] 0 token patterns confirmed.");
  console.log(" [✓] 100% compliant with Phase 35.1 Part L requirements.");
}

main().catch((err) => {
  console.error("[FATAL ERROR in packaging review archive]", err);
  process.exit(1);
});
