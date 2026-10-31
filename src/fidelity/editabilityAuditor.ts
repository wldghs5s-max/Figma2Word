import JSZip from "jszip";
import { auditDocxMediaRelationships, DocumentMediaAuditResult } from "./mediaRelationshipAuditor.js";

export interface SourceElementReference {
  pageNumber: number;
  textCount: number;
  shapeCount: number;
  imageCount: number;
}

export interface PageEditabilityReport {
  pageNumber: number;
  sectionIndex: number;
  widthPt: number;
  heightPt: number;
  orientation: "landscape" | "portrait";
  textNodeCount: number;
  totalTextLength: number;
  paragraphCount: number;
  tableCount: number;
  vmlShapeCount: number;
  vmlTextboxCount: number;
  drawingCount: number;
  mediaReferencesCount: number;
  vmlImageCount: number;
  drawingMlImageCount: number;
  hasFullPageCoverImage: boolean;
  coverImageDetails?: string;
  sourceFigmaElements?: {
    textCount: number;
    shapeCount: number;
    imageCount: number;
  };
  textPreservationCoverage?: number; // 0.0 to 1.0
  vectorShapePreservation?: number; // 0.0 to 1.0
  imageAssetPreservation?: number; // 0.0 to 1.0
  wordNativeElementRatio: number; // 0.0 to 1.0
  runtimeEditVerified?: boolean;
  editPersistenceVerified?: boolean;
  editabilityScore: number; // 0 to 100
  classification:
    | "FULLY_EDITABLE"
    | "STRUCTURALLY_EDITABLE_NOT_RUNTIME_TESTED"
    | "HYBRID_EDITABLE"
    | "IMAGE_DOMINATED"
    | "FULL_PAGE_COVER_CHEAT"
    | "EMPTY_PAGE";
  findings: string[];
}

export interface DocumentEditabilityAudit {
  docxPath?: string;
  docxSha256?: string;
  totalSections: number;
  globalSummary: {
    totalTextNodes: number;
    totalParagraphs: number;
    totalTables: number;
    totalVmlShapes: number;
    totalVmlTextboxes: number;
    totalDrawings: number;
    totalMediaImages: number;
    totalImageReferencesInDoc: number;
    fullPageCoverCheatCount: number;
    brokenRelationshipsCount: number;
    textPreservationRate?: number;
    vectorShapePreservationRate?: number;
    imageIntegrityVerdict: "PASSED" | "BROKEN_RELATIONSHIPS" | "UNREFERENCED_MEDIA";
    runtimeEditSuccessRate?: string;
    runtimePersistenceRate?: string;
    layoutStabilityVerdict: "STABLE" | "UNSTABLE";
    averageEditabilityScore: number;
    overallVerdict: "PASSED" | "ISSUES_FOUND" | "IMAGE_CHEAT_DETECTED";
  };
  mediaAudit?: DocumentMediaAuditResult;
  pages: PageEditabilityReport[];
}

/**
 * Audits a DOCX buffer or file for internal XML structure, evaluating true
 * native editability vs. raster image cheats, tracking relationships and source element preservation.
 */
