import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { CanvasDocument, CanvasElement } from "../src/canvas/types.js";

describe("Phase 17 Quality & Integration Test Suite", () => {
  // =========================================================================
  // 1. Native HWPX Line Rendering for LINE Elements
  // =========================================================================
  describe("Track A: HWPX Native Line Rendering", () => {
    it("should render Figma LINE nodes as native <hp:line> with pt0 and pt1 in HWPX", async () => {
      const lineDoc: CanvasDocument = {
        title: "Native Line Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "div_1",
                name: "Horizontal Divider",
                type: "line",
                bounds: { x: 50, y: 100, width: 400, height: 1 },
                zIndex: 1,
                style: { strokeColor: "#336699", strokeWidth: 2 },
              },
            ],
          },
        ],
        resources: {},
        diagnostics: { notices: [], warnings: [] },
      };

      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(lineDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await zip.file("Contents/section0.xml")!.async("string");

      // Verify <hp:line> tag presence and attributes
      const lineMatch = secXml.match(/<hp:line\b[\s\S]*?<\/hp:line>/);
      expect(lineMatch).toBeDefined();
      expect(lineMatch![0]).toContain('color="#336699"');
      expect(lineMatch![0]).toContain('style="SOLID"');
      expect(lineMatch![0]).toContain('<hc:pt0 x="0" y="0"/>');
      expect(lineMatch![0]).toContain('<hc:pt1 x="40000" y="100"/>');
      // Ensure it did not fall back to <hp:rect>
      expect(secXml).not.toContain('<hp:rect');
    });

    it("should strictly cap rounded rectangle ratio to 50 for pills and semi-circles", async () => {
      const pillDoc: CanvasDocument = {
        title: "Pill Shape Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "pill_1",
                name: "Badge Pill",
                type: "card",
                bounds: { x: 50, y: 50, width: 120, height: 40 },
                zIndex: 1,
                style: { fillColor: "#007ACC", cornerRadius: 50 }, // Corner radius exceeds minDim / 2 (20)
              },
            ],
          },
        ],
        resources: {},
        diagnostics: { notices: [], warnings: [] },
      };

      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(pillDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await zip.file("Contents/section0.xml")!.async("string");

      const rectMatch = secXml.match(/<hp:rect\b[^>]*\bratio="(\d+)"/);
      expect(rectMatch).toBeDefined();
      const ratio = parseInt(rectMatch![1], 10);
      expect(ratio).toBe(50); // Capped at exactly 50 per KS X 6101 schema
    });

    it("should emit 75 HWPU/px image dimensions and both hp:imgDim and hp:inImgDim", async () => {
      // 100x50 PNG sample bytes
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic
        0x00, 0x00, 0x00, 0x0d, // IHDR length (13)
        0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x00, 0x64, // width = 100 px
        0x00, 0x00, 0x00, 0x32, // height = 50 px
        0x08, 0x02, 0x00, 0x00, 0x00, // 8-bit truecolor
        0x00, 0x00, 0x00, 0x00, // CRC placeholder
      ]);

      const imgDoc: CanvasDocument = {
        title: "Image Dimension Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "img_dim_test",
                name: "Test Image",
                type: "image",
                bounds: { x: 50, y: 50, width: 100, height: 50 },
                zIndex: 1,
                style: {},
                imageRef: "res_test_img.png",
              },
            ],
          },
        ],
        resources: {
          "res_test_img.png": {
            id: "res_test_img.png",
            name: "res_test_img.png",
            mimeType: "image/png",
            data: pngHeader,
          },
        },
        diagnostics: { notices: [], warnings: [] },
      };

      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(imgDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await zip.file("Contents/section0.xml")!.async("string");

      // 100 px * 75 = 7500 HWPU; 50 px * 75 = 3750 HWPU
      expect(secXml).toContain('<hp:imgDim dimwidth="7500" dimheight="3750"/>');
      expect(secXml).toContain('binaryItemIDRef="BIN0001"');
      // Phase 20 OWPML Schema Fix: ensure spurious inImgDim and binRef are not emitted
      expect(secXml).not.toContain('<hp:inImgDim');
      expect(secXml).not.toContain('binRef="BIN0001"');
      expect(secXml).toContain('<hp:imgRect>');
      expect(secXml).toContain('<hc:pt1 x="10000" y="0"/>');
    });
  });

  // =========================================================================
  // 2. Track B: Mixed Orientation & Multi-Page Sections
  // =========================================================================
  describe("Track B: Mixed Orientation Multi-Page Documents", () => {
    it("should generate proper section break in DOCX when page orientations differ", async () => {
      const mixedDoc: CanvasDocument = {
        title: "Mixed Orientation Document",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            backgroundColor: "#FFFFFF",
            elements: [
              {
                id: "p1_text",
                name: "Page 1 Portrait",
                type: "text",
                bounds: { x: 50, y: 50, width: 200, height: 50 },
                zIndex: 1,
                style: {},
                textRuns: [{ text: "Portrait Page 1", fontFamily: "Calibri", fontSizePt: 12 }],
              },
            ],
          },
          {
            pageNumber: 2,
            bounds: { x: 0, y: 0, width: 841.89, height: 595.28 },
            backgroundColor: "#F9F9F9",
            elements: [
              {
                id: "p2_text",
                name: "Page 2 Landscape",
                type: "text",
                bounds: { x: 50, y: 50, width: 300, height: 50 },
                zIndex: 1,
                style: {},
                textRuns: [{ text: "Landscape Page 2", fontFamily: "Calibri", fontSizePt: 12 }],
              },
            ],
          },
        ],
        resources: {},
        diagnostics: { notices: [], warnings: [] },
      };

      const docxRenderer = new DocxCanvasRenderer();
      const docxBuf = await docxRenderer.renderToBuffer(mixedDoc);
      const zip = await JSZip.loadAsync(docxBuf);
      const docXml = await zip.file("word/document.xml")!.async("string");

      // Verify Page 1 paragraph has inline sectPr with w:type="nextPage" and portrait size
      expect(docXml).toContain('<w:type w:val="nextPage"/>');
      expect(docXml).toContain('w:w="11906" w:h="16838" w:orient="portrait"');

      // Verify final document sectPr has landscape size
      expect(docXml).toContain('w:w="16838" w:h="11906" w:orient="landscape"');
    });

    it("should generate per-section hp:secPr in HWPX when page orientations differ", async () => {
      const mixedDoc: CanvasDocument = {
        title: "Mixed Orientation Document HWPX",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            backgroundColor: "#FFFFFF",
            elements: [],
          },
          {
            pageNumber: 2,
            bounds: { x: 0, y: 0, width: 841.89, height: 595.28 },
            backgroundColor: "#F0F0F0",
            elements: [],
          },
        ],
        resources: {},
        diagnostics: { notices: [], warnings: [] },
      };

      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(mixedDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await zip.file("Contents/section0.xml")!.async("string");

      const secPrMatches = secXml.match(/<hp:secPr\b/g);
      expect(secPrMatches).toBeDefined();
      expect(secPrMatches!.length).toBe(2);

      // Page 1 is NARROWLY, Page 2 is WIDELY
      expect(secXml).toContain('landscape="NARROWLY" width="59528" height="84189"');
      expect(secXml).toContain('landscape="WIDELY" width="84189" height="59528"');
    });
  });

  // =========================================================================
  // 3. Real-World Fixture Conversion
  // =========================================================================
  describe("Track B: Real-World Fixture Integrity", () => {
    it("should convert real-world proposal doc fixture cleanly into DOCX and HWPX", async () => {
      const fixturePath = path.resolve(process.cwd(), "samples/real-world/sample-a-proposal-doc.json");
      expect(fs.existsSync(fixturePath)).toBe(true);

      const rawJson = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
      const parser = new FigmaCanvasParser({ titleOverride: "Real World Proposal" });
      const doc = parser.parse(rawJson);

      expect(doc.pages.length).toBe(1);
      expect(doc.pages[0].elements.length).toBeGreaterThanOrEqual(6);
      const textElements = doc.pages[0].elements.filter((e) => e.type === "text");
      expect(textElements.length).toBeGreaterThanOrEqual(4);

      // Render DOCX
      const docxRenderer = new DocxCanvasRenderer();
      const docxBuf = await docxRenderer.renderToBuffer(doc);
      expect(docxBuf.length).toBeGreaterThan(1000);
      const docxZip = await JSZip.loadAsync(docxBuf);
      const docxXml = await docxZip.file("word/document.xml")!.async("string");
      expect(docxXml).toContain("2026 차세대 엔터프라이즈 AI 자동화 구축 제안서");
      expect(docxXml).toContain("1. 핵심 기대 효과 및 도입 타당성");

      // Render HWPX
      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
      expect(hwpxBuf.length).toBeGreaterThan(1000);
      const hwpxZip = await JSZip.loadAsync(hwpxBuf);
      const hwpxSecXml = await hwpxZip.file("Contents/section0.xml")!.async("string");
      expect(hwpxSecXml).toContain("2026 차세대 엔터프라이즈 AI 자동화 구축 제안서");
      expect(hwpxSecXml).toContain("1. 핵심 기대 효과 및 도입 타당성");
    });
  });
});

