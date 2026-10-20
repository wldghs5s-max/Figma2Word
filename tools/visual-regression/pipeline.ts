import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { renderJsonToDocx } from './render_docx.js';

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

  console.log(`[Pipeline] 2. Opening DOCX in native Microsoft Word for Mac...`);
  try {
    // Clean any prior state in Word
    try {
      execSync(`osascript -e 'tell application "Microsoft Word" to close every document saving no'`, { timeout: 10000 });
    } catch {}

    // Use open -a to provide macOS security scoped access
    execSync(`open -a "Microsoft Word" "${docxPath}"`);

    // Poll for Word to load document
    let openedDocName = '';
    let sectionsCount = 0;
    const maxRetries = 20;

    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const queryScript = `
          tell application "Microsoft Word"
            if (count of documents) > 0 then
              set dName to name of front document
              set sCount to count of sections of front document
              return dName & "|" & (sCount as text)
            else
              return "NONE"
            end if
          end tell
        `;
        const res = execSync(`osascript -e '${queryScript}'`, { encoding: 'utf8', timeout: 5000 }).trim();
        if (res !== 'NONE' && res.includes('|')) {
          const parts = res.split('|');
          openedDocName = parts[0];
          sectionsCount = parseInt(parts[1], 10);
          console.log(`[Pipeline] Word document loaded: "${openedDocName}" (${sectionsCount} sections)`);
          break;
        }
      } catch (err: any) {
        // Continue waiting
      }
    }

    if (!openedDocName) {
      throw new Error('Timeout waiting for Microsoft Word to open document.');
    }

    // Export to PDF via AppleScript with generous timeout
    console.log(`[Pipeline] 3. Exporting native PDF to ${pdfPath}...`);
    const exportScript = `
      with timeout of 600 seconds
        tell application "Microsoft Word"
          set targetDoc to front document
          set pdfOut to "${pdfPath}"
          save as targetDoc file name pdfOut file format format PDF
          close targetDoc saving no
          return "OK"
        end tell
      end timeout
    `;
    const exportResult = execSync(`osascript -e '${exportScript}'`, { encoding: 'utf8', timeout: 600000 }).trim();
    if (exportResult !== 'OK') {
      throw new Error(`Word PDF export returned unexpected response: ${exportResult}`);
    }
    console.log(`[Pipeline] PDF exported successfully!`);

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
