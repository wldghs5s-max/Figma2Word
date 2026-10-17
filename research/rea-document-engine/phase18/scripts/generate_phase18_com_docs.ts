import * as fs from "fs";
import * as path from "path";
import { FigmaCanvasParser } from "../../../../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../../../../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../../../../src/canvas/renderer/hwpxCanvasRenderer.js";
import { CanvasDocument } from "../../../../src/canvas/types.js";

async function generate() {
  const outDir = path.resolve(process.cwd(), "debug/phase18-com");
  fs.mkdirSync(outDir, { recursive: true });

  const docxRenderer = new DocxCanvasRenderer();
  const hwpxRenderer = new HwpxCanvasRenderer();

  const items = [
    { name: "brief", src: "samples/synthetic-figma/single-page-brief.json" },
    { name: "dashboard", src: "samples/synthetic-figma/complex-nested-dashboard.json" },
    { name: "report", src: "samples/synthetic-figma/multi-page-report.json" },
    { name: "proposal", src: "samples/real-world/sample-a-proposal-doc.json" },
  ];

  for (const item of items) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), item.src), "utf-8"));
    const parser = new FigmaCanvasParser({ titleOverride: item.name });
    const doc = parser.parse(raw);
    const docxBuf = await docxRenderer.renderToBuffer(doc);
    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    fs.writeFileSync(path.join(outDir, `${item.name}.docx`), docxBuf);
    fs.writeFileSync(path.join(outDir, `${item.name}.hwpx`), hwpxBuf);
    console.log(`Generated ${item.name}.docx & .hwpx (${doc.pages.length} pages)`);
  }

  // Generate mixed-orientation 2-page DOCX & HWPX
  const mixedDoc: CanvasDocument = {
    title: "Phase 18 Mixed Orientation",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [
      {
        pageNumber: 1,
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: "#FFFFFF",
        elements: [
          {
            id: "mix_p1_txt",
            name: "Portrait Title",
            type: "text",
            bounds: { x: 40, y: 40, width: 300, height: 50 },
            zIndex: 1,
            style: { fillColor: "#EFF6FF", strokeColor: "#2563EB", strokeWidth: 1 },
            textRuns: [{ text: "Page 1 Portrait Section", fontFamily: "맑은 고딕", fontSizePt: 14, fontWeight: 700, color: "#1E3A8A" }],
          },
        ],
      },
      {
        pageNumber: 2,
        bounds: { x: 0, y: 0, width: 841.89, height: 595.28 },
        backgroundColor: "#F8FAFC",
        elements: [
          {
            id: "mix_p2_txt",
            name: "Landscape Title",
            type: "text",
            bounds: { x: 40, y: 40, width: 400, height: 50 },
            zIndex: 1,
            style: { fillColor: "#F0FDF4", strokeColor: "#16A34A", strokeWidth: 1 },
            textRuns: [{ text: "Page 2 Landscape Section", fontFamily: "맑은 고딕", fontSizePt: 14, fontWeight: 700, color: "#14532D" }],
          },
        ],
      },
    ],
    resources: {},
    diagnostics: { notices: [], warnings: [] },
  };

  fs.writeFileSync(path.join(outDir, "mixed-orientation.docx"), await docxRenderer.renderToBuffer(mixedDoc));
  fs.writeFileSync(path.join(outDir, "mixed-orientation.hwpx"), await hwpxRenderer.renderToBuffer(mixedDoc));
  console.log("Generated mixed-orientation.docx & .hwpx (2 pages: Portrait + Landscape)");

  // Copy customer-report1.docx for COM testing
  const customerReport1 = path.resolve(process.cwd(), "debug/canvas-audit/report-1-canvas.docx");
  if (fs.existsSync(customerReport1)) {
    fs.copyFileSync(customerReport1, path.join(outDir, "customer-report1.docx"));
    console.log("Copied customer-report1.docx (9 pages)");
  }
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
