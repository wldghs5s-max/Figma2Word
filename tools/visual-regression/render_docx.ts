import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { FigmaCanvasParser } from '../../src/canvas/parser/figmaCanvasParser.js';
import { DocxCanvasRenderer } from '../../src/canvas/renderer/docxCanvasRenderer.js';

export interface RenderDocxOptions {
  jsonPath: string;
  outputPath: string;
  scalePolicy?: 'fit-a4' | '1:1' | 'css-96dpi';
}

export interface RenderDocxResult {
  success: boolean;
  outputPath: string;
  fileSizeBytes: number;
  sha256: string;
  pageCount: number;
  durationMs: number;
  error?: string;
}

export async function renderJsonToDocx(options: RenderDocxOptions): Promise<RenderDocxResult> {
  const start = Date.now();
  try {
    const raw = JSON.parse(fs.readFileSync(options.jsonPath, 'utf8'));
    const parser = new FigmaCanvasParser({
      imageMap: raw.imageMap,
      scalePolicy: options.scalePolicy || 'fit-a4',
    });

    const doc = parser.parse(raw);
    const renderer = new DocxCanvasRenderer();
    const buffer = await renderer.renderToBuffer(doc);

    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    fs.writeFileSync(options.outputPath, buffer);

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    return {
      success: true,
      outputPath: options.outputPath,
      fileSizeBytes: buffer.length,
      sha256: hash,
      pageCount: doc.pages.length,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false,
      outputPath: options.outputPath,
      fileSizeBytes: 0,
      sha256: '',
      pageCount: 0,
      durationMs: Date.now() - start,
      error: err.message || String(err),
    };
  }
}
