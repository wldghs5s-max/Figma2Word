import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { renderJsonToDocx } from './render_docx.js';
import {
  captureWordState,
  openTargetDocumentSafely,
  exportAndCloseTargetDocOnly,
  cleanupTargetDocOnly,
} from './safe_word_automation.js';

export interface PipelineOptions {
  jsonPath: string;
  outputDir: string;
  docxName?: string;
  scalePolicy?: 'fit-a4' | '1:1' | 'css-96dpi';
  renderScale?: number;
}

export interface PipelineResult {
  success: boolean;
  docxPath: string;
  pdfPath: string;
  imagesDir: string;
  totalSections: number;
  totalPages: number;
  docxSha256: string;
  renderedPages: Array<{
    pageNumber: number;
    pngPath: string;
    widthPt: number;
    heightPt: number;
    widthPx: number;
    heightPx: number;
    sha256: string;
  }>;
  durationMs: number;
  error?: string;
}

export async function runVisualPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const start = Date.now();
  const outDir = path.resolve(options.outputDir);
  fs.mkdirSync(outDir, { recursive: true });

  const docxName = options.docxName || 'rendered.docx';
  const docxPath = path.join(outDir, docxName);
  const pdfPath = path.join(outDir, docxName.replace(/\.docx$/, '.pdf'));
  const imagesDir = path.join(outDir, 'pages');
  fs.mkdirSync(imagesDir, { recursive: true });

  console.log(`[Pipeline] 1. Rendering DOCX from ${options.jsonPath}...`);
  const docxRes = await renderJsonToDocx({
    jsonPath: options.jsonPath,
    outputPath: docxPath,
    scalePolicy: options.scalePolicy || 'fit-a4',
  });

  if (!docxRes.success) {
    return {
      success: false,
      docxPath,
      pdfPath: '',
      imagesDir: '',
      totalSections: 0,
      totalPages: 0,
      docxSha256: '',
      renderedPages: [],
      durationMs: Date.now() - start,
      error: `DOCX generation failed: ${docxRes.error}`,
    };
  }
  console.log(`[Pipeline] DOCX generated: ${(docxRes.fileSizeBytes / 1024 / 1024).toFixed(2)} MB (${docxRes.pageCount} IR pages)`);

  console.log(`[Pipeline] 2. Safely inspecting Microsoft Word state (protecting existing user documents)...`);
  let openedDocHandle: any = null;
  try {
    const wordSnapshot = captureWordState();
    if (wordSnapshot.wordWasRunning && wordSnapshot.initialDocumentNames.length > 0) {
      console.log(`[Pipeline] Detected ${wordSnapshot.initialDocumentNames.length} existing user document(s) in Word. They will be protected and untouched.`);
    }

    console.log(`[Pipeline] Opening target DOCX in Microsoft Word...`);
    openedDocHandle = await openTargetDocumentSafely(docxPath, wordSnapshot, 25);
    const openedDocName = openedDocHandle.docName;
    const sectionsCount = openedDocHandle.sectionsCount;
    console.log(`[Pipeline] Target document loaded: "${openedDocName}" (${sectionsCount} sections)`);

    // Export to PDF via AppleScript targeting ONLY our document
    console.log(`[Pipeline] 3. Exporting native PDF to ${pdfPath}...`);
    exportAndCloseTargetDocOnly(openedDocHandle, pdfPath, 600);
    console.log(`[Pipeline] PDF exported and target document closed successfully (User documents preserved)!`);

    // 4. Render PDF pages to PNG using Swift
    console.log(`[Pipeline] 4. Rendering PDF to high-resolution PNGs via Swift PDFKit...`);
    const swiftScript = path.resolve(process.cwd(), 'tools/visual-regression/pdf_to_images.swift');
    const scale = options.renderScale || 1.5;
    const swiftCmd = `swift "${swiftScript}" "${pdfPath}" "${imagesDir}" ${scale}`;
    const swiftOut = execSync(swiftCmd, { encoding: 'utf8', timeout: 60000 }).trim();

    const swiftRes = JSON.parse(swiftOut);
    if (!swiftRes.success) {
      throw new Error(`Swift PDF rendering failed: ${swiftRes.error}`);
    }

    console.log(`[Pipeline] Rendered ${swiftRes.totalPages} PNG pages.`);

    const pipelineRes: PipelineResult = {
      success: true,
      docxPath,
      pdfPath,
      imagesDir,
      totalSections: sectionsCount,
      totalPages: swiftRes.totalPages,
      docxSha256: docxRes.sha256,
      renderedPages: swiftRes.pages,
      durationMs: Date.now() - start,
    };

    fs.writeFileSync(path.join(outDir, 'pipeline-manifest.json'), JSON.stringify(pipelineRes, null, 2));
    return pipelineRes;
  } catch (err: any) {
    if (openedDocHandle) {
      cleanupTargetDocOnly(openedDocHandle);
    }
    return {
      success: false,
      docxPath,
      pdfPath,
      imagesDir,
      totalSections: 0,
      totalPages: 0,
      docxSha256: docxRes.sha256,
      renderedPages: [],
      durationMs: Date.now() - start,
      error: `Pipeline failed: ${err.message || String(err)}`,
    };
  }
}
