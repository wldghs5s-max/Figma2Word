import { describe, it, expect } from "vitest";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { DocxCanvasParser } from "../src/canvas/parser/docxCanvasParser.js";
import { SvgPath } from "../src/canvas/geometry/svgPathParser.js";
import { CanvasDocument, CanvasElement } from "../src/canvas/types.js";
import JSZip from "jszip";

describe("Phase 16 H1 Remediation Tests", () => {
  // =========================================================================
  // F-03: VML Absolute Coordinate Reverse-Parsing Error
  // =========================================================================
  describe("F-03: VML Path Parser & Absolute Coordinate Handling", () => {
    it("should parse VML lowercase m, l, c as absolute coordinates rather than SVG relative coordinates", async () => {
      // VML path for a triangle or rectangle
      // In VML: m 0,0 (move to 0,0), l 1000,0 (line to 1000,0), l 1000,1000 (line to 1000,1000)
      const vmlDocxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:v="urn:schemas-microsoft-com:vml">
  <w:body>
    <w:p>
      <w:r>
        <w:pict>
          <v:shape id="shape1"
                   style="position:absolute;left:10pt;top:10pt;width:100pt;height:100pt;z-index:1"
                   coordsize="1000,1000"
                   path="m 0,0 l 1000,0 l 1000,1000 x e"
                   filled="t" fillcolor="#FF0000"/>
        </w:pict>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const zip = new JSZip();
      zip.file("word/document.xml", vmlDocxXml);
      const docxBuffer = await zip.generateAsync({ type: "nodebuffer" });

      const parser = new DocxCanvasParser();
      const doc = await parser.parse(docxBuffer);

      expect(doc.pages[0].elements.length).toBe(1);
      const vectorElem = doc.pages[0].elements[0];
      expect(vectorElem.type).toBe("vector");
      expect(vectorElem.vectorPoints).toBeDefined();

      // If incorrectly treated as SVG relative:
      // Point 0: (0, 0)
      // Point 1: (0+1000, 0+0) = (1000, 0) -> in HWPU: width*100 = 10000
      // Point 2: (1000+1000, 0+1000) = (2000, 1000) -> X would be 20000!
      // But width is 100pt -> 10000 HWPU.
      // Point 2 X must be at or within 10000 HWPU (not 20000)!
      const points = vectorElem.vectorPoints!;
      // Point 0: (0, 0)
      // Point 1: (1000, 0) -> should be (10000, 0) HWPU
      // Point 2: (1000, 1000) -> should be (10000, 10000) HWPU
      expect(points.length).toBeGreaterThanOrEqual(3);
      expect(points[1].x).toBe(10000); // Fails if relative 'l' caused width to be 2000 and point 1 to be 5000!
      expect(points[2].x).toBe(10000);
      expect(points[2].y).toBe(10000);
    });
  });

  // =========================================================================
  // F-02: Multiline Text Preservation (\n in DOCX and HWPX)
  // =========================================================================
  describe("F-02: Multiline Text Preservation in DOCX and HWPX", () => {
    const multilineDoc: CanvasDocument = {
      title: "Multiline Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "txt-multiline",
              name: "Multiline Text",
              type: "text",
              bounds: { x: 50, y: 50, width: 300, height: 100 },
              zIndex: 1,
              style: {},
              textRuns: [
                {
                  text: "Line 1: Heading\nLine 2: Subtitle\n\nLine 4: After empty line",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 12,
                  fontWeight: 400,
                  color: "#333333",
                },
              ],
            },
          ],
        },
      ],
      resources: {},
      diagnostics: { notices: [], warnings: [] },
    };

    it("should render <w:br/> in DOCX for newlines and preserve newlines in reverse parse", async () => {
      const docxRenderer = new DocxCanvasRenderer();
      const docxBuf = await docxRenderer.renderToBuffer(multilineDoc);
      const zip = await JSZip.loadAsync(docxBuf);
      const docXml = await zip.file("word/document.xml")!.async("string");

      // Verify that <w:br/> tags are generated
      expect(docXml).toContain("<w:br/>");

      // Verify roundtrip preservation
      const docxParser = new DocxCanvasParser();
      const parsedDoc = await docxParser.parse(docxBuf);
      const textElem = parsedDoc.pages[0].elements[0];
      expect(textElem.textRuns).toBeDefined();
      const fullText = textElem.textRuns!.map((r) => r.text).join("");
      expect(fullText).toContain("\n");
      expect(fullText).toContain("Line 1: Heading");
      expect(fullText).toContain("Line 2: Subtitle");
      expect(fullText).toContain("Line 4: After empty line");
    });

    it("should render multiple paragraphs (<hp:p>) in HWPX for newlines inside textbox", async () => {
      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(multilineDoc);
      const zip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await zip.file("Contents/section0.xml")!.async("string");

      // In HWPX <hp:subList>, each newline should create a new <hp:p>
      const pMatches = secXml.match(/<hp:p\b/g);
      // There should be multiple <hp:p> tags inside the section (page container + multiple textbox lines)
      expect(pMatches).toBeDefined();
      expect(pMatches!.length).toBeGreaterThanOrEqual(4);
      expect(secXml).toContain("Line 1: Heading");
      expect(secXml).toContain("Line 2: Subtitle");
      expect(secXml).toContain("Line 4: After empty line");
    });
  });

  // =========================================================================
  // F-01: Environment-Independent Base64 and Binary Decoding (No global Buffer crash)
  // =========================================================================
  describe("F-01: Browser Buffer Dependency Elimination", () => {
    it("should decode image data without relying on global Buffer", () => {
      const figmaParser = new FigmaCanvasParser({
        imageMap: {
          ref1: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        },
      });

      const figmaNode = {
        id: "1:1",
        name: "Image Node",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        fills: [{ type: "IMAGE", imageRef: "ref1", scaleMode: "FILL" }],
      };

      const doc = figmaParser.parse({
        id: "0:0",
        name: "Doc",
        type: "DOCUMENT",
        children: [figmaNode],
      } as any);

      expect(doc.resources["image1.png"]).toBeDefined();
      const res = doc.resources["image1.png"];
      // data should be a valid Uint8Array
      expect(res.data).toBeInstanceOf(Uint8Array);
      expect(res.data.length).toBeGreaterThan(10);
      // PNG magic number check
      expect(res.data[0]).toBe(0x89);
      expect(res.data[1]).toBe(0x50);
      expect(res.data[2]).toBe(0x4e);
      expect(res.data[3]).toBe(0x47);
    });
  });

  // =========================================================================
  // F-06: Remote Image Fills in Web UI & CLI
  // =========================================================================
  describe("F-06: Remote Image URL Resolution", () => {
    it("should resolve remote AWS S3 URLs to Base64 data URLs via resolveImageMapUrls", async () => {
      const mockRawImageMap: Record<string, string> = {
        "img-1": "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/abc-123",
        "img-2": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      };

      const mockDownloader = async (url: string) => {
        expect(url).toContain("figma-alpha-api");
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      };

      const { resolveImageMapUrls } = await import("../src/canvas/utils/imageResolver.js");
      const resolved = await resolveImageMapUrls(mockRawImageMap, mockDownloader);

      expect(resolved["img-1"]).toMatch(/^data:image\/png;base64,/);
      expect(resolved["img-2"]).toMatch(/^data:image\/png;base64,/);

      // Now pass to FigmaCanvasParser
      const figmaParser = new FigmaCanvasParser({ imageMap: resolved });
      const doc = figmaParser.parse({
        id: "0:0",
        name: "Doc",
        type: "DOCUMENT",
        children: [
          {
            id: "1:1",
            name: "Image 1",
            type: "RECTANGLE",
            absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
            fills: [{ type: "IMAGE", imageRef: "img-1", scaleMode: "FILL" }],
          },
        ],
      } as any);

      expect(doc.resources["image1.png"]).toBeDefined();
      expect(doc.resources["image1.png"].data.length).toBeGreaterThan(10);
      expect(doc.resources["image1.png"].data[0]).toBe(0x89);
    });
  });
});

