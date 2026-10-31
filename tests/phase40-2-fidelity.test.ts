import { describe, it, expect } from "vitest";
import {
  synthesizeVectorIconPath,
  FigmaCanvasParser,
} from "../src/canvas/parser/figmaCanvasParser.js";
import {
  extractTextFromWordSnippet,
  normalizeText,
  buildObjectTraceability,
} from "../src/fidelity/objectTraceability.js";
import { auditLayoutStability } from "../src/fidelity/layoutStabilityAuditor.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 40.2 — Vector Fidelity & Word Verification Hardening", () => {
  // G-01 #1: profile must NOT be misclassified as file
  it("A-03: 'profile' must synthesize user profile path, NOT file/document path", () => {
    const profileRes = synthesizeVectorIconPath("user-header", "profile", 20, 20, true, false);
    const fileRes = synthesizeVectorIconPath("attachment", "file-text", 20, 20, true, false);

    expect(profileRes.provenance).toBe("SEMANTIC_APPROXIMATION");
    expect(fileRes.provenance).toBe("SEMANTIC_APPROXIMATION");

    // Profile path must NOT match file document path
    expect(profileRes.path).not.toBe(fileRes.path);
    // Profile should contain user head/body curves
    expect(profileRes.path).toContain("180 C 580");
    // File contains document folded corner (620 80 L 820 280)
    expect(fileRes.path).toContain("620 80 L 820 280");
  });

  // G-01 #2: update must NOT be misclassified as calendar (date)
  it("A-03: 'update' must synthesize refresh/rotate path, NOT calendar path", () => {
    const updateRes = synthesizeVectorIconPath("data-view", "update", 16, 16, false, true);
    const calRes = synthesizeVectorIconPath("schedule", "calendar", 16, 16, false, true);

    expect(updateRes.provenance).toBe("SEMANTIC_APPROXIMATION");
    expect(calRes.provenance).toBe("SEMANTIC_APPROXIMATION");

    // Must be completely different icons
    expect(updateRes.path).not.toBe(calRes.path);
    // Update path has arc/arrow (M 250 400 A 350)
    expect(updateRes.path).toContain("A 350 350");
    // Calendar path has rectangular frame with rings (M 150 220 L 850 220)
    expect(calRes.path).toContain("M 150 220 L 850 220");
  });

  // G-01 #3: arrow-left and arrow-right must have distinct opposing directions
  it("A-03: arrow-left and arrow-right must produce distinct, opposing chevron paths", () => {
    const leftRes = synthesizeVectorIconPath("nav", "arrow-left", 12, 16, false, true);
    const rightRes = synthesizeVectorIconPath("nav", "arrow-right", 12, 16, false, true);

    expect(leftRes.provenance).toBe("SEMANTIC_APPROXIMATION");
    expect(rightRes.provenance).toBe("SEMANTIC_APPROXIMATION");

    // Different paths
    expect(leftRes.path).not.toBe(rightRes.path);
    // Left arrow points left (x=300 peak)
    expect(leftRes.path).toContain("300 500");
    // Right arrow points right (x=700 peak)
    expect(rightRes.path).toContain("700 500");
  });

  // G-01 #4: Unrecognized icon must be classified as fallback, not claimed as original
  it("A-05: Unrecognized icon must be marked as GEOMETRIC_FALLBACK, not SOURCE_GEOMETRY", () => {
    const unknownRes = synthesizeVectorIconPath("custom-wrapper-42", "unnamed-node", 24, 24, true, true);
    expect(unknownRes.provenance).toBe("GEOMETRIC_FALLBACK");
    expect(unknownRes.path).toBe("M 100 100 L 900 100 L 900 900 L 100 900 Z");
  });

  // G-01 #5: Multiple vector siblings under composite icon must synthesize discrete components
  it("A-04: Multiple vector siblings under composite parent produce distinct subpaths without duplication", () => {
    // Sibling 0: arc, Sibling 1: arrowhead
    const arcRes = synthesizeVectorIconPath("rotate-ccw 1", "Vector", 12, 12, false, true, {
      siblingIndex: 0,
      totalVectorSiblings: 2,
    });
    const headRes = synthesizeVectorIconPath("rotate-ccw 1", "Vector", 3.3, 3.3, false, true, {
      siblingIndex: 1,
      totalVectorSiblings: 2,
    });

    expect(arcRes.provenance).toBe("LOCALLY_RECOVERED_GEOMETRY");
    expect(headRes.provenance).toBe("LOCALLY_RECOVERED_GEOMETRY");

    // Child 1 is the 3/4 arc
    expect(arcRes.path).toContain("A 350 350");
    // Child 2 is the tiny arrowhead hook
    expect(headRes.path).toContain("M 100 900 L 100 100 L 900 100");
    expect(arcRes.path).not.toBe(headRes.path);

    // Composite calendar: child 0 is line (0x2), child 2 is outer box (12x12)
    const lineRes = synthesizeVectorIconPath("calendar 1", "Vector", 0.5, 2.0, false, true, {
      siblingIndex: 0,
      totalVectorSiblings: 4,
    });
    const boxRes = synthesizeVectorIconPath("calendar 1", "Vector", 12, 12, false, true, {
      siblingIndex: 2,
      totalVectorSiblings: 4,
    });

    expect(lineRes.path).toBe("M 500 0 L 500 1000"); // vertical line
    expect(boxRes.path).toContain("M 150 200 L 850 200"); // outer calendar box
  });

  // G-01 #6: Multiple paths in fillGeometry/strokeGeometry must all be concatenated
  it("A-02: Multi-path fillGeometry and strokeGeometry must be fully retained", () => {
    const rawFigma = {
      document: {
        id: "0:0",
        type: "DOCUMENT",
        children: [
          {
            id: "1:1",
            name: "TestFrame",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 200 },
            children: [
              {
                id: "2:2",
                name: "MultiPathVector",
                type: "VECTOR",
                absoluteBoundingBox: { x: 10, y: 10, width: 50, height: 50 },
                fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
                fillGeometry: [
                  { path: "M 0 0 L 10 10" },
                  { path: "M 20 20 L 30 30" },
                  { path: "M 40 40 L 50 50" },
                ],
              },
            ],
          },
        ],
      },
    };

    const parser = new FigmaCanvasParser({ selectedFrameIds: ["1:1"] });
    const doc = parser.parse(rawFigma as any);

    const vectorElem = doc.pages[0].elements.find((e) => e.id === "2:2");
    expect(vectorElem).toBeDefined();
    expect(vectorElem?.geometryProvenance).toBe("SOURCE_GEOMETRY");
    // All 3 paths concatenated
    expect(vectorElem?.rawSvgPath).toBe("M 0 0 L 10 10 M 20 20 L 30 30 M 40 40 L 50 50");
  });

  // G-01 #7: <w:br> and <w:cr> in Word snippet must be preserved as space/newline
  it("C-01: extractTextFromWordSnippet extracts <w:br/> and <w:cr/> without concatenated words", () => {
    const snippetWithBr = `
      <w:p>
        <w:r><w:t>디자인 가이드 필요</w:t><w:br/><w:t>눈에 안들어옴</w:t></w:r>
      </w:p>
    `;
    const extracted = extractTextFromWordSnippet(snippetWithBr);
    expect(extracted).toBe("디자인 가이드 필요 눈에 안들어옴");

    const snippetWithCrAndTab = `
      <w:p>
        <w:r><w:t>Line 1</w:t><w:cr/><w:tab/><w:t>Line 2</w:t></w:r>
      </w:p>
    `;
    const extracted2 = extractTextFromWordSnippet(snippetWithCrAndTab);
    expect(extracted2).toBe("Line 1 Line 2");
  });

  // G-01 #8: Strict content verification fails if text is truncated or missing
  it("C-02: Content verification strictly fails when trailing text is omitted", () => {
    const figmaDoc = {
      document: {
        id: "0:0",
        type: "DOCUMENT",
        children: [
          {
            id: "10:1",
            name: "Page 1",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 500, height: 500 },
            children: [
              {
                id: "10:2",
                name: "FullText",
                type: "TEXT",
                characters: "한국어 원본 문장 전체 일치 검증 테스트 문구입니다",
                absoluteBoundingBox: { x: 10, y: 10, width: 200, height: 30 },
              },
            ],
          },
        ],
      },
    };

    const canvasDoc: CanvasDocument = {
      title: "Test",
      pageSize: { name: "A4", widthPt: 595, heightPt: 842, unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595, height: 842 },
          elements: [
            {
              id: "10:2",
              type: "text",
              bounds: { x: 10, y: 10, width: 200, height: 30 },
              zIndex: 1,
              style: {},
              sourceNodeId: "10:2",
              sourceNodeType: "TEXT",
            },
          ],
        },
      ],
      resources: {},
      diagnostics: { unmappedTypes: [], unsupportedProperties: [], warnings: [] },
    };

    // Word doc contains only truncated first 20 characters
    const docxTruncatedXml = `
      <w:sectPr>
        <v:rect id="s_1" alt="10:2">
          <v:textbox><w:txbxContent><w:p><w:r><w:t>한국어 원본 문장 전체 일치 검</w:t></w:r></w:p></w:txbxContent></v:textbox>
        </v:rect>
      </w:sectPr>
    `;

    const report = buildObjectTraceability(
      figmaDoc,
      ["10:1"],
      canvasDoc,
      docxTruncatedXml,
      "dummy-sha"
    );

    const mapping = report.mappings.find((m) => m.sourceNodeId === "10:2");
    expect(mapping).toBeDefined();
    expect(mapping?.contentVerified).toBe(false);
    expect(mapping?.conversionStatus).toBe("PARTIALLY_CONVERTED");
  });

  // G-01 #10: Dynamic layout stability fails closed when pageCountPreserved is false
  it("D-01: auditLayoutStability fails closed when pageCountPreserved is false", () => {
    // Calling auditLayoutStability with pageCountPreserved = false
    const report = auditLayoutStability("dummy/before", "dummy/after", [], 17, false, true);

    expect(report.pageCountPreserved).toBe(false);
    expect(report.layoutStabilityVerdict).toBe("FAILED");
  });

  // G-01 #10: Dynamic layout stability fails closed when sectionCountPreserved is false
  it("D-01: auditLayoutStability fails closed when sectionCountPreserved is false", () => {
    const report = auditLayoutStability("dummy/before", "dummy/after", [], 17, true, false);

    expect(report.sectionCountPreserved).toBe(false);
    expect(report.layoutStabilityVerdict).toBe("FAILED");
  });
});
