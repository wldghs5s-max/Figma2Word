import { describe, it, expect } from "vitest";
import { FigmaCanvasParser, synthesizeVectorIconPath } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { buildObjectTraceability } from "../src/fidelity/objectTraceability.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 40.3 — Production Fidelity & Real-World Word Editing Hardening", () => {
  // Test 1 (F-01): Simultaneous Fill and Stroke geometries with WindingRule
  it("F-01: preserves both Fill and Stroke geometries when both exist, along with evenodd winding rule", async () => {
    const parser = new FigmaCanvasParser({ selectedFrameIds: new Set(["frame_1"]) });
    const mockFigma = {
      document: {
        children: [
          {
            id: "frame_1",
            name: "Test Frame",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 800 },
            children: [
              {
                id: "vec_complex_1",
                name: "complex-vector",
                type: "VECTOR",
                absoluteBoundingBox: { x: 50, y: 50, width: 100, height: 100 },
                fillGeometry: [
                  { path: "M 0 0 L 100 0 L 100 100 Z", windingRule: "EVENODD" },
                ],
                strokeGeometry: [
                  { path: "M 10 10 L 90 90" },
                ],
                strokes: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
                strokeWeight: 2,
                fills: [{ type: "SOLID", color: { r: 0, g: 1, b: 0, a: 1 } }],
              },
            ],
          },
        ],
      },
    };

    const doc = parser.parse(mockFigma);
    const vecElem = doc.pages[0].elements.find((e) => e.sourceNodeId === "vec_complex_1");

    expect(vecElem).toBeDefined();
    expect(vecElem?.geometryProvenance).toBe("SOURCE_GEOMETRY");
    expect(vecElem?.fillRule).toBe("evenodd");
    expect(vecElem?.vectorPath).toBeDefined();
    expect(vecElem?.strokeVectorPath).toBeDefined();
    expect(vecElem?.vectorPath).not.toBe(vecElem?.strokeVectorPath);

    // Verify DOCX emission renders both fill and stroke shapes
    const renderer = new DocxCanvasRenderer();
    const zip = await renderer.buildZip(doc);
    const docXml = await zip.file("word/document.xml")!.async("string");

    expect(docXml).toContain('fillrule="evenodd"');
    expect(docXml).toContain('alt="vec_complex_1"');
    expect(docXml).toContain('id="s_0_0_s"');
  });

  // Test 2 (F-02): Multi-child search icon deconfliction (lens vs handle)
  it("F-02a: decomposes multi-vector search icon into lens circle and handle bar", () => {
    // Sibling 0: lens
    const lens = synthesizeVectorIconPath("search 1", "Vector 1", 12, 12, true, true, {
      siblingIndex: 0,
      totalVectorSiblings: 2,
    });
    // Sibling 1: handle
    const handle = synthesizeVectorIconPath("search 1", "Vector 2", 6, 6, false, true, {
      siblingIndex: 1,
      totalVectorSiblings: 2,
    });

    expect(lens.provenance).toBe("LOCALLY_RECOVERED_GEOMETRY");
    expect(handle.provenance).toBe("LOCALLY_RECOVERED_GEOMETRY");
    expect(lens.path).not.toBe(handle.path);
    expect(lens.path).toContain("C 552 180"); // Circle curvature
    expect(handle.path).toContain("M 590 590 L 850 850"); // Diagonal handle
  });

  // Test 3 (F-02b): CW vs CCW rotate icon distinct directions
  it("F-02b: distinguishes CW and CCW rotate icon arcs and arrowhead directions", () => {
    const ccw = synthesizeVectorIconPath("rotate-ccw", "icon", 16, 16, false, true);
    const cw = synthesizeVectorIconPath("rotate-cw", "icon", 16, 16, false, true);

    expect(ccw.provenance).toBe("SEMANTIC_APPROXIMATION");
    expect(cw.provenance).toBe("SEMANTIC_APPROXIMATION");
    expect(ccw.path).not.toBe(cw.path);
    // CCW uses sweep-flag 0, CW uses sweep-flag 1
    expect(ccw.path).toContain("A 350 350 0 1 0");
    expect(cw.path).toContain("A 350 350 0 1 1");
  });

  // Test 4 (F-05): Strict text preservation: single missing text results in non-VERIFIED
  it("F-05: fails verification if even 1 text out of 20 is missing (Fail-Closed)", () => {
    const sourceTexts: any[] = [];
    for (let i = 1; i <= 20; i++) {
      sourceTexts.push({
        id: `text_${i}`,
        name: `Text ${i}`,
        type: "TEXT",
        characters: `Sample Content ${i}`,
      });
    }

    const mockFigma = {
      document: {
        children: [
          {
            id: "frame_1",
            name: "Page 1",
            type: "FRAME",
            children: sourceTexts,
          },
        ],
      },
    };

    const emptyCanvasDoc: CanvasDocument = {
      title: "Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          name: "Page 1",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: sourceTexts.map((st) => ({
            id: st.id,
            name: st.name,
            type: "text",
            bounds: { x: 0, y: 0, width: 100, height: 20 },
            zIndex: 1,
            style: {},
            sourceNodeId: st.id,
          })),
        },
      ],
      resources: {},
      diagnostics: { notices: [], warnings: [] },
    };

    // Simulate DOCX with only 19 texts matching (text_20 missing/corrupted)
    let docxXml = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml"><w:body>';
    for (let i = 1; i <= 19; i++) {
      docxXml += `<w:p><w:r><w:pict><v:shape id="s_${i}" alt="text_${i}"><v:textbox><w:txbxContent><w:p><w:r><w:t>Sample Content ${i}</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>`;
    }
    // text_20 has completely mismatched text
    docxXml += `<w:p><w:r><w:pict><v:shape id="s_20" alt="text_20"><v:textbox><w:txbxContent><w:p><w:r><w:t>Completely Wrong Text</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p></w:body></w:document>`;

    const report = buildObjectTraceability(mockFigma, ["frame_1"], emptyCanvasDoc, docxXml, "dummy_hash");

    // Must NOT be VERIFIED because 1 text was missing
    expect(report.summary.textPreservationRate).toBe(0.95);
    expect(report.summary.traceabilityVerdict).not.toBe("VERIFIED");
    expect(report.summary.traceabilityVerdict).toBe("PARTIAL");
  });

  // Test 5 (F-05b): Empty shape tag without valid geometry fails content verification
  it("F-05b: rejects empty shape tags lacking path/styling as unverified content", () => {
    const mockFigma = {
      document: {
        children: [
          {
            id: "frame_1",
            name: "Page 1",
            type: "FRAME",
            children: [
              {
                id: "empty_shape_node",
                name: "Empty Shape",
                type: "VECTOR",
                strokeWeight: 1,
              },
            ],
          },
        ],
      },
    };

    const emptyCanvasDoc: CanvasDocument = {
      title: "Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          name: "Page 1",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "empty_shape_node",
              name: "Empty Shape",
              type: "vector",
              bounds: { x: 0, y: 0, width: 50, height: 50 },
              zIndex: 1,
              style: {},
              sourceNodeId: "empty_shape_node",
            },
          ],
        },
      ],
      resources: {},
      diagnostics: { notices: [], warnings: [] },
    };

    // DOCX with an empty shape tag lacking path, fillcolor, strokecolor
    const docxXml = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml"><w:body><w:p><w:r><w:pict><v:shape id="empty_s" alt="empty_shape_node"/></w:pict></w:r></w:p></w:body></w:document>';

    const report = buildObjectTraceability(mockFigma, ["frame_1"], emptyCanvasDoc, docxXml, "dummy_hash");
    const shapeMapping = report.mappings.find((m) => m.sourceNodeId === "empty_shape_node");

    expect(shapeMapping).toBeDefined();
    expect(shapeMapping?.contentVerified).toBe(false);
  });

  // Test 6 (F-07): Primitive shapes assigned PRIMITIVE_SHAPE provenance and distinguished from UNRESOLVED
  it("F-07: classifies primitive shapes as PRIMITIVE_SHAPE and separates them from UNRESOLVED vectors", () => {
    const parser = new FigmaCanvasParser({ selectedFrameIds: new Set(["frame_1"]) });
    const mockFigma = {
      document: {
        children: [
          {
            id: "frame_1",
            name: "Page 1",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 800 },
            children: [
              {
                id: "rect_1",
                name: "Rectangle 1",
                type: "RECTANGLE",
                absoluteBoundingBox: { x: 10, y: 10, width: 100, height: 50 },
                fills: [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } }],
              },
              {
                id: "line_1",
                name: "Line 1",
                type: "LINE",
                absoluteBoundingBox: { x: 10, y: 70, width: 100, height: 0 },
                strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
                strokeWeight: 1,
              },
              {
                id: "ellipse_1",
                name: "Ellipse 1",
                type: "ELLIPSE",
                absoluteBoundingBox: { x: 10, y: 80, width: 40, height: 40 },
                fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 0, a: 1 } }],
              },
            ],
          },
        ],
      },
    };

    const doc = parser.parse(mockFigma);
    const rectElem = doc.pages[0].elements.find((e) => e.sourceNodeId === "rect_1");
    const lineElem = doc.pages[0].elements.find((e) => e.sourceNodeId === "line_1");
    const ovalElem = doc.pages[0].elements.find((e) => e.sourceNodeId === "ellipse_1");

    expect(rectElem?.geometryProvenance).toBe("PRIMITIVE_SHAPE");
    expect(lineElem?.geometryProvenance).toBe("PRIMITIVE_SHAPE");
    expect(ovalElem?.geometryProvenance).toBe("PRIMITIVE_SHAPE");
  });
});
