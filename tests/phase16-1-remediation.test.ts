import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { CanvasDocument, CanvasElement } from "../src/canvas/types.js";

describe("Phase 16.1 Independent Audit Findings Remediation Tests", () => {
  // =========================================================================
  // 1. P0: Real Figma Input Landscape Handling (complex-nested-dashboard)
  // =========================================================================
  describe("P0: Real Figma Input Landscape Handling", () => {
    it("should dynamically detect landscape orientation and dimensions from top-level Figma frame", async () => {
      const samplePath = path.resolve(process.cwd(), "samples/synthetic-figma/complex-nested-dashboard.json");
      const rawJson = JSON.parse(fs.readFileSync(samplePath, "utf-8"));

      const parser = new FigmaCanvasParser({ titleOverride: "Dashboard Landscape" });
      const doc = parser.parse(rawJson);

      // Frame is 842 x 595 (A4 landscape ratio)
      expect(doc.pageSize.widthPt).toBeGreaterThan(doc.pageSize.heightPt);
      expect(doc.pageSize.widthPt).toBeCloseTo(841.89, 0);
      expect(doc.pageSize.heightPt).toBeCloseTo(595.28, 0);
      expect(doc.pageSize.orientation).toBe("landscape");

      // Verify DOCX Output has landscape orientation and matching twip dimensions
      const docxRenderer = new DocxCanvasRenderer();
      const docxBuf = await docxRenderer.renderToBuffer(doc);
      const docxZip = await JSZip.loadAsync(docxBuf);
      const docXml = await docxZip.file("word/document.xml")!.async("string");

      const pgSzMatch = docXml.match(/<w:pgSz\b[^>]*\/?>/);
      expect(pgSzMatch).toBeDefined();
      expect(pgSzMatch![0]).toContain('w:orient="landscape"');
      expect(pgSzMatch![0]).toContain('w:w="16838"');
      expect(pgSzMatch![0]).toContain('w:h="11906"');

      // Verify HWPX Output has WIDELY and matching HWPU dimensions
      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
      const hwpxZip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

      const pagePrMatch = secXml.match(/<hp:pagePr\b[^>]*\/?>/);
      expect(pagePrMatch).toBeDefined();
      expect(pagePrMatch![0]).toContain('landscape="WIDELY"');
      expect(pagePrMatch![0]).toContain('width="84189"');
      expect(pagePrMatch![0]).toContain('height="59528"');
    });

    it("should preserve portrait A4 dimensions for portrait documents (multi-page-report)", () => {
      const samplePath = path.resolve(process.cwd(), "samples/synthetic-figma/multi-page-report.json");
      const rawJson = JSON.parse(fs.readFileSync(samplePath, "utf-8"));

      const parser = new FigmaCanvasParser({ titleOverride: "Multi-page Portrait" });
      const doc = parser.parse(rawJson);

      expect(doc.pageSize.heightPt).toBeGreaterThan(doc.pageSize.widthPt);
      expect(doc.pageSize.widthPt).toBeCloseTo(595.28, 0);
      expect(doc.pageSize.heightPt).toBeCloseTo(841.89, 0);
      expect(doc.pageSize.orientation).toBe("portrait");
    });
  });

  // =========================================================================
  // 2. P1: HWPX Multi-Subpath and Open Path Separation
  // =========================================================================
  describe("P1: HWPX Multi-Subpath and Open Path", () => {
    it("should emit multiple disconnected subpaths as separate HWPX polygons", async () => {
      const compoundDoc: CanvasDocument = {
        title: "Compound Subpath Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "vec1",
                name: "Two Boxes",
                type: "vector",
                bounds: { x: 50, y: 50, width: 200, height: 100 },
                zIndex: 1,
                style: { fillColor: "#00FF00", strokeColor: "#000000", strokeWidth: 1 },
                rawSvgPath: "M 0 0 L 50 0 L 50 50 L 0 50 Z M 100 0 L 150 0 L 150 50 L 100 50 Z",
              },
            ],
          },
        ],
        resources: {},
        diagnostics: { notices: [], warnings: [] },
      };

      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(compoundDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await zip.file("Contents/section0.xml")!.async("string");

      const polygonMatches = secXml.match(/<hp:polygon\b/g);
      expect(polygonMatches).toBeDefined();
      expect(polygonMatches!.length).toBe(2);
    });

    it("should preserve open paths (like checkmarks) without closing lines or spurious fills", async () => {
      const checkmarkDoc: CanvasDocument = {
        title: "Checkmark Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "check1",
                name: "Checkmark",
                type: "vector",
                bounds: { x: 50, y: 50, width: 100, height: 100 },
                zIndex: 1,
                style: { strokeColor: "#0000FF", strokeWidth: 2 },
                rawSvgPath: "M 10 50 L 40 80 L 90 20",
              },
            ],
          },
        ],
        resources: {},
        diagnostics: { notices: [], warnings: [] },
      };

      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(checkmarkDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await zip.file("Contents/section0.xml")!.async("string");

      // Open paths must NOT be emitted as <hp:polygon> (which auto-closes in Hancom)
      expect(secXml).not.toContain("<hp:polygon");
      const lineMatches = secXml.match(/<hp:line\b/g);
      expect(lineMatches).toBeDefined();
      expect(lineMatches!.length).toBe(2);
      expect(secXml).toContain('<hc:pt0 x="0" y="5000"/>');
      expect(secXml).toContain('<hc:pt1 x="3750" y="10000"/>');
      expect(secXml).toContain('<hc:pt1 x="10000" y="0"/>');
    });

    it("should distinguish closed vs open subpaths in mixed multi-contour paths", async () => {
      const mixedDoc: CanvasDocument = {
        title: "Mixed Path Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "mix1",
                name: "Circle and Line",
                type: "vector",
                bounds: { x: 50, y: 50, width: 200, height: 200 },
                zIndex: 1,
                style: { fillColor: "#FF0000", strokeColor: "#000000", strokeWidth: 1 },
                // Closed outer box + open inner slash
                rawSvgPath: "M 0 0 L 100 0 L 100 100 L 0 100 Z M 20 20 L 80 80",
              },
            ],
          },
        ],
        resources: {},
        diagnostics: { notices: [], warnings: [] },
      };

      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(mixedDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await zip.file("Contents/section0.xml")!.async("string");

      // Closed box is emitted as <hp:polygon> with fill; open slash is emitted as <hp:line> without fill
      const polygonMatches = secXml.match(/<hp:polygon\b/g);
      expect(polygonMatches).toBeDefined();
      expect(polygonMatches!.length).toBe(1);

      const lineMatches = secXml.match(/<hp:line\b/g);
      expect(lineMatches).toBeDefined();
      expect(lineMatches!.length).toBe(1);

      expect(secXml).toContain('<hc:winBrush faceColor="#FF0000"');
      expect(secXml).toContain('<hc:pt0 x="4000" y="4000"/>');
      expect(secXml).toContain('<hc:pt1 x="16000" y="16000"/>');
    });
  });

  // =========================================================================
  // 3. P1: Image FILL Crop Verification
  // =========================================================================
  describe("P1: Image FILL Crop Verification", () => {
    const widePngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0xc8, // width = 200
      0x00, 0x00, 0x00, 0x64, // height = 100
      0x08, 0x02, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);

    const tallPngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x64, // width = 100
      0x00, 0x00, 0x00, 0xc8, // height = 200
      0x08, 0x02, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);

    it("should calculate correct imgClip bounds for horizontal overflow in HWPX (left & right crop)", async () => {
      const imageDoc: CanvasDocument = {
        title: "Crop Test Wide",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "img1",
                name: "Wide Image in Square Box",
                type: "image",
                bounds: { x: 50, y: 50, width: 100, height: 100 },
                zIndex: 1,
                style: {},
                imageRef: "sample_wide.png",
              },
            ],
          },
        ],
        resources: {
          "sample_wide.png": {
            id: "sample_wide.png",
            name: "sample_wide.png",
            mimeType: "image/png",
            data: widePngBytes,
          },
        },
        diagnostics: { notices: [], warnings: [] },
      };

      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(imageDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await zip.file("Contents/section0.xml")!.async("string");

      const imgClipMatch = secXml.match(/<hp:imgClip\s+([^>]+)\/>/);
      expect(imgClipMatch).toBeDefined();
      const clipAttrs = imgClipMatch![1];

      const leftVal = parseInt(clipAttrs.match(/left="(\d+)"/)![1], 10);
      const rightVal = parseInt(clipAttrs.match(/right="(\d+)"/)![1], 10);
      expect(leftVal).toBeGreaterThan(0);
      expect(rightVal).toBeLessThan(20000);
    });

    it("should calculate correct imgClip bounds for vertical overflow in HWPX (top & bottom crop)", async () => {
      const imageDoc: CanvasDocument = {
        title: "Crop Test Tall",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "img2",
                name: "Tall Image in Square Box",
                type: "image",
                bounds: { x: 50, y: 50, width: 100, height: 100 },
                zIndex: 1,
                style: {},
                imageRef: "sample_tall.png",
              },
            ],
          },
        ],
        resources: {
          "sample_tall.png": {
            id: "sample_tall.png",
            name: "sample_tall.png",
            mimeType: "image/png",
            data: tallPngBytes,
          },
        },
        diagnostics: { notices: [], warnings: [] },
      };

      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(imageDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await zip.file("Contents/section0.xml")!.async("string");

      const imgClipMatch = secXml.match(/<hp:imgClip\s+([^>]+)\/>/);
      expect(imgClipMatch).toBeDefined();
      const clipAttrs = imgClipMatch![1];

      const topVal = parseInt(clipAttrs.match(/top="(\d+)"/)![1], 10);
      const bottomVal = parseInt(clipAttrs.match(/bottom="(\d+)"/)![1], 10);
      expect(topVal).toBeGreaterThan(0);
      expect(bottomVal).toBeLessThan(20000);
    });
  });

  // =========================================================================
  // 4. P1: Text Vertical Alignment F-12
  // =========================================================================
  describe("P1: Text Vertical Alignment F-12", () => {
    it("should preserve TOP, CENTER, BOTTOM alignment across Canvas IR, DOCX, and HWPX", async () => {
      const figmaParser = new FigmaCanvasParser();
      const textTop = {
        id: "text:top",
        name: "Top Text",
        type: "TEXT",
        characters: "Top Aligned",
        absoluteBoundingBox: { x: 50, y: 50, width: 200, height: 80 },
        style: { fontSize: 14, fontFamily: "Calibri", textAlignVertical: "TOP" },
      };
      const textCenter = {
        id: "text:center",
        name: "Center Text",
        type: "TEXT",
        characters: "Center Aligned",
        absoluteBoundingBox: { x: 50, y: 150, width: 200, height: 80 },
        style: { fontSize: 14, fontFamily: "Calibri", textAlignVertical: "CENTER" },
      };
      const textBottom = {
        id: "text:bottom",
        name: "Bottom Text",
        type: "TEXT",
        characters: "Bottom Aligned",
        absoluteBoundingBox: { x: 50, y: 250, width: 200, height: 80 },
        style: { fontSize: 14, fontFamily: "Calibri", textAlignVertical: "BOTTOM" },
      };

      const doc = figmaParser.parse({
        id: "0:0",
        name: "Vertical Align Comparison",
        type: "DOCUMENT",
        children: [textTop, textCenter, textBottom],
      } as any);

      expect(doc.pages[0].elements[0].verticalAlign).toBe("top");
      expect(doc.pages[0].elements[1].verticalAlign).toBe("center");
      expect(doc.pages[0].elements[2].verticalAlign).toBe("bottom");

      // Verify DOCX VML emits exact v-text-anchor tags
      const docxRenderer = new DocxCanvasRenderer();
      const docxBuf = await docxRenderer.renderToBuffer(doc);
      const docxZip = await JSZip.loadAsync(docxBuf);
      const docXml = await docxZip.file("word/document.xml")!.async("string");
      expect(docXml).toContain("v-text-anchor:top");
      expect(docXml).toContain("v-text-anchor:middle");
      expect(docXml).toContain("v-text-anchor:bottom");

      // Verify HWPX emits exact vertAlign attributes
      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
      const hwpxZip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");
      expect(secXml).toContain('vertAlign="TOP"');
      expect(secXml).toContain('vertAlign="CENTER"');
      expect(secXml).toContain('vertAlign="BOTTOM"');
    });
  });

  // =========================================================================
  // 5. P2: HWPX Rounded Corners F-13
  // =========================================================================
  describe("P2: HWPX Rounded Corners F-13", () => {
    it("should compute accurate ratio for cornerRadius=0, 8, 24 and cards with stroke & fill", async () => {
      const cardsDoc: CanvasDocument = {
        title: "Corner Radius Scale Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "c0",
                name: "Sharp Rect (r=0)",
                type: "card",
                bounds: { x: 50, y: 50, width: 100, height: 100 },
                zIndex: 1,
                style: { fillColor: "#FFFFFF", cornerRadius: 0 },
              },
              {
                id: "c8",
                name: "Round Card (r=8)",
                type: "card",
                bounds: { x: 50, y: 160, width: 100, height: 100 },
                zIndex: 2,
                style: { fillColor: "#F0F0F0", strokeColor: "#000000", strokeWidth: 1, cornerRadius: 8 },
              },
              {
                id: "c24",
                name: "Round Card (r=24)",
                type: "card",
                bounds: { x: 50, y: 270, width: 100, height: 100 },
                zIndex: 3,
                style: { fillColor: "#E0E0E0", strokeColor: "#000000", strokeWidth: 1, cornerRadius: 24 },
              },
            ],
          },
        ],
        resources: {},
        diagnostics: { notices: [], warnings: [] },
      };

      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(cardsDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await zip.file("Contents/section0.xml")!.async("string");

      const rectMatches = Array.from(secXml.matchAll(/<hp:rect\b[^>]*\bratio="(\d+)"/g));
      expect(rectMatches.length).toBe(3);

      const ratio0 = parseInt(rectMatches[0][1], 10);
      const ratio8 = parseInt(rectMatches[1][1], 10);
      const ratio24 = parseInt(rectMatches[2][1], 10);

      expect(ratio0).toBe(0);
      expect(ratio8).toBeGreaterThan(0);
      expect(ratio24).toBeGreaterThan(ratio8);
    });
  });
});
