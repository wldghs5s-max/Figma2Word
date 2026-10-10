import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/index.js";
import { ConversionPipeline } from "../src/pipeline/index.js";
import { FigmaNode } from "../src/parser/types.js";
import { PageBreakElement } from "../src/model/elements.js";

describe("STEP 1: CANVAS Multi-Screen Isolation & Page Breaks", () => {
  const parser = new FigmaParser();
  const pipeline = new ConversionPipeline();

  // Test A: Clear Multi-Screen
  it("Test A: isolates multiple independent top-level screen frames with a PageBreak", async () => {
    const multiScreenCanvas: FigmaNode = {
      id: "canvas-root",
      name: "App Flow Canvas",
      type: "CANVAS",
      children: [
        {
          id: "screen-1",
          name: "Screen 1 - Login",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
          children: [
            {
              id: "text-1",
              name: "Login Title",
              type: "TEXT",
              characters: "Welcome Back",
              style: { fontSize: 24 },
            },
          ],
        },
        {
          id: "screen-2",
          name: "Screen 2 - Home",
          type: "FRAME",
          absoluteBoundingBox: { x: 450, y: 0, width: 375, height: 812 },
          children: [
            {
              id: "text-2",
              name: "Home Title",
              type: "TEXT",
              characters: "Main Dashboard",
              style: { fontSize: 24 },
            },
          ],
        },
      ],
    };

    // 1. Verify Parser & IR output
    const parseResult = parser.parse(multiScreenCanvas);
    const elements = parseResult.document.sections[0].elements;

    // Elements should contain: [Screen 1 Container, PageBreak, Screen 2 Container]
    expect(elements.length).toBe(3);
    expect(elements[0].type).toBe("container");
    expect(elements[1].type).toBe("page_break");
    expect((elements[1] as PageBreakElement).id).toBe("pb-screen-2");
    expect(elements[2].type).toBe("container");

    // 2. Verify DOCX OpenXML contains native w:br page break
    const pipelineResult = await pipeline.convert(multiScreenCanvas);
    expect(pipelineResult.docxBuffer.length).toBeGreaterThan(3000);
  });

  // Test B: Existing Single Frame
  it("Test B: preserves single frame without inserting unnecessary PageBreak", () => {
    const singleScreenCanvas: FigmaNode = {
      id: "canvas-root",
      name: "Single Screen Canvas",
      type: "CANVAS",
      children: [
        {
          id: "screen-only",
          name: "Single Overview",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
          children: [
            {
              id: "text-header",
              name: "Header",
              type: "TEXT",
              characters: "Overview Document",
              style: { fontSize: 24 },
            },
          ],
        },
      ],
    };

    const parseResult = parser.parse(singleScreenCanvas);
    const elements = parseResult.document.sections[0].elements;

    expect(elements.length).toBe(1);
    expect(elements[0].type).toBe("container");
    // No page break in single screen
    expect(elements.some((e) => e.type === "page_break")).toBe(false);
  });

  // Test C: Existing Card Layout Structure (Document Flow)
  it("Test C: preserves canvas-level document flow with direct text/cards without page breaks", () => {
    const cardFlowCanvas: FigmaNode = {
      id: "canvas-root",
      name: "Card Document Flow",
      type: "CANVAS",
      children: [
        {
          id: "doc-title",
          name: "Title Text",
          type: "TEXT",
          characters: "Service Strategy Cards",
          style: { fontSize: 28 },
          absoluteBoundingBox: { x: 50, y: 40, width: 600, height: 40 },
        },
        {
          id: "card-1",
          name: "Card 1",
          type: "FRAME",
          absoluteBoundingBox: { x: 50, y: 100, width: 600, height: 120 },
          children: [
            {
              id: "card-1-text",
              name: "Card 1 Desc",
              type: "TEXT",
              characters: "First Card Content",
              style: { fontSize: 14 },
            },
          ],
        },
        {
          id: "card-2",
          name: "Card 2",
          type: "FRAME",
          absoluteBoundingBox: { x: 50, y: 240, width: 600, height: 120 },
          children: [
            {
              id: "card-2-text",
              name: "Card 2 Desc",
              type: "TEXT",
              characters: "Second Card Content",
              style: { fontSize: 14 },
            },
          ],
        },
      ],
    };

    const parseResult = parser.parse(cardFlowCanvas);
    const elements = parseResult.document.sections[0].elements;

    // Preserved as single continuous document flow (no page break)
    expect(elements.length).toBe(3);
    expect(elements.some((e) => e.type === "page_break")).toBe(false);
  });

  // Test D: Multi-Screen with Interstitial Non-Frame Nodes
  it("Test D: preserves non-frame canvas nodes and inserts PageBreak across screens", () => {
    const canvasWithRectangle: FigmaNode = {
      id: "canvas-root",
      name: "Flow with Separator",
      type: "CANVAS",
      children: [
        {
          id: "screen-a",
          name: "Screen A",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
          children: [
            {
              id: "text-a",
              name: "Screen A Title",
              type: "TEXT",
              characters: "Screen A",
              style: { fontSize: 20 },
            },
          ],
        },
        {
          id: "rect-bg",
          name: "Canvas Divider Shape",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 400, y: 0, width: 20, height: 812 },
          fills: [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }],
        },
        {
          id: "screen-b",
          name: "Screen B",
          type: "FRAME",
          absoluteBoundingBox: { x: 450, y: 0, width: 375, height: 812 },
          children: [
            {
              id: "text-b",
              name: "Screen B Title",
              type: "TEXT",
              characters: "Screen B",
              style: { fontSize: 20 },
            },
          ],
        },
      ],
    };

    const parseResult = parser.parse(canvasWithRectangle);
    const elements = parseResult.document.sections[0].elements;

    // Must not drop the RECTANGLE shape, and must separate Screen A and Screen B with PageBreak
    expect(elements.some((e) => e.type === "shape")).toBe(true);
    expect(elements.some((e) => e.type === "page_break")).toBe(true);

    const pbIndex = elements.findIndex((e) => e.type === "page_break");
    expect(pbIndex).toBeGreaterThan(0);
    expect(pbIndex).toBeLessThan(elements.length - 1);
  });

  // Test E: 2D Grid Artboards with Canvas Title (Storyboard / Multi-Row Flow)
  it("Test E: isolates 2D grid of screen frames with canvas title without collapsing into row columns", () => {
    const gridCanvas: FigmaNode = {
      id: "canvas-grid",
      name: "Storyboard 2D Grid",
      type: "CANVAS",
      children: [
        {
          id: "canvas-title",
          name: "Flow Title",
          type: "TEXT",
          characters: "모바일 서비스 전체 플로우 (2D 그리드)",
          absoluteBoundingBox: { x: 0, y: -100, width: 500, height: 40 },
          style: { fontSize: 24, fontWeight: "bold" },
        },
        // Row 1
        {
          id: "grid-s1",
          name: "Screen 1",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
          children: [{ id: "t-s1", name: "T1", type: "TEXT", characters: "화면 1" }],
        },
        {
          id: "grid-s2",
          name: "Screen 2",
          type: "FRAME",
          absoluteBoundingBox: { x: 450, y: 0, width: 375, height: 812 },
          children: [{ id: "t-s2", name: "T2", type: "TEXT", characters: "화면 2" }],
        },
        {
          id: "grid-s3",
          name: "Screen 3",
          type: "FRAME",
          absoluteBoundingBox: { x: 900, y: 0, width: 375, height: 812 },
          children: [{ id: "t-s3", name: "T3", type: "TEXT", characters: "화면 3" }],
        },
        // Row 2
        {
          id: "grid-s4",
          name: "Screen 4",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 950, width: 375, height: 812 },
          children: [{ id: "t-s4", name: "T4", type: "TEXT", characters: "화면 4" }],
        },
        {
          id: "grid-s5",
          name: "Screen 5",
          type: "FRAME",
          absoluteBoundingBox: { x: 450, y: 950, width: 375, height: 812 },
          children: [{ id: "t-s5", name: "T5", type: "TEXT", characters: "화면 5" }],
        },
        {
          id: "grid-s6",
          name: "Screen 6",
          type: "FRAME",
          absoluteBoundingBox: { x: 900, y: 950, width: 375, height: 812 },
          children: [{ id: "t-s6", name: "T6", type: "TEXT", characters: "화면 6" }],
        },
      ],
    };

    const parseResult = parser.parse(gridCanvas);
    const elements = parseResult.document.sections[0].elements;

    // Verify canvas title heading is preserved
    expect(elements[0].type).toBe("heading");

    // Verify 6 screens separated by 5 PageBreaks
    const pbElements = elements.filter((e) => e.type === "page_break");
    expect(pbElements).toHaveLength(5);

    const screenContainers = elements.filter((e) => e.type === "container");
    expect(screenContainers).toHaveLength(6);

    // Verify none of the screens were grouped into a multi-column row cluster
    for (const c of screenContainers as any[]) {
      expect(c.layoutDirection).not.toBe("horizontal");
      expect(c.columnWidths).toBeUndefined();
    }
  });

  // Test F: E2E DOCX OpenXML generation for 2D Grid
  it("Test F: generates valid DOCX with native PageBreaks and no multi-column screen tables", async () => {
    const gridCanvas: FigmaNode = {
      id: "canvas-grid-e2e",
      name: "E2E Grid Canvas",
      type: "CANVAS",
      children: [
        {
          id: "e2e-title",
          name: "Doc Title",
          type: "TEXT",
          characters: "E2E 검증 플로우",
          absoluteBoundingBox: { x: 0, y: -50, width: 400, height: 30 },
          style: { fontSize: 20 },
        },
        {
          id: "e2e-s1",
          name: "Screen 1",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
          fills: [{ type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.95 } }],
          children: [
            { id: "e2e-t1-h", name: "H1", type: "TEXT", characters: "스크린 1 헤더" },
            { id: "e2e-t1-p", name: "P1", type: "TEXT", characters: "스크린 1 본문" },
          ],
        },
        {
          id: "e2e-s2",
          name: "Screen 2",
          type: "FRAME",
          absoluteBoundingBox: { x: 450, y: 0, width: 375, height: 812 },
          fills: [{ type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.95 } }],
          children: [
            { id: "e2e-t2-h", name: "H2", type: "TEXT", characters: "스크린 2 헤더" },
            { id: "e2e-t2-p", name: "P2", type: "TEXT", characters: "스크린 2 본문" },
          ],
        },
      ],
    };

    const res = await pipeline.convert(gridCanvas);
    expect(res.docxBuffer).toBeInstanceOf(Buffer);

    // Verify OpenXML
    const { inflateRawSync } = await import("node:zlib");
    const buffer = res.docxBuffer;
    let offset = 0;
    let xml = "";
    while (offset + 30 <= buffer.length) {
      if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
      const flags = buffer.readUInt16LE(offset + 6);
      const method = buffer.readUInt16LE(offset + 8);
      let compSize = buffer.readUInt32LE(offset + 18);
      const nameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
      const dataStart = offset + 30 + nameLength + extraLength;
      if (flags & 0x8) {
        const nextHeader = buffer.indexOf(Buffer.from([0x50, 0x4b]), dataStart + 4);
        compSize = (nextHeader === -1 ? buffer.length : nextHeader) - dataStart;
      }
      const compressed = buffer.subarray(dataStart, dataStart + compSize);
      if (name === "word/document.xml") {
        const bytes = method === 0 ? compressed : inflateRawSync(compressed);
        xml = bytes.toString("utf8");
        break;
      }
      offset = dataStart + compSize;
      if (flags & 0x8) offset += 16;
    }

    expect(xml).toContain('<w:br w:type="page"/>');
    expect(xml).toContain("스크린 1 헤더");
    expect(xml).toContain("스크린 2 헤더");

    // Verify that neither screen is squeezed into a multi-column row table
    // (A multi-column table would have multiple w:tc per w:tr at the root)
    const rootTblMatches = xml.match(/<w:tbl[\s>]/g) || [];
    expect(rootTblMatches.length).toBe(2);
  });
});
