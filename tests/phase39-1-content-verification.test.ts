import { describe, it, expect } from "vitest";
import {
  buildObjectTraceability,
  extractTextFromWordSnippet,
  normalizeText,
  unescapeXml,
} from "../src/fidelity/objectTraceability.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 39.1: Object Traceability Exact Content Verification Suite", () => {
  it("1. Rejects mismatched text: Source 'ORIGINAL' vs Word 'WRONG' (no permissive fallback)", () => {
    const rawFigma = {
      figmaNode: {
        id: "1:1",
        type: "FRAME",
        children: [
          {
            id: "1:2",
            type: "TEXT",
            characters: "ORIGINAL",
            visible: true,
          },
        ],
      },
    };

    const canvasDoc: CanvasDocument = {
      version: "1.0",
      metadata: { title: "Test", created: new Date().toISOString() },
      pages: [
        {
          id: "p1",
          name: "Page 1",
          elements: [
            {
              id: "1:2",
              sourceNodeId: "1:2",
              type: "text",
              bounds: { x: 0, y: 0, width: 100, height: 20 },
              zIndex: 1,
              style: {},
              textRuns: [{ text: "ORIGINAL" }],
            },
          ],
        },
      ],
      resources: {},
    };

    // Word shape has <w:t>WRONG</w:t>
    const docxXml = `<w:document><w:body><w:p><w:r><w:pict><v:rect id="s1" alt="1:2"><v:textbox><w:txbxContent><w:p><w:r><w:t>WRONG</w:t></w:r></w:p></w:txbxContent></v:textbox></v:rect></w:pict></w:r></w:p></w:body></w:document>`;

    const rep = buildObjectTraceability(rawFigma, ["1:1"], canvasDoc, docxXml, "sha");
    const m = rep.mappings.find((x) => x.sourceNodeId === "1:2");

    expect(m).toBeDefined();
    expect(m?.contentVerified).toBe(false);
    expect(m?.conversionStatus).toBe("PARTIALLY_CONVERTED");
    expect(rep.summary.contentVerifiedCount).toBe(0);
  });

  it("2. Verifies multi-run text concatenation and XML entity unescaping", () => {
    const rawFigma = {
      figmaNode: {
        id: "2:1",
        type: "FRAME",
        children: [
          {
            id: "2:2",
            type: "TEXT",
            characters: "Foo & Bar <Baz>",
            visible: true,
          },
        ],
      },
    };

    const canvasDoc: CanvasDocument = {
      version: "1.0",
      metadata: { title: "Test", created: new Date().toISOString() },
      pages: [
        {
          id: "p1",
          name: "Page 1",
          elements: [
            {
              id: "2:2",
              sourceNodeId: "2:2",
              type: "text",
              bounds: { x: 0, y: 0, width: 100, height: 20 },
              zIndex: 1,
              style: {},
              textRuns: [{ text: "Foo & Bar <Baz>" }],
            },
          ],
        },
      ],
      resources: {},
    };

    // Split across 3 runs with XML entities: Foo &amp; , Bar , &lt;Baz&gt;
    const docxXml = `<w:document><w:body><w:p><w:r><w:pict><v:rect id="s2" alt="2:2"><v:textbox><w:txbxContent><w:p><w:r><w:t>Foo &amp; </w:t></w:r><w:r><w:t>Bar </w:t></w:r><w:r><w:t>&lt;Baz&gt;</w:t></w:r></w:p></w:txbxContent></v:textbox></v:rect></w:pict></w:r></w:p></w:body></w:document>`;

    const rep = buildObjectTraceability(rawFigma, ["2:1"], canvasDoc, docxXml, "sha");
    const m = rep.mappings.find((x) => x.sourceNodeId === "2:2");

    expect(m?.contentVerified).toBe(true);
    expect(m?.conversionStatus).toBe("CONVERTED");
    expect(rep.summary.contentVerifiedCount).toBe(1);
    expect(rep.summary.preservedTextsCount).toBe(1);
  });

  it("3. Rejects placeholder dummy image (size <= 100 bytes)", () => {
    const rawFigma = {
      figmaNode: {
        id: "3:1",
        type: "FRAME",
        children: [
          {
            id: "3:2",
            type: "RECTANGLE",
            fills: [{ type: "IMAGE", imageRef: "img_test_1" }],
            visible: true,
          },
        ],
      },
    };

    const canvasDoc: CanvasDocument = {
      version: "1.0",
      metadata: { title: "Test", created: new Date().toISOString() },
      pages: [
        {
          id: "p1",
          name: "Page 1",
          elements: [
            {
              id: "3:2",
              sourceNodeId: "3:2",
              type: "image",
              bounds: { x: 0, y: 0, width: 100, height: 100 },
              zIndex: 1,
              style: {},
              imageRef: "img_test_1",
            },
          ],
        },
      ],
      resources: {},
    };

    const docxXml = `<w:document><w:body><w:p><w:r><w:pict><v:shape id="s3" alt="3:2"><v:imagedata r:id="rId1" o:title="img1"/></v:shape></w:pict></w:r></w:p></w:body></w:document>`;
    const relsXml = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>`;

    const mediaMap = new Map<string, { size: number; isPlaceholder?: boolean }>();
    mediaMap.set("media/image1.png", { size: 42, isPlaceholder: true }); // Dummy 42-byte 1x1 GIF!

    const rep = buildObjectTraceability(rawFigma, ["3:1"], canvasDoc, docxXml, "sha", {
      docxRelsXml: relsXml,
      mediaFilesMap: mediaMap,
    });

    const m = rep.mappings.find((x) => x.sourceNodeId === "3:2");
    expect(m?.contentVerified).toBe(false);
    expect(m?.conversionStatus).toBe("PARTIALLY_CONVERTED");
    expect(rep.summary.preservedImagesCount).toBe(0);
  });

  it("4. Accepts genuine authentic image with verified relationship and non-trivial byte size", () => {
    const rawFigma = {
      figmaNode: {
        id: "4:1",
        type: "FRAME",
        children: [
          {
            id: "4:2",
            type: "RECTANGLE",
            fills: [{ type: "IMAGE", imageRef: "img_real_1" }],
            visible: true,
          },
        ],
      },
    };

    const canvasDoc: CanvasDocument = {
      version: "1.0",
      metadata: { title: "Test", created: new Date().toISOString() },
      pages: [
        {
          id: "p1",
          name: "Page 1",
          elements: [
            {
              id: "4:2",
              sourceNodeId: "4:2",
              type: "image",
              bounds: { x: 0, y: 0, width: 100, height: 100 },
              zIndex: 1,
              style: {},
              imageRef: "img_real_1",
            },
          ],
        },
      ],
      resources: {},
    };

    const docxXml = `<w:document><w:body><w:p><w:r><w:pict><v:shape id="s4" alt="4:2"><v:imagedata r:id="rIdReal" o:title="imgReal"/></v:shape></w:pict></w:r></w:p></w:body></w:document>`;
    const relsXml = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdReal" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/real_photo.png"/></Relationships>`;

    const mediaMap = new Map<string, { size: number; isPlaceholder?: boolean }>();
    mediaMap.set("media/real_photo.png", { size: 204850, isPlaceholder: false });

    const rep = buildObjectTraceability(rawFigma, ["4:1"], canvasDoc, docxXml, "sha", {
      docxRelsXml: relsXml,
      mediaFilesMap: mediaMap,
    });

    const m = rep.mappings.find((x) => x.sourceNodeId === "4:2");
    expect(m?.docxRelationshipId).toBe("rIdReal");
    expect(m?.contentVerified).toBe(true);
    expect(m?.conversionStatus).toBe("CONVERTED");
    expect(rep.summary.preservedImagesCount).toBe(1);
  });

  it("5. Classifies unresolved objects into 7 defined categories", () => {
    const rawFigma = {
      figmaNode: {
        id: "5:1",
        type: "FRAME",
        children: [
          { id: "5:2", type: "BOOLEAN_OPERATION", visible: true },
          { id: "5:3", type: "VECTOR", visible: true },
          { id: "5:4", type: "GROUP", visible: false },
        ],
      },
    };

    const canvasDoc: CanvasDocument = {
      version: "1.0",
      metadata: { title: "Test", created: new Date().toISOString() },
      pages: [
        {
          id: "p1",
          name: "Page 1",
          elements: [
            { id: "5:2", sourceNodeId: "5:2", type: "shape", bounds: { x: 0, y: 0, width: 10, height: 10 }, zIndex: 1, style: {} },
            { id: "5:3", sourceNodeId: "5:3", type: "shape", bounds: { x: 0, y: 0, width: 10, height: 10 }, zIndex: 1, style: {} },
          ],
        },
      ],
      resources: {},
    };

    const docxXml = `<w:document><w:body><w:p/></w:body></w:document>`;

    const rep = buildObjectTraceability(rawFigma, ["5:1"], canvasDoc, docxXml, "sha");

    expect(rep.summary.unresolvedBreakdown).toBeDefined();
    expect(rep.summary.unresolvedBreakdown?.unsupportedTypeCount).toBeGreaterThanOrEqual(1);
    expect(rep.summary.unresolvedBreakdown?.intentionalOmissionCount).toBeGreaterThanOrEqual(1);
  });
});

