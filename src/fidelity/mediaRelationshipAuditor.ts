import JSZip from "jszip";

export type ImageRelationshipType =
  | "EMBEDDED_IMAGE"
  | "LINKED_IMAGE"
  | "BROKEN_RELATIONSHIP"
  | "UNREFERENCED_MEDIA"
  | "NATIVE_VECTOR"
  | "UNKNOWN_MEDIA";

export interface MediaRelationshipDetail {
  relId: string;
  target: string;
  targetMode: "Internal" | "External";
  mediaType: ImageRelationshipType;
  fileName?: string;
  fileSizeBytes?: number;
  usageCount: number;
  referencingSections: number[];
}

export interface SectionMediaUsage {
  sectionIndex: number;
  pageNumber: number;
  vmlImageCount: number;
  drawingMlImageCount: number;
  totalImageElements: number;
  referencedRelIds: string[];
}

export interface DocumentMediaAuditResult {
  totalMediaFilesInZip: number;
  totalImageRelationships: number;
  totalImageElementsInDoc: number;
  totalDuplicateUsages: number;
  brokenRelationshipsCount: number;
  unreferencedMediaCount: number;
  embeddedImagesCount: number;
  linkedImagesCount: number;
  mediaFiles: {
    zipPath: string;
    sizeBytes: number;
    isReferenced: boolean;
    referencingRelIds: string[];
  }[];
  relationships: MediaRelationshipDetail[];
  perSectionUsage: SectionMediaUsage[];
  reconciliationNotes: string;
}

/**
 * Parses and audits all media assets, relationships, and image tag references in a DOCX package.
 */
