import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/figmaParser.js";
import { FigmaNode } from "../src/parser/types.js";
import { ContainerElement } from "../src/model/index.js";

describe("Auto Layout Deep Verification", () => {
  const parser = new FigmaParser();

  it("extracts padding and itemSpacing correctly into ContainerElement", () => {
    const autoNode: FigmaNode = {
      id: "al-1",
      name: "Auto Layout Box",
      type: "FRAME",
      layoutMode: "HORIZONTAL",
      itemSpacing: 16,
      paddingTop: 20,
      paddingRight: 24,
      paddingBottom: 20,
      paddingLeft: 24,
      children: [
        {
          id: "item-1",
          name: "Item 1",
          type: "TEXT",
          characters: "Left Item",
        },
        {
          id: "item-2",
          name: "Item 2",
          type: "TEXT",
          characters: "Right Item",
        },
      ],
    };

    const res = parser.parse(autoNode);
    const container = res.document.sections[0].elements[0] as ContainerElement;

    expect(container.type).toBe("container");
    expect(container.layoutDirection).toBe("horizontal");
    expect(container.gap).toBe(16);
    expect(container.padding?.top).toBe(20);
    expect(container.padding?.right).toBe(24);
    expect(container.padding?.bottom).toBe(20);
    expect(container.padding?.left).toBe(24);
    expect(container.children.length).toBe(2);
  });

  it("handles vertical Auto Layout with single and multiple children", () => {
    const verticalNode: FigmaNode = {
      id: "al-vert",
      name: "Vertical Stack",
      type: "FRAME",
      layoutMode: "VERTICAL",
      itemSpacing: 12,
      children: [
        { id: "v1", name: "Heading", type: "TEXT", characters: "Stack Title" },
        { id: "v2", name: "Desc", type: "TEXT", characters: "Stack Description" },
      ],
    };

    const res = parser.parse(verticalNode);
    const container = res.document.sections[0].elements[0] as ContainerElement;

    expect(container.type).toBe("container");
    expect(container.layoutDirection).toBe("vertical");
    expect(container.children.length).toBe(2);
  });
});

