import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { CanvasDocument, FigmaNode } from "../src/canvas/types.js";

describe("Phase 25: Web UI Multi-Section & Typography Fidelity Guard", () => {
  it("1. Emits isolated section break (<w:sectPr>) for adjacent identical-dimension pages", async () => {
    // Synthetic archetype: 3 web UI screens where Page 1 & 2 have identical 1920x1080 dimensions
    const syntheticDoc: CanvasDocument = {
      title: "Web UI Multi-Page Archetype",
      pageSize: {
        name: "Custom",
        widthPt: 1440,
        heightPt: 810,
        orientation: "landscape",
        unit: "pt",
      },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 1440, height: 810 },
          elements: [
            {
              id: "btn-1",
              name: "Button 1",
              type: "card",
              bounds: { x: 50, y: 50, width: 120, height: 40 },
              zIndex: 1,
              style: { fillColor: "#007AFF" },
            },
          ],
        },
        {
          pageNumber: 2,
          bounds: { x: 0, y: 0, width: 1440, height: 810 }, // Exact same dimensions as Page 1
          elements: [
            {
              id: "btn-2",
              name: "Button 2",
              type: "card",
              bounds: { x: 50, y: 50, width: 120, height: 40 },
              zIndex: 1,
              style: { fillColor: "#34C759" },
            },
          ],
        },
        {
          pageNumber: 3,
          bounds: { x: 0, y: 0, width: 1440, height: 877.5 },
          elements: [
            {
              id: "card-3",
              name: "Dashboard Card",
              type: "card",
              bounds: { x: 100, y: 100, width: 400, height: 300 },
              zIndex: 1,
              style: { fillColor: "#F2F2F7" },
            },
          ],
        },
      ],
    };

    const renderer = new DocxCanvasRenderer();
    const buffer = await renderer.renderToBuffer(syntheticDoc);
    expect(buffer).toBeDefined();

    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")!.async("text");

    // All 3 pages must have sectPr (2 in paragraph properties, 1 at root of body)
    const sectPrMatches = docXml.match(/<w:sectPr>/g) || [];
    expect(sectPrMatches.length).toBe(3);

    // Verify nextPage section break is present in pPr for page 1 to 2
    expect(docXml).toContain('<w:type w:val="nextPage"/>');
    expect(docXml).toContain('w:w="28800" w:h="16200"'); // 1440pt * 20 twips = 28800

    // Verify that NO regular pageBreakBefore was used to fake page separation for identical dimensions
    expect(docXml).not.toContain("<w:pageBreakBefore/>");
  });

  it("2. Applies <w:noWrap/> and width buffer to single-line auto-resize textboxes", async () => {
    const syntheticDoc: CanvasDocument = {
      title: "Typography Wrap Guard",
      pageSize: {
        name: "A4",
        widthPt: 841.89,
        heightPt: 595.28,
        orientation: "landscape",
        unit: "pt",
      },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 841.89, height: 595.28 },
          elements: [
            {
              id: "breadcrumb-1",
              name: "Breadcrumb",
              type: "text",
              bounds: { x: 50, y: 50, width: 141.0, height: 12.75 },
              zIndex: 1,
              textRuns: [
                {
                  text: "대시보드 / 사업장 관리 / 사업 관리",
                  fontFamily: "Pretendard",
                  fontSizePt: 10.5,
                },
              ],
              textAutoResize: "WIDTH_AND_HEIGHT",
            },
            {
              id: "paragraph-1",
              name: "Multi-line Paragraph",
              type: "text",
              bounds: { x: 50, y: 100, width: 300, height: 80 },
              zIndex: 2,
              textRuns: [
                {
                  text: "이 문단은 여러 줄에 걸쳐 정상적으로 자동 개행되어야 하는 본문 텍스트입니다.",
                  fontFamily: "Pretendard",
                  fontSizePt: 10.5,
                },
              ],
              textAutoResize: "HEIGHT",
            },
          ],
        },
      ],
    };

    const renderer = new DocxCanvasRenderer();
    const buffer = await renderer.renderToBuffer(syntheticDoc);
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")!.async("text");

    // Verify <w:noWrap/> is present for single-line auto-width text
    expect(docXml).toContain("<w:noWrap/>");

    // Verify width buffer was applied to the breadcrumb shape (141 + max(3, 141*0.03) ≈ 145.23pt)
    expect(docXml).toMatch(/width:145\.[0-9]+pt/);
  });

  it("3. Filters non-screen redline guide groups (📏 Container) in discoverPageFrames", () => {
    const rawFigmaCanvas: FigmaNode = {
      id: "canvas-1",
      name: "Canvas with Guide",
      type: "CANVAS",
      children: [
        {
          id: "screen-1",
          name: "Desktop - 1",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 1080 },
          children: [],
        },
        {
          id: "guide-container",
          name: "📏 Container",
          type: "GROUP",
          absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 3361 },
          children: [
            {
              id: "inner-pad",
              name: "INNER_PADDING-TOP",
              type: "FRAME",
              absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 20 },
            },
          ],
        },
        {
          id: "screen-2",
          name: "Desktop - 2",
          type: "FRAME",
          absoluteBoundingBox: { x: 2000, y: 0, width: 1920, height: 1080 },
          children: [],
        },
      ],
    };

    const parser = new FigmaCanvasParser();
    const doc = parser.parse(rawFigmaCanvas);

    // Must only have 2 pages (screen-1 and screen-2); the 📏 Container must be ignored
    expect(doc.pages.length).toBe(2);
    expect(doc.pages[0].elements).toBeDefined();
    expect(doc.pages[1].elements).toBeDefined();
  });

  it("4. Clamps oversized page dimensions to Word 22-inch physical limit (1,584 pt)", async () => {
    const oversizedDoc: CanvasDocument = {
      title: "Oversized Frame Protection",
      pageSize: {
        name: "Custom",
        widthPt: 2500, // Exceeds Word 1584pt limit
        heightPt: 3000,
        orientation: "portrait",
        unit: "pt",
      },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 2500, height: 3000 },
          elements: [],
        },
      ],
    };

    const renderer = new DocxCanvasRenderer();
    const buffer = await renderer.renderToBuffer(oversizedDoc);
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")!.async("text");

    // Word max twips is 1584 * 20 = 31680
    expect(docXml).toContain('w:w="31680"');
    expect(docXml).toContain('w:h="31680"');
    expect(docXml).not.toContain('w:w="50000"');
  });
});
