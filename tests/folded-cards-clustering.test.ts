import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/index.js";
import { ConversionPipeline } from "../src/pipeline/index.js";
import { FigmaNode } from "../src/parser/types.js";
import * as path from "path";
import * as fs from "fs";

describe("Phase 4.1-B: Folded Card Containers Horizontal Clustering", () => {
  const parser = new FigmaParser();
  const pipeline = new ConversionPipeline();

  it("clusters folded card containers into a horizontal row container (2 columns)", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "samples/real-world/real-two-column-card.json"
    );
    const outputPath = path.join(
      process.cwd(),
      "samples/output/real-two-column-card.docx"
    );

    const result = await pipeline.convertFile(fixturePath, outputPath);

    expect(result.docxBuffer).toBeInstanceOf(Buffer);
    expect(result.docxBuffer.length).toBeGreaterThan(3000);
    expect(fs.existsSync(outputPath)).toBe(true);

    const rootElement = result.internalDocument.sections[0].elements[0] as any;
    expect(rootElement).toBeDefined();

    // Find the row cluster container inside root element
    const rowCluster = rootElement.children.find(
      (c: any) => c.type === "container" && c.layoutDirection === "horizontal"
    );

    expect(rowCluster).toBeDefined();
    expect(rowCluster.children.length).toBe(2);
    // Both cards should be folded inside this row
    expect(rowCluster.children[0].type).toBe("container");
    expect(rowCluster.children[1].type).toBe("container");
  });

  it("clusters 3 folded card containers into a horizontal row container (3 columns)", async () => {
    const threeCardsFrame: FigmaNode = {
      id: "30:0",
      name: "3 Cards Frame",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 1200, height: 400 },
      children: [
        // Card 1
        {
          id: "30:1",
          name: "Card 1 BG",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 40, y: 40, width: 340, height: 260 },
          fills: [{ type: "SOLID" }],
        },
        {
          id: "30:2",
          name: "Card 1 Title",
          type: "TEXT",
          characters: "Card 1",
          absoluteBoundingBox: { x: 60, y: 60, width: 300, height: 30 },
        },
        // Card 2
        {
          id: "30:3",
          name: "Card 2 BG",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 420, y: 40, width: 340, height: 260 },
          fills: [{ type: "SOLID" }],
        },
        {
          id: "30:4",
          name: "Card 2 Title",
          type: "TEXT",
          characters: "Card 2",
          absoluteBoundingBox: { x: 440, y: 60, width: 300, height: 30 },
        },
        // Card 3
        {
          id: "30:5",
          name: "Card 3 BG",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 800, y: 40, width: 340, height: 260 },
          fills: [{ type: "SOLID" }],
        },
        {
          id: "30:6",
          name: "Card 3 Title",
          type: "TEXT",
          characters: "Card 3",
          absoluteBoundingBox: { x: 820, y: 60, width: 300, height: 30 },
        },
      ],
    };

    const parseRes = parser.parse(threeCardsFrame);
    const rootEl = parseRes.document.sections[0].elements[0] as any;
    expect(rootEl).toBeDefined();

    const rowCluster = rootEl.children.find(
      (c: any) => c.type === "container" && c.layoutDirection === "horizontal"
    );
    expect(rowCluster).toBeDefined();
    expect(rowCluster.children.length).toBe(3);
  });
});
