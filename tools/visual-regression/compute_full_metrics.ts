import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { FigmaCanvasParser } from '../../src/canvas/parser/figmaCanvasParser.js';
import { DocxCanvasRenderer } from '../../src/canvas/renderer/docxCanvasRenderer.js';
import { CanvasDocument } from '../../src/canvas/types/canvasIr.js';

export interface DynamicMetricResult {
  project: string;
  evaluatedAt: string;
  sourceJsonPath: string;
  docxPath?: string;
  pipelineManifestPath?: string;
  globalSummary: {
    totalCandidateFrames: number;
    totalCanvasPages: number;
    totalRenderedDocxSections: number | 'unknown';
    totalRenderedDocxPages: number | 'not_measured';
    frameCoveragePercent: number;
    detectedCollisionsCount: number;
    oversizedPagesCount: number;
    totalElements: number;
    totalTextboxes: number;
    totalSingleLineTextboxes: number;
    wordCompatibility: string;
  };
  pages: Array<{
    pageNumber: number;
    frameId: string;
    frameName: string;
    figmaSizePx: { width: number; height: number };
    canvasSizePt: { width: number; height: number };
    elementCount: number;
    shapeCount: number;
    textboxCount: number;
    singleLineTextCount: number;
    multiLineTextCount: number;
    fontFamilies: string[];
    geometryScalePreserved: boolean;
    structuralDefects: string[];
  }>;
}

export interface MetricComputeOptions {
  jsonPath: string;
  docxPath?: string;
  pipelineManifestPath?: string;
  scalePolicy?: 'fit-a4' | '1:1' | 'css-96dpi';
}

/**
 * Computes strictly measured, non-hardcoded visual and structural metrics from
 * the actual Figma JSON input, generated DOCX XML, and pipeline execution logs.
 */
