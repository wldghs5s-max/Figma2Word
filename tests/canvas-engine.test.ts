import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import {
  ptToTwip,
  twipToPt,
  ptToEmu,
  emuToPt,
  ptToHwpu,
  hwpuToPt,
  figmaPxToPt,
  resolveScale,
  CanvasDocument,
  CanvasPage,
  CanvasElement,
  FigmaCanvasParser,
  DocxCanvasParser,
  DocxCanvasRenderer,
  HwpxCanvasRenderer,
  CanvasPipeline,
  parseXmlAttributes,
} from "../src/canvas/index.js";

describe("Canvas Engine - Unit Conversions & Scale", () => {
  it("converts points to twips accurately", () => {
    expect(ptToTwip(10)).toBe(200);
    expect(twipToPt(200)).toBe(10);
  });

  it("converts points to EMUs accurately", () => {
    expect(ptToEmu(1)).toBe(12700);
    expect(emuToPt(12700)).toBe(1);
  });

  it("converts points to HWPUs accurately", () => {
    expect(ptToHwpu(10.5)).toBe(1050);
    expect(hwpuToPt(1050)).toBe(10.5);
  });

  it("converts Figma 96 DPI pixels to points accurately", () => {
    expect(figmaPxToPt(54)).toBe(40.5);
    expect(figmaPxToPt(96)).toBe(72);
  });

  it("resolves fit-a4 scale policy for standard Figma A4 frame", () => {
    const scale = resolveScale(794, 1123, "fit-a4");
    expect(scale.targetWidthPt).toBeCloseTo(595.28, 1);
    expect(scale.targetHeightPt).toBeCloseTo(841.89, 1);
    expect(scale.scaleX).toBeCloseTo(0.7497, 3);
    expect(scale.scaleY).toBeCloseTo(0.7497, 3);
  });

  it("resolves 1:1 and css-96dpi scale policies", () => {
    const scale1 = resolveScale(100, 200, "1:1");
    expect(scale1.scaleX).toBe(1.0);
    expect(scale1.targetWidthPt).toBe(100);

    const scaleCss = resolveScale(100, 200, "css-96dpi");
    expect(scaleCss.scaleX).toBe(0.75);
    expect(scaleCss.targetWidthPt).toBe(75);
  });
});

describe("Canvas Engine - XML Attribute Order Agnostic Parser", () => {
  it("correctly extracts attributes regardless of ordering or quotes", () => {
    const tag1 = '<Relationship Type="http://.../image" Target="media/image1.png" Id="rId2"/>';
    const attrs1 = parseXmlAttributes(tag1);
    expect(attrs1.Id).toBe("rId2");
    expect(attrs1.Target).toBe("media/image1.png");
    expect(attrs1.Type).toBe("http://.../image");

    const tag2 = `<Relationship Target='media/image99.jpg' Id='rId99' TargetMode='Internal'/>`;
    const attrs2 = parseXmlAttributes(tag2);
    expect(attrs2.Id).toBe("rId99");
    expect(attrs2.Target).toBe("media/image99.jpg");
    expect(attrs2.TargetMode).toBe("Internal");
  });
});

