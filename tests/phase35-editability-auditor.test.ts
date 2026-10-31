import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { auditDocxEditability } from "../src/fidelity/editabilityAuditor.js";

async function createSyntheticDocx(options: {
  texts?: string[];
  vmlRectWidthPt?: number;
  vmlRectHeightPt?: number;
  pageWidthPt?: number;
  pageHeightPt?: number;
  hasMedia?: boolean;
}): Promise<Buffer> {
  const zip = new JSZip();

  const pw = (options.pageWidthPt || 612) * 20; // in twips
  const ph = (options.pageHeightPt || 792) * 20;

  let body = "";
  if (options.vmlRectWidthPt && options.vmlRectHeightPt) {
    body += `<w:p><w:r><w:pict><v:rect style="width:${options.vmlRectWidthPt}pt;height:${options.vmlRectHeightPt}pt" r:embed="rId1"/></w:pict></w:r></w:p>`;
  }

  if (options.texts && options.texts.length > 0) {
    for (const t of options.texts) {
      body += `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
    }
  }

  body += `<w:sectPr><w:pgSz w:w="${pw}" w:h="${ph}" w:orient="portrait"/></w:sectPr>`;

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${body}
  </w:body>
</w:document>`;

  zip.file("word/document.xml", docXml);
  if (options.hasMedia) {
    zip.file("word/media/image1.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

describe("Phase 35: DOCX Editability Auditor Suite", () => {
  it("1. Successfully audits rich native editable DOCX", async () => {
    const docxBuf = await createSyntheticDocx({
      texts: ["Title of Document", "Section 1: Introduction", "Paragraph content with typography", "Conclusion remarks"],
      pageWidthPt: 612,
      pageHeightPt: 792,
    });

    const report = await auditDocxEditability(docxBuf);
    expect(report.totalSections).toBe(1);
    expect(report.globalSummary.totalTextNodes).toBe(4);
    expect(report.globalSummary.fullPageCoverCheatCount).toBe(0);
    expect(report.pages[0].classification).toBe("FULLY_EDITABLE");
    expect(report.pages[0].hasFullPageCoverImage).toBe(false);
  });

  it("2. Accurately detects and penalizes full-page raster cover image cheat", async () => {
    // 600pt x 780pt rect on a 612pt x 792pt page with 0 text nodes
    const cheatDocx = await createSyntheticDocx({
      vmlRectWidthPt: 600,
      vmlRectHeightPt: 780,
      pageWidthPt: 612,
      pageHeightPt: 792,
      hasMedia: true,
      texts: [], // ZERO text nodes!
    });

    const report = await auditDocxEditability(cheatDocx);
    expect(report.pages[0].hasFullPageCoverImage).toBe(true);
    expect(report.pages[0].classification).toBe("FULL_PAGE_COVER_CHEAT");
    expect(report.pages[0].editabilityScore).toBe(5);
    expect(report.globalSummary.overallVerdict).toBe("IMAGE_CHEAT_DETECTED");
  });

  it("3. Classifies hybrid document with text and reasonable graphics as HYBRID_EDITABLE", async () => {
    const hybridDocx = await createSyntheticDocx({
      vmlRectWidthPt: 200,
      vmlRectHeightPt: 150, // Small graphic card
      pageWidthPt: 612,
      pageHeightPt: 792,
      hasMedia: true,
      texts: ["Only Card Title"], // 1 text + 1 shape vs 1 media -> ratio ~ 50-66%
    });

    const report = await auditDocxEditability(hybridDocx);
    expect(report.pages[0].hasFullPageCoverImage).toBe(false);
    expect(report.pages[0].classification).toBe("HYBRID_EDITABLE");
  });

  it("4. Classifies completely empty section as EMPTY_PAGE rather than IMAGE_DOMINATED", async () => {
    const emptyDocx = await createSyntheticDocx({
      pageWidthPt: 612,
      pageHeightPt: 792,
      texts: [],
      hasMedia: false,
    });

    const report = await auditDocxEditability(emptyDocx);
    expect(report.pages[0].classification).toBe("EMPTY_PAGE");
    expect(report.pages[0].editabilityScore).toBe(0);
    expect(report.pages[0].findings[0]).toContain("Page is empty");
  });
});
