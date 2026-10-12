import { FigmaParser, ParseResult, ConversionNotice } from "../parser/index.js";
import { DocxRenderer } from "../renderer/index.js";
import { InternalDocument } from "../model/index.js";
import { FigmaNode, FigmaFileResponse } from "../parser/types.js";
import { FigmaClient, parseFigmaUrl, findNodeEntry, FigmaApiError, collectImageRefs } from "../api/index.js";
import * as fs from "fs";
import * as path from "path";

export function safeFileStem(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  return (cleaned.length > 0 ? cleaned : "figma-export").slice(0, 80);
}

export interface PipelineOptions {
  outputPath?: string;
  imageMap?: Record<string, string>;
  titleOverride?: string;
  downloadImages?: boolean;
  pageOrientation?: "portrait" | "landscape";
  selectedFrameIds?: string[];
  marginsMm?: { top?: number; right?: number; bottom?: number; left?: number };
}

export interface SelectableFrame {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
  isA4Ratio?: boolean;
  isA4Name?: boolean;
  isRecommendedA4?: boolean;
  canvasName?: string;
}

export function isA4Ratio(width?: number, height?: number): boolean {
  if (!width || !height || width <= 0 || height <= 0) return false;
  const ratio = width / height;
  // ISO 216 standard A4 aspect ratio (portrait) is 1 / sqrt(2) ≈ 0.7071 (tolerance: 0.68 ~ 0.73)
  return ratio >= 0.68 && ratio <= 0.73;
}

export function extractSelectableFrames(
  input: FigmaNode | FigmaFileResponse
): SelectableFrame[] {
  const root = "document" in input ? input.document : input;
  const frames: SelectableFrame[] = [];

  const collectFromChildren = (children?: FigmaNode[], canvasName?: string) => {
    if (!children) return;
    for (const child of children) {
      if (child.visible === false) continue;
      const box = child.absoluteBoundingBox;
      const width = box ? Math.round(box.width) : undefined;
      const height = box ? Math.round(box.height) : undefined;
      const aspectRatio =
        width && height ? Number((width / height).toFixed(3)) : undefined;
      const a4Ratio = isA4Ratio(width, height);
      const a4Name = /\bA4\b/i.test(child.name || "");

      frames.push({
        id: child.id,
        name: child.name || "Untitled Frame",
        type: child.type,
        width,
        height,
        aspectRatio,
        isA4Ratio: a4Ratio,
        isA4Name: a4Name,
        isRecommendedA4: a4Ratio || a4Name,
        canvasName,
      });
    }
  };

  if (root.type === "DOCUMENT") {
    for (const canvas of root.children || []) {
      if (canvas.visible === false) continue;
      collectFromChildren(canvas.children, canvas.name);
    }
  } else if (root.type === "CANVAS") {
    collectFromChildren(root.children, root.name);
  } else {
    const box = root.absoluteBoundingBox;
    const width = box ? Math.round(box.width) : undefined;
    const height = box ? Math.round(box.height) : undefined;
    const aspectRatio =
      width && height ? Number((Math.min(width, height) / Math.max(width, height)).toFixed(3)) : undefined;
    const a4Ratio = isA4Ratio(width, height);
    const a4Name = /\bA4\b/i.test(root.name || "");
    frames.push({
      id: root.id,
      name: root.name || "Root Frame",
      type: root.type,
      width,
      height,
      aspectRatio,
      isA4Ratio: a4Ratio,
      isA4Name: a4Name,
      isRecommendedA4: a4Ratio || a4Name,
    });
  }

  return frames;
}

export function filterFigmaNodeByFrames(
  input: FigmaNode | FigmaFileResponse,
  selectedFrameIds?: string[]
): FigmaNode | FigmaFileResponse {
  if (!selectedFrameIds) return input;
  const selectedSet = new Set(selectedFrameIds);
  const root = "document" in input ? input.document : input;

  if (root.type === "DOCUMENT") {
    const newDocument: FigmaNode = {
      ...root,
      children: (root.children || []).map((canvas) => ({
        ...canvas,
        children: (canvas.children || []).filter((child) => selectedSet.has(child.id)),
      })),
    };
    if ("document" in input) {
      return {
        ...input,
        document: newDocument,
      };
    }
    return newDocument;
  }

  if (root.type === "CANVAS") {
    const filteredCanvas: FigmaNode = {
      ...root,
      children: (root.children || []).filter((child) => selectedSet.has(child.id)),
    };
    return filteredCanvas;
  }

  if (selectedSet.has(root.id)) {
    return input;
  }

  return {
    ...root,
    children: [],
  };
}


export interface FigmaImageCompleteness {
  referencedCount: number;
  resolvedCount: number;
  isComplete: boolean;
  missingRefs: string[];
}

