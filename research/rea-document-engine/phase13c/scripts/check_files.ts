import * as fs from "fs";
import * as path from "path";

interface ReportSet {
  name: string;
  figmaSnapshot: string;
  refDocx: string;
  canvasDocx: string;
  flowDocx: string;
}

const reports: ReportSet[] = [
  {
    name: "Report 1 (1차 진단)",
    figmaSnapshot: "debug/customer/Report1-Live-Snapshot.json",
    refDocx: "완성본-20261012/report-1차-진단-편집가능-Word보정-v3.docx",
    canvasDocx: "debug/canvas-audit/report-1-canvas.docx",
    flowDocx: "debug/quality-audit/live_generated/report-1차-정식개선.docx",
  },
  {
    name: "Report 2 (2차 경과)",
    figmaSnapshot: "debug/customer/Report2-Live-Snapshot.json",
    refDocx: "완성본-20261012/report-2차-경과-편집가능-Word보정-v3.docx",
    canvasDocx: "debug/canvas-audit/report-2-canvas.docx",
    flowDocx: "debug/quality-audit/live_generated/report-2차-정식개선.docx",
  },
  {
    name: "Report 3 (3차 성과검증)",
    figmaSnapshot: "debug/customer/Report3-Live-Snapshot.json",
    refDocx: "완성본-20261012/report-3차-성과검증-편집가능-Word보정-v3.docx",
    canvasDocx: "debug/canvas-audit/report-3-canvas.docx",
    flowDocx: "debug/quality-audit/live_generated/report-3차-정식개선.docx",
  },
];

console.log("=== Phase 13C Phase A: Baseline Files Verification ===");

for (const r of reports) {
  console.log(`\n--- ${r.name} ---`);
  for (const [key, filePath] of Object.entries(r)) {
    if (key === "name") continue;
    const absPath = path.resolve(filePath);
    const exists = fs.existsSync(absPath);
    const size = exists ? fs.statSync(absPath).size : 0;
    console.log(`  [${key}] ${filePath}`);
    console.log(`     Exists: ${exists}, Size: ${(size / 1024).toFixed(1)} KB (${size} bytes)`);
  }
}
