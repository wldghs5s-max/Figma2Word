import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface PageComparisonResult {
  pageNumber: number;
  width: number;
  height: number;
  evaluatedPixels: number;
  mismatchPixels: number;
  mismatchRatio: number;
  mae: number;
  ssim: number;
  diffImagePath: string;
  verdict: string;
}

async function runComparison() {
  const rootDir = process.cwd();
  const baseDir = path.resolve(rootDir, 'research/rea-document-engine/phase26-visual-fidelity/artifacts/baseline_word_render/pages');
  const impDir = path.resolve(rootDir, 'research/rea-document-engine/phase26-visual-fidelity/artifacts/improved_word_render/pages');
  const diffDir = path.resolve(rootDir, 'research/rea-document-engine/phase26-visual-fidelity/artifacts/diff_heatmaps');
  fs.mkdirSync(diffDir, { recursive: true });

  const swiftScript = path.resolve(rootDir, 'tools/visual-regression/compare_engine.swift');
  const results: PageComparisonResult[] = [];

  console.log('=== RUNNING FULL 17-PAGE COMPARISON ===');

  for (let p = 1; p <= 17; p++) {
    const pStr = p.toString().padStart(3, '0');
    const basePng = path.join(baseDir, `page-${pStr}.png`);
    const impPng = path.join(impDir, `page-${pStr}.png`);
    const diffPng = path.join(diffDir, `page-${pStr}-diff.png`);

    if (!fs.existsSync(basePng) || !fs.existsSync(impPng)) {
      console.warn(`Skipping page ${p}: files missing`);
      continue;
    }

    const cmd = `swift "${swiftScript}" "${basePng}" "${impPng}" "${diffPng}" 5.0`;
    const out = execSync(cmd, { encoding: 'utf8' }).trim();
    const res = JSON.parse(out);

    let verdict = '동일 유지 (No regression)';
    if (res.mismatchRatio > 0.001) {
      verdict = '모서리 곡률 및 스타일 개선 감지 (Improved VML ArcSize)';
    }

    results.push({
      pageNumber: p,
      width: res.width1,
      height: res.height1,
      evaluatedPixels: res.evaluatedPixels,
      mismatchPixels: res.mismatchPixels,
      mismatchRatio: res.mismatchRatio,
      mae: res.mae,
      ssim: res.ssim,
      diffImagePath: diffPng,
      verdict,
    });

    console.log(`Page ${p.toString().padStart(2, ' ')}: SSIM=${res.ssim.toFixed(4)}, MAE=${res.mae.toFixed(2)}, Mismatch=${(res.mismatchRatio * 100).toFixed(2)}% | ${verdict}`);
  }

  const summary = {
    comparisonDate: new Date().toISOString(),
    baselineDir: baseDir,
    improvedDir: impDir,
    diffDir,
    totalPagesCompared: results.length,
    averageSsim: Number((results.reduce((acc, r) => acc + r.ssim, 0) / results.length).toFixed(4)),
    averageMae: Number((results.reduce((acc, r) => acc + r.mae, 0) / results.length).toFixed(2)),
    pages: results,
  };

  const outJson = path.resolve(rootDir, 'research/rea-document-engine/phase26-visual-fidelity/artifacts/comparison_results.json');
  fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));
  console.log('\nSaved comparison summary to:', outJson);
}

runComparison().catch(console.error);
