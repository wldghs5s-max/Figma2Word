import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/figmaParser.js";
import { FigmaNode } from "../src/parser/types.js";
import { InternalDocumentSchema } from "../src/model/index.js";

describe("Edge Cases & Schema Validation", () => {
  const parser = new FigmaParser();

  it("strictly filters out invisible (visible: false) nodes and their subtrees", () => {
    const root: FigmaNode = {
      id: "root-1",
      name: "Root",
      type: "FRAME",
      children: [
        { id: "vis-1", name: "Visible", type: "TEXT", visible: true, characters: "I am visible" },
        { id: "invis-1", name: "Hidden", type: "TEXT", visible: false, characters: "I am hidden" },
        {
          id: "invis-frame",
          name: "Hidden Frame",
          type: "FRAME",
          visible: false,
          children: [{ id: "nested-invis", name: "Nested", type: "TEXT", characters: "Should not appear" }],
        },
      ],
    };

    const res = parser.parse(root);
    const container = res.document.sections[0].elements[0] as any;
    expect(container.children.length).toBe(1);
    expect(container.children[0].runs[0].text).toBe("I am visible");
  });

  it("handles empty characters text node without runtime exception", () => {
    const emptyTextNode: FigmaNode = {
      id: "empty-1",
      name: "Empty",
      type: "TEXT",
      characters: "",
    };

    expect(() => parser.parse(emptyTextNode)).not.toThrow();
    const res = parser.parse(emptyTextNode);
    expect(res.document.sections[0].elements.length).toBe(1);
  });

  it("handles nodes without absoluteBoundingBox gracefully in sorting", () => {
    const noBoxNode: FigmaNode = {
      id: "no-box-frame",
      name: "No Box Frame",
      type: "FRAME",
      children: [
        { id: "nb-1", name: "Node 1", type: "TEXT", characters: "First" },
        { id: "nb-2", name: "Node 2", type: "TEXT", characters: "Second" },
      ],
    };

    expect(() => parser.parse(noBoxNode)).not.toThrow();
  });

  it("logs Unsupported status for unknown future Figma node types", () => {
    const unknownNode: FigmaNode = {
      id: "future-1",
      name: "Future Figma AI Widget",
      type: "AI_WIDGET_EXPERIMENTAL" as any,
    };

    const res = parser.parse(unknownNode);
    expect(res.stats.unsupportedNodes).toBe(1);
    expect(res.notices[0].status).toBe("Unsupported");
  });

  it("validates that all parsed documents satisfy InternalDocumentSchema", () => {
    const node: FigmaNode = {
      id: "test-node",
      name: "Test Document",
      type: "FRAME",
      children: [{ id: "t-1", name: "Text", type: "TEXT", characters: "Schema Check" }],
    };

    const res = parser.parse(node);
    expect(() => InternalDocumentSchema.parse(res.document)).not.toThrow();
  });
});

