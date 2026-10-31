import { describe, it, expect } from "vitest";
import { buildObjectTraceability } from "../src/fidelity/objectTraceability.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 38: Source-to-Word Object Traceability Suite", () => {
  it("1. Maps text node to Word shape with alt attribute", () => {
    const rawFigma = {
      id: "0:0",
      type: "DOCUMENT",
      children: [
        {
          id: "10:1",
          type: "FRAME",
          name: "Test Frame",
          children: [
            {
              id: "10:2",
              type: "TEXT",
              name: "Header Title",
              characters: "Hello World",
              visible: true,
            },
          ],
        },
      ],
    };

    const canvasDoc: CanvasDocument = {
      title: "Test Doc",
      pageSize: { widthPt: 595.28, heightPt: 841.89 },
      pages: [
        {
          pageNumber: 1,
          frameId: "10:1",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "10:2",
              sourceNodeId: "10:2",
              type: "text",
              bounds: { x: 10, y: 10, width: 100, height: 20 },
              zIndex: 1,
              style: {},
              textRuns: [{ text: "Hello World" }],
            },
          ],
        },
      ],
      resources: {},
    };

    const docxXml = `<w:document><w:body><w:p><w:r><w:pict><v:rect id="s_0_0" alt="10:2" style="position:absolute"><v:textbox><w:txbxContent><w:p><w:r><w:t>Hello World</w:t></w:r></w:p></w:txbxContent></v:textbox></v:rect></w:pict></w:r></w:p></w:body></w:document>`;

    const res = buildObjectTraceability(
      rawFigma,
      ["10:1"],
      canvasDoc,
      docxXml,
      "dummy_sha256"
    );

    expect(res.summary.totalSourceNodes).toBe(1);
    expect(res.summary.sourceTextsCount).toBe(1);
    expect(res.summary.preservedTextsCount).toBe(1);
    expect(res.summary.textPreservationRate).toBe(1.0);
    expect(res.summary.missingCount).toBe(0);
    expect(res.summary.traceabilityVerdict).toBe("VERIFIED");

    const mapping = res.mappings[0];
    expect(mapping.sourceNodeId).toBe("10:2");
    expect(mapping.docxObjectId).toBe("s_0_0");
    expect(mapping.conversionStatus).toBe("CONVERTED");
    expect(mapping.mappingRelation).toBe("ONE_TO_ONE");
  });

  it("2. Correctly flags intentionally omitted non-rendering layout container", () => {
    const rawFigma = {
      id: "0:0",
      children: [
        {
          id: "20:1",
          type: "FRAME",
          children: [
            {
              id: "20:2",
              type: "GROUP",
              visible: true,
              fills: [],
              strokes: [],
              children: [
                {
                  id: "20:3",
                  type: "RECTANGLE",
                  visible: true,
                  fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
                },
              ],
            },
          ],
        },
      ],
    };

    const canvasDoc: CanvasDocument = {
      title: "Test Doc",
      pageSize: { widthPt: 595.28, heightPt: 841.89 },
      pages: [
        {
          pageNumber: 1,
          frameId: "20:1",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "20:3",
              sourceNodeId: "20:3",
              type: "card",
              bounds: { x: 0, y: 0, width: 50, height: 50 },
              zIndex: 1,
              style: { fillColor: "#FF0000" },
            },
          ],
        },
      ],
      resources: {},
    };

    const docxXml = `<w:document><w:body><w:p><w:r><w:pict><v:rect id="s_0_0" alt="20:3"/></w:pict></w:r></w:p></w:body></w:document>`;

    const res = buildObjectTraceability(
      rawFigma,
      ["20:1"],
      canvasDoc,
      docxXml,
      "dummy_sha256"
    );

    expect(res.summary.totalSourceNodes).toBe(2);
    expect(res.summary.sourceContainersCount).toBe(1);
    expect(res.summary.sourceShapesCount).toBe(1);
    expect(res.summary.preservedShapesCount).toBe(1);
    expect(res.summary.intentionallyOmittedCount).toBe(1);

    const groupMapping = res.mappings.find((m) => m.sourceNodeId === "20:2");
    expect(groupMapping?.conversionStatus).toBe("INTENTIONALLY_OMITTED");

    const shapeMapping = res.mappings.find((m) => m.sourceNodeId === "20:3");
    expect(shapeMapping?.conversionStatus).toBe("CONVERTED");
  });

  it("3. Detects truly missing unrendered elements without false-positive inflation", () => {
    const rawFigma = {
      id: "0:0",
      children: [
        {
          id: "30:1",
          type: "FRAME",
          children: [
            {
              id: "30:2",
              type: "RECTANGLE",
              visible: true,
              fills: [{ type: "SOLID" }],
            },
          ],
        },
      ],
    };

    const canvasDoc: CanvasDocument = {
      title: "Test Doc",
      pageSize: { widthPt: 595.28, heightPt: 841.89 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [], // Missing!
        },
      ],
      resources: {},
    };

    const docxXml = `<w:document><w:body><w:p/></w:body></w:document>`;

    const res = buildObjectTraceability(
      rawFigma,
      ["30:1"],
      canvasDoc,
      docxXml,
      "dummy_sha256"
    );

    expect(res.summary.missingCount).toBe(1);
    expect(res.summary.shapePreservationRate).toBe(0);
    expect(res.summary.traceabilityVerdict).toBe("PARTIAL");
    expect(res.mappings[0].conversionStatus).toBe("MISSING");
  });
});