export async function auditDocxMediaRelationships(
  docxBuffer: Buffer | Uint8Array
): Promise<DocumentMediaAuditResult> {
  const zip = await JSZip.loadAsync(docxBuffer);

  // 1. Enumerate files in word/media/
  const mediaFilesMap = new Map<string, number>();
  for (const fileName of Object.keys(zip.files)) {
    if (fileName.startsWith("word/media/") && !zip.files[fileName].dir) {
      const fileData = await zip.file(fileName)?.async("uint8array");
      mediaFilesMap.set(fileName, fileData ? fileData.length : 0);
    }
  }

  // 2. Read word/_rels/document.xml.rels
  const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("text");
  const relMap = new Map<
    string,
    { target: string; targetMode: "Internal" | "External"; type: string }
  >();

  if (relsXml) {
    const relMatches = relsXml.matchAll(
      /<Relationship\s+([^>]+)\/?>/g
    );
    for (const match of relMatches) {
      const attrs = match[1];
      const idMatch = attrs.match(/Id="([^"]+)"/);
      const typeMatch = attrs.match(/Type="([^"]+)"/);
      const targetMatch = attrs.match(/Target="([^"]+)"/);
      const modeMatch = attrs.match(/TargetMode="([^"]+)"/);

      if (idMatch && typeMatch && targetMatch) {
        const id = idMatch[1];
        const type = typeMatch[1];
        const target = targetMatch[1];
        const targetMode = modeMatch && modeMatch[1] === "External" ? "External" : "Internal";

        if (
          type.includes("/relationships/image") ||
          target.startsWith("media/") ||
          /\.(png|jpe?g|gif|webp|svg|emf|wmf)$/i.test(target)
        ) {
          relMap.set(id, { target, targetMode, type });
        }
      }
    }
  }

  // 3. Read word/document.xml and section chunks
  const docXml = await zip.file("word/document.xml")?.async("text");
  if (!docXml) {
    throw new Error("Invalid DOCX: missing word/document.xml");
  }

  // Extract sections
  const bodyMatch = docXml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/);
  const bodyContent = bodyMatch ? bodyMatch[1] : docXml;

  const rawSections: string[] = [];
  let searchPos = 0;
  while (searchPos < bodyContent.length) {
    const sectPrIdx = bodyContent.indexOf("<w:sectPr", searchPos);
    if (sectPrIdx === -1) {
      const trailing = bodyContent.substring(searchPos);
      if (trailing.trim().length > 0) {
        if (rawSections.length > 0) {
          rawSections[rawSections.length - 1] += trailing;
        } else {
          rawSections.push(trailing);
        }
      }
      break;
    }
    const sectPrCloseIdx = bodyContent.indexOf("</w:sectPr>", sectPrIdx);
    if (sectPrCloseIdx === -1) break;
    const sectPrEnd = sectPrCloseIdx + "</w:sectPr>".length;

    const lastPBeforeSectPr = bodyContent.lastIndexOf("<w:p", sectPrIdx);
    const lastPCloseBeforeSectPr = bodyContent.lastIndexOf("</w:p>", sectPrIdx);
    const isInsideP =
      lastPBeforeSectPr >= searchPos &&
      (lastPCloseBeforeSectPr === -1 || lastPBeforeSectPr > lastPCloseBeforeSectPr);

    let chunkEnd = sectPrEnd;
    if (isInsideP) {
      const pCloseIdx = bodyContent.indexOf("</w:p>", sectPrEnd);
      if (pCloseIdx !== -1) {
        chunkEnd = pCloseIdx + "</w:p>".length;
      }
    }
    rawSections.push(bodyContent.substring(searchPos, chunkEnd));
    searchPos = chunkEnd;
  }
  const sectionChunks = rawSections.length > 0 ? rawSections : [bodyContent];

  // 4. Track usages per relationship and per section
  const relUsageMap = new Map<
    string,
    { count: number; sections: Set<number> }
  >();
  for (const relId of relMap.keys()) {
    relUsageMap.set(relId, { count: 0, sections: new Set() });
  }

  const perSectionUsage: SectionMediaUsage[] = [];
  let totalDocImageElements = 0;

  for (let sIdx = 0; sIdx < sectionChunks.length; sIdx++) {
    const chunk = sectionChunks[sIdx];
    const pageNum = sIdx + 1;
    let vmlImgCount = 0;
    let drawingMlImgCount = 0;
    const referencedInThisSection: string[] = [];

    // Check VML <v:imagedata ...>
    const vmlMatches = chunk.matchAll(/<v:imagedata\s+([^>]+)\/?>/g);
    for (const vm of vmlMatches) {
      vmlImgCount++;
      const attrs = vm[1];
      const rIdMatch = attrs.match(/(?:r:id|o:relid)="([^"]+)"/);
      if (rIdMatch) {
        const rId = rIdMatch[1];
        referencedInThisSection.push(rId);
        if (!relUsageMap.has(rId)) {
          relUsageMap.set(rId, { count: 0, sections: new Set() });
        }
        const usage = relUsageMap.get(rId)!;
        usage.count++;
        usage.sections.add(pageNum);
      }
    }

    // Check DrawingML <a:blip ...>
    const blipMatches = chunk.matchAll(/<a:blip\s+([^>]+)\/?>/g);
    for (const bm of blipMatches) {
      drawingMlImgCount++;
      const attrs = bm[1];
      const rEmbedMatch = attrs.match(/(?:r:embed|r:link)="([^"]+)"/);
      if (rEmbedMatch) {
        const rId = rEmbedMatch[1];
        referencedInThisSection.push(rId);
        if (!relUsageMap.has(rId)) {
          relUsageMap.set(rId, { count: 0, sections: new Set() });
        }
        const usage = relUsageMap.get(rId)!;
        usage.count++;
        usage.sections.add(pageNum);
      }
    }

    const sectionTotal = vmlImgCount + drawingMlImgCount;
    totalDocImageElements += sectionTotal;

    perSectionUsage.push({
      sectionIndex: sIdx,
      pageNumber: pageNum,
      vmlImageCount: vmlImgCount,
      drawingMlImageCount: drawingMlImgCount,
      totalImageElements: sectionTotal,
      referencedRelIds: referencedInThisSection,
    });
  }

  // 5. Construct MediaRelationshipDetail and classify
  const relationshipDetails: MediaRelationshipDetail[] = [];
  let brokenCount = 0;
  let embeddedCount = 0;
  let linkedCount = 0;
  let duplicateUsageCount = 0;

  const referencedMediaFiles = new Set<string>();

  for (const [rId, rel] of relMap.entries()) {
    const usage = relUsageMap.get(rId) || { count: 0, sections: new Set<number>() };
    const target = rel.target;
    let mediaType: ImageRelationshipType = "UNKNOWN_MEDIA";
    let fileSizeBytes: number | undefined;

    if (rel.targetMode === "External") {
      mediaType = "LINKED_IMAGE";
      linkedCount++;
    } else {
      const normalizedZipPath = target.startsWith("word/")
        ? target
        : target.startsWith("media/")
        ? `word/${target}`
        : `word/${target.replace(/^\.\//, "")}`;

      if (mediaFilesMap.has(normalizedZipPath)) {
        mediaType = "EMBEDDED_IMAGE";
        fileSizeBytes = mediaFilesMap.get(normalizedZipPath);
        embeddedCount++;
        referencedMediaFiles.add(normalizedZipPath);
      } else {
        mediaType = "BROKEN_RELATIONSHIP";
        brokenCount++;
      }
    }

    if (usage.count > 1) {
      duplicateUsageCount += usage.count - 1;
    }

    relationshipDetails.push({
      relId: rId,
      target,
      targetMode: rel.targetMode,
      mediaType,
      fileName: target.split("/").pop(),
      fileSizeBytes,
      usageCount: usage.count,
      referencingSections: Array.from(usage.sections).sort((a, b) => a - b),
    });
  }

  // Check unreferenced media files in word/media/
  const mediaFilesSummary = Array.from(mediaFilesMap.entries()).map(([zipPath, sizeBytes]) => {
    const isReferenced = referencedMediaFiles.has(zipPath);
    const referencingRelIds: string[] = [];
    for (const [rId, rel] of relMap.entries()) {
      const norm = rel.target.startsWith("media/") ? `word/${rel.target}` : rel.target;
      if (norm === zipPath) referencingRelIds.push(rId);
    }
    return {
      zipPath,
      sizeBytes,
      isReferenced,
      referencingRelIds,
    };
  });

  const unreferencedCount = mediaFilesSummary.filter((f) => !f.isReferenced).length;

  const reconciliationNotes = `DOCX contains ${mediaFilesMap.size} media files in word/media/, which are mapped to ${relMap.size} OpenXML Relationships. ` +
    `These relationships are referenced ${totalDocImageElements} times across ${sectionChunks.length} sections (${duplicateUsageCount} duplicate usages across multiple pages/shapes). ` +
    `Broken relationships: ${brokenCount}, Unreferenced media files: ${unreferencedCount}.`;

  return {
    totalMediaFilesInZip: mediaFilesMap.size,
    totalImageRelationships: relMap.size,
    totalImageElementsInDoc: totalDocImageElements,
    totalDuplicateUsages: duplicateUsageCount,
    brokenRelationshipsCount: brokenCount,
    unreferencedMediaCount: unreferencedCount,
    embeddedImagesCount: embeddedCount,
    linkedImagesCount: linkedCount,
    mediaFiles: mediaFilesSummary,
    relationships: relationshipDetails,
    perSectionUsage,
    reconciliationNotes,
  };
}

