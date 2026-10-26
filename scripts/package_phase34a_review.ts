import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

async function main() {
  const rootDir = process.cwd();
  const zipName = "phase34a-gpt-review.zip";
  const zipPath = path.join(rootDir, zipName);
  const parentZipPath = path.join(path.dirname(rootDir), zipName);

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
  if (fs.existsSync(parentZipPath)) {
    fs.unlinkSync(parentZipPath);
  }

  // Files to strictly include
  const filesToInclude = [
    "phase34a-capture-hardening/README.md",
    "phase34a-capture-hardening/preflight-summary.json",
    "phase34a-capture-hardening/reports/01-initial-audit.md",
    "phase34a-capture-hardening/reports/02-network-policy.md",
    "phase34a-capture-hardening/reports/03-cache-integrity.md",
    "phase34a-capture-hardening/reports/04-png-validation.md",
    "phase34a-capture-hardening/reports/05-url-security.md",
    "phase34a-capture-hardening/reports/06-request-budget.md",
    "phase34a-capture-hardening/reports/07-secret-safety.md",
    "phase34a-capture-hardening/reports/08-failure-injection.md",
    "phase34a-capture-hardening/reports/09-real-json-preflight.md",
    "phase34a-capture-hardening/reports/10-regression-results.md",
    "phase34a-capture-hardening/reports/11-final-readiness.md",
    "phase34a-capture-hardening/evidence/logs/full_test_log.txt",
    "phase34a-capture-hardening/evidence/git_diff_summary.patch",
    "src/api/networkMode.ts",
    "src/api/oneShotCapture.ts",
    "src/api/urlSecurity.ts",
    "src/api/index.ts",
    "src/api/types.ts",
    "src/cache/cacheManifest.ts",
    "src/cache/pngValidator.ts",
    "src/cache/index.ts",
    "tests/phase34a-capture-hardening.test.ts",
    "tests/phase33-offline-fidelity.test.ts",
    "scripts/preflight_phase34a_capture.ts",
  ];

  console.log(`Packaging ${filesToInclude.length} files into ${zipName}...`);

  for (const f of filesToInclude) {
    if (!fs.existsSync(path.join(rootDir, f))) {
      throw new Error(`Required file for package not found: ${f}`);
    }
  }

  // Execute zip
  execFileSync("zip", ["-r", zipName, ...filesToInclude], { cwd: rootDir });

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
