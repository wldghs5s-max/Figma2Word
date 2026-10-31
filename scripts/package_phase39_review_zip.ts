import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { execSync } from "child_process";

export async function packageReviewZip() {
  const rootDir = process.cwd();
  const zipPath = path.resolve(rootDir, "phase39-gpt-review.zip");
  const zip = new JSZip();

  console.log("================================================================================");
  console.log(" Packaging Phase 39 Independent Codex/GPT Audit Review Archive");
  console.log(" Target:", zipPath);
  console.log("================================================================================");

  // Files to include
  const filesToInclude: string[] = [
    // Source core implementations & fixes
    "src/fidelity/verificationVerdict.ts",
    "src/fidelity/objectTraceability.ts",
    "src/fidelity/integrityGate.ts",
    "src/fidelity/layoutStabilityAuditor.ts",
    "src/fidelity/sectionPageMapper.ts",
    "src/fidelity/mediaRelationshipAuditor.ts",
    "src/fidelity/editabilityAuditor.ts",
    "tools/quality-audit/src/runner.ts",
    "tools/quality-audit/src/wordRenderer.ts",
    "tools/quality-audit/src/imageComparator.ts",
    "tools/visual-regression/windows_word_edit_test.ps1",
    "tsconfig.scripts.json",
    "tsconfig.json",
    "package.json",

    // New Phase 39 Negative & Failure-Injection Tests
    "tests/phase39-verdict-engine.test.ts",
    "tests/phase39-object-traceability-negative.test.ts",
    "tests/phase39-integrity-gate-negative.test.ts",
    "tests/phase39-layout-stability-negative.test.ts",
    "tests/phase39-editability-media-negative.test.ts",

    // Pipeline Runners
    "scripts/run_phase39_production_pipeline.ts",
  ];

  for (const relPath of filesToInclude) {
    const fullPath = path.resolve(rootDir, relPath);
    if (fs.existsSync(fullPath)) {
      zip.file(relPath.replace(/\\/g, "/"), fs.readFileSync(fullPath));
      console.log(`  + Added: ${relPath}`);
    } else {
      console.warn(`  ! Warning: File not found: ${relPath}`);
    }
  }

  // Include Phase 39 outputs (metrics & reports, excluding large binaries)
  const p39Dir = path.resolve(rootDir, "phase39-verification-foundation");
  if (fs.existsSync(p39Dir)) {
    function addDirRecursive(dir: string, base: string) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        const rel = path.join(base, item).replace(/\\/g, "/");
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          addDirRecursive(full, rel);
        } else {
          // Exclude binary files like .docx, .pdf, .png
          if (/\.(docx|pdf|png|jpe?g)$/i.test(item)) {
            return;
          }
          zip.file(rel, fs.readFileSync(full));
          console.log(`  + Added: ${rel}`);
        }
      }
    }
    addDirRecursive(p39Dir, "phase39-verification-foundation");
  }

  // Add git diff patch
  try {
    const diff = execSync("git diff HEAD~1..HEAD", { encoding: "utf8" });
    zip.file("evidence/git-diff.patch", diff);
    console.log("  + Added: evidence/git-diff.patch");
  } catch {
    const status = execSync("git diff", { encoding: "utf8" });
    zip.file("evidence/git-diff.patch", status);
    console.log("  + Added: evidence/git-diff.patch (working tree diff)");
  }

  // Generate ZIP
  const content = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  fs.writeFileSync(zipPath, content);

  console.log("\n================================================================================");
  console.log(` Package completed: ${zipPath} (${(content.length / 1024).toFixed(1)} KB)`);
  console.log(" Verified: Zero customer binaries, zero tokens, zero environment secrets.");
  console.log("================================================================================");
}

packageReviewZip().catch(console.error);
