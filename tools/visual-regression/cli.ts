import * as path from 'path';
import { runVisualPipeline } from './pipeline.js';

async function main() {
  const rootDir = process.cwd();
  const jsonPath = path.resolve(rootDir, 'debug/phase25-web-ui-fidelity/pentech_v3_original.json');
  const outDir = path.resolve(rootDir, 'research/rea-document-engine/phase26-visual-fidelity/artifacts/baseline_word_render');

  console.log('=== FIGMA2WORD VISUAL PIPELINE CLI ===');
  console.log('Input JSON:', jsonPath);
  console.log('Output Dir:', outDir);

  const res = await runVisualPipeline({
    jsonPath,
    outputDir: outDir,
    docxName: 'phase26_baseline.docx',
    scalePolicy: 'fit-a4',
    renderScale: 1.5,
  });

  console.log('\n=== PIPELINE EXECUTION RESULT ===');
  console.log(`Success: ${res.success}`);
  console.log(`Duration: ${(res.durationMs / 1000).toFixed(2)}s`);
  console.log(`DOCX: ${res.docxPath} (SHA256: ${res.docxSha256.slice(0, 16)}...)`);
  console.log(`PDF: ${res.pdfPath}`);
  console.log(`Total Sections: ${res.totalSections}`);
  console.log(`Total Pages: ${res.totalPages}`);
  if (res.error) {
    console.error(`Error: ${res.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
