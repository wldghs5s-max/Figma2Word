import { describe, it, expect } from "vitest";
import { buildObjectTraceability } from "../src/fidelity/objectTraceability.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 39: Object Traceability Failure Injection & Negative Suite", () => {
  it("1. Rejects IR-only element when DOCX XML has empty body (Codex defect reproduction)", () => {
    const rawFigma = {
      figmaNode: {
        id: "10:1",
        name: "Test Frame",
        type: "FRAME",
        children: [
          {
            id: "10:2",
            name: "Title Text",
            type: "TEXT",
            characters: "Real Customer Title",
            visible: true,
          },
        ],
      },
    };

    const canvasDoc: CanvasDocument = {
      version: "1.0",
      metadata: { title: "Test Doc", created: new Date().toISOString() },
      pages: [
        {
          id: "p1",
          name: "Page 1",
          elements: [
            {
              id: "10:2",
              sourceNodeId: "10:2",
              name: "Title Text",
              type: "text",
              bounds: { x: 10, y: 10, width: 100, height: 20 },
              zIndex: 1,
              style: {},
              textRuns: [{ text: "Real Customer Title" }],
            },
          ],
        },
      ],
      resources: {},
    };

    // Empty DOCX XML body - no shapes at all!
    const docxXmlEmpty = `<w:document><w:body><w:p><w:r><w:t>Irrelevant text</w:t></w:r></w:p></w:body></w:document>`;

    const rep = buildObjectTraceability(
      rawFigma,
      ["10:1"],
      canvasDoc,
      docxXmlEmpty,
      "test_sha"
    );

    // Must NOT be verified when DOCX did not actually receive the object!
    expect(rep.summary.traceabilityVerdict).not.toBe("VERIFIED");
    expect(rep.summary.preservedTextsCount).toBe(0);
    expect(rep.summary.docxObjectsResolved).toBe(0);
    expect(rep.summary.unresolvedInDocxCount).toBe(1);

    const mapping = rep.mappings.find((m) => m.sourceNodeId === "10:2");
    expect(mapping).toBeDefined();
    expect(mapping?.conversionStatus).toBe("UNRESOLVED");
    expect(mapping?.docxObjectId).toBeUndefined();
  });

  it("2. Fails when total source elements is 0 (empty input cannot be VERIFIED)", () => {
    const rawFigmaEmpty = {
      figmaNode: {
        id: "10:1",
        name: "Empty Frame",
        type: "FRAME",
        children: [],
      },
    };

    const canvasDoc: CanvasDocument = {
      version: "1.0",
      metadata: { title: "Test Doc", created: new Date().toISOString() },
      pages: [{ id: "p1", name: "Page 1", elements: [] }],
      resources: {},
    };

    const docxXml = `<w:document><w:body><w:p/></w:body></w:document>`;

    const rep = buildObjectTraceability(
      rawFigmaEmpty,
      ["10:1"],
      canvasDoc,
      docxXml,
      "test_sha"
    );

    expect(rep.summary.totalSourceNodes).toBe(0);
    expect(rep.summary.traceabilityVerdict).toBe("FAILED");
  });

  it("3. Detects text content mismatch between source characters and Word text", () => {
    const rawFigma = {
      figmaNode: {
        id: "10:1",
        name: "Test Frame",
        type: "FRAME",
        children: [
          {
            id: "10:2",
            name: "Title Text",
            type: "TEXT",
            characters: "Expected Exact Text",
            visible: true,
          },
        ],
      },
    };

    const canvasDoc: CanvasDocument = {
      version: "1.0",
      metadata: { title: "Test Doc", created: new Date().toISOString() },
      pages: [
        {
          id: "p1",
          name: "Page 1",
          elements: [
            {
              id: "10:2",
              sourceNodeId: "10:2",
              name: "Title Text",
              type: "text",
              bounds: { x: 10, y: 10, width: 100, height: 20 },
              zIndex: 1,
              style: {},
              textRuns: [{ text: "Expected Exact Text" }],
            },
          ],
        },
      ],
      resources: {},
    };

    // Shape exists with matching alt, but inner text is corrupted/mismatched!
    const docxXmlCorrupted = `<w:document><w:body><w:p><w:r><w:pict><v:rect id="s_0" alt="10:2"><v:textbox><w:txbxContent><w:p><w:r><w:t>Completely Different Mismatched Text</w:t></w:r></w:p></w:txbxContent></v:textbox></v:rect></w:pict></w:r></w:p></w:body></w:document>`;

    const rep = buildObjectTraceability(
      rawFigma,
      ["10:1"],
      canvasDoc,
      docxXmlCorrupted,
      "test_sha"
    );

    const mapping = rep.mappings.find((m) => m.sourceNodeId === "10:2");
    expect(mapping).toBeDefined();
    expect(mapping?.contentVerified).toBe(false);
    expect(rep.summary.contentVerifiedCount).toBe(0);
  });
});

