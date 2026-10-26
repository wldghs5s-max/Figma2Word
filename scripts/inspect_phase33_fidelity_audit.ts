import * as fs from "fs";
import * as path from "path";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";

async function main() {
  const rootDir = process.cwd();
  const jsonPath = path.resolve(rootDir, "펜테크 3차 디자인.json");

  if (!fs.existsSync(jsonPath)) {
    console.error("Design JSON not found:", jsonPath);
    process.exit(1);
  }

  console.log("[Phase 33 Audit] Loading Figma JSON snapshot...");
  const t0 = Date.now();
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  console.log(`[Phase 33 Audit] Loaded ${(fs.statSync(jsonPath).size / 1024 / 1024).toFixed(1)} MB JSON in ${((Date.now() - t0) / 1000).toFixed(2)}s`);

  const parser = new FigmaCanvasParser({
    imageMap: raw.imageMap,
    scalePolicy: "fit-a4",
  });

  const doc = parser.parse(raw);
  console.log(`[Phase 33 Audit] Parsed ${doc.pages.length} canvas pages.`);

  // Audit per page
  const pageReports: any[] = [];

  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    const textElements = page.elements.filter((e) => e.type === "text");
    const cardElements = page.elements.filter((e) => e.type === "card");
    const imageElements = page.elements.filter((e) => e.type === "image");
    const vectorElements = page.elements.filter((e) => e.type === "vector");
    const ovalElements = page.elements.filter((e) => e.type === "oval");

    // Check style coverage using exact CanvasStyle fields
    const strokedCount = page.elements.filter((e) => e.style.strokeWidth && e.style.strokeWidth > 0).length;
    const shadowCount = page.elements.filter((e) => e.style.shadow && e.style.shadow.blur > 0).length;
    const roundedCount = page.elements.filter((e) => e.style.cornerRadius && e.style.cornerRadius > 0).length;
    const opacityCount = page.elements.filter((e) => e.opacity !== undefined && e.opacity < 1.0).length;
    const centerTexts = textElements.filter((e) => e.paragraphAlign === "center").length;
    const rightTexts = textElements.filter((e) => e.paragraphAlign === "right").length;

    pageReports.push({
      pageIndex: i + 1,
      pageId: page.id,
      pageName: page.name,
      bounds: page.bounds,
      counts: {
        total: page.elements.length,
        text: textElements.length,
        card: cardElements.length,
        image: imageElements.length,
        vector: vectorElements.length,
        oval: ovalElements.length,
      },
      styles: {
        stroked: strokedCount,
        shadowed: shadowCount,
        rounded: roundedCount,
        translucent: opacityCount,
        centerTexts,
        rightTexts,
      },
    });
  }

  // Generate DOCX and HWPX to inspect XML structures
  console.log("[Phase 33 Audit] Rendering DOCX buffer to inspect document.xml...");
  const docxRenderer = new DocxCanvasRenderer();
  const docxBuf = await docxRenderer.renderToBuffer(doc);

  console.log("[Phase 33 Audit] Rendering HWPX buffer to inspect section0.xml...");
  const hwpxRenderer = new HwpxCanvasRenderer();
  const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);

  // Unzip DOCX to examine XML
  // We can write a summary
  const summary = {
    timestamp: new Date().toISOString(),
    pagesCount: doc.pages.length,
    docxSizeBytes: docxBuf.length,
    hwpxSizeBytes: hwpxBuf.length,
    pages: pageReports,
  };

  const outDir = path.resolve(rootDir, "debug/phase33-audit");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "audit_summary.json"), JSON.stringify(summary, null, 2));

  console.log("[Phase 33 Audit] Successfully generated audit summary at debug/phase33-audit/audit_summary.json");
  console.log(`Total elements across all 17 pages: ${pageReports.reduce((acc, p) => acc + p.counts.total, 0)}`);
  console.log(`Total text elements: ${pageReports.reduce((acc, p) => acc + p.counts.text, 0)}`);
  console.log(`Total card elements: ${pageReports.reduce((acc, p) => acc + p.counts.card, 0)}`);
  console.log(`Total image elements: ${pageReports.reduce((acc, p) => acc + p.counts.image, 0)}`);
  console.log(`Total vector elements: ${pageReports.reduce((acc, p) => acc + p.counts.vector, 0)}`);
}

main().catch((err) => {
  console.error("[Phase 33 Audit Error]:", err);
  process.exit(1);
});
