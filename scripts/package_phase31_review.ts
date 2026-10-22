import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

async function buildPhase31ReviewPackage() {
  const rootDir = fs.existsSync(path.join(process.cwd(), 'src'))
    ? process.cwd()
    : path.join(process.cwd(), 'Figma2Word');
  const zip = new JSZip();

  console.log('[Packaging] Building phase31-gpt-review.zip...');

  // 1. Audit Reports (01 ~ 09 + README)
  const reportsDir = path.join(rootDir, 'phase31-quality-validation/reports');
  if (fs.existsSync(reportsDir)) {
    for (const f of fs.readdirSync(reportsDir).sort()) {
      if (f.endsWith('.md')) {
        zip.file(`reports/${f}`, fs.readFileSync(path.join(reportsDir, f)));
      }
    }
  }
  const mainReadme = path.join(rootDir, 'phase31-quality-validation/README.md');
  if (fs.existsSync(mainReadme)) {
    zip.file('README.md', fs.readFileSync(mainReadme));
  }

  // 2. Modified Production Source Code
  const srcFiles = [
    'src/canvas/renderer/docxCanvasRenderer.ts',
    'src/canvas/renderer/hwpxCanvasRenderer.ts',
    'tools/visual-regression/safe_word_automation.ts',
    'scripts/generate_phase30_synthetic_fixture.ts',
    'scripts/run_phase30_visual_pipeline.ts',
    'scripts/experiment_vml_image_binding.ts',
  ];
  for (const sf of srcFiles) {
    const full = path.join(rootDir, sf);
    if (fs.existsSync(full)) {
      zip.file(`source-code/${sf}`, fs.readFileSync(full));
    }
  }

  // 3. Relevant Automated Tests
  const testFiles = [
    'tests/phase31-audit-verification.test.ts',
    'tests/phase30-production-fidelity.test.ts',
    'tests/phase29-word-automation-final-guard.test.ts',
    'tests/phase28-word-isolation-and-rendering.test.ts',
  ];
  for (const tf of testFiles) {
    const full = path.join(rootDir, tf);
    if (fs.existsSync(full)) {
      zip.file(`tests/${path.basename(tf)}`, fs.readFileSync(full));
    }
  }

  // 4. Evidence (Before / After PNGs, DOCX XML, HWPX XML, Logs)
  const evidenceFiles = [
    'phase31-quality-validation/evidence/before/page-001-corrupt-png.png',
    'phase31-quality-validation/evidence/after/page-001-fixed.png',
    'phase31-quality-validation/evidence/after/page-002-fixed.png',
    'phase31-quality-validation/evidence/after/phase31_rendered.docx',
    'phase31-quality-validation/evidence/after/phase31_rendered.hwpx',
    'phase31-quality-validation/evidence/after/phase31_rendered.pdf',
    'phase31-quality-validation/evidence/docx-xml/document.xml',
    'phase31-quality-validation/evidence/docx-xml/document.xml.rels',
    'phase31-quality-validation/evidence/hwpx-xml/section0.xml',
    'phase31-quality-validation/evidence/logs/full_test_log.txt',
    'samples/phase30_comprehensive_synthetic_fixture.json',
  ];
  for (const ef of evidenceFiles) {
    const full = path.join(rootDir, ef);
    if (fs.existsSync(full)) {
      zip.file(`evidence/${path.basename(ef)}`, fs.readFileSync(full));
    }
  }

  const outZipPath = path.join(rootDir, 'phase31-gpt-review.zip');
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  fs.writeFileSync(outZipPath, buffer);
  console.log(`[Packaging] Successfully generated ${outZipPath} (${(buffer.length / 1024).toFixed(1)} KB)`);

  // Also copy to parent directory
  const parentZipPath = path.join(rootDir, '../phase31-gpt-review.zip');
  fs.writeFileSync(parentZipPath, buffer);
  console.log(`[Packaging] Copied to parent directory: ${parentZipPath}`);

  // Integrity Check
  const verifyZip = await JSZip.loadAsync(buffer);
  const fileNames = Object.keys(verifyZip.files);
  console.log(`[Packaging] Verified ZIP integrity: contains ${fileNames.length} files.`);
  for (const fn of fileNames.sort()) {
    console.log(`  - ${fn}`);
  }
}

buildPhase31ReviewPackage().catch(console.error);
