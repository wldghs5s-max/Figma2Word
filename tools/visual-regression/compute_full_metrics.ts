import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import JSZip from 'jszip';
import { FigmaCanvasParser } from '../../src/canvas/parser/figmaCanvasParser.js';
import { DocxCanvasRenderer } from '../../src/canvas/renderer/docxCanvasRenderer.js';
import { CanvasDocument } from '../../src/canvas/types/canvasIr.js';

export interface DynamicMetricResult {
  project: string;
  evaluatedAt: string;
  sourceJsonPath: string;
  sourceJsonSha256: string;
  docxPath?: string;
  docxSha256?: string;
  pipelineManifestPath?: string;
  globalSummary: {
    totalCandidateFrames: number;
    totalCanvasPages: number;
    totalRenderedDocxSections: number | 'unknown';
    totalRenderedDocxPages: number | 'not_measured';
    sectionCountMismatch: number | 'unknown';
    frameCoveragePercent: number;
    detectedCollisionsCount: number;
    visualCollisionsCount: number | 'not_measured';
    oversizedPagesCount: number;
    totalElements: number;
    totalTextboxes: number;
    totalSingleLineTextboxes: number;
    wordCompatibility: string;
    manifestMatched: boolean | 'no_manifest';
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

  const jsonRawBytes = fs.readFileSync(jsonPath);
  const sourceJsonSha256 = crypto.createHash('sha256').update(jsonRawBytes).digest('hex');
  const raw = JSON.parse(jsonRawBytes.toString('utf8'));

  const parser = new FigmaCanvasParser({
    imageMap: raw.imageMap,
    scalePolicy: options.scalePolicy || 'fit-a4',
  });
  const doc = parser.parse(raw);

  const discoveredFrames: any[] = (parser as any).discoverPageFrames(raw.figmaNode || raw.document || raw);
  const totalCandidateFrames = discoveredFrames.length;
  const totalCanvasPages = doc.pages.length;

  // 1. Inspect actual DOCX for real w:sectPr count and compute SHA-256 hash
  let actualDocxSections: number | 'unknown' = 'unknown';
  let targetDocxPath = options.docxPath ? path.resolve(options.docxPath) : undefined;
  let docxSha256 = '';

  if (!targetDocxPath || !fs.existsSync(targetDocxPath)) {
    try {
      const renderer = new DocxCanvasRenderer();
      const buffer = await renderer.renderToBuffer(doc);
      docxSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
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
      docxSha256 = crypto.createHash('sha256').update(data).digest('hex');
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

  // Structural section count parity metric (separate from visual collisions)
  const sectionCountMismatch = typeof actualDocxSections === 'number'
    ? Math.abs(totalCanvasPages - actualDocxSections)
    : 'unknown';

  // 2. Read actual pipeline execution result if available, with SHA-256 stale cache validation
  let actualWordPages: number | 'not_measured' = 'not_measured';
  let wordCompatibility = 'not_measured';
  let manifestMatched: boolean | 'no_manifest' = 'no_manifest';

  if (options.pipelineManifestPath && fs.existsSync(options.pipelineManifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(options.pipelineManifestPath, 'utf8'));
      // Stale cache protection: verify that manifest docxSha256 matches the analyzed DOCX
      if (manifest.docxSha256 && docxSha256 && manifest.docxSha256 !== docxSha256) {
        manifestMatched = false;
        actualWordPages = 'not_measured';
        wordCompatibility = `stale_manifest_mismatch (Manifest sha ${manifest.docxSha256.slice(0, 8)} != DOCX sha ${docxSha256.slice(0, 8)})`;
      } else {
        manifestMatched = true;
        if (manifest.success) {
          actualWordPages = typeof manifest.totalPages === 'number' ? manifest.totalPages : 'not_measured';
          wordCompatibility = `Valid (${manifest.totalSections} sections, ${manifest.totalPages} pages rendered)`;
        } else {
          wordCompatibility = `Failed: ${manifest.error || 'Unknown Word error'}`;
        }
      }
    } catch {
      wordCompatibility = 'unavailable';
      manifestMatched = false;
    }
  }

  // 3. Collision detection:
  // Inspect candidate frame geometry for exact overlapping coordinate collisions (e.g. adjacent frames sharing identical bounds)
  let detectedFrameCollisions = 0;
  for (let i = 0; i < discoveredFrames.length; i++) {
    for (let j = i + 1; j < discoveredFrames.length; j++) {
      const b1 = discoveredFrames[i].absoluteBoundingBox;
      const b2 = discoveredFrames[j].absoluteBoundingBox;
      if (b1 && b2) {
        if (b1.x === b2.x && b1.y === b2.y && b1.width === b2.width && b1.height === b2.height) {
          detectedFrameCollisions++;
        }
      }
    }
  }

  // Visual layout collision: if sections are isolated per page, visual page collisions are 0.
  // If sectionCountMismatch > 0 and identical frame coordinates exist, report the collision.
  const visualCollisionsCount = sectionCountMismatch === 0 ? 0 : (detectedFrameCollisions > 0 ? detectedFrameCollisions : 'not_measured');
  const detectedCollisionsCount = detectedFrameCollisions;

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
    project: 'Figma2Word — Phase 28 Dynamic Metrics Engine',
    evaluatedAt: new Date().toISOString(),
    sourceJsonPath: jsonPath,
    sourceJsonSha256,
    docxPath: targetDocxPath,
    docxSha256,
    pipelineManifestPath: options.pipelineManifestPath,
    globalSummary: {
      totalCandidateFrames,
      totalCanvasPages,
      totalRenderedDocxSections: actualDocxSections,
      totalRenderedDocxPages: actualWordPages,
      sectionCountMismatch,
      frameCoveragePercent,
      detectedCollisionsCount,
      visualCollisionsCount,
      oversizedPagesCount: pageMetrics.filter(p => p.structuralDefects.includes('OVERSIZED_PAGE_CLAMPED')).length,
      totalElements,
      totalTextboxes,
      totalSingleLineTextboxes: totalSingleLineText,
      wordCompatibility,
      manifestMatched,
    },
    pages: pageMetrics,
  };
}