export function assessImageCompleteness(
  targetNode: FigmaNode | FigmaFileResponse,
  imageMap?: Record<string, string>
): FigmaImageCompleteness {
  const referencedRefs = collectImageRefs(targetNode);
  const map = imageMap || {};
  const missingRefs: string[] = [];

  for (const ref of referencedRefs) {
    const data = map[ref];
    if (!data || typeof data !== "string" || !data.startsWith("data:image/")) {
      missingRefs.push(ref);
    }
  }

  const referencedCount = referencedRefs.length;
  const resolvedCount = referencedCount - missingRefs.length;
  const isComplete = missingRefs.length === 0;

  return {
    referencedCount,
    resolvedCount,
    isComplete,
    missingRefs,
  };
}

export interface FigmaSnapshotMetadata {
  fileName?: string;
  fileKey?: string;
  nodeId?: string;
  exportedAt?: string;
  imageStats?: FigmaImageCompleteness;
}

export interface FigmaSnapshot {
  version: "1.0";
  source: "figma2word";
  exportedAt: string;
  metadata?: FigmaSnapshotMetadata;
  figmaNode: FigmaNode | FigmaFileResponse;
  imageMap?: Record<string, string>;
}

export function isFigmaSnapshot(obj: unknown): obj is FigmaSnapshot {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    (o.source === "figma2word" || "figmaNode" in o) &&
    !!o.figmaNode &&
    typeof o.figmaNode === "object"
  );
}

export function createFigmaSnapshot(
  targetNode: FigmaNode | FigmaFileResponse,
  imageMap?: Record<string, string>,
  metadata?: FigmaSnapshotMetadata
): FigmaSnapshot {
  const imageStats = metadata?.imageStats || assessImageCompleteness(targetNode, imageMap);
  return {
    version: "1.0",
    source: "figma2word",
    exportedAt: new Date().toISOString(),
    metadata: {
      ...metadata,
      imageStats,
    },
    figmaNode: targetNode,
    imageMap: imageMap ? { ...imageMap } : {},
  };
}

export interface PipelineResult {
  docxBuffer: Buffer;
  outputPath?: string;
  internalDocument: InternalDocument;
  notices: ConversionNotice[];
  stats: ParseResult["stats"];
  durationMs: number;
}

export class ConversionPipeline {
  private parser: FigmaParser;
  private renderer: DocxRenderer;

  constructor(options?: { imageMap?: Record<string, string> }) {
    this.parser = new FigmaParser({ imageMap: options?.imageMap });
    this.renderer = new DocxRenderer();
  }

