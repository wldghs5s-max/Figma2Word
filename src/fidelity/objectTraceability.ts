import crypto from "crypto";
import { CanvasDocument, CanvasElement } from "../canvas/types.js";
import { extractTopLevelSections } from "./sectionPageMapper.js";

export type SourceElementKind = "TEXT" | "SHAPE" | "IMAGE" | "CONTAINER";

export type ConversionStatus =
  | "CONVERTED"
  | "PARTIALLY_CONVERTED"
  | "INTENTIONALLY_OMITTED"
  | "UNSUPPORTED"
  | "MISSING"
  | "UNRESOLVED";

export type MappingRelation =
  | "ONE_TO_ONE"
  | "ONE_TO_MANY"
  | "MANY_TO_ONE"
  | "INTENTIONALLY_OMITTED"
  | "UNSUPPORTED"
  | "MISSING";

export type EditabilityStatus =
  | "RUNTIME_EDIT_VERIFIED"
  | "STRUCTURALLY_EDITABLE"
  | "NOT_APPLICABLE"
  | "UNSUPPORTED";

export type UnresolvedCategory =
  | "ACTUAL_MISSING"
  | "MAPPING_FAILURE"
  | "MULTI_OBJECT_DECOMPOSED"
  | "MERGED_INTO_PARENT"
  | "INTENTIONAL_OMISSION"
  | "UNSUPPORTED_TYPE"
  | "UNRESOLVED";

export interface UnresolvedBreakdown {
  actualMissingCount: number;
  mappingFailureCount: number;
  multiObjectDecomposedCount: number;
  mergedIntoParentCount: number;
  intentionalOmissionCount: number;
  unsupportedTypeCount: number;
  stillUnresolvedCount: number;
}

export interface TraceableObjectMapping {
  sourceDocumentSha256: string;
  sourceFrameNodeId: string;
  sourceNodeId: string;
  sourceNodeType: string;
  sourceElementKind: SourceElementKind;
  sourceContentHash: string;

  canonicalIrElementId?: string;
  canonicalIrElementType?: string;

  docxPart?: string;
  docxObjectId?: string;
  docxObjectType?: string;
  docxRelationshipId?: string;

  expectedPageIndex: number;
  renderedPageIndex?: number;

  outputContentHash?: string;
  contentVerified?: boolean;

  conversionStatus: ConversionStatus;
  mappingRelation: MappingRelation;
  editabilityStatus: EditabilityStatus;
  unresolvedCategory?: UnresolvedCategory;
  omissionReason?: string;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
}

export interface TraceabilitySummary {
  timestamp: string;
  sourceDocumentSha256: string;
  totalSourceNodes: number;
  totalTraceableNodes: number;
  totalDocxObjectsMapped: number;

  sourceObjectsFound: number;
  irObjectsMapped: number;
  docxObjectsResolved: number;
  contentVerifiedCount: number;
  unresolvedInDocxCount: number;

  unresolvedBreakdown?: UnresolvedBreakdown;

  sourceTextsCount: number;
  sourceShapesCount: number;
  sourceImagesCount: number;
  sourceContainersCount: number;

  preservedTextsCount: number;
  preservedShapesCount: number;
  preservedImagesCount: number;

  textPreservationRate: number;
  shapePreservationRate: number;
  imagePreservationRate: number;

  convertedCount: number;
  intentionallyOmittedCount: number;
  unsupportedCount: number;
  missingCount: number;

  overallTraceabilityRate: number;
  traceabilityVerdict: "VERIFIED" | "PARTIAL" | "FAILED";
}

export interface ObjectTraceabilityReport {
  summary: TraceabilitySummary;
  mappings: TraceableObjectMapping[];
}

export interface BuildObjectTraceabilityOptions {
  docxRelsXml?: string;
  mediaFilesMap?: Map<string, { size: number; isPlaceholder?: boolean }>;
}

export function unescapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function extractTextFromWordSnippet(snippet: string): string {
  if (!snippet) return "";
  const regex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  const parts: string[] = [];
  while ((match = regex.exec(snippet)) !== null) {
    parts.push(match[1]);
  }
  return normalizeText(parts.join(""));
}

