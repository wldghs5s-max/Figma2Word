import JSZip from "jszip";

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
  hasFullPageCoverImage: boolean;
  coverImageDetails?: string;
  editabilityScore: number; // 0 to 100
  classification: "FULLY_EDITABLE" | "HYBRID_EDITABLE" | "IMAGE_DOMINATED" | "FULL_PAGE_COVER_CHEAT";
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
    totalDrawings: number;
    totalMediaImages: number;
    fullPageCoverCheatCount: number;
    averageEditabilityScore: number;
    overallVerdict: "PASSED" | "ISSUES_FOUND" | "IMAGE_CHEAT_DETECTED";
  };
  pages: PageEditabilityReport[];
}

/**
 * Audits a DOCX buffer or file for internal XML structure, evaluating true
 * native editability vs. raster image cheats.
 */
export async function auditDocxEditability(
  docxBuffer: Buffer | Uint8Array,
  docxPath = "in-memory.docx",
  docxSha256 = ""
): Promise<DocumentEditabilityAudit> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const docXml = await zip.file("word/document.xml")?.async("text");

  if (!docXml) {
    throw new Error("Invalid DOCX: missing word/document.xml");
  }

  // Find all media files
  const mediaFiles = Object.keys(zip.files).filter((k) => k.startsWith("word/media/"));

  // Split document by sections
  // In Word, section properties are defined by <w:sectPr>
  const bodyMatch = docXml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/);
  const bodyContent = bodyMatch ? bodyMatch[1] : docXml;

  // Split content by w:sectPr
  const rawSections: string[] = [];
  const sectPrRegex = /<w:sectPr[\s\S]*?<\/w:sectPr>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sectPrRegex.exec(bodyContent)) !== null) {
    const chunk = bodyContent.substring(lastIndex, match.index + match[0].length);
    rawSections.push(chunk);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < bodyContent.length) {
    const trailing = bodyContent.substring(lastIndex);
    if (trailing.trim().length > 0) {
      rawSections.push(trailing);
    }
  }

  // If no sectPr found, treat whole body as single section
  const sectionChunks = rawSections.length > 0 ? rawSections : [bodyContent];

  const pageReports: PageEditabilityReport[] = [];

  let grandTextNodes = 0;
  let grandParagraphs = 0;
  let grandTables = 0;
  let grandShapes = 0;
  let grandDrawings = 0;
  let coverCheats = 0;
  let totalScoreSum = 0;

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

      if (wMatch) widthPt = Number(wMatch[1]) / 20.0; // twips to pt
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
    const mediaRefMatches = chunk.match(/r:embed="([^"]+)"/g) || [];

    const textNodeCount = textMatches.length;
    const paragraphCount = pMatches.length;
    const tableCount = tblMatches.length;
    const vmlShapeCount = vmlShapeMatches.length;
    const vmlTextboxCount = vmlTextboxMatches.length;
    const drawingCount = drawingMatches.length;
    const mediaReferencesCount = mediaRefMatches.length;

    // 3. Detect Full Page Cover Image Cheats
    // An image whose bounds cover > 90% of section width and height with < 3 text nodes
    let hasFullPageCoverImage = false;
    let coverImageDetails: string | undefined;

    // Check VML imagedata / rect with full dimension
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

    // 4. Calculate Editability Score (0 - 100)
    // Positive factors: native text nodes, paragraphs, tables, native vector shapes
    // Negative factors: pure raster image cover, absence of selectable text
    let score = 0;
    let classification: PageEditabilityReport["classification"] = "FULLY_EDITABLE";
    const findings: string[] = [];

    if (hasFullPageCoverImage) {
      score = 5;
      classification = "FULL_PAGE_COVER_CHEAT";
      findings.push("CRITICAL: Full-page raster image covers canvas, bypassing native typography");
      coverCheats++;
    } else if (mediaReferencesCount === 0 && textNodeCount > 0) {
      // 100% vector / text native document without raster dependencies
      score = 100;
      classification = "FULLY_EDITABLE";
      findings.push(`Pure native editable content: ${textNodeCount} text nodes (${textLength} chars)`);
    } else {
      // Hybrid document: calculate proportional score
      const editableItems = textNodeCount + vmlShapeCount + tableCount * 3;
      const totalItems = editableItems + mediaReferencesCount;
      const editableRatio = totalItems > 0 ? editableItems / totalItems : 0;

      score = Math.round(editableRatio * 100);

      if (textNodeCount === 0 && mediaReferencesCount > 0) {
        score = Math.min(score, 15);
        classification = "IMAGE_DOMINATED";
        findings.push("Page contains zero editable text nodes; entirely graphic-driven");
      } else if (score >= 70) {
        classification = "FULLY_EDITABLE";
        findings.push(`Rich editable typography: ${textNodeCount} text nodes, ${mediaReferencesCount} media elements`);
      } else if (score >= 30) {
        classification = "HYBRID_EDITABLE";
        findings.push(`Balanced hybrid layout: ${textNodeCount} text nodes, ${mediaReferencesCount} media elements`);
      } else {
        classification = "IMAGE_DOMINATED";
        findings.push(`Image-heavy page: only ${textNodeCount} text nodes vs ${mediaReferencesCount} media elements`);
      }

      if (tableCount > 0) {
        findings.push(`Structured Word table: ${tableCount} native table(s)`);
      }
    }

    grandTextNodes += textNodeCount;
    grandParagraphs += paragraphCount;
    grandTables += tableCount;
    grandShapes += vmlShapeCount;
    grandDrawings += drawingCount;
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
      hasFullPageCoverImage,
      coverImageDetails,
      editabilityScore: score,
      classification,
      findings,
    });
  }

  const avgScore = sectionChunks.length > 0 ? Math.round(totalScoreSum / sectionChunks.length) : 0;
  let overallVerdict: DocumentEditabilityAudit["globalSummary"]["overallVerdict"] = "PASSED";
  if (coverCheats > 0) overallVerdict = "IMAGE_CHEAT_DETECTED";
  else if (avgScore < 50) overallVerdict = "ISSUES_FOUND";

  return {
    docxPath,
    docxSha256,
    totalSections: sectionChunks.length,
    globalSummary: {
      totalTextNodes: grandTextNodes,
      totalParagraphs: grandParagraphs,
      totalTables: grandTables,
      totalVmlShapes: grandShapes,
      totalDrawings: grandDrawings,
      totalMediaImages: mediaFiles.length,
      fullPageCoverCheatCount: coverCheats,
      averageEditabilityScore: avgScore,
      overallVerdict,
    },
    pages: pageReports,
  };
}
