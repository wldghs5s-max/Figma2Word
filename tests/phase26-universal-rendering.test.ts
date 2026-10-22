import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument } from "../src/canvas/types.js";
import { FigmaNode } from "../src/parser/types.js";

describe("Phase 26: Universal Rendering & Fidelity Improvements", () => {
  it("1. Accurately calculates VML arcsize using half-dimension radius formula", async () => {
    // Button with height: 40pt, width: 200pt, cornerRadius: 8pt
    // Phase 31.1 Empirical Word Measurement: Word for Mac renders R = arcsize * minDim.
    // Therefore, arcsize = min(0.5, 8 / min(200, 40)) = 8 / 40 = 0.200.
    const syntheticDoc: CanvasDocument = {
      title: "VML ArcSize Fidelity",
      pageSize: { name: "A4", widthPt: 841.89, heightPt: 595.28, orientation: "landscape", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 841.89, height: 595.28 },
          elements: [
            {
              id: "btn-1",
              name: "Rounded Button",
              type: "card",
              bounds: { x: 50, y: 50, width: 200, height: 40 },
              style: {
                fillColor: "0066FF",
                cornerRadius: 8,
              },
              zIndex: 1,
            },
          ],
        },
      ],
    };

    const renderer = new DocxCanvasRenderer();
    const buffer = await renderer.renderToBuffer(syntheticDoc);
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")!.async("text");

    // Must match arcsize="0.200"
    expect(docXml).toContain('arcsize="0.200"');
  });

  it("2. Protects normal 'Container' UI groups from accidental false-positive deletion", () => {
    const rawFigmaCanvas: FigmaNode = {
      id: "canvas-root",
      name: "Dashboard Canvas",
      type: "CANVAS",
      children: [
        // Legitimate design container that MUST NOT be deleted
        {
          id: "normal-container-group",
          name: "Main Content Container",
          type: "GROUP",
          visible: true,
          absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
          children: [
            {
              id: "card-1",
              name: "Dashboard Card",
              type: "RECTANGLE",
              visible: true,
              fills: [{ type: "SOLID", visible: true, color: { r: 0.2, g: 0.4, b: 0.8, a: 1 } }],
              absoluteBoundingBox: { x: 100, y: 100, width: 400, height: 300 },
            },
          ],
        },
        // Genuine plugin measurement guide that MUST be filtered out
        {
          id: "plugin-guide-group",
          name: "📏 Container",
          type: "GROUP",
          visible: true,
          absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 3361 },
          children: [
            {
              id: "guide-padding",
              name: "INNER_PADDING_TOP",
              type: "RECTANGLE",
              visible: true,
              absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 24 },
            },
          ],
        },
      ],
    };

    const parser = new FigmaCanvasParser();
    const doc = parser.parse({ figmaNode: rawFigmaCanvas });

    // Only the legitimate container should be converted to a page
    expect(doc.pages.length).toBe(1);
    // Page must correspond to the normal container
    expect(doc.pages[0].elements.length).toBeGreaterThan(0);
  });

  it("3. Guarantees ECMA-376 <w:wordWrap w:val=\"0\"/> on all single-line textboxes without schema corruption", async () => {
    const syntheticDoc: CanvasDocument = {
      title: "Schema Verification",
      pageSize: { name: "A4", widthPt: 841.89, heightPt: 595.28, orientation: "landscape", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 841.89, height: 595.28 },
          elements: [
            {
              id: "txt-1",
              name: "Label",
              type: "text",
              bounds: { x: 10, y: 10, width: 100, height: 20 },
              textRuns: [{ text: "사업목록", fontFamily: "Pretendard", fontSizePt: 12 }],
              textAutoResize: "WIDTH_AND_HEIGHT",
              zIndex: 1,
            },
          ],
        },
      ],
    };

    const renderer = new DocxCanvasRenderer();
    const buffer = await renderer.renderToBuffer(syntheticDoc);
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")!.async("text");

    expect(docXml).toContain('<w:wordWrap w:val="0"/>');
    expect(docXml).not.toContain("<w:noWrap/>");
  });
});
