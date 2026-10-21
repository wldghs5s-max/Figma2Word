import * as path from 'path';
import * as fs from 'fs';
import { runVisualPipeline } from '../tools/visual-regression/pipeline.js';
import { FigmaCanvasParser } from '../src/canvas/parser/figmaCanvasParser.js';
import { HwpxCanvasRenderer } from '../src/canvas/renderer/hwpxCanvasRenderer.js';
import { computeDynamicMetrics } from '../tools/visual-regression/compute_full_metrics.js';

async function main() {
  const rootDir = fs.existsSync(path.join(process.cwd(), 'src'))
    ? process.cwd()
    : path.join(process.cwd(), 'Figma2Word');

  const jsonPath = path.join(rootDir, 'samples/phase30_comprehensive_synthetic_fixture.json');
  const outDir = path.join(rootDir, 'debug/phase30-evidence/run');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('[Phase 30 Runner] 1. Executing Word Visual Pipeline...');
  const pipelineRes = await runVisualPipeline({
    jsonPath,
    outputDir: outDir,
    docxName: 'phase30_rendered.docx',
    scalePolicy: 'fit-a4',
  });

  console.log('[Phase 30 Runner] Pipeline finished with success =', pipelineRes.success);
  if (!pipelineRes.success) {
    console.error('[Phase 30 Runner] Error:', pipelineRes.error);
  } else {
    console.log(`[Phase 30 Runner] Rendered ${pipelineRes.totalPages} PNG pages, DOCX size: ${fs.statSync(pipelineRes.docxPath).size} bytes`);
  }

  // 2. Render HWPX
  console.log('[Phase 30 Runner] 2. Rendering HWPX document...');
  const rawJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const parser = new FigmaCanvasParser({
    imageMap: rawJson.imageMap,
    scalePolicy: 'fit-a4',
  });
  const canvasDoc = parser.parse(rawJson);
  const hwpxRenderer = new HwpxCanvasRenderer();
  const hwpxBuffer = await hwpxRenderer.renderToBuffer(canvasDoc);
  const hwpxPath = path.join(outDir, 'phase30_rendered.hwpx');
  fs.writeFileSync(hwpxPath, hwpxBuffer);
  console.log(`[Phase 30 Runner] HWPX generated at ${hwpxPath} (${hwpxBuffer.length} bytes)`);

  // 3. Compute dynamic metrics
  console.log('[Phase 30 Runner] 3. Computing Dynamic Metrics...');
  const metrics = await computeDynamicMetrics({
    jsonPath,
    docxPath: pipelineRes.docxPath,
    pipelineManifestPath: path.join(outDir, 'pipeline-manifest.json'),
  });

  const metricsPath = path.join(outDir, 'phase30_metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`[Phase 30 Runner] Metrics saved to ${metricsPath}`);
  console.log('Summary:', JSON.stringify(metrics.globalSummary, null, 2));
}

main().catch(console.error);
