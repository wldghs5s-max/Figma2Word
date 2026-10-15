import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";

const SYNTHETIC_DIR = path.resolve(process.cwd(), "samples/synthetic-figma");
const OUTPUT_DIR = path.resolve(process.cwd(), "samples/output/synthetic-benchmarks");

describe("Phase 15 Track D: Synthetic Archetypes Benchmark & Validation", () => {
  const samples = [
    { file: "single-page-brief.json", name: "Single Page Brief", expectedPages: 1 },
    { file: "multi-page-report.json", name: "Multi-Page Report", expectedPages: 3 },
    { file: "image-centric-portfolio.json", name: "Image-Centric Portfolio", expectedPages: 1 },
    { file: "text-centric-article.json", name: "Text-Centric Article", expectedPages: 1 },
    { file: "vector-centric-infographic.json", name: "Vector-Centric Infographic", expectedPages: 1 },
    { file: "complex-nested-dashboard.json", name: "Complex Nested Dashboard", expectedPages: 1 },
    { file: "table-card-hybrid.json", name: "Table-Card Hybrid", expectedPages: 1 },
  ];

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const sample of samples) {
    it(`successfully parses and renders ${sample.name} to both DOCX and HWPX`, async () => {
      const samplePath = path.join(SYNTHETIC_DIR, sample.file);
      const rawJson = JSON.parse(fs.readFileSync(samplePath, "utf-8"));

      const parser = new FigmaCanvasParser({
        imageMap: rawJson.images,
        titleOverride: sample.name,
      });

      const canvasDoc = parser.parse(rawJson);
      expect(canvasDoc).toBeDefined();
      expect(canvasDoc.pages.length).toBe(sample.expectedPages);
      expect(canvasDoc.pages[0].elements.length).toBeGreaterThan(0);

      // 1. Render DOCX
      const docxRenderer = new DocxCanvasRenderer();
      const docxBuffer = await docxRenderer.renderToBuffer(canvasDoc);
      expect(docxBuffer.byteLength).toBeGreaterThan(1000);

      // Verify DOCX ZIP structure
      const docxZip = await JSZip.loadAsync(docxBuffer);
      expect(docxZip.file("word/document.xml")).toBeDefined();
      expect(docxZip.file("[Content_Types].xml")).toBeDefined();

      const docxOutPath = path.join(OUTPUT_DIR, sample.file.replace(".json", ".docx"));
      fs.writeFileSync(docxOutPath, docxBuffer);

      // 2. Render HWPX
      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuffer = await hwpxRenderer.renderToBuffer(canvasDoc);
      expect(hwpxBuffer.byteLength).toBeGreaterThan(1000);

      // Verify HWPX ZIP structure (KS X 6101)
      const hwpxZip = await JSZip.loadAsync(hwpxBuffer);
      expect(hwpxZip.file("mimetype")).toBeDefined();
      expect(hwpxZip.file("Contents/section0.xml")).toBeDefined();
      expect(hwpxZip.file("Contents/header.xml")).toBeDefined();

      const hwpxOutPath = path.join(OUTPUT_DIR, sample.file.replace(".json", ".hwpx"));
      fs.writeFileSync(hwpxOutPath, hwpxBuffer);
    });
  }
});

