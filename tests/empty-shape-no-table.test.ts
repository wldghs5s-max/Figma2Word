import { describe, it, expect } from "vitest";
import { DocxRenderer } from "../src/renderer/index.js";
import { InternalDocument, ShapeElement, ContainerElement, TableElement } from "../src/model/index.js";
import { ConversionPipeline } from "../src/pipeline/index.js";
import { FigmaNode } from "../src/parser/types.js";

describe("STEP 2-B-1: Avoid Tables for Empty Decorative Shapes", () => {
  const renderer = new DocxRenderer();
  const pipeline = new ConversionPipeline();

  // Test A: Empty Shape (content: undefined or content: [])
  it("Test A: does NOT generate a Table for empty decorative shapes (content: 0)", () => {
    const emptyShape: ShapeElement = {
      type: "shape",
      shapeType: "rectangle",
      fill: { r: 220, g: 220, b: 220, a: 1 }, // e.g. #DCDCDC decorative bar
      width: 100,
      height: 10,
    };

    const rendered = renderer.renderElement(emptyShape);
    expect(rendered).toBeNull();

    // Verify when rendered inside an InternalDocument
    const doc: InternalDocument = {
      version: "1.0.0",
      metadata: { title: "Empty Shape Test", convertedAt: new Date().toISOString(), conversionMode: "balanced" },
      pageConfig: { size: "A4", widthMm: 210, heightMm: 297, orientation: "portrait", marginsMm: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 } },
      sections: [
        {
          id: "sec-1",
          elements: [
            { type: "paragraph", runs: [{ text: "Before Shape" }] },
            emptyShape,
            { type: "paragraph", runs: [{ text: "After Shape" }] },
          ],
        },
      ],
    };

    const sectionElements = renderer.renderElements(doc.sections[0].elements);
    // Should contain 2 paragraphs and ZERO tables
    expect(sectionElements.length).toBe(2);
    expect(sectionElements.every((e: any) => e.constructor.name === "Paragraph")).toBe(true);
  });

  // Test B: Shape with content (Card / Box style)
  it("Test B: preserves 1x1 Table rendering for shapes that have content", () => {
    const cardShape: ShapeElement = {
      type: "shape",
      shapeType: "rounded_rectangle",
      fill: { r: 240, g: 248, b: 255, a: 1 },
      stroke: { width: 1, style: "solid", color: { r: 0, g: 100, b: 200 } },
      content: [
        {
          type: "heading",
          level: 3,
          runs: [{ text: "Card Header" }],
          alignment: "left",
        },
        {
          type: "paragraph",
          runs: [{ text: "Card body description." }],
        },
      ],
    };

    const rendered = renderer.renderElement(cardShape);
    expect(rendered).not.toBeNull();
    expect((rendered as any).constructor.name).toBe("Table");
  });

  // Test C: Actual Layout Tables (Multi-Column Horizontal Container)
  it("Test C: ensures multi-column layout tables from horizontal containers are completely unaffected", async () => {
    const figmaHorizontalRow: FigmaNode = {
      id: "row-1",
      name: "2-Column Row",
      type: "FRAME",
      layoutMode: "HORIZONTAL",
      children: [
        {
          id: "col-1",
          name: "Col 1",
          type: "TEXT",
          characters: "Left Column Content",
          style: { fontSize: 14 },
        },
        {
          id: "col-2",
          name: "Col 2",
          type: "TEXT",
          characters: "Right Column Content",
          style: { fontSize: 14 },
        },
      ],
    };

    const result = await pipeline.convert(figmaHorizontalRow);
    expect(result.docxBuffer).toBeInstanceOf(Buffer);
    expect(result.docxBuffer.length).toBeGreaterThan(1000);

    // The container should still be rendered as a Table with 2 columns
    const container = result.internalDocument.sections[0].elements[0] as ContainerElement;
    expect(container.type).toBe("container");
    expect(container.layoutDirection).toBe("horizontal");
    expect(container.children.length).toBe(2);
  });
});
