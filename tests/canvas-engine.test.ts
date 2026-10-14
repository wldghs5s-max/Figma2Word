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

describe("Canvas Engine - Renderers (DOCX & HWPX)", () => {
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
            id: "el-header",
            name: "Title Header",
            type: "text",
            bounds: { x: 40.5, y: 50.0, width: 514.0, height: 60.0 },
            zIndex: 1,
            style: {
              fillColor: "#F3F4F6",
              cornerRadius: 4,
            },
            textRuns: [
              {
                text: "Executive Business Report",
                fontFamily: "Pretendard",
                fontSizePt: 22,
                fontWeight: 700,
                color: "#111827",
              },
            ],
          },
          {
            id: "el-image",
            name: "Company Logo",
            type: "image",
            bounds: { x: 40.5, y: 130.0, width: 100.0, height: 100.0 },
            zIndex: 2,
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
            id: "el-card",
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
                text: "Quarterly Revenue: $4.2M",
                fontFamily: "Inter",
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

  it("renders sample Canvas IR into a structurally valid DOCX buffer", async () => {
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
  });

  it("renders sample Canvas IR into a structurally valid HWPX buffer", async () => {
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

    const sectionXml = await zip.file("Contents/section0.xml")!.async("string");
    expect(sectionXml).toContain('pageBreak="1"');
    expect(sectionXml).toContain("Executive Business Report");
    expect(sectionXml).toContain("Quarterly Revenue: $4.2M");
    expect(sectionXml).toContain("hp:drawText");
  });

  it("parses generated DOCX back into Canvas IR via DocxCanvasParser", async () => {
    const docxRenderer = new DocxCanvasRenderer();
    const docxBuf = await docxRenderer.renderToBuffer(sampleCanvasDoc);

    const docxParser = new DocxCanvasParser();
    const parsedDoc = await docxParser.parse(docxBuf);

    expect(parsedDoc.pages.length).toBe(2);
    expect(parsedDoc.pages[0].elements.length).toBe(2);
    expect(parsedDoc.pages[1].elements.length).toBe(1);

    const titleEl = parsedDoc.pages[0].elements[0];
    expect(titleEl.textRuns?.[0].text).toBe("Executive Business Report");
    expect(titleEl.bounds.width).toBeCloseTo(514.0, 0);

    const cardEl = parsedDoc.pages[1].elements[0];
    expect(cardEl.textRuns?.[0].text).toBe("Quarterly Revenue: $4.2M");
    expect(cardEl.bounds.width).toBeCloseTo(250.0, 0);
  });
});

describe("Canvas Pipeline - End to End", () => {
  it("translates sample DOCX to HWPX directly via pipeline", async () => {
    const pipeline = new CanvasPipeline();
    const sampleDocxPath = path.resolve("debug/canvas-audit/report-1-canvas-test.docx");

    if (fs.existsSync(sampleDocxPath)) {
      const outHwpxPath = path.resolve("debug/canvas-audit/test-pipeline-roundtrip.hwpx");
      const res = await pipeline.convertDocxToHwpx(sampleDocxPath, {
        outputHwpxPath: outHwpxPath,
      });

      expect(res.stats.pageCount).toBe(9);
      expect(res.stats.elementCount).toBeGreaterThan(700);
      expect(fs.existsSync(outHwpxPath)).toBe(true);

      const zip = await JSZip.loadAsync(fs.readFileSync(outHwpxPath));
      expect(zip.file("Contents/section0.xml")).toBeDefined();
    }
  });
});
