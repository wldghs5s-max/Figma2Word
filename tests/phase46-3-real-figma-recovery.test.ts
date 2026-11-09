import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as zlib from "zlib";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import JSZip from "jszip";

describe("Phase 46.3: Real Figma Full File Recovery & 5-Screen Live Verification", () => {
  const cacheFile = path.resolve("debug/phase45/cache/figma_full_original.json");
  const localGz = path.resolve("debug/phase46_3/backup/figma_full_original.json.gz");
  const framesDir = path.resolve("debug/phase46_3/frames");

  const expectedSha256 = "1241738082692e1f625c3d0b06e5d91bd354f6b4c86d1d3fc1ab800f09c49faa";

  it("1. Canonical raw Figma JSON cache exists and matches exact SHA-256", () => {
    expect(fs.existsSync(cacheFile)).toBe(true);
    const stat = fs.statSync(cacheFile);
    expect(stat.size).toBe(45704275);

    const buf = fs.readFileSync(cacheFile);
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    expect(hash).toBe(expectedSha256);
  });

  it("2. Local Gzip backup decompresses to identical byte-level SHA-256", () => {
    expect(fs.existsSync(localGz)).toBe(true);
    const gzBuf = fs.readFileSync(localGz);
    const decomp = zlib.gunzipSync(gzBuf);
    expect(decomp.length).toBe(45704275);

    const hash = crypto.createHash("sha256").update(decomp).digest("hex");
    expect(hash).toBe(expectedSha256);
  });

  it("3. Frame 1154:2591 (고객목록) parses to exactly 189 elements, 98 texts, 60 cards", async () => {
    const framePath = path.join(framesDir, "frame_1154_2591.json");
    expect(fs.existsSync(framePath)).toBe(true);

    const raw = JSON.parse(fs.readFileSync(framePath, "utf8"));
    const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
    const doc = parser.parse(raw);

    const page = doc.pages[0];
    expect(page.elements.length).toBe(189);

    const texts = page.elements.filter((e) => e.type === "text");
    const cards = page.elements.filter((e) => e.type === "card");
    const tables = page.elements.filter((e) => e.type === "table");

    expect(texts.length).toBe(98);
    expect(cards.length).toBe(60);
    expect(tables.length).toBe(0);
  });

  it("4. Frame 1154:3082 (고객상세) parses to 88 elements and 2 distinct 6x2 tables", async () => {
    const framePath = path.join(framesDir, "frame_1154_3082.json");
    const raw = JSON.parse(fs.readFileSync(framePath, "utf8"));
    const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
    const doc = parser.parse(raw);

    const page = doc.pages[0];
    expect(page.elements.length).toBe(88);

    const tables = page.elements.filter((e) => e.type === "table");
    expect(tables.length).toBe(2);
    expect(tables[0].tableData?.rowCount).toBe(6);
    expect(tables[0].tableData?.colCount).toBe(2);
    expect(tables[1].tableData?.rowCount).toBe(6);
    expect(tables[1].tableData?.colCount).toBe(2);
  });

  it("5. Frame 1154:7666 (홈) preserves clipped ovals and renders cubic Bezier paths in DOCX", async () => {
    const framePath = path.join(framesDir, "frame_1154_7666.json");
    const raw = JSON.parse(fs.readFileSync(framePath, "utf8"));
    const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
    const doc = parser.parse(raw);

    const page = doc.pages[0];
    // Phase 46.final: 166 elements (165 previous + 1 recovered gradient banner node 1154:7735)
    expect(page.elements.length).toBe(166);

    // Verify clipped ovals
    const clippedOvals = page.elements.filter(
      (e) => e.type === "oval" && e.originalBounds && e.clipBounds
    );
    expect(clippedOvals.length).toBeGreaterThanOrEqual(2);

    // Render DOCX and verify cubic Bezier 'c' path in XML
    const docxRenderer = new DocxCanvasRenderer();
    const docxBuf = await docxRenderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(docxBuf);
    const xml = await zip.file("word/document.xml")!.async("string");

    expect(xml).toContain('coordsize="1000,1000"');
    expect(xml).toMatch(/path="[^"]*\sc\s+[\d\-]+/);
  });

  it("6. Frame 1154:4490 (계약관리) parses to 83 elements with 11x10 table and zero text-fill background leaks", async () => {
    const framePath = path.join(framesDir, "frame_1154_4490.json");
    const raw = JSON.parse(fs.readFileSync(framePath, "utf8"));
    const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
    const doc = parser.parse(raw);

    const page = doc.pages[0];
    expect(page.elements.length).toBe(83);

    const tables = page.elements.filter((e) => e.type === "table");
    expect(tables.length).toBe(1);
    expect(tables[0].tableData?.rowCount).toBe(11);
    expect(tables[0].tableData?.colCount).toBe(10);

    // Render HWPX and verify native <hp:tbl> with 110 cells
    const hwpxRenderer = new HwpxCanvasRenderer();
    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(hwpxBuf);
    const secXml = await zip.file("Contents/section0.xml")!.async("string");
    expect(secXml).toContain("<hp:tbl");
    const cellMatches = secXml.match(/<hp:tc/g) || [];
    expect(cellMatches.length).toBe(110);
  });

  it("7. Frame 1154:8582 (보장분석 요약 팝업) triggers Atomic Fallback (0 tables, 78 cards)", async () => {
    const framePath = path.join(framesDir, "frame_1154_8582.json");
    const raw = JSON.parse(fs.readFileSync(framePath, "utf8"));
    const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
    const doc = parser.parse(raw);

    const page = doc.pages[0];
    expect(page.elements.length).toBe(229);

    const tables = page.elements.filter((e) => e.type === "table");
    const cards = page.elements.filter((e) => e.type === "card");
    const texts = page.elements.filter((e) => e.type === "text");

    expect(tables.length).toBe(0);
    expect(cards.length).toBe(78);
    expect(texts.length).toBe(132);
  });

  it("8. Verifies generated Word 16.0 COM PDF and PNG artifacts exist for all 5 frames", () => {
    const ids = ["1154_2591", "1154_3082", "1154_7666", "1154_4490", "1154_8582"];
    for (const id of ids) {
      const docxPath = path.resolve(`debug/phase46_3/docx/frame_${id}.docx`);
      const hwpxPath = path.resolve(`debug/phase46_3/hwpx/frame_${id}.hwpx`);
      const pdfPath = path.resolve(`debug/phase46_3/pdf/frame_${id}.pdf`);
      const pngPath = path.resolve(`debug/phase46_3/rendered/word_${id}-Page01.png`);

      expect(fs.existsSync(docxPath)).toBe(true);
      expect(fs.statSync(docxPath).size).toBeGreaterThan(10000);

      expect(fs.existsSync(hwpxPath)).toBe(true);
      expect(fs.statSync(hwpxPath).size).toBeGreaterThan(14000);

      expect(fs.existsSync(pdfPath)).toBe(true);
      expect(fs.statSync(pdfPath).size).toBeGreaterThan(80000);

      expect(fs.existsSync(pngPath)).toBe(true);
      expect(fs.statSync(pngPath).size).toBeGreaterThan(70000);
    }
  });
});
