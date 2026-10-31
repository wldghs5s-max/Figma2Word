import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import JSZip from "jszip";

function computeSha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const rootDir = process.cwd();
  const zipPath = path.resolve(rootDir, "phase35-2-gpt-review.zip");
  const zip = new JSZip();

  console.log("================================================================================");
  console.log(" Phase 35.2: Packaging Independent GPT/Argon Review Archive");
  console.log("================================================================================");

  const filesToInclude: string[] = [
    // Core Engine & Fidelity Sources
    "src/canvas/parser/figmaCanvasParser.ts",
    "src/canvas/renderer/docxCanvasRenderer.ts",
    "src/canvas/types.ts",
    "src/fidelity/nodeIdMapper.ts",
    "src/fidelity/integrityGate.ts",
    "src/fidelity/benchmarkEngine.ts",
    "src/fidelity/pngDecoder.ts",
    "src/fidelity/editabilityAuditor.ts",
    "tools/visual-regression/windows_word_automation.ps1",
    "scripts/run_phase35_2_production_recovery.ts",

    // Tests
    "tests/phase35-2-nodeid-mapping-and-integrity.test.ts",
    "tests/phase35-1-integrity-gate.test.ts",
    "tests/phase35-editability-auditor.test.ts",
    "tests/phase35-benchmark-engine.test.ts",

    // Phase 35.2 Root
    "phase35-2-real-fidelity/README.md",

    // Reports (All 11 reports)
    "phase35-2-real-fidelity/reports/01-real-json-validation.md",
    "phase35-2-real-fidelity/reports/02-nodeid-mapping.md",
    "phase35-2-real-fidelity/reports/03-production-pipeline.md",
    "phase35-2-real-fidelity/reports/04-independent-renderers.md",
    "phase35-2-real-fidelity/reports/05-word-native-rendering.md",
    "phase35-2-real-fidelity/reports/06-real-fidelity-baseline.md",
    "phase35-2-real-fidelity/reports/07-current-fidelity.md",
    "phase35-2-real-fidelity/reports/08-renderer-improvements.md",
    "phase35-2-real-fidelity/reports/09-editability-audit.md",
    "phase35-2-real-fidelity/reports/10-integrity-and-regression.md",
    "phase35-2-real-fidelity/reports/11-final-assessment.md",

    // Metrics
    "phase35-2-real-fidelity/metrics/frame-provenance.json",
    "phase35-2-real-fidelity/metrics/baseline.json",
    "phase35-2-real-fidelity/metrics/current.json",
    "phase35-2-real-fidelity/metrics/candidate.json",
    "phase35-2-real-fidelity/metrics/comparison.csv",
    "phase35-2-real-fidelity/metrics/editability.json",
    "phase35-2-real-fidelity/metrics/summary.json",

    // Evidence
    "phase35-2-real-fidelity/evidence/README.md",
    "phase35-2-real-fidelity/evidence/sanitized-commands.md",
    "phase35-2-real-fidelity/evidence/sanitized-execution-log.txt",
    "phase35-2-real-fidelity/evidence/git-diff.patch",
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

    // Check for customer proprietary strings or raw JSON dump
    if (textContent.includes("펜테크 3차 디자인.json") && relPath.endsWith(".json") && content.length > 5 * 1024 * 1024) {
      throw new Error(`CRITICAL SECURITY FAILURE: Proprietary customer JSON detected in ${relPath}`);
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
  console.log(`Total Entries: ${addedCount}`);

  // Self-Audit
  console.log("\n[Self-Audit] Verifying ZIP integrity and exclusion rules...");
  const loadedZip = await JSZip.loadAsync(zipBuffer);
  const loadedEntries = Object.keys(loadedZip.files);
  console.log(`Loaded entries count: ${loadedEntries.length}`);

  for (const entry of loadedEntries) {
    if (entry.endsWith(".png") || entry.endsWith(".docx") || entry.endsWith(".pdf")) {
      throw new Error(`AUDIT FAIL: Prohibited binary found in review archive: ${entry}`);
    }
    if (entry.includes("펜테크 3차 디자인.json")) {
      throw new Error(`AUDIT FAIL: Raw customer JSON found in review archive: ${entry}`);
    }
    if (entry.endsWith(".json")) {
      const jsonText = await loadedZip.files[entry].async("string");
      try {
        JSON.parse(jsonText);
      } catch (e: any) {
        throw new Error(`AUDIT FAIL: Corrupt JSON in review archive: ${entry} (${e.message})`);
      }
    }
  }
  console.log("[Self-Audit] All exclusion and integrity checks PASSED!");
}

main().catch(console.error);

