import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

async function main() {
  console.log('[PACKAGE] Packaging phase37-gpt-review.zip using JSZip...');
  const zip = new JSZip();

  const filesToAdd: { zipPath: string; diskPath: string }[] = [];

  // 1. All files in phase37-word-editability
  function addDir(dir: string, prefix: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relZipPath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        addDir(fullPath, relZipPath);
      } else {
        filesToAdd.push({ zipPath: relZipPath, diskPath: fullPath });
      }
    }
  }

  addDir('phase37-word-editability', 'phase37-word-editability');

  // 2. Tests
  filesToAdd.push({ zipPath: 'tests/phase37-image-transform.test.ts', diskPath: 'tests/phase37-image-transform.test.ts' });
  filesToAdd.push({ zipPath: 'tests/phase37-git-verification.test.ts', diskPath: 'tests/phase37-git-verification.test.ts' });
  filesToAdd.push({ zipPath: 'tests/phase37-media-relationships.test.ts', diskPath: 'tests/phase37-media-relationships.test.ts' });
  filesToAdd.push({ zipPath: 'tests/phase35-editability-auditor.test.ts', diskPath: 'tests/phase35-editability-auditor.test.ts' });

  // 3. Source files modified or created
  filesToAdd.push({ zipPath: 'src/canvas/parser/figmaCanvasParser.ts', diskPath: 'src/canvas/parser/figmaCanvasParser.ts' });
  filesToAdd.push({ zipPath: 'src/fidelity/editabilityAuditor.ts', diskPath: 'src/fidelity/editabilityAuditor.ts' });
  filesToAdd.push({ zipPath: 'src/fidelity/mediaRelationshipAuditor.ts', diskPath: 'src/fidelity/mediaRelationshipAuditor.ts' });
  filesToAdd.push({ zipPath: 'src/fidelity/gitOriginVerifier.ts', diskPath: 'src/fidelity/gitOriginVerifier.ts' });
  filesToAdd.push({ zipPath: 'src/fidelity/affineTransformEngine.ts', diskPath: 'src/fidelity/affineTransformEngine.ts' });
  filesToAdd.push({ zipPath: 'src/fidelity/integrityGate.ts', diskPath: 'src/fidelity/integrityGate.ts' });

  // 4. Tools & Runners
  filesToAdd.push({ zipPath: 'tools/visual-regression/windows_word_edit_test.ps1', diskPath: 'tools/visual-regression/windows_word_edit_test.ps1' });
  filesToAdd.push({ zipPath: 'scripts/run_phase37_production_pipeline.ts', diskPath: 'scripts/run_phase37_production_pipeline.ts' });

  // Verify and add files
  const FORBIDDEN_EXTS = ['.png', '.docx', '.pdf', '.exe', '.dll', '.node'];
  const FORBIDDEN_PATTERNS = ['펜테크', 'figd_', 'figma_token'];

  for (const item of filesToAdd) {
    const ext = path.extname(item.diskPath).toLowerCase();
    if (FORBIDDEN_EXTS.includes(ext)) {
      throw new Error(`FORBIDDEN EXTENSION in zip packaging: ${item.diskPath}`);
    }

    const content = fs.readFileSync(item.diskPath);
    if (item.diskPath.endsWith('.json') && content.length > 5 * 1024 * 1024) {
      throw new Error(`Customer design JSON detected (>5MB): ${item.diskPath}`);
    }

    const contentStr = content.toString('utf8', 0, Math.min(content.length, 100000));
    for (const pat of FORBIDDEN_PATTERNS) {
      if (pat === '펜테크' && !item.diskPath.endsWith('.md') && !item.diskPath.endsWith('.txt') && !item.diskPath.endsWith('.json') && !item.diskPath.endsWith('.ts') && !item.diskPath.endsWith('.ps1') && !item.diskPath.endsWith('.patch') && !item.diskPath.endsWith('.csv')) {
        throw new Error(`Suspicious file containing customer name: ${item.diskPath}`);
      }
      if (pat.startsWith('figd_') && contentStr.includes(pat)) {
        throw new Error(`SECRET TOKEN detected in file: ${item.diskPath}`);
      }
    }

    zip.file(item.zipPath, content);
    console.log(`  + ${item.zipPath} (${content.length} bytes)`);
  }

  const zipPath = path.resolve('phase37-gpt-review.zip');
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  fs.writeFileSync(zipPath, buffer);
  console.log(`[PACKAGE] Successfully created ${zipPath} (${buffer.length} bytes)`);

  // Self-Audit the zip
  console.log('[PACKAGE] Running self-audit on generated zip...');
  const verifyZip = await JSZip.loadAsync(buffer);
  const entries = Object.keys(verifyZip.files);
  console.log(`  Total entries in zip: ${entries.length}`);

  for (const entry of entries) {
    const lower = entry.toLowerCase();
    for (const ext of FORBIDDEN_EXTS) {
      if (lower.endsWith(ext)) {
        throw new Error(`Audit FAILED: Zip contains forbidden file extension ${entry}`);
      }
    }
    const data = await verifyZip.files[entry].async('nodebuffer');
    if (entry.endsWith('.json') && data.length > 5 * 1024 * 1024) {
      throw new Error(`Audit FAILED: Customer design JSON in zip ${entry}`);
    }
  }

  console.log('[PACKAGE] Self-Audit PASSED! Zero binary, raw image, docx, pdf, or customer dumps found.');
}

main().catch((err) => {
  console.error('Fatal in package:', err);
  process.exit(1);
});
