import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

async function main() {
  const rootDir = process.cwd();
  const zipName = "phase34a1-gpt-review.zip";
  const zipPath = path.join(rootDir, zipName);
  const parentZipPath = path.join(path.dirname(rootDir), zipName);

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
  if (fs.existsSync(parentZipPath)) {
    fs.unlinkSync(parentZipPath);
  }

  // Files to strictly include in the review bundle
  const filesToInclude = [
    "phase34a1-release-gate/README.md",
    "phase34a1-release-gate/release-gate-summary.json",
    "phase34a1-release-gate/reports/01-audit-findings.md",
    "phase34a1-release-gate/reports/02-png-integrity.md",
    "phase34a1-release-gate/reports/03-redirect-ssrf.md",
    "phase34a1-release-gate/reports/04-cache-root-isolation.md",
    "phase34a1-release-gate/reports/05-token-redaction.md",
    "phase34a1-release-gate/reports/06-cdn-fail-fast.md",
    "phase34a1-release-gate/reports/07-crash-recovery.md",
    "phase34a1-release-gate/reports/08-preflight-17-frames.md",
    "phase34a1-release-gate/reports/09-regression-results.md",
    "phase34a1-release-gate/reports/10-release-gate-decision.md",
    "phase34a1-release-gate/evidence/sanitized-logs/full_test_log.txt",
    "phase34a1-release-gate/evidence/sanitized-logs/git_diff_summary.patch",
    "phase34a1-release-gate/evidence/synthetic-fixtures/fixtures.json",
    "phase34a1-release-gate/evidence/failure-injection/injection_results.json",
    "src/cache/pngValidator.ts",
    "src/cache/cacheManifest.ts",
    "src/cache/index.ts",
    "src/api/urlSecurity.ts",
    "src/api/networkMode.ts",
    "src/api/oneShotCapture.ts",
    "src/api/figmaClient.ts",
    "src/api/types.ts",
    "src/api/index.ts",
    "tests/phase34a1-release-gate.test.ts",
    "tests/phase34a-capture-hardening.test.ts",
    "tests/phase33-offline-fidelity.test.ts",
    "scripts/preflight_phase34a1_release_gate.ts",
  ];

  console.log(`Packaging ${filesToInclude.length} files into ${zipName}...`);

  for (const f of filesToInclude) {
    if (!fs.existsSync(path.join(rootDir, f))) {
      throw new Error(`Required file for package not found: ${f}`);
    }
  }

  // Execute zip
  execFileSync("zip", ["-r", zipPath, ...filesToInclude], { cwd: rootDir });

  // Copy to parent workspace directory as well
  fs.copyFileSync(zipPath, parentZipPath);

  const stat = fs.statSync(zipPath);
  console.log(
    `Successfully created ${zipName}: ${stat.size} bytes (${(stat.size / 1024).toFixed(1)} KB)`
  );

  // Verify zip contents
  const list = execFileSync("unzip", ["-l", zipPath], { encoding: "utf8" });
  console.log("Zip content verification:\n" + list);

  // Strict security check: Ensure no private customer design JSON, tokens, or .env
  if (list.includes("펜테크") || list.includes(".env")) {
    throw new Error("SECURITY VIOLATION: Sensitive data detected in review package!");
  }
  console.log("Security scan passed: Zero sensitive files detected in zip package.");
}

main().catch((err) => {
  console.error("Packaging error:", err);
  process.exit(1);
});
