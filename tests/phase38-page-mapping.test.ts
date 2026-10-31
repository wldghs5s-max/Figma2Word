import { describe, it, expect } from "vitest";
import { auditSectionPageMapping, extractTopLevelSections } from "../src/fidelity/sectionPageMapper.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 38: Section-to-Rendered Page Mapping Suite", () => {
  it("1. Accurately maps 3 sections to 3 pages without off-by-one shifts from nested textboxes", () => {
    const canvasDoc: CanvasDocument = {
      title: "Test Doc",
      pageSize: { widthPt: 595.28, heightPt: 841.89 },
      pages: [
        {
          pageNumber: 1,
          frameId: "F1",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [],
        },
        {
          pageNumber: 2,
          frameId: "F2",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [],
        },
        {
          pageNumber: 3,
          frameId: "F3",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [],
        },
      ],
      resources: {},
    };

    const docxXml = `<w:document><w:body>
  <w:p>
    <w:pPr><w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:pPr>
    <w:r><w:pict><v:rect id="s_0_0" alt="F1"><v:textbox><w:txbxContent><w:p><w:r><w:t>Page 1 Text 1</w:t></w:r></w:p><w:p><w:r><w:t>Page 1 Text 2</w:t></w:r></w:p></w:txbxContent></v:textbox></v:rect></w:pict></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:pPr>
    <w:r><w:pict><v:rect id="s_1_0" alt="F2"><v:textbox><w:txbxContent><w:p><w:r><w:t>Page 2 Text</w:t></w:r></w:p></w:txbxContent></v:textbox></v:rect></w:pict></w:r>
  </w:p>
  <w:p>
    <w:pPr/>
    <w:r><w:pict><v:rect id="s_2_0" alt="F3"><v:textbox><w:txbxContent><w:p><w:r><w:t>Page 3 Text</w:t></w:r></w:p></w:txbxContent></v:textbox></v:rect></w:pict></w:r>
  </w:p>
  <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
</w:body></w:document>`;

    const sections = extractTopLevelSections(docxXml);
    expect(sections.length).toBe(3);

    const report = auditSectionPageMapping(canvasDoc, docxXml, ["F1", "F2", "F3"], 3);
    expect(report.totalTargetFrames).toBe(3);
    expect(report.totalDocxSections).toBe(3);
    expect(report.totalWordRenderedPages).toBe(3);
    expect(report.verifiedMappingsCount).toBe(3);
    expect(report.mappingVerdict).toBe("VERIFIED");

    // Page 1 should contain exactly 2 text nodes, NOT shifted to Page 2!
    expect(report.pages[0].traceableTextsCount).toBe(2);
    expect(report.pages[1].traceableTextsCount).toBe(1);
    expect(report.pages[2].traceableTextsCount).toBe(1);
  });

  it("2. Flags PAGE_MAPPING_UNVERIFIED when page count is truncated in Word rendering", () => {
    const canvasDoc: CanvasDocument = {
      title: "Test Doc",
      pageSize: { widthPt: 595.28, heightPt: 841.89 },
      pages: [
        { pageNumber: 1, bounds: { x: 0, y: 0, width: 100, height: 100 }, elements: [] },
        { pageNumber: 2, bounds: { x: 0, y: 0, width: 100, height: 100 }, elements: [] },
      ],
      resources: {},
    };

    const docxXml = `<w:document><w:body>
  <w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/></w:sectPr></w:pPr><w:r><w:t>P1</w:t></w:r></w:p>
  <w:p><w:r><w:t>P2</w:t></w:r></w:p>
  <w:sectPr/>
</w:body></w:document>`;

    // Word rendered only 1 page instead of 2
    const report = auditSectionPageMapping(canvasDoc, docxXml, ["N1", "N2"], 1);
    expect(report.pages[0].status).toBe("PAGE_MAPPING_VERIFIED");
    expect(report.pages[1].status).toBe("PAGE_MAPPING_UNVERIFIED");
    expect(report.mappingVerdict).toBe("PARTIAL");
  });
});
