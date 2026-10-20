import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

async function buildReviewPackage() {
  const rootDir = process.cwd();
  const zip = new JSZip();

  console.log('[Packaging] Building phase28-gpt-review.zip...');

  // 1. Audit Reports (01 ~ 10)
  const auditDir = path.join(rootDir, 'research/rea-document-engine/phase28-quality-audit');
  if (fs.existsSync(auditDir)) {
    for (const f of fs.readdirSync(auditDir)) {
      if (f.endsWith('.md')) {
        zip.file(`audit-reports/${f}`, fs.readFileSync(path.join(auditDir, f)));
      }
    }
  }

  // 2. Modified Production Source Code
  const srcFiles = [
    'tools/visual-regression/safe_word_automation.ts',
    'tools/visual-regression/pipeline.ts',
    'tools/visual-regression/compute_full_metrics.ts',
    'src/canvas/renderer/docxCanvasRenderer.ts',
    'src/canvas/parser/docxCanvasParser.ts',
  ];
  for (const sf of srcFiles) {
    const full = path.join(rootDir, sf);
    if (fs.existsSync(full)) {
      zip.file(`source-code/${sf}`, fs.readFileSync(full));
    }
  }

  // 3. Automated Tests
  const testFiles = [
    'tests/phase28-word-isolation-and-rendering.test.ts',
    'tests/word-automation-safety.test.ts',
    'tests/metrics-trustworthiness.test.ts',
    'tests/phase27-renderer-improvements.test.ts',
    'tests/visual-comparison-algorithm.test.ts',
  ];
  for (const tf of testFiles) {
    const full = path.join(rootDir, tf);
    if (fs.existsSync(full)) {
      zip.file(`tests/${path.basename(tf)}`, fs.readFileSync(full));
    }
  }

  // 4. Evidence & Artifacts
  const evidenceFiles = [
    'debug/phase28-evidence/full_test_log.txt',
    'debug/phase28-evidence/environment_info.json',
    'debug/phase28-evidence/phase28_metrics.json',
    'debug/phase28-evidence/run/pipeline-manifest.json',
    'debug/phase28-evidence/run/rendered_document.docx',
    'debug/phase28-evidence/run/rendered_document.pdf',
    'debug/phase28-evidence/run/pages/page-001.png',
    'debug/phase28-evidence/run/pages/page-002.png',
    'debug/phase28-evidence/run/pages/page-003.png',
  ];
  for (const ef of evidenceFiles) {
    const full = path.join(rootDir, ef);
    if (fs.existsSync(full)) {
      zip.file(`evidence/${path.basename(ef)}`, fs.readFileSync(full));
    }
  }

  const outZipPath = path.join(rootDir, 'phase28-gpt-review.zip');
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  fs.writeFileSync(outZipPath, buffer);
  console.log(`[Packaging] Successfully generated ${outZipPath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

  // Verify integrity
  const verifyZip = await JSZip.loadAsync(buffer);
  const fileCount = Object.keys(verifyZip.files).length;
  console.log(`[Packaging] Verified ZIP integrity: contains ${fileCount} files.`);
}

buildReviewPackage().catch(console.error);
