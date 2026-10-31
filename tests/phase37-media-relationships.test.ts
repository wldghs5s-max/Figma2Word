import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { auditDocxMediaRelationships } from "../src/fidelity/mediaRelationshipAuditor.js";

async function createMockDocxWithRels(options: {
  mediaFiles?: string[];
  relationships?: { id: string; target: string; mode?: "Internal" | "External" }[];
  vmlImages?: { rId: string; sectionIndex: number }[];
  drawingMlImages?: { rId: string; sectionIndex: number }[];
}): Promise<Buffer> {
  const zip = new JSZip();

  // 1. Add media files
  for (const m of options.mediaFiles || []) {
    zip.file(`word/media/${m}`, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));
  }

  // 2. Add rels
  let relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
  for (const r of options.relationships || []) {
    const modeAttr = r.mode === "External" ? ` TargetMode="External"` : "";
    relsXml += `\n  <Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.target}"${modeAttr}/>`;
  }
  relsXml += `\n</Relationships>`;
  zip.file("word/_rels/document.xml.rels", relsXml);

  // 3. Add document XML with sections
  let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>`;

  const maxSec = Math.max(
    0,
    ...(options.vmlImages || []).map((v) => v.sectionIndex),
    ...(options.drawingMlImages || []).map((d) => d.sectionIndex)
  );

  for (let s = 0; s <= maxSec; s++) {
    const vmls = (options.vmlImages || []).filter((v) => v.sectionIndex === s);
    const dmls = (options.drawingMlImages || []).filter((d) => d.sectionIndex === s);

    for (const v of vmls) {
      docXml += `<w:p><w:r><w:pict><v:rect><v:imagedata r:id="${v.rId}"/></v:rect></w:pict></w:r></w:p>`;
    }
    for (const d of dmls) {
      docXml += `<w:p><w:r><w:drawing><a:blip r:embed="${d.rId}"/></w:drawing></w:r></w:p>`;
    }

    docXml += `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>`;
  }

  docXml += `</w:body></w:document>`;
  zip.file("word/document.xml", docXml);

  return zip.generateAsync({ type: "nodebuffer" });
}

describe("Phase 37: DOCX Media Relationship Auditor Suite", () => {
  it("1. Accurately verifies EMBEDDED_IMAGE with 1:1 relationship and media file", async () => {
    const docxBuf = await createMockDocxWithRels({
      mediaFiles: ["image1.png"],
      relationships: [{ id: "rId1", target: "media/image1.png" }],
      vmlImages: [{ rId: "rId1", sectionIndex: 0 }],
    });

    const res = await auditDocxMediaRelationships(docxBuf);
    expect(res.totalMediaFilesInZip).toBe(1);
    expect(res.totalImageRelationships).toBe(1);
    expect(res.totalImageElementsInDoc).toBe(1);
    expect(res.embeddedImagesCount).toBe(1);
    expect(res.brokenRelationshipsCount).toBe(0);
    expect(res.unreferencedMediaCount).toBe(0);
    expect(res.relationships[0].mediaType).toBe("EMBEDDED_IMAGE");
  });

  it("2. Detects BROKEN_RELATIONSHIP when relationship targets missing media file", async () => {
    const docxBuf = await createMockDocxWithRels({
      mediaFiles: [], // Missing media file!
      relationships: [{ id: "rId99", target: "media/missing_photo.png" }],
      vmlImages: [{ rId: "rId99", sectionIndex: 0 }],
    });

    const res = await auditDocxMediaRelationships(docxBuf);
    expect(res.brokenRelationshipsCount).toBe(1);
    expect(res.relationships[0].mediaType).toBe("BROKEN_RELATIONSHIP");
  });

  it("3. Identifies UNREFERENCED_MEDIA files residing in word/media/", async () => {
    const docxBuf = await createMockDocxWithRels({
      mediaFiles: ["used.png", "orphan.png"],
      relationships: [{ id: "rId1", target: "media/used.png" }],
      vmlImages: [{ rId: "rId1", sectionIndex: 0 }],
    });

    const res = await auditDocxMediaRelationships(docxBuf);
    expect(res.totalMediaFilesInZip).toBe(2);
    expect(res.unreferencedMediaCount).toBe(1);
    const orphan = res.mediaFiles.find((m) => m.zipPath.includes("orphan.png"));
    expect(orphan?.isReferenced).toBe(false);
  });

  it("4. Accounts for duplicate image usages across multiple pages", async () => {
    // 1 media file used across 3 sections
    const docxBuf = await createMockDocxWithRels({
      mediaFiles: ["logo.png"],
      relationships: [{ id: "rIdLogo", target: "media/logo.png" }],
      vmlImages: [
        { rId: "rIdLogo", sectionIndex: 0 },
        { rId: "rIdLogo", sectionIndex: 1 },
        { rId: "rIdLogo", sectionIndex: 2 },
      ],
    });

    const res = await auditDocxMediaRelationships(docxBuf);
    expect(res.totalMediaFilesInZip).toBe(1);
    expect(res.totalImageElementsInDoc).toBe(3);
    expect(res.totalDuplicateUsages).toBe(2);
    expect(res.relationships[0].usageCount).toBe(3);
    expect(res.relationships[0].referencingSections).toEqual([1, 2, 3]);
  });
});

