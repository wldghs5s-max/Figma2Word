import * as fs from "fs";
import * as path from "path";
import { CanvasPipeline } from "../../../../src/canvas/pipeline/canvasPipeline.js";

async function regenerate() {
  const pipeline = new CanvasPipeline();
  const reports = [
    { id: "report-1", file: "debug/customer/Report1-Live-Snapshot.json" },
    { id: "report-2", file: "debug/customer/Report2-Live-Snapshot.json" },
    { id: "report-3", file: "debug/customer/Report3-Live-Snapshot.json" },
  ];

  console.log("Regenerating Canvas DOCX outputs with improved parser and renderer...");

  for (const r of reports) {
    const raw = fs.readFileSync(r.file, "utf-8");
    const json = JSON.parse(raw);
    const outDocx = path.resolve(`debug/canvas-audit/${r.id}-canvas.docx`);
    const outHwpx = path.resolve(`debug/canvas-audit/${r.id}-canvas.hwpx`);

    const t0 = Date.now();
    const res = await pipeline.convertFigma(json, {
      format: "both",
      outputDocxPath: outDocx,
      outputHwpxPath: outHwpx,
      scalePolicy: "fit-a4",
    });
    console.log(`[${r.id}] Generated in ${Date.now() - t0}ms: ${res.stats.pageCount} pages, ${res.stats.elementCount} elements -> ${outDocx}`);
  }

  console.log("Regeneration complete!");
}

regenerate().catch(console.error);
