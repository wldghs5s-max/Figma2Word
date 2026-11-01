import { describe, it, expect } from "vitest";
import { synthesizeVectorIconPath } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";
import JSZip from "jszip";

describe("Phase 40.5 — Visual Fidelity & Icon Recovery Hardening", () => {
  it("B-01: circle-check with a single vector sibling produces an unselected circle, NOT a checkmark", () => {
    // When radio button is unselected, totalVectorSiblings is 1
    const res = synthesizeVectorIconPath("circle-check 2", "Vector", 15.0, 15.0, false, true, {
      siblingIndex: 0,
      totalVectorSiblings: 1,
    });

    expect(res.provenance).toBe("LOCALLY_RECOVERED_GEOMETRY");
    // Must be a circle outline (starts with M 500 100 C 720 100)
    expect(res.path).toContain("M 500 100 C 720 100");
    // Must NOT be a checkmark hook
    expect(res.path).not.toBe("M 150 520 L 400 780 L 880 180");
  });

  it("B-02: circle-check with multiple siblings produces circle for outer and checkmark for hook", () => {
    // Child 0: 20x20 outer circle
    const circleRes = synthesizeVectorIconPath("circle-check 2", "Vector", 15.0, 15.0, false, true, {
      siblingIndex: 0,
      totalVectorSiblings: 2,
    });
    // Child 1: 8x5.5 checkmark hook
    const hookRes = synthesizeVectorIconPath("circle-check 2", "Vector", 6.0, 4.0, false, true, {
      siblingIndex: 1,
      totalVectorSiblings: 2,
    });

    expect(circleRes.path).toContain("M 500 100 C 720 100");
    expect(hookRes.path).toBe("M 150 520 L 400 780 L 880 180");
  });

  it("D-01: search icon without fill produces clean single-stroke circle + diagonal handle", () => {
    const res = synthesizeVectorIconPath("search-input", "search", 16.0, 16.0, false, true, {
      siblingIndex: 0,
      totalVectorSiblings: 1,
    });

    // Should contain lens circle and diagonal handle stroke
    expect(res.path).toContain("M 420 180 C 552 180");
    expect(res.path).toContain("M 590 590 L 850 850");
  });

  it("E-01: zero-width and zero-height vector shapes are clamped to minimum stroke width in VML", async () => {
    const doc: CanvasDocument = {
      pageSize: {
        widthPt: 500,
        heightPt: 500,
      },
      pages: [
        {
          id: "page-1",
          pageNumber: 1,
          widthPt: 500,
          heightPt: 500,
          bounds: {
            x: 0,
            y: 0,
            width: 500,
            height: 500,
          },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "v-line-1",
              type: "vector",
              name: "ZeroWidthLine",
              bounds: {
                x: 100,
                y: 100,
                width: 0, // Zero width vertical stroke
                height: 50,
              },
              zIndex: 1,
              style: {
                strokeColor: "#000000",
                strokeWidth: 1.5,
              },
              vectorPath: "m 0,0 l 0,1000 e",
            },
            {
              id: "h-line-1",
              type: "vector",
              name: "ZeroHeightLine",
              bounds: {
                x: 100,
                y: 200,
                width: 50,
                height: 0, // Zero height horizontal stroke
              },
              zIndex: 2,
              style: {
                strokeColor: "#000000",
                strokeWidth: 2.0,
              },
              vectorPath: "m 0,0 l 1000,0 e",
            },
          ],
        },
      ],
      resources: {},
    };

    const renderer = new DocxCanvasRenderer();
    const buf = await renderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file("word/document.xml")!.async("text");

    // Verify v-line-1 width is clamped to strokeWidth (1.500pt) instead of 0.000pt
    expect(docXml).toMatch(/alt="v-line-1"[^>]*style="[^"]*width:1\.500pt/);
    // Verify h-line-1 height is clamped to strokeWidth (2.000pt) instead of 0.000pt
    expect(docXml).toMatch(/alt="h-line-1"[^>]*style="[^"]*height:2\.000pt/);
  });
});
