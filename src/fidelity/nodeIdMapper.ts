import { FigmaNode } from "../parser/types.js";
import { CanvasDocument, CanvasPage } from "../canvas/types.js";

export const TARGET_17_FRAME_IDS = [
  "763:5068",
  "766:256",
  "757:88",
  "759:759",
  "757:92",
  "757:142",
  "757:158",
  "759:911",
  "757:124",
  "759:1076",
  "766:2289",
  "757:118",
  "766:2942",
  "759:1314",
  "759:1858",
  "759:1533",
  "768:3434",
] as const;

export interface FrameMappingSpec {
  pageNumber: number;
  nodeId: string;
  frameName: string;
  expectedDimensions?: { width: number; height: number };
}

export interface MappedFrameEntry {
  pageNumber: number;
  nodeId: string;
  frameName: string;
  actualDimensions?: { width: number; height: number };
  node: FigmaNode;
}

export interface NodeMappingValidationResult {
  valid: boolean;
  violations: string[];
  mappedFrames: MappedFrameEntry[];
}

/**
 * Searches and indexes all nodes by ID in a Figma document tree.
 */
export function indexFigmaNodes(root: any): Map<string, FigmaNode> {
  const map = new Map<string, FigmaNode>();
  if (!root || typeof root !== "object") return map;

  function walk(node: any) {
    if (!node || typeof node !== "object") return;
    if (node.id && typeof node.id === "string") {
      map.set(node.id, node as FigmaNode);
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  const rootNode = root.figmaNode || root.document || root;
  walk(rootNode);
  return map;
}

/**
 * Validates and extracts target frames strictly by nodeId.
 * Performs deep integrity checks:
 * 1. Valid Figma structure
 * 2. Missing target nodeIds
 * 3. Duplicate target nodeIds in spec
 * 4. Frame dimension validation (if spec provided)
 * 5. Strict ordering preservation
 */
export function validateAndExtractTargetFrames(
  figmaData: any,
  targetNodeIds: readonly string[] = TARGET_17_FRAME_IDS,
  referenceSpecs?: FrameMappingSpec[]
): NodeMappingValidationResult {
  const violations: string[] = [];
  const mappedFrames: MappedFrameEntry[] = [];

  if (!figmaData || typeof figmaData !== "object") {
    return {
      valid: false,
      violations: ["MAPPING_FAIL_INVALID_JSON: Input Figma JSON is null, undefined, or not an object."],
      mappedFrames: [],
    };
  }

  const rootNode = figmaData.figmaNode || figmaData.document || figmaData;
  if (!rootNode || (!rootNode.type && !Array.isArray(rootNode.children))) {
    return {
      valid: false,
      violations: ["MAPPING_FAIL_INVALID_STRUCTURE: Document root missing valid Figma type or children."],
      mappedFrames: [],
    };
  }

  // Check 1: Duplicate IDs in target specification
  const seenSpecIds = new Set<string>();
  for (const id of targetNodeIds) {
    if (seenSpecIds.has(id)) {
      violations.push(`MAPPING_FAIL_DUPLICATE_TARGET: Target ID '${id}' is duplicated in target specification.`);
    }
    seenSpecIds.add(id);
  }

  // Index all nodes in the raw Figma JSON
  const nodeIndex = indexFigmaNodes(figmaData);

  // Check 2: Missing target nodes
  const missingIds: string[] = [];
  for (let idx = 0; idx < targetNodeIds.length; idx++) {
    const id = targetNodeIds[idx];
    const pageNum = idx + 1;
    const node = nodeIndex.get(id);

    if (!node) {
      missingIds.push(id);
      violations.push(`MAPPING_FAIL_MISSING_NODE: Target nodeId '${id}' (expected page ${pageNum}) not found in Figma JSON.`);
      continue;
    }

    const bbox = node.absoluteBoundingBox;
    const actualDims = bbox ? { width: bbox.width, height: bbox.height } : undefined;

    // Check 3: Dimension matching if spec provided
    if (referenceSpecs) {
      const spec = referenceSpecs.find((s) => s.nodeId === id || s.pageNumber === pageNum);
      if (spec && spec.expectedDimensions && actualDims) {
        if (
          Math.abs(actualDims.width - spec.expectedDimensions.width) > 1 ||
          Math.abs(actualDims.height - spec.expectedDimensions.height) > 1
        ) {
          violations.push(
            `MAPPING_FAIL_DIMENSION_MISMATCH: Frame '${id}' dimension mismatch: expected ${spec.expectedDimensions.width}x${spec.expectedDimensions.height}, found ${actualDims.width}x${actualDims.height}.`
          );
        }
      }
    }

    mappedFrames.push({
      pageNumber: pageNum,
      nodeId: id,
      frameName: node.name || `Frame ${id}`,
      actualDimensions: actualDims,
      node,
    });
  }

  // Check 4: Page count matching
  if (mappedFrames.length !== targetNodeIds.length) {
    violations.push(
      `MAPPING_FAIL_PAGE_COUNT: Extracted ${mappedFrames.length} frames, expected ${targetNodeIds.length}. Missing ${missingIds.length} node(s).`
    );
  }

  return {
    valid: violations.length === 0,
    violations,
    mappedFrames,
  };
}

/**
 * Validates that a generated CanvasDocument strictly matches the expected target node IDs and order.
 */
export function validateCanvasIrPageMapping(
  doc: CanvasDocument,
  expectedTargetIds: readonly string[] = TARGET_17_FRAME_IDS
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  if (doc.pages.length !== expectedTargetIds.length) {
    violations.push(
      `MAPPING_FAIL_IR_PAGE_COUNT: CanvasDocument has ${doc.pages.length} pages, expected ${expectedTargetIds.length}.`
    );
  }

  for (let i = 0; i < Math.min(doc.pages.length, expectedTargetIds.length); i++) {
    const page = doc.pages[i];
    const expectedId = expectedTargetIds[i];

    if (!page.frameId) {
      violations.push(
        `MAPPING_FAIL_IR_MISSING_FRAME_ID: CanvasPage ${page.pageNumber} does not carry an authentic frameId.`
      );
    } else if (page.frameId !== expectedId) {
      violations.push(
        `MAPPING_FAIL_IR_ORDER_MISMATCH: CanvasPage ${page.pageNumber} has frameId '${page.frameId}', expected '${expectedId}'.`
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