export async function computeDynamicMetrics(options: MetricComputeOptions): Promise<DynamicMetricResult> {
  const jsonPath = path.resolve(options.jsonPath);
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Input JSON not found: ${jsonPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const parser = new FigmaCanvasParser({
    imageMap: raw.imageMap,
    scalePolicy: options.scalePolicy || 'fit-a4',
  });
  const doc = parser.parse(raw);

  const discoveredFrames: any[] = (parser as any).discoverPageFrames(raw.figmaNode || raw.document || raw);
  const totalCandidateFrames = discoveredFrames.length;
  const totalCanvasPages = doc.pages.length;

  // 1. Inspect actual DOCX for real w:sectPr count
  let actualDocxSections: number | 'unknown' = 'unknown';
  let targetDocxPath = options.docxPath ? path.resolve(options.docxPath) : undefined;

  // If no DOCX was provided, synthesize one in memory to measure actual XML section output
  if (!targetDocxPath || !fs.existsSync(targetDocxPath)) {
    try {
      const renderer = new DocxCanvasRenderer();
      const buffer = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file('word/document.xml')?.async('text');
      if (docXml) {
        const matches = docXml.match(/<w:sectPr[\s>]/g);
        actualDocxSections = matches ? matches.length : 0;
      }
    } catch {
      actualDocxSections = 'unknown';
    }
  } else {
    try {
      const data = fs.readFileSync(targetDocxPath);
      const zip = await JSZip.loadAsync(data);
      const docXml = await zip.file('word/document.xml')?.async('text');
      if (docXml) {
        const matches = docXml.match(/<w:sectPr[\s>]/g);
        actualDocxSections = matches ? matches.length : 0;
      }
    } catch {
      actualDocxSections = 'unknown';
    }
  }

  // 2. Read actual pipeline execution result if available
  let actualWordPages: number | 'not_measured' = 'not_measured';
  let wordCompatibility = 'not_measured';

  if (options.pipelineManifestPath && fs.existsSync(options.pipelineManifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(options.pipelineManifestPath, 'utf8'));
      if (manifest.success) {
        actualWordPages = typeof manifest.totalPages === 'number' ? manifest.totalPages : 'not_measured';
        wordCompatibility = `Valid (${manifest.totalSections} sections, ${manifest.totalPages} pages rendered)`;
      } else {
        wordCompatibility = `Failed: ${manifest.error || 'Unknown Word error'}`;
      }
    } catch {
      wordCompatibility = 'unavailable';
    }
  }

  // 3. Collision detection: verify if any adjacent pages share identical coordinates without section isolation
  let detectedCollisions = 0;
  if (typeof actualDocxSections === 'number') {
    // If doc has multiple pages but fewer sections than pages, collisions exist!
    if (totalCanvasPages > 1 && actualDocxSections < totalCanvasPages) {
      detectedCollisions = totalCanvasPages - actualDocxSections;
    }
  }

  // 4. Calculate frame coverage
  const frameCoveragePercent = totalCandidateFrames > 0
    ? Number(((totalCanvasPages / totalCandidateFrames) * 100).toFixed(1))
    : (totalCanvasPages === 0 ? 100.0 : 0.0);

  let totalElements = 0;
  let totalTextboxes = 0;
  let totalSingleLineText = 0;

  const pageMetrics = discoveredFrames.map((f: any, idx: number) => {
    const page = doc.pages[idx];
    const box = f.absoluteBoundingBox || { width: 0, height: 0 };
    const elements = page ? page.elements : [];

    totalElements += elements.length;

    let shapeCount = 0;
    let textboxCount = 0;
    let singleLineTextCount = 0;
    let multiLineTextCount = 0;
    const fonts = new Set<string>();
    const defects: string[] = [];

    for (const el of elements) {
      if (el.type === 'text' || (el.textRuns && el.textRuns.length > 0)) {
        textboxCount++;
        for (const r of el.textRuns || []) {
          if (r.fontFamily) fonts.add(r.fontFamily);
        }
        if (el.textAutoResize === 'WIDTH_AND_HEIGHT' && !(el.textRuns || []).some(r => r.text && /[\r\n]/.test(r.text))) {
          singleLineTextCount++;
        } else {
          multiLineTextCount++;
        }
      } else {
        shapeCount++;
      }
    }

    totalTextboxes += textboxCount;
    totalSingleLineText += singleLineTextCount;

    const canvasW = page ? page.bounds.width : 0;
    const canvasH = page ? page.bounds.height : 0;
    const expectedW = box.width * 0.75;
    const expectedH = box.height * 0.75;

    const isScalePreserved = Math.abs(canvasW - expectedW) < 1.0 && Math.abs(canvasH - expectedH) < 1.0;
    if (!isScalePreserved) {
      defects.push(`SCALE_ALTERED: Figma ${box.width}x${box.height} -> Canvas ${Math.round(canvasW)}x${Math.round(canvasH)}`);
    }

    const figmaWPt = box.width * 0.75;
    const figmaHPt = box.height * 0.75;
    if (figmaWPt > 1584 || figmaHPt > 1584 || canvasW > 1584 || canvasH > 1584) {
      defects.push('OVERSIZED_PAGE_CLAMPED');
    }

    return {
      pageNumber: idx + 1,
      frameId: f.id,
      frameName: f.name || `Frame_${f.id}`,
      figmaSizePx: { width: box.width, height: box.height },
      canvasSizePt: { width: Math.round(canvasW * 100) / 100, height: Math.round(canvasH * 100) / 100 },
      elementCount: elements.length,
      shapeCount,
      textboxCount,
      singleLineTextCount,
      multiLineTextCount,
      fontFamilies: Array.from(fonts),
      geometryScalePreserved: isScalePreserved,
      structuralDefects: defects,
    };
  });

  return {
    project: 'Figma2Word — Phase 27 Dynamic Metrics Engine',
    evaluatedAt: new Date().toISOString(),
    sourceJsonPath: jsonPath,
    docxPath: targetDocxPath,
    pipelineManifestPath: options.pipelineManifestPath,
    globalSummary: {
      totalCandidateFrames,
      totalCanvasPages,
      totalRenderedDocxSections: actualDocxSections,
      totalRenderedDocxPages: actualWordPages,
      frameCoveragePercent,
      detectedCollisionsCount: detectedCollisions,
      oversizedPagesCount: pageMetrics.filter(p => p.structuralDefects.includes('OVERSIZED_PAGE_CLAMPED')).length,
      totalElements,
      totalTextboxes,
      totalSingleLineTextboxes: totalSingleLineText,
      wordCompatibility,
    },
    pages: pageMetrics,
  };
}
