import { describe, it, expect } from "vitest";
import { SvgPath } from "../src/canvas/geometry/svgPathParser.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";
import JSZip from "jszip";

describe("Phase 16 H2 Document Format & Geometry Hardening Tests", () => {
  // =========================================================================
  // F-08: SVG Path Tokenizer Boundary Cases & Extrema Bounding Box
  // =========================================================================
  describe("F-08: SVG Path Tokenizer & Extrema Bounding Box", () => {
    it("should handle compact arc flags fused without spaces (e.g. A25 25 0 11 150 150)", () => {
      // 0 11 -> largeArcFlag=0, sweepFlag=1, followed by 1 (or 0 1 1)
      const d = "M 100 100 A 25 25 0 0 1 125 125 A 25 25 0 11 150 150";
      const parsed = SvgPath.parse(d);
      expect(parsed.commands.length).toBeGreaterThanOrEqual(3);
      // Ensure no NaN coordinates were produced
      for (const cmd of parsed.commands) {
        for (const pt of cmd.points) {
          expect(Number.isFinite(pt.x)).toBe(true);
          expect(Number.isFinite(pt.y)).toBe(true);
        }
      }
    });

    it("should handle negative coordinates without preceding space (e.g. L 100-50)", () => {
      const d = "M 0 0 L 100-50 L 50.5.5";
      const parsed = SvgPath.parse(d);
      expect(parsed.commands.length).toBe(3);
      expect(parsed.commands[1].points[0].x).toBe(100);
      expect(parsed.commands[1].points[0].y).toBe(-50);
      expect(parsed.commands[2].points[0].x).toBe(50.5);
      expect(parsed.commands[2].points[0].y).toBe(0.5);
    });

    it("should calculate exact extrema bounding box for cubic bezier curves", () => {
      // Curve: P0=(0,0), P1=(0,100), P2=(100,100), P3=(100,0)
      // At t=0.5: y = 0.125*0 + 0.375*100 + 0.375*100 + 0.125*0 = 75
      // Control points y reach 100, but curve apex is at y=75
      const d = "M 0 0 C 0 100 100 100 100 0";
      const parsed = SvgPath.parse(d);
      const bounds = parsed.getBounds();
      expect(bounds.minX).toBeCloseTo(0, 1);
      expect(bounds.maxX).toBeCloseTo(100, 1);
      expect(bounds.minY).toBeCloseTo(0, 1);
      // If extrema derivatives are used, maxY is 75. If only control points are used, maxY is 100.
      expect(bounds.maxY).toBeCloseTo(75, 1);
    });
  });

  // =========================================================================
  // F-05: Landscape & Dynamic Page Size in DOCX and HWPX
  // =========================================================================
  describe("F-05: Dynamic Page Size & Landscape Orientation", () => {
    const landscapeDoc: CanvasDocument = {
      title: "Landscape Test",
      pageSize: { name: "Custom", widthPt: 841.89, heightPt: 595.28, unit: "pt" }, // A4 landscape
      marginsPt: { top: 36, right: 36, bottom: 36, left: 36 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 841.89, height: 595.28 },
          elements: [
            {
              id: "card1",
              name: "Landscape Card",
              type: "card",
              bounds: { x: 50, y: 50, width: 700, height: 400 },
              zIndex: 1,
              style: { fillColor: "#EEEEEE" },
            },
          ],
        },
      ],
      resources: {},
      diagnostics: { notices: [], warnings: [] },
    };

    it("should emit landscape orientation and correct width/height in DOCX w:pgSz", async () => {
      const docxRenderer = new DocxCanvasRenderer();
      const docxBuf = await docxRenderer.renderToBuffer(landscapeDoc);
      const zip = await JSZip.loadAsync(docxBuf);
      const docXml = await zip.file("word/document.xml")!.async("string");

      // Verify w:pgSz
      const pgSzMatch = docXml.match(/<w:pgSz\b[^>]*\/?>/);
      expect(pgSzMatch).toBeDefined();
      const pgSzXml = pgSzMatch![0];
      expect(pgSzXml).toContain('w:orient="landscape"');
      // 841.89 * 20 = 16838 twips
      expect(pgSzXml).toContain('w:w="16838"');
      // 595.28 * 20 = 11906 twips
      expect(pgSzXml).toContain('w:h="11906"');
    });

    it("should emit landscape orientation and correct width/height in HWPX hp:pagePr", async () => {
      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(landscapeDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await zip.file("Contents/section0.xml")!.async("string");

      const pagePrMatch = secXml.match(/<hp:pagePr\b[^>]*\/?>/);
      expect(pagePrMatch).toBeDefined();
      const pagePrXml = pagePrMatch![0];
      // Landscape A4 in OWPML (KS X 6101): landscape="NARROWLY" and portrait-base dimensions (59528 x 84189)
      expect(pagePrXml).toContain('width="59528"');
      expect(pagePrXml).toContain('height="84189"');
      expect(pagePrXml).toContain('landscape="NARROWLY"');
    });
  });

  // =========================================================================
  // F-07: HWPX Image MIME and BinData Naming Integrity
  // =========================================================================
  describe("F-07: HWPX Image MIME and BinData Naming Integrity", () => {
    it("should preserve JPEG extension and MIME type in HWPX BinData and Manifest", async () => {
      const jpegDoc: CanvasDocument = {
        title: "JPEG Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "img1",
                name: "JPEG Photo",
                type: "image",
                bounds: { x: 50, y: 50, width: 200, height: 200 },
                zIndex: 1,
                style: {},
                imageRef: "photo.jpg",
              },
            ],
          },
        ],
        resources: {
          "photo.jpg": {
            id: "photo.jpg",
            name: "photo.jpg",
            mimeType: "image/jpeg",
            // Valid JPEG SOI/EOI dummy bytes
            data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]),
          },
        },
        diagnostics: { notices: [], warnings: [] },
      };

      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(jpegDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);

      // Verify BinData/ contains .jpg
      const files = Object.keys(zip.files);
      const binFile = files.find((f) => f.startsWith("BinData/BIN"));
      expect(binFile).toBeDefined();
      expect(binFile).toMatch(/\.jpg$/i);

      // Verify content.hpf has image/jpeg
      const hpfXml = await zip.file("Contents/content.hpf")!.async("string");
      expect(hpfXml).toContain('media-type="image/jpeg"');
    });
  });

  // =========================================================================
  // F-11: Support Missing Figma Vector Types (STAR, POLYGON, BOOLEAN_OPERATION)
  // =========================================================================
  describe("F-11: Figma Vector Types STAR, POLYGON, BOOLEAN_OPERATION", () => {
    it("should convert STAR, POLYGON, BOOLEAN_OPERATION to vector elements", () => {
      const figmaParser = new FigmaCanvasParser();
      const starNode = {
        id: "star:1",
        name: "Gold Star",
        type: "STAR",
        absoluteBoundingBox: { x: 10, y: 10, width: 50, height: 50 },
        fillGeometry: [{ path: "M 25 0 L 32 16 L 50 16 L 36 27 L 41 45 L 25 34 L 9 45 L 14 27 L 0 16 L 18 16 Z" }],
        fills: [{ type: "SOLID", color: { r: 1, g: 0.84, b: 0, a: 1 } }],
      };
      const polygonNode = {
        id: "poly:1",
        name: "Hexagon",
        type: "POLYGON",
        absoluteBoundingBox: { x: 70, y: 10, width: 60, height: 60 },
        fillGeometry: [{ path: "M 30 0 L 60 17 L 60 43 L 30 60 L 0 43 L 0 17 Z" }],
        fills: [{ type: "SOLID", color: { r: 0, g: 0.5, b: 1, a: 1 } }],
      };
      const boolNode = {
        id: "bool:1",
        name: "Union Shape",
        type: "BOOLEAN_OPERATION",
        booleanOperation: "UNION",
        absoluteBoundingBox: { x: 140, y: 10, width: 80, height: 40 },
        fillGeometry: [{ path: "M 0 0 L 80 0 L 80 40 L 0 40 Z" }],
        fills: [{ type: "SOLID", color: { r: 0.2, g: 0.8, b: 0.2, a: 1 } }],
      };

      const doc = figmaParser.parse({
        id: "0:0",
        name: "Vector Shapes",
        type: "DOCUMENT",
        children: [starNode, polygonNode, boolNode],
      } as any);

      expect(doc.pages[0].elements.length).toBe(3);
      for (const elem of doc.pages[0].elements) {
        expect(elem.type).toBe("vector");
        expect(elem.vectorPath).toBeDefined();
        expect(elem.vectorPath!.length).toBeGreaterThan(0);
      }
    });
  });
});
