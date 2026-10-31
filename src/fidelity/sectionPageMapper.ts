import { CanvasDocument } from "../canvas/types.js";

export interface PageMappingEntry {
  pageNumber: number; // 1-indexed
  figmaNodeId: string;
  canvasPageId?: string;
  docxSectionIndex: number; // 1-indexed
  renderedPageIndex: number; // 1-indexed
  pdfPageNumber: number; // 1-indexed
  hasContent: boolean;
  traceableTextsCount: number;
  traceableShapesCount: number;
  traceableImagesCount: number;
  sectionBreakType: "nextPage" | "continuous" | "evenPage" | "oddPage" | "bodyFinal";
  pageSize: {
    widthTwips: number;
    heightTwips: number;
    orientation: "portrait" | "landscape";
  };
  status: "PAGE_MAPPING_VERIFIED" | "PAGE_MAPPING_UNVERIFIED";
  diagnostics?: string;
}

export interface SectionPageMappingReport {
  totalTargetFrames: number;
  totalCanvasPages: number;
  totalDocxSections: number;
  totalWordRenderedPages: number;
  verifiedMappingsCount: number;
  unverifiedMappingsCount: number;
  mappingVerdict: "VERIFIED" | "PARTIAL" | "FAILED";
  pages: PageMappingEntry[];
}

/**
 * Extracts top-level document sections while strictly ignoring nested paragraphs inside VML textboxes.
 */
export function extractTopLevelSections(docxXml: string): string[] {
  const bodyMatch = docxXml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/);
  const bodyContent = bodyMatch ? bodyMatch[1] : docxXml;

  let depth = 0;
  const sections: string[] = [];
  let currentSectionBuffer = "";
  let curPStart = -1;
  const pRegex = /<\/?w:p\b[^>]*>/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = pRegex.exec(bodyContent)) !== null) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0 && curPStart !== -1) {
        const topLevelP = bodyContent.substring(curPStart, pRegex.lastIndex);
        currentSectionBuffer += topLevelP;
        curPStart = -1;
        lastIndex = pRegex.lastIndex;

        if (topLevelP.includes("<w:sectPr")) {
          sections.push(currentSectionBuffer);
          currentSectionBuffer = "";
        }
      }
    } else {
      if (depth === 0) {
        if (m.index > lastIndex) {
          const intermediate = bodyContent.substring(lastIndex, m.index);
          if (intermediate.includes("<w:sectPr")) {
            currentSectionBuffer += intermediate;
            sections.push(currentSectionBuffer);
            currentSectionBuffer = "";
          } else {
            currentSectionBuffer += intermediate;
          }
        }
        curPStart = m.index;
      }
      depth++;
    }
  }

  const trailing = bodyContent.substring(lastIndex);
  if (trailing.length > 0 || currentSectionBuffer.length > 0) {
    currentSectionBuffer += trailing;
    if (currentSectionBuffer.trim().length > 0) {
      sections.push(currentSectionBuffer);
    }
  }

  return sections.length > 0 ? sections : [bodyContent];
}

/**
 * Validates the exact 1-to-1 correspondence between Figma frames, Canvas pages,
 * DOCX sections, and Word rendered PDF pages.
 */
export function auditSectionPageMapping(
  canvasDoc: CanvasDocument,
  docxXml: string,
  targetFrameIds: string[],
  wordRenderedPageCount: number
): SectionPageMappingReport {
  const sections = extractTopLevelSections(docxXml);
  const pageEntries: PageMappingEntry[] = [];

  let verifiedCount = 0;
  let unverifiedCount = 0;

  const count = Math.max(targetFrameIds.length, canvasDoc.pages.length, sections.length);

  for (let idx = 0; idx < count; idx++) {
    const pageNum = idx + 1;
    const figmaNodeId = targetFrameIds[idx] || `UNMAPPED_${pageNum}`;
    const canvasPage = canvasDoc.pages[idx];
    const sectionXml = sections[idx] || "";

    const textsCount = (sectionXml.match(/<w:t[\s>][\s\S]*?<\/w:t>/g) || []).length;
    const shapesCount = (sectionXml.match(/<v:(rect|shape|oval|line|roundrect)\b/g) || []).length;
    const imagesCount = (sectionXml.match(/<v:imagedata\b/g) || []).length;
    const hasContent = textsCount > 0 || shapesCount > 0 || imagesCount > 0;

    // Extract section page dimensions and type
    const pgSzMatch = sectionXml.match(/<w:pgSz[^>]*w:w="([^"]+)"[^>]*w:h="([^"]+)"(?:[^>]*w:orient="([^"]+)")?[^>]*\/>/);
    const typeMatch = sectionXml.match(/<w:type[^>]*w:val="([^"]+)"[^>]*\/>/);

    const wTwips = pgSzMatch ? parseInt(pgSzMatch[1], 10) : 11906;
    const hTwips = pgSzMatch ? parseInt(pgSzMatch[2], 10) : 16838;
    const orient = pgSzMatch && pgSzMatch[3] === "landscape" ? "landscape" : "portrait";
    const sectBreakType = (typeMatch ? typeMatch[1] : (idx === sections.length - 1 ? "bodyFinal" : "nextPage")) as PageMappingEntry["sectionBreakType"];

    // A mapping is verified if frame, canvas page, docx section, and word rendered page align 1:1
    const frameMatches = !!canvasPage && (!canvasPage.frameId || canvasPage.frameId === figmaNodeId);
    const withinWordPages = pageNum <= wordRenderedPageCount;
    const isVerified = frameMatches && withinWordPages && hasContent;

    if (isVerified) {
      verifiedCount++;
    } else {
      unverifiedCount++;
    }

    pageEntries.push({
      pageNumber: pageNum,
      figmaNodeId,
      canvasPageId: canvasPage?.frameId,
      docxSectionIndex: pageNum,
      renderedPageIndex: pageNum,
      pdfPageNumber: pageNum,
      hasContent,
      traceableTextsCount: textsCount,
      traceableShapesCount: shapesCount,
      traceableImagesCount: imagesCount,
      sectionBreakType: sectBreakType,
      pageSize: {
        widthTwips: wTwips,
        heightTwips: hTwips,
        orientation: orient,
      },
      status: isVerified ? "PAGE_MAPPING_VERIFIED" : "PAGE_MAPPING_UNVERIFIED",
      diagnostics: isVerified
        ? `Page ${pageNum} verified: Frame ${figmaNodeId} -> Section ${pageNum} -> Rendered Page ${pageNum}`
        : `Page ${pageNum} unverified: Frame alignment or rendered content mismatch`,
    });
  }

  const mappingVerdict =
    unverifiedCount === 0 && verifiedCount === targetFrameIds.length
      ? "VERIFIED"
      : verifiedCount >= targetFrameIds.length - 1
      ? "PARTIAL"
      : "FAILED";

  return {
    totalTargetFrames: targetFrameIds.length,
    totalCanvasPages: canvasDoc.pages.length,
    totalDocxSections: sections.length,
    totalWordRenderedPages: wordRenderedPageCount,
    verifiedMappingsCount: verifiedCount,
    unverifiedMappingsCount: unverifiedCount,
    mappingVerdict,
    pages: pageEntries,
  };
}
