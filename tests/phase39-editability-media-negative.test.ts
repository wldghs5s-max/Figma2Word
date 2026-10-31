import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { auditDocxEditability, SourceElementReference } from "../src/fidelity/editabilityAuditor.js";
import { auditDocxMediaRelationships } from "../src/fidelity/mediaRelationshipAuditor.js";

async function createDocxWithXml(documentXml: string, relsXml?: string, mediaFiles?: { [name: string]: Buffer }): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("word/document.xml", documentXml);
  if (relsXml) {
    zip.file("word/_rels/document.xml.rels", relsXml);
  }
  if (mediaFiles) {
    for (const [name, buf] of Object.entries(mediaFiles)) {
      zip.file(`word/media/${name}`, buf);
    }
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("Phase 39: Editability & Media Codex Vulnerability Hardening Suite", () => {
  it("1. Rejects score 100 / FULLY_EDITABLE when source has 100 texts/shapes but Word has only 3 text nodes (Codex defect reproduction)", async () => {
    // 3 text nodes in Word, 0 shapes, 0 media
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Only Three</w:t></w:r></w:p>
    <w:p><w:r><w:t>Text Nodes</w:t></w:r></w:p>
    <w:p><w:r><w:t>In Word</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`;

    const docxBuf = await createDocxWithXml(docXml);

    const sourceRefs: SourceElementReference[] = [
      {
        pageNumber: 1,
        textCount: 100, // 100 in Figma!
        shapeCount: 100, // 100 in Figma!
        imageCount: 0,
      },
    ];

    const audit = await auditDocxEditability(docxBuf, "test.docx", "hash", sourceRefs);

    // In old buggy code, this received score = 100 and FULLY_EDITABLE!
    // With Phase 39 fix, score must be heavily penalized (< 30) and cannot be FULLY_EDITABLE!
    expect(audit.pages[0].editabilityScore).toBeLessThan(30);
    expect(audit.pages[0].classification).not.toBe("FULLY_EDITABLE");
    expect(audit.globalSummary.overallVerdict).toBe("ISSUES_FOUND");
  });

  it("2. Detects BROKEN_RELATIONSHIP when v:imagedata references rId that does not exist in .rels (Codex defect reproduction)", async () => {
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:pict><v:rect><v:imagedata r:id="rIdMissingFromRels"/></v:rect></w:pict></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`;

    // Empty relationships in .rels!
    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

    const docxBuf = await createDocxWithXml(docXml, relsXml);
    const mediaAudit = await auditDocxMediaRelationships(docxBuf);

    // Must detect the broken relationship!
    expect(mediaAudit.brokenRelationshipsCount).toBeGreaterThan(0);
    const brokenRel = mediaAudit.relationships.find((r) => r.relId === "rIdMissingFromRels");
    expect(brokenRel).toBeDefined();
    expect(brokenRel?.mediaType).toBe("BROKEN_RELATIONSHIP");
  });

  it("3. Identifies transparent placeholder image file by size (< 70 bytes)", async () => {
    // 68-byte 1x1 transparent PNG
    const tinyPlaceholderPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:pict><v:rect><v:imagedata r:id="rIdPlaceholder"/></v:rect></w:pict></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdPlaceholder" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/placeholder.png"/>
</Relationships>`;

    const docxBuf = await createDocxWithXml(docXml, relsXml, { "placeholder.png": tinyPlaceholderPng });
    const mediaAudit = await auditDocxMediaRelationships(docxBuf);

    expect(mediaAudit.relationships[0].isPlaceholder).toBe(true);
  });
});

