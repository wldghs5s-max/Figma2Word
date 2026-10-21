import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

async function buildReviewPackage() {
  const rootDir = fs.existsSync(path.join(process.cwd(), 'src'))
    ? process.cwd()
    : path.join(process.cwd(), 'Figma2Word');
  const zip = new JSZip();

  console.log('[Packaging] Building phase30-gpt-review.zip...');

  // 1. Audit Reports (01 ~ 13)
  const auditDir = path.join(rootDir, 'research/rea-document-engine/phase30-production-fidelity');
  if (fs.existsSync(auditDir)) {
    for (const f of fs.readdirSync(auditDir).sort()) {
      if (f.endsWith('.md')) {
        zip.file(`audit-reports/${f}`, fs.readFileSync(path.join(auditDir, f)));
      }
    }
  }

  // 2. Production Source Code
  const srcFiles = [
    'tools/visual-regression/safe_word_automation.ts',
    'tools/visual-regression/pipeline.ts',
    'tools/visual-regression/compute_full_metrics.ts',
    'src/canvas/renderer/docxCanvasRenderer.ts',
    'src/canvas/renderer/hwpxCanvasRenderer.ts',
    'src/canvas/parser/figmaCanvasParser.ts',
    'src/canvas/types.ts',
    'scripts/generate_phase30_synthetic_fixture.ts',
    'scripts/run_phase30_visual_pipeline.ts',
  ];
  for (const sf of srcFiles) {
    const full = path.join(rootDir, sf);
    if (fs.existsSync(full)) {
      zip.file(`source-code/${sf}`, fs.readFileSync(full));
    }
  }

  // 3. Automated Tests
  const testFiles = [
    'tests/phase30-production-fidelity.test.ts',
    'tests/phase29-word-automation-final-guard.test.ts',
    'tests/phase28-word-isolation-and-rendering.test.ts',
    'tests/phase27-renderer-improvements.test.ts',
    'tests/visual-comparison-algorithm.test.ts',
    'tests/metrics-trustworthiness.test.ts',
    'tests/word-automation-safety.test.ts',
  ];
  for (const tf of testFiles) {
    const full = path.join(rootDir, tf);
    if (fs.existsSync(full)) {
      zip.file(`tests/${path.basename(tf)}`, fs.readFileSync(full));
    }
  }

  // 4. Evidence & Artifacts
  const evidenceFiles = [
    'debug/phase30-evidence/full_test_log.txt',
    'debug/phase30-evidence/environment_info.json',
    'samples/phase30_comprehensive_synthetic_fixture.json',
    'debug/phase30-evidence/run/phase30_rendered.docx',
    'debug/phase30-evidence/run/phase30_rendered.hwpx',
    'debug/phase30-evidence/run/phase30_rendered.pdf',
    'debug/phase30-evidence/run/pages/page-001.png',
    'debug/phase30-evidence/run/pages/page-002.png',
    'debug/phase30-evidence/run/phase30_metrics.json',
    'debug/phase30-evidence/run/pipeline-manifest.json',
  ];
  for (const ef of evidenceFiles) {
    const full = path.join(rootDir, ef);
    if (fs.existsSync(full)) {
      zip.file(`evidence/${path.basename(ef)}`, fs.readFileSync(full));
    }
  }

  const outZipPath = path.join(rootDir, 'phase30-gpt-review.zip');
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  fs.writeFileSync(outZipPath, buffer);
  console.log(`[Packaging] Successfully generated ${outZipPath} (${(buffer.length / 1024).toFixed(1)} KB)`);

  // Also copy to parent project directory if exists
  const parentZipPath = path.join(rootDir, '../phase30-gpt-review.zip');
  fs.writeFileSync(parentZipPath, buffer);
  console.log(`[Packaging] Copied to parent directory: ${parentZipPath}`);

  // Verify integrity
  const verifyZip = await JSZip.loadAsync(buffer);
  const fileNames = Object.keys(verifyZip.files);
  console.log(`[Packaging] Verified ZIP integrity: contains ${fileNames.length} files.`);
  for (const f of fileNames.sort()) {
    console.log(`  - ${f}`);
  }
}

buildReviewPackage().catch(console.error);
