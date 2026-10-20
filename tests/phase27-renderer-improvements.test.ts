import { describe, it, expect } from "vitest";
import { resolveScale } from "../src/canvas/types.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { FigmaNode } from "../src/canvas/types/figmaTypes.js";

describe("Phase 27: Universal Renderer Improvements & Proofs", () => {
  it("1. Uniformly downscales oversized 22-inch exceeding frames while preserving exact aspect ratio", () => {
    // 3,000 x 4,000 px tall web landing page (initial pt: 2,250 x 3,000 pt > 1,584 pt)
    const resolved = resolveScale(3000, 4000, "fit-a4");

    // Height must be clamped to exactly 1,584 pt
    expect(resolved.targetHeightPt).toBe(1584.00);

    // Width must preserve exact aspect ratio: 1584 * (3000 / 4000) = 1188.00 pt
    expect(resolved.targetWidthPt).toBe(1188.00);

    // ScaleX and ScaleY must be identical (uniform scale, no distortion)
    expect(resolved.scaleX).toBe(resolved.scaleY);
    expect(resolved.scaleX).toBeCloseTo(0.75 * (1584 / 3000), 5);
  });

  it("2. Non-oversized web frame keeps standard 0.75 scale without downscaling", () => {
    // Standard 1920 x 1080 px frame (initial pt: 1,440 x 810 pt <= 1,584 pt)
    const resolved = resolveScale(1920, 1080, "fit-a4");

    expect(resolved.targetWidthPt).toBe(1440.00);
    expect(resolved.targetHeightPt).toBe(810.00);
    expect(resolved.scaleX).toBe(0.75);
    expect(resolved.scaleY).toBe(0.75);
  });

  it("3. Correctly prioritizes rectangleCornerRadii over stale scalar cornerRadius", () => {
    // Card with top-only rounded corners [16, 16, 0, 0] and stale cornerRadius: 4
    const rawNode: FigmaNode = {
      id: "card-round",
      name: "Top-Rounded Modal",
      type: "FRAME",
      visible: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
      children: [
        {
          id: "card-body",
          name: "Body",
          type: "RECTANGLE",
          visible: true,
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
          absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
          rectangleCornerRadii: [16, 16, 0, 0],
          cornerRadius: 4, // Stale legacy property in Figma
        },
      ],
    };

    const parser = new FigmaCanvasParser();
    const doc = parser.parse({ figmaNode: rawNode });

    const elem = doc.pages[0].elements[0];
    expect(elem).toBeDefined();
    expect(elem.style?.cornerRadii).toBeDefined();
    // Non-zero radii average: (16 + 16) / 2 = 16 * 0.75 = 12 pt
    expect(elem.style?.cornerRadius).toBe(12);
  });
});
