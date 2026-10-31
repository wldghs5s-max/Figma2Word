import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const rootDir = process.cwd();
const stagingDir = path.join(rootDir, "temp/phase34a1-hotfix-review-staging");
const zipPath = path.join(rootDir, "phase34a1-hotfix-gpt-review.zip");

if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

// Files to include
const filesToCopy = [
  // Core sources
  { src: "src/api/oneShotCapture.ts", dest: "src/api/oneShotCapture.ts" },
  { src: "src/cache/cacheManifest.ts", dest: "src/cache/cacheManifest.ts" },
  { src: "src/api/urlSecurity.ts", dest: "src/api/urlSecurity.ts" },
  { src: "src/api/networkMode.ts", dest: "src/api/networkMode.ts" },
  { src: "src/cache/pngValidator.ts", dest: "src/cache/pngValidator.ts" },

  // Tests
  { src: "tests/phase34a1-hotfix.test.ts", dest: "tests/phase34a1-hotfix.test.ts" },
  { src: "tests/phase34a1-release-gate.test.ts", dest: "tests/phase34a1-release-gate.test.ts" },
  { src: "tests/phase34a-capture-hardening.test.ts", dest: "tests/phase34a-capture-hardening.test.ts" },

  // Scripts
  { src: "scripts/preflight_phase34a1_hotfix.ts", dest: "scripts/preflight_phase34a1_hotfix.ts" },

  // Reports
  { src: "phase34a1-hotfix/README.md", dest: "phase34a1-hotfix/README.md" },
  { src: "phase34a1-hotfix/01-crash-recovery-order.md", dest: "phase34a1-hotfix/01-crash-recovery-order.md" },
  { src: "phase34a1-hotfix/02-http-budget-accounting.md", dest: "phase34a1-hotfix/02-http-budget-accounting.md" },
  { src: "phase34a1-hotfix/03-failure-injection-results.md", dest: "phase34a1-hotfix/03-failure-injection-results.md" },
  { src: "phase34a1-hotfix/04-preflight-results.md", dest: "phase34a1-hotfix/04-preflight-results.md" },
  { src: "phase34a1-hotfix/05-regression-results.md", dest: "phase34a1-hotfix/05-regression-results.md" },
  { src: "phase34a1-hotfix/06-final-readiness.md", dest: "phase34a1-hotfix/06-final-readiness.md" },
  { src: "phase34a1-hotfix/preflight-summary.json", dest: "phase34a1-hotfix/preflight-summary.json" },
  { src: "phase34a1-hotfix/git-diff.patch", dest: "phase34a1-hotfix/git-diff.patch" },
];

for (const item of filesToCopy) {
  const fullSrc = path.join(rootDir, item.src);
  const fullDest = path.join(stagingDir, item.dest);
  if (fs.existsSync(fullSrc)) {
    fs.mkdirSync(path.dirname(fullDest), { recursive: true });
    fs.copyFileSync(fullSrc, fullDest);
  } else {
    console.warn(`File not found: ${item.src}`);
  }
}

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

// Create ZIP using PowerShell Compress-Archive
console.log(`Creating ZIP at: ${zipPath}`);
execSync(`powershell -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -Force"`, {
  stdio: "inherit",
});

// Clean staging directory
fs.rmSync(stagingDir, { recursive: true, force: true });

const stat = fs.statSync(zipPath);
console.log(`Successfully generated GPT audit review archive: ${zipPath} (${(stat.size / 1024).toFixed(1)} KB)`);