  /**
   * Run end-to-end conversion from Figma JSON / Node to DOCX
   */
  public async convert(
    input: FigmaNode | FigmaFileResponse,
    options?: PipelineOptions
  ): Promise<PipelineResult> {
    const startTime = Date.now();

    // If custom imageMap was provided in options, update parser
    if (options?.imageMap) {
      this.parser = new FigmaParser({ imageMap: options.imageMap });
    }

    // Step 0: Frame Selection Filter
    let targetInput = input;
    if (options?.selectedFrameIds !== undefined) {
      if (options.selectedFrameIds.length === 0) {
        throw new FigmaApiError(
          "변환할 프레임이 선택되지 않았습니다. 최소 1개 이상의 프레임을 선택해주세요.",
          400
        );
      }
      targetInput = filterFigmaNodeByFrames(input, options.selectedFrameIds);
    }

    // Step 1: Parse Figma AST to Internal Document Model
    const parseResult = this.parser.parse(targetInput);
    const internalDoc = parseResult.document;

    // Empty Document Guard: Validate that conversion produced meaningful elements
    const totalElements = internalDoc.sections.reduce((sum, sec) => sum + sec.elements.length, 0);
    if (totalElements === 0) {
      throw new FigmaApiError(
        `변환 가능한 Figma 요소를 찾지 못했습니다. 선택한 node-id가 비어있는 Canvas이거나 지원되지 않는 레이어인지 확인하세요. (검사된 총 노드 수: ${parseResult.stats.totalNodes})`,
        422
      );
    }

    if (options?.titleOverride) {
      internalDoc.metadata.title = options.titleOverride;
    }

    if (options?.pageOrientation) {
      internalDoc.pageConfig.orientation = options.pageOrientation;
      for (const sec of internalDoc.sections) {
        if (sec.pageConfig) {
          sec.pageConfig.orientation = options.pageOrientation;
        } else {
          sec.pageConfig = { ...internalDoc.pageConfig, orientation: options.pageOrientation };
        }
      }
    }

    if (options?.marginsMm) {
      const mergedMargins = {
        top: options.marginsMm.top ?? internalDoc.pageConfig.marginsMm?.top ?? 25.4,
        right: options.marginsMm.right ?? internalDoc.pageConfig.marginsMm?.right ?? 25.4,
        bottom: options.marginsMm.bottom ?? internalDoc.pageConfig.marginsMm?.bottom ?? 25.4,
        left: options.marginsMm.left ?? internalDoc.pageConfig.marginsMm?.left ?? 25.4,
      };
      internalDoc.pageConfig.marginsMm = mergedMargins;
      for (const sec of internalDoc.sections) {
        if (sec.pageConfig) {
          sec.pageConfig.marginsMm = { ...mergedMargins };
        } else {
          sec.pageConfig = { ...internalDoc.pageConfig, marginsMm: { ...mergedMargins } };
        }
      }
    }

    // Step 2: Render Internal Document Model to DOCX Buffer
    const docxBuffer = await this.renderer.renderToBuffer(internalDoc);


    // Step 3: Write to disk if outputPath provided
    if (options?.outputPath) {
      const dir = path.dirname(options.outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      await fs.promises.writeFile(options.outputPath, docxBuffer);
    }

    const durationMs = Date.now() - startTime;

    return {
      docxBuffer,
      outputPath: options?.outputPath,
      internalDocument: internalDoc,
      notices: parseResult.notices,
      stats: parseResult.stats,
      durationMs,
    };
  }

  /**
   * Convert offline from a FigmaSnapshot object without any network API calls
   */
  public async convertSnapshot(
    snapshot: FigmaSnapshot,
    options?: PipelineOptions
  ): Promise<PipelineResult> {
    const mergedImageMap = { ...snapshot.imageMap, ...options?.imageMap };
    return await this.convert(snapshot.figmaNode, {
      ...options,
      imageMap: mergedImageMap,
      titleOverride: options?.titleOverride || snapshot.metadata?.fileName,
    });
  }

  /**
   * Convert directly from a local Figma JSON file path (supports both raw Figma JSON and FigmaSnapshot JSON)
   */
  public async convertFile(
    jsonFilePath: string,
    outputPath?: string,
    options?: PipelineOptions
  ): Promise<PipelineResult> {
    const rawContent = await fs.promises.readFile(jsonFilePath, "utf-8");
    const jsonInput = JSON.parse(rawContent);

    if (isFigmaSnapshot(jsonInput)) {
      const defaultOutputPath =
        outputPath ||
        path.join(
          process.cwd(),
          "samples/output",
          `${jsonInput.metadata?.fileName || path.basename(jsonFilePath, path.extname(jsonFilePath))}.docx`
        );
      return await this.convertSnapshot(jsonInput, { ...options, outputPath: defaultOutputPath });
    }

    const defaultOutputPath =
      outputPath ||
      path.join(
        process.cwd(),
        "samples/output",
        `${path.basename(jsonFilePath, path.extname(jsonFilePath))}.docx`
      );

    return await this.convert(jsonInput as FigmaFileResponse, { ...options, outputPath: defaultOutputPath });
  }

  /**
   * Convert live Figma design by URL (e.g. https://www.figma.com/design/:fileKey/:title?node-id=:nodeId)
   */
  public async convertFigmaUrl(
    figmaUrl: string,
    accessToken: string,
    options?: PipelineOptions
  ): Promise<PipelineResult> {
    const parsed = parseFigmaUrl(figmaUrl);
    return await this.convertFigmaFileKey(parsed.fileKey, accessToken, {
      ...options,
      nodeId: parsed.nodeId,
      titleOverride: options?.titleOverride || parsed.fileName,
    });
  }

  /**
   * Convert live Figma design using fileKey and optional nodeId
   */
  public async convertFigmaFileKey(
    fileKey: string,
    accessToken: string,
    options?: PipelineOptions & { nodeId?: string }
  ): Promise<PipelineResult> {
    const client = new FigmaClient({ accessToken });

    let targetInput: FigmaNode | FigmaFileResponse;

    if (options?.nodeId) {
      // Fetch specific targeted node
      const nodesRes = await client.fetchNodes(fileKey, [options.nodeId]);
      const nodeEntry = findNodeEntry(nodesRes.nodes, options.nodeId);
      if (!nodeEntry || !nodeEntry.document) {
        throw new FigmaApiError(
          `Node '${options.nodeId}' was not found in Figma file '${fileKey}'`,
          404
        );
      }
      targetInput = nodeEntry.document;
    } else {
      // Fetch full file document tree
      targetInput = await client.fetchFile(fileKey);
    }

    // Resolve images if downloadImages is not explicitly set to false
    let imageMap = { ...options?.imageMap };
    if (options?.downloadImages !== false) {
      const rootNode: FigmaNode = "document" in targetInput ? targetInput.document : targetInput;
      const fetchedImages = await client.resolveImages(fileKey, rootNode);
      imageMap = { ...imageMap, ...fetchedImages };
    }

    const defaultOutputName = safeFileStem(
      options?.titleOverride ||
        `figma-${fileKey}${options?.nodeId ? `-${options.nodeId.replace(/:/g, "_")}` : ""}`
    );
    const defaultOutputPath =
      options?.outputPath ||
      path.join(process.cwd(), "samples/output", `${defaultOutputName}.docx`);

    return await this.convert(targetInput, {
      ...options,
      imageMap,
      outputPath: defaultOutputPath,
    });
  }
}


