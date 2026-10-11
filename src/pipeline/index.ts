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

    // Step 1: Parse Figma AST to Internal Document Model
    const parseResult = this.parser.parse(input);
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


