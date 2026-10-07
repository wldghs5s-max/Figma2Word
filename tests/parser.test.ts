import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/figmaParser.js";
import { FigmaNode } from "../src/parser/types.js";
import {
  simpleDocumentFixture,
  cardLayoutFixture,
  autoLayoutFixture,
} from "../src/fixtures/samples.js";

describe("FigmaParser", () => {
  const parser = new FigmaParser();

  it("parses simpleDocumentFixture correctly into InternalDocument", () => {
    const result = parser.parse(simpleDocumentFixture);
    expect(result.document).toBeDefined();
    expect(result.document.sections.length).toBe(1);

    const section = result.document.sections[0];
    expect(section.elements.length).toBe(4);

    // Check heading
    const heading = section.elements[0];
    expect(heading.type).toBe("heading");
    if (heading.type === "heading") {
      expect(heading.level).toBe(1);
      expect(heading.runs[0].text).toContain("2026");
    }

    // Check line
    const line = section.elements[1];
    expect(line.type).toBe("line");

    // Check stats
    expect(result.stats.supportedNodes).toBe(4);
    expect(result.stats.unsupportedNodes).toBe(0);
  });

  it("parses cardLayoutFixture into containers with vertical layout", () => {
    const result = parser.parse(cardLayoutFixture);
    const section = result.document.sections[0];
    expect(section.elements.length).toBe(3); // Heading + 2 Cards

    const card1 = section.elements[1];
    expect(card1.type).toBe("container");
    if (card1.type === "container") {
      expect(card1.layoutDirection).toBe("vertical");
      expect(card1.children.length).toBe(2);
      expect(card1.background).toBeDefined();
    }
  });

  it("parses autoLayoutFixture into horizontal containers", () => {
    const result = parser.parse(autoLayoutFixture);
    const section = result.document.sections[0];
    const grid = section.elements[1];

    expect(grid.type).toBe("container");
    if (grid.type === "container") {
      expect(grid.layoutDirection).toBe("horizontal");
      expect(grid.children.length).toBe(3);
    }
  });

  it("records unsupported nodes and provides fallback notices", () => {
    const customNode: FigmaNode = {
      id: "unsupported-vector-01",
      name: "Complex SVG Icon",
      type: "VECTOR",
      absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 },
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
    };

    const result = parser.parse(customNode);
    expect(result.notices.some((n) => n.status === "Fallback")).toBe(true);
    expect(result.stats.fallbackNodes).toBe(1);
  });
});

