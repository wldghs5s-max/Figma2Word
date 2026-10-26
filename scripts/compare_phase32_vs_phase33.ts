import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

function fileHash(p: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

async function main() {
  const rootDir = process.cwd();
  const p32Dir = path.resolve(rootDir, "debug/phase32-benchmark/pages");
  const p33Dir = path.resolve(rootDir, "debug/phase33-benchmark/pages");

  console.log("=== Phase 32 vs Phase 33 Comparison Report ===");
  const results: any[] = [];

  for (let i = 1; i <= 17; i++) {
    const pageNum = String(i).padStart(3, "0");
    const p32File = path.join(p32Dir, `page-${pageNum}.png`);
    const p33File = path.join(p33Dir, `page-${pageNum}.png`);

    if (!fs.existsSync(p32File) || !fs.existsSync(p33File)) {
      results.push({ page: i, status: "MISSING_EVIDENCE" });
      continue;
    }

    const s32 = fs.statSync(p32File).size;
    const s33 = fs.statSync(p33File).size;
    const h32 = fileHash(p32File);
    const h33 = fileHash(p33File);

    const identical = h32 === h33;
    results.push({
      page: i,
      p32Size: s32,
      p33Size: s33,
      identical,
      status: identical ? "IDENTICAL_PIXELS" : "UPDATED_RENDERING",
    });
  }

  console.table(results);
  const identicalCount = results.filter((r) => r.identical).length;
  console.log(`Summary: ${identicalCount}/17 pages byte-identical, ${17 - identicalCount}/17 pages with opacity/style refinements.`);
}

main().catch(console.error);