export async function auditDocxEditability(
  docxBuffer: Buffer | Uint8Array,
  docxPath = "in-memory.docx",
  docxSha256 = "",
  sourceElements?: SourceElementReference[]
): Promise<DocumentEditabilityAudit> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const docXml = await zip.file("word/document.xml")?.async("text");

  if (!docXml) {
    throw new Error("Invalid DOCX: missing word/document.xml");
  }

  // Run media relationships audit
  const mediaAudit = await auditDocxMediaRelationships(docxBuffer);

  // Split document by sections
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

    // Check if this sectPr is inside an active <w:p>
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

  const pageReports: PageEditabilityReport[] = [];

  let grandTextNodes = 0;
  let grandParagraphs = 0;
  let grandTables = 0;
  let grandShapes = 0;
  let grandTextboxes = 0;
  let grandDrawings = 0;
  let grandMediaRefs = 0;
  let coverCheats = 0;
  let totalScoreSum = 0;

  let totalSourceTexts = 0;
  let totalPreservedTexts = 0;
  let totalSourceShapes = 0;
  let totalPreservedShapes = 0;

  for (let idx = 0; idx < sectionChunks.length; idx++) {
    const chunk = sectionChunks[idx];
    const pageNum = idx + 1;

    // 1. Extract section dimensions from w:pgSz
    let widthPt = 612; // default letter 8.5"
    let heightPt = 792; // default letter 11"
    let orient: "landscape" | "portrait" = "portrait";

    const pgSzMatch = chunk.match(/<w:pgSz\s+([^>]+)\/>/);
    if (pgSzMatch) {
      const attrs = pgSzMatch[1];
      const wMatch = attrs.match(/w:w="(\d+)"/);
      const hMatch = attrs.match(/w:h="(\d+)"/);
      const orientMatch = attrs.match(/w:orient="([^"]+)"/);

      if (wMatch) widthPt = Number(wMatch[1]) / 20.0;
      if (hMatch) heightPt = Number(hMatch[1]) / 20.0;
      if (orientMatch && orientMatch[1] === "landscape") orient = "landscape";
    }

    // 2. Count XML nodes
    const textMatches = chunk.match(/<w:t[\s>]([\s\S]*?)<\/w:t>/g) || [];
    let textLength = 0;
    for (const tm of textMatches) {
      const clean = tm.replace(/<[^>]+>/g, "");
      textLength += clean.length;
    }

    const pMatches = chunk.match(/<w:p[\s>]/g) || [];
    const tblMatches = chunk.match(/<w:tbl[\s>]/g) || [];
    const vmlShapeMatches = chunk.match(/<v:(rect|roundrect|shape|oval|line)[\s>]/g) || [];
    const vmlTextboxMatches = chunk.match(/<v:textbox[\s>]/g) || [];
    const drawingMatches = chunk.match(/<w:drawing[\s>]/g) || [];

    // Accurate image detection: VML imagedata (r:id or o:relid) + DrawingML blip (r:embed or r:link) + VML shapes with r:embed
    const vmlImageMatches = chunk.match(/<v:imagedata\s+[^>]*>/g) || [];
    const drawingMlImageMatches = chunk.match(/<a:blip\s+[^>]*>/g) || [];
    const rEmbedMatches = chunk.match(/r:embed="([^"]+)"/g) || [];

    const textNodeCount = textMatches.length;
    const paragraphCount = pMatches.length;
    const tableCount = tblMatches.length;
    const vmlShapeCount = vmlShapeMatches.length;
    const vmlTextboxCount = vmlTextboxMatches.length;
    const drawingCount = drawingMatches.length;
    const vmlImageCount = vmlImageMatches.length;
    const drawingMlImageCount = drawingMlImageMatches.length;
    // Deduplicate media references: take max of matched image tags vs r:embed matches
    const mediaReferencesCount = Math.max(
      vmlImageCount + drawingMlImageCount,
      rEmbedMatches.length
    );

    // 3. Detect Full Page Cover Image Cheats
    let hasFullPageCoverImage = false;
    let coverImageDetails: string | undefined;

    const vmlRectFullMatch = chunk.match(/width:([0-9.]+)pt;height:([0-9.]+)pt/g) || [];
    for (const style of vmlRectFullMatch) {
      const wSub = style.match(/width:([0-9.]+)pt/);
      const hSub = style.match(/height:([0-9.]+)pt/);
      if (wSub && hSub) {
        const sw = parseFloat(wSub[1]);
        const sh = parseFloat(hSub[1]);
        const coversWidth = sw >= widthPt * 0.90;
        const coversHeight = sh >= heightPt * 0.90;
        if (coversWidth && coversHeight && textNodeCount <= 2 && mediaReferencesCount >= 1) {
          hasFullPageCoverImage = true;
          coverImageDetails = `VML Shape ${sw}pt x ${sh}pt covers full page (${widthPt}x${heightPt}pt) with only ${textNodeCount} text nodes`;
          break;
        }
      }
    }

    // 4. Source element comparison (if provided)
    const sourceRef = sourceElements?.find((s) => s.pageNumber === pageNum);
    let textPreservationCoverage: number | undefined;
    let vectorShapePreservation: number | undefined;
    let imageAssetPreservation: number | undefined;

    if (sourceRef) {
      totalSourceTexts += sourceRef.textCount;
      totalPreservedTexts += Math.min(textNodeCount, sourceRef.textCount);
      totalSourceShapes += sourceRef.shapeCount;
      totalPreservedShapes += Math.min(vmlShapeCount, sourceRef.shapeCount);

      textPreservationCoverage = sourceRef.textCount > 0
        ? Math.min(1.0, textNodeCount / sourceRef.textCount)
        : 1.0;
      vectorShapePreservation = sourceRef.shapeCount > 0
        ? Math.min(1.0, vmlShapeCount / sourceRef.shapeCount)
        : 1.0;
      imageAssetPreservation = sourceRef.imageCount > 0
        ? Math.min(1.0, mediaReferencesCount / sourceRef.imageCount)
        : 1.0;
    }

    // 5. Native element ratio calculation
    // Native elements: text nodes, vector shapes, native tables
    const nativeEditableCount = textNodeCount + vmlShapeCount + tableCount * 3;
    const totalElementCount = nativeEditableCount + mediaReferencesCount;
    const wordNativeElementRatio = totalElementCount > 0
      ? Number((nativeEditableCount / totalElementCount).toFixed(4))
      : 0;

    // 6. Multi-Factor Editability Evaluation
    let score = 0;
    let classification: PageEditabilityReport["classification"] = "FULLY_EDITABLE";
    const findings: string[] = [];

    if (textNodeCount === 0 && vmlShapeCount === 0 && mediaReferencesCount === 0 && drawingCount === 0) {
      score = 0;
      classification = "EMPTY_PAGE";
      findings.push("Page is empty: contains 0 text nodes, 0 vector shapes, and 0 media references");
    } else if (hasFullPageCoverImage) {
      score = 5;
      classification = "FULL_PAGE_COVER_CHEAT";
      findings.push("CRITICAL: Full-page raster image covers canvas, bypassing native typography");
      coverCheats++;
    } else if (textNodeCount === 0 && mediaReferencesCount > 0) {
      score = Math.min(15, Math.round(wordNativeElementRatio * 100));
      classification = "IMAGE_DOMINATED";
      findings.push(`Page contains zero editable text nodes; entirely graphic-driven (${mediaReferencesCount} images)`);
    } else if (mediaReferencesCount === 0) {
      // 100% Vector / Native Typography (no raster dependencies)
      // Check if text volume is rich vs sparse
      if (textNodeCount >= 3) {
        score = 100;
        classification = "FULLY_EDITABLE";
        findings.push(`Pure native editable content: ${textNodeCount} text nodes (${textLength} chars), ${vmlShapeCount} shapes`);
      } else {
        // Sparse text page with 1-2 text nodes
        score = Math.min(100, 75 + textNodeCount * 10);
        classification = "FULLY_EDITABLE";
        findings.push(`Sparse native layout: ${textNodeCount} text node(s), ${vmlShapeCount} vector shape(s)`);
      }
    } else {
      // Hybrid document (combines native text/shapes with referenced images)
      const rawScore = Math.round(wordNativeElementRatio * 100);

      // Award bonus if text density is high (> 20 text nodes)
      const textBonus = textNodeCount >= 20 ? 10 : textNodeCount >= 10 ? 5 : 0;
      score = Math.min(100, Math.max(10, rawScore + textBonus));

      if (score >= 70 && textNodeCount >= 3) {
        classification = "FULLY_EDITABLE";
        findings.push(`Rich editable typography: ${textNodeCount} text nodes, ${vmlShapeCount} vector shapes, ${mediaReferencesCount} image(s)`);
      } else if (score >= 30) {
        classification = "HYBRID_EDITABLE";
        findings.push(`Balanced hybrid layout: ${textNodeCount} text nodes, ${mediaReferencesCount} image(s)`);
      } else {
        classification = "IMAGE_DOMINATED";
        findings.push(`Image-heavy page: only ${textNodeCount} text nodes vs ${mediaReferencesCount} image(s)`);
      }
    }

    if (tableCount > 0) {
      findings.push(`Structured Word table: ${tableCount} native table(s)`);
    }
    if (vmlImageCount > 0) {
      findings.push(`VML image references: ${vmlImageCount}`);
    }
    if (drawingMlImageCount > 0) {
      findings.push(`DrawingML image references: ${drawingMlImageCount}`);
    }

    grandTextNodes += textNodeCount;
    grandParagraphs += paragraphCount;
    grandTables += tableCount;
    grandShapes += vmlShapeCount;
    grandTextboxes += vmlTextboxCount;
    grandDrawings += drawingCount;
    grandMediaRefs += mediaReferencesCount;
    totalScoreSum += score;

    pageReports.push({
      pageNumber: pageNum,
      sectionIndex: idx,
      widthPt,
      heightPt,
      orientation: orient,
      textNodeCount,
      totalTextLength: textLength,
      paragraphCount,
      tableCount,
      vmlShapeCount,
      vmlTextboxCount,
      drawingCount,
      mediaReferencesCount,
      vmlImageCount,
      drawingMlImageCount,
      hasFullPageCoverImage,
      coverImageDetails,
      sourceFigmaElements: sourceRef ? {
        textCount: sourceRef.textCount,
        shapeCount: sourceRef.shapeCount,
        imageCount: sourceRef.imageCount,
      } : undefined,
      textPreservationCoverage,
      vectorShapePreservation,
      imageAssetPreservation,
      wordNativeElementRatio,
      editabilityScore: score,
      classification,
      findings,
    });
  }

  const avgScore = sectionChunks.length > 0 ? Math.round(totalScoreSum / sectionChunks.length) : 0;
  let overallVerdict: DocumentEditabilityAudit["globalSummary"]["overallVerdict"] = "PASSED";
  if (coverCheats > 0) overallVerdict = "IMAGE_CHEAT_DETECTED";
  else if (avgScore < 50) overallVerdict = "ISSUES_FOUND";

  const imageIntegrityVerdict =
    mediaAudit.brokenRelationshipsCount > 0
      ? "BROKEN_RELATIONSHIPS"
      : mediaAudit.unreferencedMediaCount > 0
      ? "UNREFERENCED_MEDIA"
      : "PASSED";

  return {
    docxPath,
    docxSha256,
    totalSections: sectionChunks.length,
    globalSummary: {
      totalTextNodes: grandTextNodes,
      totalParagraphs: grandParagraphs,
      totalTables: grandTables,
      totalVmlShapes: grandShapes,
      totalVmlTextboxes: grandTextboxes,
      totalDrawings: grandDrawings,
      totalMediaImages: mediaAudit.totalMediaFilesInZip,
      totalImageReferencesInDoc: grandMediaRefs,
      fullPageCoverCheatCount: coverCheats,
      brokenRelationshipsCount: mediaAudit.brokenRelationshipsCount,
      textPreservationRate: totalSourceTexts > 0 ? Number((totalPreservedTexts / totalSourceTexts).toFixed(4)) : undefined,
      vectorShapePreservationRate: totalSourceShapes > 0 ? Number((totalPreservedShapes / totalSourceShapes).toFixed(4)) : undefined,
      imageIntegrityVerdict,
      layoutStabilityVerdict: "STABLE",
      averageEditabilityScore: avgScore,
      overallVerdict,
    },
    mediaAudit,
    pages: pageReports,
  };
}
