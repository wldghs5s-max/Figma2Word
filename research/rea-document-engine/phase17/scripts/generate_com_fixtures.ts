import * as fs from "fs";
import * as path from "path";
import { FigmaCanvasParser } from "../../../../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../../../../src/canvas/renderer/docxCanvasRenderer.js";

const outDir = path.resolve(process.cwd(), "debug/phase17-com");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const targets = [
  { json: "samples/synthetic-figma/single-page-brief.json", name: "brief.docx" },
  { json: "samples/synthetic-figma/complex-nested-dashboard.json", name: "dashboard.docx" },
  { json: "samples/synthetic-figma/multi-page-report.json", name: "report.docx" },
];

async function generate() {
  const renderer = new DocxCanvasRenderer();
  for (const t of targets) {
    const raw = JSON.parse(fs.readFileSync(t.json, "utf-8"));
    const parser = new FigmaCanvasParser({ titleOverride: t.name });
    const doc = parser.parse(raw);
    const buf = await renderer.renderToBuffer(doc);
    const outPath = path.join(outDir, t.name);
    fs.writeFileSync(outPath, buf);
    console.log(`Generated: ${outPath} (${buf.length} bytes, ${doc.pages.length} pages)`);
  }
}

generate().catch(console.error);
