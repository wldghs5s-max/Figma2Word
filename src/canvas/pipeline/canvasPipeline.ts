import * as fs from "fs";
import * as path from "path";
import { CanvasDocument, ScalePolicy } from "../types.js";
import { FigmaCanvasParser } from "../parser/figmaCanvasParser.js";
import { DocxCanvasParser } from "../parser/docxCanvasParser.js";
import { DocxCanvasRenderer } from "../renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../renderer/hwpxCanvasRenderer.js";
import { FigmaNode, FigmaFileResponse } from "../../parser/types.js";
import { FigmaSnapshot, isFigmaSnapshot } from "../../pipeline/index.js";

export interface CanvasPipelineOptions {
  format?: "docx" | "hwpx" | "both";
  scalePolicy?: ScalePolicy;
  selectedFrameIds?: string[];
  imageMap?: Record<string, string>;
  titleOverride?: string;
  outputPath?: string;
  outputDocxPath?: string;
  outputHwpxPath?: string;
}

export interface CanvasPipelineResult {
  canvasDocument: CanvasDocument;
  docxBuffer?: Buffer;
  hwpxBuffer?: Buffer;
  outputDocxPath?: string;
  outputHwpxPath?: string;
  durationMs: number;
  stats: {
    pageCount: number;
    elementCount: number;
    resourceCount: number;
  };
}

export class CanvasPipeline {
  private figmaParser: FigmaCanvasParser;
  private docxParser: DocxCanvasParser;
  private docxRenderer: DocxCanvasRenderer;
  private hwpxRenderer: HwpxCanvasRenderer;

  constructor(options?: { creator?: string }) {
    this.figmaParser = new FigmaCanvasParser();
    this.docxParser = new DocxCanvasParser();
    this.docxRenderer = new DocxCanvasRenderer({ creator: options?.creator });
    this.hwpxRenderer = new HwpxCanvasRenderer({ creator: options?.creator });
  }

  /**
   * Convert Figma AST / Snapshot to Canvas Output (DOCX, HWPX, or Both)
   */
  public async convertFigma(
    input: FigmaNode | FigmaFileResponse | FigmaSnapshot,
    options?: CanvasPipelineOptions
  ): Promise<CanvasPipelineResult> {
    const startTime = Date.now();

    // 1. Unpack FigmaSnapshot if provided
    let rawFigma: FigmaNode | FigmaFileResponse;
    let mergedImageMap = options?.imageMap || {};

    if (isFigmaSnapshot(input)) {
      rawFigma = input.figmaNode;
      if (input.imageMap) {
        mergedImageMap = { ...input.imageMap, ...mergedImageMap };
      }
    } else {
      rawFigma = input as FigmaNode | FigmaFileResponse;
    }

    // 2. Parse Figma into CanvasDocument
    const parser = new FigmaCanvasParser({
      imageMap: mergedImageMap,
      selectedFrameIds: options?.selectedFrameIds,
      scalePolicy: options?.scalePolicy || "fit-a4",
      titleOverride: options?.titleOverride,
    });

    const canvasDocument = parser.parse(rawFigma);

    // 3. Render requested formats
    const format = options?.format || "docx";
    let docxBuffer: Buffer | undefined;
    let hwpxBuffer: Buffer | undefined;

    if (format === "docx" || format === "both") {
      docxBuffer = await this.docxRenderer.renderToBuffer(canvasDocument);
    }

    if (format === "hwpx" || format === "both") {
      hwpxBuffer = await this.hwpxRenderer.renderToBuffer(canvasDocument);
    }

    // 4. Save to disk if paths provided
    let outDocxPath = options?.outputDocxPath;
    let outHwpxPath = options?.outputHwpxPath;

    if (options?.outputPath) {
      const base = options.outputPath.replace(/\.(docx|hwpx)$/i, "");
      if (format === "docx" || format === "both") {
        outDocxPath = `${base}.docx`;
      }
      if (format === "hwpx" || format === "both") {
        outHwpxPath = `${base}.hwpx`;
      }
    }

    if (docxBuffer && outDocxPath) {
      const dir = path.dirname(outDocxPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await fs.promises.writeFile(outDocxPath, docxBuffer);
    }

    if (hwpxBuffer && outHwpxPath) {
      const dir = path.dirname(outHwpxPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await fs.promises.writeFile(outHwpxPath, hwpxBuffer);
    }

    const durationMs = Date.now() - startTime;
    const elementCount = canvasDocument.pages.reduce(
      (sum, p) => sum + p.elements.length,
      0
    );

    return {
      canvasDocument,
      docxBuffer,
      hwpxBuffer,
      outputDocxPath: outDocxPath,
      outputHwpxPath: outHwpxPath,
      durationMs,
      stats: {
        pageCount: canvasDocument.pages.length,
        elementCount,
        resourceCount: Object.keys(canvasDocument.resources).length,
      },
    };
  }

  /**
   * Convert an existing absolute-canvas DOCX file into HWPX
   */
  public async convertDocxToHwpx(
    docxInput: Buffer | string,
    options?: CanvasPipelineOptions
  ): Promise<CanvasPipelineResult> {
    const startTime = Date.now();

    const canvasDocument = await this.docxParser.parse(docxInput);
    const hwpxBuffer = await this.hwpxRenderer.renderToBuffer(canvasDocument);

    let outHwpxPath = options?.outputHwpxPath || options?.outputPath;
    if (outHwpxPath) {
      if (!outHwpxPath.endsWith(".hwpx")) {
        outHwpxPath = `${outHwpxPath}.hwpx`;
      }
      const dir = path.dirname(outHwpxPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await fs.promises.writeFile(outHwpxPath, hwpxBuffer);
    }

    const durationMs = Date.now() - startTime;
    const elementCount = canvasDocument.pages.reduce(
      (sum, p) => sum + p.elements.length,
      0
    );

    return {
      canvasDocument,
      hwpxBuffer,
      outputHwpxPath: outHwpxPath,
      durationMs,
      stats: {
        pageCount: canvasDocument.pages.length,
        elementCount,
        resourceCount: Object.keys(canvasDocument.resources).length,
      },
    };
  }

  /**
   * Universal file conversion method supporting both .json (Figma snapshot)
   * and .docx (DOCX -> HWPX)
   */
  public async convertFile(
    filePath: string,
    options?: CanvasPipelineOptions
  ): Promise<CanvasPipelineResult> {
    const absPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`);
    }

    const ext = path.extname(absPath).toLowerCase();

    if (ext === ".docx") {
      return this.convertDocxToHwpx(absPath, options);
    }

    if (ext === ".json") {
      const content = await fs.promises.readFile(absPath, "utf-8");
      const parsed = JSON.parse(content);
      return this.convertFigma(parsed, options);
    }

    throw new Error(`Unsupported file extension for Canvas Engine: ${ext}`);
  }
}
