import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

async function main() {
  const rootDir = process.cwd();
  const zipName = "phase33-gpt-review.zip";
  const zipPath = path.join(rootDir, zipName);

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  // Files to strictly include
  const filesToInclude = [
    "phase33-offline-fidelity/README.md",
    "phase33-offline-fidelity/cache-manifest-example.json",
    "phase33-offline-fidelity/reports/01-api-call-inventory.md",
    "phase33-offline-fidelity/reports/02-cache-inventory.md",
    "phase33-offline-fidelity/reports/03-offline-policy.md",
    "phase33-offline-fidelity/reports/04-one-shot-capture-design.md",
    "phase33-offline-fidelity/reports/05-json-ir-fidelity.md",
    "phase33-offline-fidelity/reports/06-docx-hwpx-structural-fidelity.md",
    "phase33-offline-fidelity/reports/07-visual-comparison.md",
    "phase33-offline-fidelity/reports/08-renderer-fixes.md",
    "phase33-offline-fidelity/reports/09-regression-results.md",
    "phase33-offline-fidelity/reports/10-final-assessment.md",
    "phase33-offline-fidelity/evidence/logs/full_test_log.txt",
    "phase33-offline-fidelity/evidence/git_diff_summary.patch",
    "phase33-offline-fidelity/evidence/comparisons/audit_summary.json",
    "phase33-offline-fidelity/evidence/comparisons/structural_fidelity_metrics.json",
    "src/api/networkMode.ts",
    "src/api/oneShotCapture.ts",
    "src/cache/cacheManifest.ts",
    "src/api/figmaClient.ts",
    "src/api/types.ts",
    "src/api/index.ts",
    "src/canvas/parser/figmaCanvasParser.ts",
    "src/canvas/renderer/docxCanvasRenderer.ts",
    "src/canvas/renderer/hwpxCanvasRenderer.ts",
    "tools/visual-regression/safe_word_automation.ts",
    "tests/phase33-offline-fidelity.test.ts",
    "scripts/benchmark_phase33_offline_fidelity.ts",
    "scripts/compare_phase32_vs_phase33.ts",
  ];

  console.log(`Packaging ${filesToInclude.length} files into ${zipName}...`);

  for (const f of filesToInclude) {
    if (!fs.existsSync(path.join(rootDir, f))) {
      throw new Error(`Required file for package not found: ${f}`);
    }
  }

  // Use zip command
  execFileSync("zip", ["-r", zipName, ...filesToInclude], { cwd: rootDir });

  const stat = fs.statSync(zipPath);
  console.log(`Successfully created ${zipName}: ${stat.size} bytes (${(stat.size / 1024).toFixed(1)} KB)`);

  // Verify zip contents
  const list = execFileSync("unzip", ["-l", zipName], { encoding: "utf8" });
  console.log("Zip content verification:\n" + list);

  // Security check: Ensure no private design or tokens
  if (list.includes("펜테크") || list.includes(".env")) {
    throw new Error("SECURITY VIOLATION: Sensitive data detected in review package!");
  }
  console.log("Security scan passed: Zero sensitive files detected in zip package.");
}

main().catch((err) => {
  console.error("Packaging error:", err);
  process.exit(1);
});
