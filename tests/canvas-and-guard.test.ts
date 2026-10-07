import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/index.js";
import { ConversionPipeline } from "../src/pipeline/index.js";
import { FigmaNode, FigmaFileResponse } from "../src/parser/types.js";
import { FigmaApiError } from "../src/api/index.js";

describe("Phase 4.1-A: CANVAS Support & Empty Document Guard", () => {
  const parser = new FigmaParser();
  const pipeline = new ConversionPipeline();

  it("successfully parses a standalone CANVAS node (e.g. from ?node-id=0-1)", () => {
    const canvasNode: FigmaNode = {
      id: "0:1",
      name: "Page 1",
      type: "CANVAS",
      children: [
        {
          id: "1:1",
          name: "Main Title",
          type: "TEXT",
          characters: "Page 1 Header",
          style: { fontSize: 24 },
        },
        {
          id: "1:2",
          name: "Body Text",
          type: "TEXT",
          characters: "This canvas content is now properly parsed.",
          style: { fontSize: 12 },
        },
      ],
    };

    const result = parser.parse(canvasNode);
    expect(result.document.sections.length).toBe(1);
    expect(result.document.sections[0].id).toBe("0:1");
    expect(result.document.sections[0].elements.length).toBe(2);
    expect(result.stats.totalElements).toBe(2);
    expect(result.stats.supportedNodes).toBe(2);
  });

  it("converts a standalone CANVAS input through the full pipeline to DOCX", async () => {
    const canvasNode: FigmaNode = {
      id: "0:1",
      name: "Page 1",
      type: "CANVAS",
      children: [
        {
          id: "1:1",
          name: "Welcome Heading",
          type: "TEXT",
          characters: "Real Canvas Conversion",
          style: { fontSize: 24, fontWeight: 700 },
        },
      ],
    };

    const result = await pipeline.convert(canvasNode);
    expect(result.docxBuffer).toBeInstanceOf(Buffer);
    expect(result.docxBuffer.length).toBeGreaterThan(3000);
    expect(result.stats.totalElements).toBe(1);
  });

  it("rejects conversion when canvas has 0 convertible elements (Empty Document Guard)", async () => {
    const emptyCanvas: FigmaNode = {
      id: "0:1",
      name: "Empty Canvas",
      type: "CANVAS",
      children: [],
    };

    await expect(pipeline.convert(emptyCanvas)).rejects.toThrow(
      /변환 가능한 Figma 요소를 찾지 못했습니다/
    );
  });

  it("rejects conversion when nodes are completely invisible or unsupported", async () => {
    const invisibleCanvas: FigmaNode = {
      id: "0:1",
      name: "Hidden Elements Canvas",
      type: "CANVAS",
      children: [
        {
          id: "1:1",
          name: "Hidden Text",
          type: "TEXT",
          characters: "Invisible",
          visible: false,
        },
      ],
    };

    await expect(pipeline.convert(invisibleCanvas)).rejects.toThrow(
      /변환 가능한 Figma 요소를 찾지 못했습니다/
    );
  });
});
