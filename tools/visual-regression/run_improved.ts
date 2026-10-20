import * as path from 'path';
import { runVisualPipeline } from './pipeline.js';

async function main() {
  const rootDir = process.cwd();
  const jsonPath = path.resolve(rootDir, 'debug/phase25-web-ui-fidelity/pentech_v3_original.json');
  const outDir = path.resolve(rootDir, 'research/rea-document-engine/phase26-visual-fidelity/artifacts/improved_word_render');

  console.log('=== RUNNING PHASE 26 IMPROVED PIPELINE ===');
  const res = await runVisualPipeline({
    jsonPath,
    outputDir: outDir,
    docxName: 'phase26_improved.docx',
    scalePolicy: 'fit-a4',
    renderScale: 1.5,
  });

  console.log('=== IMPROVED PIPELINE FINISHED ===');
  console.log(`Success: ${res.success}`);
  console.log(`Total Sections: ${res.totalSections}, Total Pages: ${res.totalPages}`);
  console.log(`DOCX: ${res.docxPath} (${res.docxSha256.slice(0, 16)}...)`);
}

main().catch(console.error);
