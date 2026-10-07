import { FigmaParser, ParseResult, ConversionNotice } from "../parser/index.js";
import { DocxRenderer } from "../renderer/index.js";
import { InternalDocument } from "../model/index.js";
import { FigmaNode, FigmaFileResponse } from "../parser/types.js";
import * as fs from "fs";
import * as path from "path";

export interface PipelineOptions {
  outputPath?: string;
  imageMap?: Record<string, string>;
  titleOverride?: string;
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

    // Step 1: Parse Figma AST to Internal Document Model
    const parseResult = this.parser.parse(input);
    const internalDoc = parseResult.document;

    if (options?.titleOverride) {
      internalDoc.metadata.title = options.titleOverride;
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
   * Convert directly from a Figma JSON file path
   */
  public async convertFile(
    jsonFilePath: string,
    outputPath?: string
  ): Promise<PipelineResult> {
    const rawContent = await fs.promises.readFile(jsonFilePath, "utf-8");
    const jsonInput = JSON.parse(rawContent) as FigmaFileResponse;
    const defaultOutputPath =
      outputPath ||
      path.join(
        process.cwd(),
        "samples/output",
        `${path.basename(jsonFilePath, path.extname(jsonFilePath))}.docx`
      );

    return await this.convert(jsonInput, { outputPath: defaultOutputPath });
  }
}