export function normalizeText(str: string): string {
  if (!str) return "";
  return unescapeXml(str).replace(/\s+/g, " ").trim();
}

function hashString(val: string): string {
  return crypto.createHash("sha256").update(val, "utf8").digest("hex").slice(0, 16);
}

/**
 * Builds deterministic, item-level Source-to-Word traceability records from raw Figma frames,
 * Canvas IR, and Word OpenXML structures.
 */
export function buildObjectTraceability(
  figmaRaw: any,
  targetFrameIds: string[],
  canvasDoc: CanvasDocument,
  docxXmlContent: string,
  jsonSha256: string,
  options?: BuildObjectTraceabilityOptions
): ObjectTraceabilityReport {
  const mappings: TraceableObjectMapping[] = [];

  // Parse .rels if provided
  const relIdToTarget = new Map<string, string>();
  if (options?.docxRelsXml) {
    const relRegex = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
    let rMatch: RegExpExecArray | null;
    while ((rMatch = relRegex.exec(options.docxRelsXml)) !== null) {
      relIdToTarget.set(rMatch[1], rMatch[2]);
    }
  }

  // Parse docxXmlContent to extract all shape ids, alt attributes, rIds, and text content
  interface DocxShapeEntry {
    tag: string;
    id: string;
    alt?: string;
    title?: string;
    pageIndex: number;
    rawSnippet: string;
  }

  const docxShapesById = new Map<string, DocxShapeEntry>();
  const docxShapesByAlt = new Map<string, DocxShapeEntry[]>();

  // Word document is split into top-level sections per page
  const sections = extractTopLevelSections(docxXmlContent);
  const shapeTagRegex = /<v:(rect|shape|line|oval|roundrect)\b([^>]*)>/g;

  for (let sectIdx = 0; sectIdx < sections.length; sectIdx++) {
    const sectXml = sections[sectIdx];
    const pageNum = sectIdx + 1;
    let match: RegExpExecArray | null;
    const scanner = new RegExp(shapeTagRegex.source, "g");
    while ((match = scanner.exec(sectXml)) !== null) {
      const tag = match[1];
      const attrStr = match[2];
      const idMatch = /id="([^"]+)"/.exec(attrStr);
      const altMatch = /alt="([^"]+)"/.exec(attrStr);
      const titleMatch = /o:title="([^"]+)"/.exec(attrStr);

      const shapeId = idMatch ? idMatch[1] : undefined;
      const alt = altMatch ? altMatch[1] : undefined;
      const title = titleMatch ? titleMatch[1] : undefined;

      if (!shapeId) continue;

      // Extract full snippet up to closing tag </v:${tag}> or next shape
      const shapeEndIdx = sectXml.indexOf(`</v:${tag}>`, match.index);
      const fullShapeSnippet = shapeEndIdx !== -1
        ? sectXml.substring(match.index, shapeEndIdx + tag.length + 4)
        : match[0];

      const entry: DocxShapeEntry = {
        tag,
        id: shapeId,
        alt,
        title,
        pageIndex: pageNum,
        rawSnippet: fullShapeSnippet,
      };

      docxShapesById.set(shapeId, entry);
      if (alt) {
        if (!docxShapesByAlt.has(alt)) {
          docxShapesByAlt.set(alt, []);
        }
        docxShapesByAlt.get(alt)!.push(entry);
      }
    }
  }

  // Also collect VML imagedata relationships
  const imagedataRegex = /<v:imagedata[^>]*r:id="([^"]+)"[^>]*>/g;
  const docxImagesByRel = new Set<string>();
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imagedataRegex.exec(docxXmlContent)) !== null) {
    docxImagesByRel.add(imgMatch[1]);
  }

  // Canvas elements indexed by sourceNodeId
  const canvasElementsBySourceId = new Map<string, CanvasElement[]>();
  for (let pageNum = 1; pageNum <= canvasDoc.pages.length; pageNum++) {
    const page = canvasDoc.pages[pageNum - 1];
    for (const elem of page.elements) {
      const srcId = elem.sourceNodeId || elem.id;
      if (!canvasElementsBySourceId.has(srcId)) {
        canvasElementsBySourceId.set(srcId, []);
      }
      canvasElementsBySourceId.get(srcId)!.push(elem);
    }
  }

  // Process Figma nodes for each target frame
  let totalSourceNodes = 0;
  let sourceTexts = 0;
  let sourceShapes = 0;
  let sourceImages = 0;
  let sourceContainers = 0;

  let irObjectsCount = 0;
  let docxObjectsResolvedCount = 0;
  let contentVerifiedCount = 0;
  let unresolvedInDocxCount = 0;

  let preservedTexts = 0;
  let preservedShapes = 0;
  let preservedImages = 0;

  let convertedCount = 0;
  let omittedCount = 0;
  let unsupportedCount = 0;
  let missingCount = 0;

  // Find frames in figmaRaw
  const frameNodesMap = new Map<string, any>();
  function searchFrames(node: any) {
    if (!node) return;
    if (targetFrameIds.includes(node.id)) {
      frameNodesMap.set(node.id, node);
    }
    if (node.children && Array.isArray(node.children)) {
      for (const c of node.children) searchFrames(c);
    }
  }
  const rootNode = figmaRaw.figmaNode || figmaRaw.document || figmaRaw;
  searchFrames(rootNode);

  for (let frameIdx = 0; frameIdx < targetFrameIds.length; frameIdx++) {
    const frameId = targetFrameIds[frameIdx];
    const frameNode = frameNodesMap.get(frameId);
    const expectedPage = frameIdx + 1;

    if (!frameNode) {
      continue;
    }

    function walkSourceNode(n: any, parentFrameId: string) {
      totalSourceNodes++;
      const nodeId = n.id;
      const nodeType = n.type || "UNKNOWN";
      const isVisible = n.visible !== false;

      let elementKind: SourceElementKind = "SHAPE";
      let contentString = `${nodeId}:${nodeType}`;

      if (nodeType === "TEXT") {
        elementKind = "TEXT";
        sourceTexts++;
        contentString += `:${n.characters || ""}`;
      } else if (
        n.fills &&
        Array.isArray(n.fills) &&
        n.fills.some((f: any) => f.type === "IMAGE")
      ) {
        elementKind = "IMAGE";
        sourceImages++;
        const imgFill = n.fills.find((f: any) => f.type === "IMAGE");
        contentString += `:imageRef=${imgFill?.imageRef || ""}`;
      } else if (
        [
          "RECTANGLE",
          "ELLIPSE",
          "VECTOR",
          "LINE",
          "POLYGON",
          "STAR",
          "BOOLEAN_OPERATION",
        ].includes(nodeType)
      ) {
        elementKind = "SHAPE";
        sourceShapes++;
        contentString += `:w=${n.size?.x || 0}:h=${n.size?.y || 0}`;
      } else {
        elementKind = "CONTAINER";
        sourceContainers++;
      }

      const sourceContentHash = hashString(contentString);

      // Check visibility & empty containers
      if (!isVisible) {
        omittedCount++;
        mappings.push({
          sourceDocumentSha256: jsonSha256,
          sourceFrameNodeId: parentFrameId,
          sourceNodeId: nodeId,
          sourceNodeType: nodeType,
          sourceElementKind: elementKind,
          sourceContentHash,
          expectedPageIndex: expectedPage,
          conversionStatus: "INTENTIONALLY_OMITTED",
          mappingRelation: "INTENTIONALLY_OMITTED",
          editabilityStatus: "NOT_APPLICABLE",
          unresolvedCategory: "INTENTIONAL_OMISSION",
          omissionReason: "HIDDEN_NODE_VISIBLE_FALSE",
          confidenceLevel: "HIGH",
        });
        return;
      }

      // Check if node is purely a structural layout wrapper without visible rendering
      const hasVisibleFill =
        n.fills &&
        Array.isArray(n.fills) &&
        n.fills.some((f: any) => f.visible !== false && f.type !== "NONE");
      const hasVisibleStroke =
        n.strokes &&
        Array.isArray(n.strokes) &&
        n.strokes.some((s: any) => s.visible !== false);
      const isRenderableContainer = hasVisibleFill || hasVisibleStroke;

      if (elementKind === "CONTAINER" && !isRenderableContainer) {
        omittedCount++;
        mappings.push({
          sourceDocumentSha256: jsonSha256,
          sourceFrameNodeId: parentFrameId,
          sourceNodeId: nodeId,
          sourceNodeType: nodeType,
          sourceElementKind: elementKind,
          sourceContentHash,
          expectedPageIndex: expectedPage,
          conversionStatus: "INTENTIONALLY_OMITTED",
          mappingRelation: "INTENTIONALLY_OMITTED",
          editabilityStatus: "NOT_APPLICABLE",
          unresolvedCategory: "INTENTIONAL_OMISSION",
          omissionReason: "STRUCTURAL_CONTAINER_DECOMPOSED_TO_CHILDREN",
          confidenceLevel: "HIGH",
        });

        // Recurse into children
        if (n.children && Array.isArray(n.children)) {
          for (const c of n.children) walkSourceNode(c, parentFrameId);
        }
        return;
      }

      // Look up corresponding Canvas IR elements and DOCX OpenXML shapes
      const matchedCanvasElems = canvasElementsBySourceId.get(nodeId) || [];
      const matchedDocxShapes = docxShapesByAlt.get(nodeId) || [];

      const inIr = matchedCanvasElems.length > 0;
      const inDocx = matchedDocxShapes.length > 0;

      if (inIr) irObjectsCount++;

      let conversionStatus: ConversionStatus = "CONVERTED";
      let mappingRelation: MappingRelation = "ONE_TO_ONE";
      let editabilityStatus: EditabilityStatus = "STRUCTURALLY_EDITABLE";
      let contentVerified = false;

      if (!inIr && !inDocx) {
        // Did not convert to either IR or DOCX
        if (nodeType === "COMPONENT" || nodeType === "INSTANCE") {
          conversionStatus = "INTENTIONALLY_OMITTED";
          mappingRelation = "INTENTIONALLY_OMITTED";
          editabilityStatus = "NOT_APPLICABLE";
          omittedCount++;
        } else {
          conversionStatus = "MISSING";
          mappingRelation = "MISSING";
          editabilityStatus = "UNSUPPORTED";
          missingCount++;
        }
      } else if (inIr && !inDocx) {
        // Converted to IR, but NOT resolved into actual Word DOCX OpenXML
        // This fails closed: IR-only is NOT preserved in Word!
        conversionStatus = "UNRESOLVED";
        mappingRelation = "MISSING";
        editabilityStatus = "UNSUPPORTED";
        unresolvedInDocxCount++;
      } else {
        // inDocx is true! Actually resolved into Word document!
        docxObjectsResolvedCount++;

        // Verify content
        if (elementKind === "TEXT") {
          const rawChars = n.characters || "";
          const normSource = normalizeText(rawChars);

          // Extract and concatenate all text runs from matched Word docx shapes
          let combinedDocxText = "";
          for (const s of matchedDocxShapes) {
            const txt = extractTextFromWordSnippet(s.rawSnippet);
            if (txt) {
              if (combinedDocxText) combinedDocxText += " ";
              combinedDocxText += txt;
            }
          }
          combinedDocxText = normalizeText(combinedDocxText);

          if (normSource.length === 0) {
            contentVerified = true;
            contentVerifiedCount++;
            preservedTexts++;
          } else {
            // Strict content verification: must exactly match or fully contain the normalized source text
            // Partial slice matches (e.g. first 20 chars) are strictly prohibited
            const matches =
              combinedDocxText.length > 0 &&
              (combinedDocxText === normSource || combinedDocxText.includes(normSource));

            if (matches) {
              contentVerified = true;
              contentVerifiedCount++;
              preservedTexts++;
            } else {
              contentVerified = false;
              conversionStatus = "PARTIALLY_CONVERTED";
            }
          }
        } else if (elementKind === "SHAPE") {
          const primaryDocxShape = matchedDocxShapes[0];
          if (primaryDocxShape && primaryDocxShape.id && primaryDocxShape.tag) {
            contentVerified = true;
            contentVerifiedCount++;
            preservedShapes++;
          } else {
            contentVerified = false;
            conversionStatus = "PARTIALLY_CONVERTED";
          }
        } else if (elementKind === "IMAGE") {
          const primarySnippet = matchedDocxShapes[0]?.rawSnippet || "";
          const rIdMatch = /r:id="([^"]+)"/.exec(primarySnippet) || /r:embed="([^"]+)"/.exec(primarySnippet);
          const actualRId = rIdMatch ? rIdMatch[1] : undefined;

          // Evidence-based image verification: requires actual relationship ID, rels XML, and authentic media file
          if (actualRId && options?.docxRelsXml && options?.mediaFilesMap) {
            const target = relIdToTarget.get(actualRId);
            if (target) {
              const mediaInfo = options.mediaFilesMap.get(target);
              if (mediaInfo && !mediaInfo.isPlaceholder && mediaInfo.size > 100) {
                // Confirmed non-placeholder media bytes with authentic relationship
                contentVerified = true;
                contentVerifiedCount++;
                preservedImages++;
              } else {
                // Placeholder dummy image or empty bytes
                contentVerified = false;
                conversionStatus = "PARTIALLY_CONVERTED";
              }
            } else {
              // Broken relationship target
              contentVerified = false;
              conversionStatus = "PARTIALLY_CONVERTED";
            }
          } else {
            // Unverified image: missing rels XML, missing media map, or missing r:id
            contentVerified = false;
            conversionStatus = "UNRESOLVED";
          }
        }

        convertedCount++;

        if (matchedCanvasElems.length > 1 || matchedDocxShapes.length > 1) {
          mappingRelation = "ONE_TO_MANY";
        } else {
          mappingRelation = "ONE_TO_ONE";
        }

        if (elementKind === "TEXT" || elementKind === "SHAPE") {
          editabilityStatus = "STRUCTURALLY_EDITABLE";
        } else {
          editabilityStatus = "NOT_APPLICABLE";
        }
      }

      const primaryDocxShape = matchedDocxShapes[0];
      const primaryCanvasElem = matchedCanvasElems[0];

      // Extract genuine relationship ID if present (never synthesize rId_${imageRef})
      let resolvedRelationshipId: string | undefined;
      if (elementKind === "IMAGE" && primaryDocxShape) {
        const rMatch = /r:id="([^"]+)"/.exec(primaryDocxShape.rawSnippet) || /r:embed="([^"]+)"/.exec(primaryDocxShape.rawSnippet);
        if (rMatch) resolvedRelationshipId = rMatch[1];
      }

      // Classify unresolved/missing objects into canonical categories without unverified heuristics
      let unresolvedCategory: UnresolvedCategory | undefined;
      if (conversionStatus === "INTENTIONALLY_OMITTED") {
        unresolvedCategory = "INTENTIONAL_OMISSION";
      } else if (
        ["BOOLEAN_OPERATION", "SLICE", "CANVAS", "CONNECTOR", "WIDGET", "EMBED", "LINK_UNFURL"].includes(
          nodeType
        )
      ) {
        unresolvedCategory = "UNSUPPORTED_TYPE";
      } else if (conversionStatus === "UNRESOLVED" || conversionStatus === "MISSING") {
        if (matchedDocxShapes.length > 1) {
          unresolvedCategory = "MULTI_OBJECT_DECOMPOSED";
        } else if (docxShapesById.has(nodeId)) {
          unresolvedCategory = "MAPPING_FAILURE";
        } else {
          // Without definitive OpenXML proof of parent merging or omission,
          // leave strictly classified as UNRESOLVED
          unresolvedCategory = "UNRESOLVED";
        }
      }

      mappings.push({
        sourceDocumentSha256: jsonSha256,
        sourceFrameNodeId: parentFrameId,
        sourceNodeId: nodeId,
        sourceNodeType: nodeType,
        sourceElementKind: elementKind,
        sourceContentHash,

        canonicalIrElementId: primaryCanvasElem?.id,
        canonicalIrElementType: primaryCanvasElem?.type,

        docxPart: primaryDocxShape ? "word/document.xml" : undefined,
        docxObjectId: primaryDocxShape?.id,
        docxObjectType: primaryDocxShape?.tag,
        docxRelationshipId: resolvedRelationshipId,

        expectedPageIndex: expectedPage,
        renderedPageIndex: primaryDocxShape?.pageIndex || expectedPage,
        outputContentHash: primaryDocxShape ? hashString(primaryDocxShape.rawSnippet) : undefined,
        contentVerified,

        conversionStatus,
        mappingRelation,
        editabilityStatus,
        unresolvedCategory,
        omissionReason:
          conversionStatus === "INTENTIONALLY_OMITTED"
            ? "CONTAINER_TRANSPARENT_WRAPPER"
            : conversionStatus === "UNRESOLVED"
            ? "IR_ELEMENT_NOT_RESOLVED_IN_DOCX_XML"
            : undefined,
        confidenceLevel: "HIGH",
      });

      // Recurse into children
      if (n.children && Array.isArray(n.children)) {
        for (const c of n.children) walkSourceNode(c, parentFrameId);
      }
    }

    if (frameNode.children && Array.isArray(frameNode.children)) {
      for (const c of frameNode.children) walkSourceNode(c, frameId);
    }
  }

  const textPreservationRate =
    sourceTexts > 0 ? Number((preservedTexts / sourceTexts).toFixed(4)) : 1.0;
  const shapePreservationRate =
    sourceShapes > 0 ? Number((preservedShapes / sourceShapes).toFixed(4)) : 1.0;
  const imagePreservationRate =
    sourceImages > 0 ? Number((preservedImages / sourceImages).toFixed(4)) : 1.0;

  const totalTraceableNodes = convertedCount + omittedCount;
  const overallTraceabilityRate =
    totalSourceNodes > 0 ? Number((totalTraceableNodes / totalSourceNodes).toFixed(4)) : 1.0;

  let traceabilityVerdict: "VERIFIED" | "PARTIAL" | "FAILED" = "FAILED";
  if (totalSourceNodes === 0) {
    traceabilityVerdict = "FAILED";
  } else if (
    missingCount === 0 &&
    unresolvedInDocxCount === 0 &&
    textPreservationRate >= 0.95 &&
    overallTraceabilityRate >= 0.95
  ) {
    traceabilityVerdict = "VERIFIED";
  } else if (missingCount + unresolvedInDocxCount <= 5) {
    traceabilityVerdict = "PARTIAL";
  } else {
    traceabilityVerdict = "FAILED";
  }

  const unresolvedBreakdown: UnresolvedBreakdown = {
    actualMissingCount: mappings.filter((m) => m.unresolvedCategory === "ACTUAL_MISSING").length,
    mappingFailureCount: mappings.filter((m) => m.unresolvedCategory === "MAPPING_FAILURE").length,
    multiObjectDecomposedCount: mappings.filter((m) => m.unresolvedCategory === "MULTI_OBJECT_DECOMPOSED").length,
    mergedIntoParentCount: mappings.filter((m) => m.unresolvedCategory === "MERGED_INTO_PARENT").length,
    intentionalOmissionCount: mappings.filter((m) => m.unresolvedCategory === "INTENTIONAL_OMISSION").length,
    unsupportedTypeCount: mappings.filter((m) => m.unresolvedCategory === "UNSUPPORTED_TYPE").length,
    stillUnresolvedCount: mappings.filter((m) => m.unresolvedCategory === "UNRESOLVED").length,
  };

  const summary: TraceabilitySummary = {
    timestamp: new Date().toISOString(),
    sourceDocumentSha256: jsonSha256,
    totalSourceNodes,
    totalTraceableNodes,
    totalDocxObjectsMapped: docxObjectsResolvedCount,

    sourceObjectsFound: totalSourceNodes,
    irObjectsMapped: irObjectsCount,
    docxObjectsResolved: docxObjectsResolvedCount,
    contentVerifiedCount,
    unresolvedInDocxCount,
    unresolvedBreakdown,

    sourceTextsCount: sourceTexts,
    sourceShapesCount: sourceShapes,
    sourceImagesCount: sourceImages,
    sourceContainersCount: sourceContainers,

    preservedTextsCount: preservedTexts,
    preservedShapesCount: preservedShapes,
    preservedImagesCount: preservedImages,

    textPreservationRate,
    shapePreservationRate,
    imagePreservationRate,

    convertedCount,
    intentionallyOmittedCount: omittedCount,
    unsupportedCount,
    missingCount,

    overallTraceabilityRate,
    traceabilityVerdict,
  };

  return {
    summary,
    mappings,
  };
}