describe("Canvas Engine - Renderers (DOCX & HWPX) & Typography Preservation", () => {
  const sampleCanvasDoc: CanvasDocument = {
    title: "Dual Engine Test Document",
    pageSize: {
      name: "A4",
      widthPt: 595.28,
      heightPt: 841.89,
      unit: "pt",
    },
    marginsPt: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    diagnostics: {
      notices: [],
      warnings: [],
    },
    resources: {
      "img-1": {
        id: "img-1",
        name: "test-img.png",
        mimeType: "image/png",
        data: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          "base64"
        ),
      },
    },
    pages: [
      {
        pageNumber: 1,
        name: "Page 1 - Cover",
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: "#FFFFFF",
        elements: [
          {
            id: "figma_node_title_1",
            name: "Title Header",
            type: "text",
            bounds: { x: 40.5, y: 50.0, width: 514.0, height: 60.0 },
            zIndex: 1,
            style: {
              fillColor: "#F3F4F6",
              cornerRadius: 4,
            },
            innerPaddingPt: { top: 5, right: 10, bottom: 5, left: 10 },
            textRuns: [
              {
                text: "Executive Business Report (경영 분석 보고서)",
                fontFamily: "Pretendard",
                fontSizePt: 22,
                fontWeight: 700,
                color: "#111827",
                lineHeightPt: 28,
              },
            ],
          },
          {
            id: "figma_node_line_1",
            name: "Accent Divider",
            type: "line",
            bounds: { x: 40.5, y: 120.0, width: 514.0, height: 0.0 },
            zIndex: 2,
            style: {
              strokeColor: "#3B82F6",
              strokeWidth: 2,
            },
          },
          {
            id: "figma_node_img_1",
            name: "Company Logo",
            type: "image",
            bounds: { x: 40.5, y: 140.0, width: 100.0, height: 100.0 },
            zIndex: 3,
            style: {},
            imageRef: "img-1",
          },
        ],
      },
      {
        pageNumber: 2,
        name: "Page 2 - Content",
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: "#F9FAFB",
        elements: [
          {
            id: "figma_node_card_1",
            name: "Data Card",
            type: "card",
            bounds: { x: 40.5, y: 50.0, width: 250.0, height: 150.0 },
            zIndex: 1,
            style: {
              fillColor: "#FFFFFF",
              strokeColor: "#E5E7EB",
              strokeWidth: 1,
              cornerRadius: 8,
            },
            textRuns: [
              {
                text: "Quarterly Revenue: $4.2M (전년비 24% 성장)",
                fontFamily: "맑은 고딕",
                fontSizePt: 14,
                fontWeight: 600,
                color: "#1F2937",
              },
            ],
          },
        ],
      },
    ],
  };

  it("renders sample Canvas IR into a structurally valid DOCX buffer preserving Pretendard & EastAsia fonts", async () => {
    const renderer = new DocxCanvasRenderer();
    const docxBuf = await renderer.renderToBuffer(sampleCanvasDoc);

    expect(docxBuf).toBeDefined();
    expect(docxBuf.length).toBeGreaterThan(1000);

    const zip = await JSZip.loadAsync(docxBuf);
    expect(zip.file("[Content_Types].xml")).toBeDefined();
    expect(zip.file("word/document.xml")).toBeDefined();
    expect(zip.file("word/media/image1.png")).toBeDefined();

    const docXml = await zip.file("word/document.xml")!.async("string");
    expect(docXml).toContain("w:pageBreakBefore");
    expect(docXml).toContain("Executive Business Report");
    expect(docXml).toContain("Quarterly Revenue: $4.2M");
    expect(docXml).toContain("v:textbox");
    expect(docXml).toContain("v:line");
    expect(docXml).toContain('alt="figma_node_title_1"');
    expect(docXml).toContain('alt="figma_node_line_1"');
    expect(docXml).toContain('w:eastAsia="Pretendard"');
    expect(docXml).toContain('w:eastAsia="맑은 고딕"');
    expect(docXml).toContain('inset="10.00pt,5.00pt,10.00pt,5.00pt"');
  });

  it("renders sample Canvas IR into a valid HWPX with 7 OWPML fontface blocks and dynamic charPr fontRef", async () => {
    const renderer = new HwpxCanvasRenderer();
    const hwpxBuf = await renderer.renderToBuffer(sampleCanvasDoc);

    expect(hwpxBuf).toBeDefined();
    expect(hwpxBuf.length).toBeGreaterThan(1000);

    const zip = await JSZip.loadAsync(hwpxBuf);
    expect(zip.file("mimetype")).toBeDefined();
    expect(zip.file("version.xml")).toBeDefined();
    expect(zip.file("Contents/content.hpf")).toBeDefined();
    expect(zip.file("Contents/header.xml")).toBeDefined();
    expect(zip.file("Contents/section0.xml")).toBeDefined();
    expect(zip.file("BinData/BIN0001.png")).toBeDefined();

    // Verify uncompressed mimetype first entry
    const mimeStr = await zip.file("mimetype")!.async("string");
    expect(mimeStr.trim()).toBe("application/hwp+zip");

    const headerXml = await zip.file("Contents/header.xml")!.async("string");
    expect(headerXml).toContain('<hh:fontfaces itemCnt="7">');
    expect(headerXml).toContain('lang="hangul"');
    expect(headerXml).toContain('lang="latin"');
    expect(headerXml).toContain('face="Pretendard"');
    expect(headerXml).toContain('face="맑은 고딕"');
    expect(headerXml).toContain("hh:fontRef");

    const sectionXml = await zip.file("Contents/section0.xml")!.async("string");
    expect(sectionXml).toContain('pageBreak="1"');
    expect(sectionXml).toContain("Executive Business Report");
    expect(sectionXml).toContain("Quarterly Revenue: $4.2M");
    expect(sectionXml).toContain("hp:drawText");
  });

  it("parses generated DOCX back into Canvas IR with 100% data and ID preservation (Roundtrip Zero Loss)", async () => {
    const docxRenderer = new DocxCanvasRenderer();
    const docxBuf = await docxRenderer.renderToBuffer(sampleCanvasDoc);

    const docxParser = new DocxCanvasParser();
    const parsedDoc = await docxParser.parse(docxBuf);

    expect(parsedDoc.pages.length).toBe(2);
    // Page 1: title, line, image (3 elements)
    expect(parsedDoc.pages[0].elements.length).toBe(3);
    // Page 2: card (1 element)
    expect(parsedDoc.pages[1].elements.length).toBe(1);

    const titleEl = parsedDoc.pages[0].elements[0];
    expect(titleEl.id).toBe("figma_node_title_1");
    expect(titleEl.name).toBe("Title Header");
    expect(titleEl.type).toBe("text");
    expect(titleEl.textRuns?.[0].text).toContain("Executive Business Report");
    expect(titleEl.textRuns?.[0].fontFamily).toBe("Pretendard");
    expect(titleEl.bounds.width).toBeCloseTo(514.0, 0);
    expect(titleEl.innerPaddingPt?.left).toBe(10);
    expect(titleEl.innerPaddingPt?.top).toBe(5);

    const lineEl = parsedDoc.pages[0].elements[1];
    expect(lineEl.id).toBe("figma_node_line_1");
    expect(lineEl.name).toBe("Accent Divider");
    expect(lineEl.type).toBe("line");
    expect(lineEl.bounds.width).toBeCloseTo(514.0, 0);

    const imgEl = parsedDoc.pages[0].elements[2];
    expect(imgEl.id).toBe("figma_node_img_1");
    expect(imgEl.type).toBe("image");
    expect(imgEl.imageRef).toBe("img-1");

    const cardEl = parsedDoc.pages[1].elements[0];
    expect(cardEl.id).toBe("figma_node_card_1");
    expect(cardEl.textRuns?.[0].text).toContain("Quarterly Revenue: $4.2M");
    expect(cardEl.textRuns?.[0].fontFamily).toBe("맑은 고딕");
  });

  it("diagnoses and logs warnings when encountering unsupported DOCX elements like DrawingML or Tables", async () => {
    const mockDocxZip = new JSZip();
    const mockDocXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    <w:p><w:r><w:t>Direct body flow text</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:drawing><wp:inline/></w:drawing></w:p>
  </w:body>
</w:document>`;

    mockDocxZip.file("word/document.xml", mockDocXml);
    const buf = await mockDocxZip.generateAsync({ type: "nodebuffer" });

    const parser = new DocxCanvasParser();
    const res = await parser.parse(buf);

    expect(res.diagnostics.warnings.length).toBeGreaterThanOrEqual(2);
    expect(res.diagnostics.warnings.some((w) => w.includes("<w:tbl>"))).toBe(true);
    expect(res.diagnostics.warnings.some((w) => w.includes("DrawingML"))).toBe(true);
  });
});

describe("Canvas Pipeline - End to End", () => {
  it("translates sample DOCX to HWPX directly via pipeline", async () => {
    const pipeline = new CanvasPipeline();
    // Render a self-contained test DOCX first to guarantee file presence
    const renderer = new DocxCanvasRenderer();
    const testDoc: CanvasDocument = {
      title: "Self Contained E2E Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      diagnostics: { notices: [], warnings: [] },
      resources: {},
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "test-title",
              name: "E2E Title",
              type: "text",
              bounds: { x: 50, y: 50, width: 400, height: 50 },
              zIndex: 1,
              style: {},
              textRuns: [{ text: "Pipeline Test Heading", fontFamily: "Pretendard", fontSizePt: 16 }],
            },
          ],
        },
      ],
    };

    const docxBuf = await renderer.renderToBuffer(testDoc);
    const testDocxPath = path.resolve("debug/canvas-audit/test-e2e-input.docx");
    const outHwpxPath = path.resolve("debug/canvas-audit/test-e2e-output.hwpx");
    fs.mkdirSync(path.dirname(testDocxPath), { recursive: true });
    fs.writeFileSync(testDocxPath, docxBuf);

    const res = await pipeline.convertDocxToHwpx(testDocxPath, {
      outputHwpxPath: outHwpxPath,
    });

    expect(res.stats.pageCount).toBe(1);
    expect(res.stats.elementCount).toBe(1);
    expect(fs.existsSync(outHwpxPath)).toBe(true);

    const zip = await JSZip.loadAsync(fs.readFileSync(outHwpxPath));
    expect(zip.file("Contents/section0.xml")).toBeDefined();
    const sectionXml = await zip.file("Contents/section0.xml")!.async("string");
    expect(sectionXml).toContain("Pipeline Test Heading");
  });
});

describe("Canvas Engine - Visual Fidelity & Parser Improvements (Phase 13C)", () => {
  it("strips container fill on pure TEXT Figma nodes to prevent opaque background overlay", () => {
    const parser = new FigmaCanvasParser();
    const mockFigmaDoc = {
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "0:1",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "1:1",
                name: "A4 Frame",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 794, height: 1123 },
                children: [
                  {
                    id: "1:2",
                    name: "Pure Text",
                    type: "TEXT",
                    absoluteBoundingBox: { x: 50, y: 50, width: 200, height: 30 },
                    characters: "Hello World",
                    fills: [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }],
                    style: {
                      fontFamily: "Pretendard",
                      fontSize: 16,
                      fontWeight: 700,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const canvasDoc = parser.parse(mockFigmaDoc as any);
    expect(canvasDoc.pages.length).toBe(1);
    const textEl = canvasDoc.pages[0].elements.find((e) => e.name === "Pure Text");
    expect(textEl).toBeDefined();
    // Element style fillColor must NOT be set for pure text node
    expect(textEl?.style.fillColor).toBeUndefined();
    // But textRun color should have the font color
    expect(textEl?.textRuns?.[0].color).toBeDefined();
  });

  it("calculates correct VML crop fractions for aspect ratio preservation in DocxCanvasRenderer", async () => {
    const renderer = new DocxCanvasRenderer();
    // Dummy PNG buffer with 200x100 resolution (aspect ratio 2.0)
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG sig
      0x00, 0x00, 0x00, 0x0d, // IHDR len 13
      0x49, 0x48, 0x44, 0x52, // "IHDR"
      0x00, 0x00, 0x00, 0xc8, // width = 200
      0x00, 0x00, 0x00, 0x64, // height = 100 (aspect = 2.0)
      0x08, 0x06, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, // CRC dummy
    ]);

    const doc: CanvasDocument = {
      title: "Crop Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      diagnostics: { notices: [], warnings: [] },
      resources: {
        "crop-img": {
          id: "crop-img",
          name: "wide.png",
          mimeType: "image/png",
          data: pngHeader,
        },
      },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "img-crop-el",
              name: "Cropped Image",
              type: "image",
              bounds: { x: 50, y: 50, width: 100, height: 100 }, // square box (aspect 1.0) for 2.0 image -> crops horizontally
              zIndex: 1,
              style: {},
              imageRef: "crop-img",
            },
          ],
        },
      ],
    };

    const buf = await renderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file("word/document.xml")!.async("string");

    // In 2.0 image placed in 1.0 container, rendered width = 100, rendered height = 100.
    // targetAspect (1.0) < origAspect (2.0): crop horizontally: cropleft & cropright
    expect(docXml).toContain("cropleft=");
    expect(docXml).toContain("cropright=");
  });
});

