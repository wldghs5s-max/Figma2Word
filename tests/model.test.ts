import { describe, it, expect } from "vitest";
import {
  InternalDocumentSchema,
  DocElementSchema,
  ParagraphElementSchema,
  ColorSchema,
} from "../src/model/index.js";

describe("Internal Document Model", () => {
  it("validates a well-formed Color", () => {
    const validColor = { r: 255, g: 0, b: 0, a: 1, hex: "FF0000" };
    expect(() => ColorSchema.parse(validColor)).not.toThrow();

    const invalidColor = { r: 300, g: 0, b: 0 };
    expect(() => ColorSchema.parse(invalidColor)).toThrow();
  });

  it("validates a ParagraphElement", () => {
    const validParagraph = {
      type: "paragraph" as const,
      alignment: "center" as const,
      runs: [{ type: "run" as const, text: "Hello World" }],
    };
    expect(() => ParagraphElementSchema.parse(validParagraph)).not.toThrow();
  });

  it("validates a full InternalDocument structure", () => {
    const fullDoc = {
      version: "1.0.0" as const,
      metadata: {
        title: "Test Document",
      },
      pageConfig: {
        size: "A4" as const,
        orientation: "portrait" as const,
      },
      sections: [
        {
          title: "Section 1",
          elements: [
            {
              type: "heading" as const,
              level: 1 as const,
              runs: [{ type: "run" as const, text: "Title" }],
            },
            {
              type: "paragraph" as const,
              runs: [{ type: "run" as const, text: "Body" }],
            },
          ],
        },
      ],
    };

    const parsed = InternalDocumentSchema.parse(fullDoc);
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.sections[0].elements.length).toBe(2);
  });
});

