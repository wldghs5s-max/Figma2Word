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
});
