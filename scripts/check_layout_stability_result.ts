import * as fs from "fs";
import * as path from "path";
import { auditLayoutStability } from "../src/fidelity/layoutStabilityAuditor.js";

const editWorkDir = path.resolve("debug/phase39-editability");
const beforeDir = path.join(editWorkDir, "rendered-before");
const afterDir = path.join(editWorkDir, "rendered-after");
const summaryPath = path.join(editWorkDir, "evidence/word-edit-test-summary.json");

const summaryRaw = fs.readFileSync(summaryPath, "utf8").replace(/^\uFEFF/, "");
const summary = JSON.parse(summaryRaw);
const editedBoxes = summary.editedBoundingBoxes || [];

console.log(`Auditing layout stability with ${editedBoxes.length} edited boxes across 17 pages...`);
const report = auditLayoutStability(beforeDir, afterDir, editedBoxes, 17, true, true);

console.log("Layout Stability Report Summary:", {
  totalPages: report.totalPages,
  unintendedRegressionsCount: report.unintendedRegressionsCount,
  insufficientCoverageCount: report.insufficientCoverageCount,
  dimensionMismatchCount: report.dimensionMismatchCount,
  missingEvidenceCount: report.missingEvidenceCount,
  stablePagesCount: report.stablePagesCount,
  averageUnchangedMismatchRatio: `${(report.averageUnchangedMismatchRatio * 100).toFixed(4)}%`,
  averageUnchangedMae: report.averageUnchangedMae,
  layoutStabilityVerdict: report.layoutStabilityVerdict,
});

console.log("\nPage-by-page results:");
report.pages.forEach(p => {
  console.log(`Page ${p.pageNumber}: status=${p.status}, isStable=${p.isStable}, inspectedRatio=${(p.inspectedRatio * 100).toFixed(2)}%, mismatchRatio=${(p.unchangedRegionMismatchRatio * 100).toFixed(4)}%`);
  if (p.diagnostics) console.log(`  diagnostics: ${p.diagnostics}`);
});

