import * as fs from "fs";
import * as path from "path";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import JSZip from "jszip";

async function main() {
  const rootDir = process.cwd();
  const jsonPath = path.resolve(rootDir, "펜테크 3차 디자인.json");
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  const parser = new FigmaCanvasParser({
    imageMap: raw.imageMap,
    scalePolicy: "fit-a4",
  });
  const doc = parser.parse(raw);

  const docxRenderer = new DocxCanvasRenderer();
  const docxBuf = await docxRenderer.renderToBuffer(doc);
  const docxZip = await JSZip.loadAsync(docxBuf);
  const docXml = await docxZip.file("word/document.xml")!.async("string");

  const hwpxRenderer = new HwpxCanvasRenderer();
  const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
  const hwpxZip = await JSZip.loadAsync(hwpxBuf);
  const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

  // Count XML tags in DOCX
  const docxShapeCount = (docXml.match(/<v:(shape|rect|roundrect|oval)/g) || []).length;
  const docxParagraphCount = (docXml.match(/<w:p\b/g) || []).length;
  const docxRunCount = (docXml.match(/<w:r\b/g) || []).length;
  const docxFillOpacityCount = (docXml.match(/<v:fill opacity=/g) || []).length;
  const docxStrokeOpacityCount = (docXml.match(/<v:stroke[^>]*opacity=/g) || []).length;
  const docxShadowCount = (docXml.match(/<v:shadow on="t"/g) || []).length;

  // Count XML tags in HWPX
  const hwpxRectCount = (docXml.match(/<hp:rect/g) || []).length;
  const hwpxBrushCount = (secXml.match(/<hc:fillBrush/g) || []).length;
  const hwpxShadowCount = (secXml.match(/<hp:shadow type="DROP"/g) || []).length;
  const hwpxTranslucentCount = (secXml.match(/alpha="([1-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-4])"/g) || []).length;

  const totalIRElements = doc.pages.reduce((acc, p) => acc + p.elements.length, 0);
  const totalIRTexts = doc.pages.reduce((acc, p) => acc + p.elements.filter((e) => e.type === "text").length, 0);
  const totalIRCards = doc.pages.reduce((acc, p) => acc + p.elements.filter((e) => e.type === "card").length, 0);
  const totalIRVectors = doc.pages.reduce((acc, p) => acc + p.elements.filter((e) => e.type === "vector").length, 0);
  const totalIROvals = doc.pages.reduce((acc, p) => acc + p.elements.filter((e) => e.type === "oval").length, 0);
  const totalIRImages = doc.pages.reduce((acc, p) => acc + p.elements.filter((e) => e.type === "image").length, 0);

  const report = {
    canvasIR: {
      pagesCount: doc.pages.length,
      totalElements: totalIRElements,
      texts: totalIRTexts,
      cards: totalIRCards,
      vectors: totalIRVectors,
      ovals: totalIROvals,
      images: totalIRImages,
    },
    docxXmlMetrics: {
      totalVmlShapes: docxShapeCount,
      totalParagraphs: docxParagraphCount,
      totalRuns: docxRunCount,
      fillOpacityElements: docxFillOpacityCount,
      strokeOpacityElements: docxStrokeOpacityCount,
      shadowElements: docxShadowCount,
    },
    hwpxXmlMetrics: {
      totalFillBrushes: hwpxBrushCount,
      dropShadows: hwpxShadowCount,
      translucentBrushes: hwpxTranslucentCount,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync("debug/phase33-audit/structural_fidelity_metrics.json", JSON.stringify(report, null, 2));
}

main().catch(console.error);
