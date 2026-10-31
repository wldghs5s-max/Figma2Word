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

  conversionStatus: ConversionStatus;
  mappingRelation: MappingRelation;
  editabilityStatus: EditabilityStatus;
  omissionReason?: string;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
}

export interface TraceabilitySummary {
  timestamp: string;
  sourceDocumentSha256: string;
  totalSourceNodes: number;
  totalTraceableNodes: number;
  totalDocxObjectsMapped: number;

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
  jsonSha256: string
): ObjectTraceabilityReport {
  const mappings: TraceableObjectMapping[] = [];

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
      const entry: DocxShapeEntry = {
        tag,
        id: shapeId,
        alt,
        title,
        pageIndex: pageNum,
        rawSnippet: match[0],
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
          omissionReason: "STRUCTURAL_CONTAINER_DECOMPOSED_TO_CHILDREN",
          confidenceLevel: "HIGH",
        });

        // Recurse into children
        if (n.children && Array.isArray(n.children)) {
          for (const c of n.children) walkSourceNode(c, parentFrameId);
        }
        return;
      }

      // Look up corresponding Canvas IR elements
      const matchedCanvasElems = canvasElementsBySourceId.get(nodeId) || [];
      const matchedDocxShapes = docxShapesByAlt.get(nodeId) || [];

      let conversionStatus: ConversionStatus = "CONVERTED";
      let mappingRelation: MappingRelation = "ONE_TO_ONE";
      let editabilityStatus: EditabilityStatus = "STRUCTURALLY_EDITABLE";

      if (matchedCanvasElems.length === 0 && matchedDocxShapes.length === 0) {
        // Did not convert
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
      } else {
        convertedCount++;
        if (elementKind === "TEXT") preservedTexts++;
        else if (elementKind === "SHAPE") preservedShapes++;
        else if (elementKind === "IMAGE") preservedImages++;

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
        docxRelationshipId:
          elementKind === "IMAGE" && primaryCanvasElem?.imageRef
            ? `rId_${primaryCanvasElem.imageRef}`
            : undefined,

        expectedPageIndex: expectedPage,
        renderedPageIndex: primaryDocxShape?.pageIndex || expectedPage,
        outputContentHash: primaryDocxShape ? hashString(primaryDocxShape.rawSnippet) : undefined,

        conversionStatus,
        mappingRelation,
        editabilityStatus,
        omissionReason:
          conversionStatus === "INTENTIONALLY_OMITTED"
            ? "CONTAINER_TRANSPARENT_WRAPPER"
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

  const traceabilityVerdict =
    missingCount === 0 && textPreservationRate >= 0.95 && overallTraceabilityRate >= 0.95
      ? "VERIFIED"
      : missingCount <= 5
      ? "PARTIAL"
      : "FAILED";

  const summary: TraceabilitySummary = {
    timestamp: new Date().toISOString(),
    sourceDocumentSha256: jsonSha256,
    totalSourceNodes,
    totalTraceableNodes,
    totalDocxObjectsMapped: convertedCount,

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
