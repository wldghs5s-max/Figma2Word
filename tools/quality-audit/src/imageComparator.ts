import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PageVisualComparison, QualityAuditOptions } from './types.js';

const execFileAsync = promisify(execFile);

export class ImageComparator {
  private scriptPath: string;

  constructor(customScriptPath?: string) {
    this.scriptPath = customScriptPath || path.resolve(process.cwd(), 'tools/quality-audit/scripts/compare_images.ps1');
  }

  /**
   * Compares two page images (e.g. Figma PNG vs Generated DOCX PNG, or Reference DOCX vs Generated DOCX).
   */
  public async comparePageImages(
    pageNumber: number,
    baseImagePath: string,
    testImagePath: string,
    outputDir: string,
    options?: QualityAuditOptions
  ): Promise<PageVisualComparison> {
    const fullBase = path.resolve(baseImagePath);
    const fullTest = path.resolve(testImagePath);

    if (!fs.existsSync(fullBase) || !fs.existsSync(fullTest)) {
      return {
        pageNumber,
        baseImagePath: fullBase,
        testImagePath: fullTest,
        widthDiff: 0,
        heightDiff: 0,
        aspectRatioDiff: 0,
        totalEvaluatedPixels: 0,
        mismatchPixelCount: 0,
        mismatchRatio: 1.0,
        mae: 255,
        rmse: 255,
        visualSummary: `Image file missing: base=${fs.existsSync(fullBase)}, test=${fs.existsSync(fullTest)}`,
      };
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const diffPath = path.resolve(outputDir, `Page${pageNumber.toString().padStart(2, '0')}-diff.png`);
    const overlayPath = path.resolve(outputDir, `Page${pageNumber.toString().padStart(2, '0')}-overlay.png`);
    const tolerance = options?.toleranceThreshold ?? 10;

    const args = [
      '-ExecutionPolicy', 'Bypass',
      '-NoProfile',
      '-File', this.scriptPath,
      '-Image1', fullBase,
      '-Image2', fullTest,
      '-OutDiffPng', options?.generateDiff !== false ? diffPath : '',
      '-OutOverlayPng', options?.generateOverlay !== false ? overlayPath : '',
      '-Tolerance', tolerance.toString(),
    ];

    try {
      const { stdout } = await execFileAsync('powershell', args, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const trimmed = stdout.trim();
      const jsonLine = trimmed.split('\n').map(l => l.trim()).filter(l => l.startsWith('{')).pop();
      if (!jsonLine) {
        throw new Error(`Invalid output from compare_images.ps1: ${trimmed}`);
      }

      const res = JSON.parse(jsonLine);
      if (!res.success) {
        throw new Error(res.error || 'Unknown image comparison failure');
      }

      const mismatchRatio = Number(res.mismatchRatio || 0);
      let summary = '';
      if (mismatchRatio === 0) {
        summary = '완전 일치 (100% 픽셀 동일)';
      } else if (mismatchRatio < 0.03) {
        summary = '최상 (미세 안티앨리어싱/글꼴 힌팅 차이 수준)';
      } else if (mismatchRatio < 0.15) {
        summary = '양호 (미세 여백/패딩 이동 감지)';
      } else if (mismatchRatio < 0.35) {
        summary = '주의 (요소 배치 차이 또는 폰트 크기 불일치)';
      } else {
        summary = '경고 (주요 콘텐츠 누락 또는 대폭 레이아웃 불일치)';
      }

      if (res.widthDiff > 0 || res.heightDiff > 0) {
        summary += ` [해상도 불일치: ΔW=${res.widthDiff}px, ΔH=${res.heightDiff}px]`;
      }

      return {
        pageNumber,
        baseImagePath: fullBase,
        testImagePath: fullTest,
        diffImagePath: fs.existsSync(diffPath) ? diffPath : undefined,
        overlayImagePath: fs.existsSync(overlayPath) ? overlayPath : undefined,
        baseDimensions: res.baseDimensions,
        testDimensions: res.testDimensions,
        widthDiff: Number(res.widthDiff || 0),
        heightDiff: Number(res.heightDiff || 0),
        aspectRatioDiff: Number(res.aspectRatioDiff || 0),
        totalEvaluatedPixels: Number(res.totalEvaluatedPixels || 0),
        mismatchPixelCount: Number(res.mismatchPixelCount || 0),
        mismatchRatio,
        mae: Number(res.mae || 0),
        rmse: Number(res.rmse || 0),
        visualSummary: summary,
      };
    } catch (err: any) {
      return {
        pageNumber,
        baseImagePath: fullBase,
        testImagePath: fullTest,
        widthDiff: 0,
        heightDiff: 0,
        aspectRatioDiff: 0,
        totalEvaluatedPixels: 0,
        mismatchPixelCount: 0,
        mismatchRatio: 1.0,
        mae: 255,
        rmse: 255,
        visualSummary: `Image comparison execution error: ${err.message}`,
      };
    }
  }
}
