import * as fs from 'fs';
import * as path from 'path';
import {
  QualityAuditInput,
  QualityAuditResult,
  PageVisualComparison,
  DocxRenderResult,
  DocxStructureComparison,
} from './types.js';
import { WordRenderer } from './wordRenderer.js';
import { ImageComparator } from './imageComparator.js';
import { DocxStructureComparator } from './docxStructureComparator.js';
import { ReportGenerator } from './reportGenerator.js';

export class QualityAuditRunner {
  private wordRenderer: WordRenderer;
  private imageComparator: ImageComparator;
  private docxComparator: DocxStructureComparator;
  private reportGenerator: ReportGenerator;

  constructor() {
    this.wordRenderer = new WordRenderer();
    this.imageComparator = new ImageComparator();
    this.docxComparator = new DocxStructureComparator();
    this.reportGenerator = new ReportGenerator();
  }

  /**
   * Executes a deterministic quality audit comparison based on the provided inputs.
   */
  public async runAudit(input: QualityAuditInput, outputDir: string): Promise<QualityAuditResult> {
    const fullOutputDir = path.resolve(outputDir);
    if (!fs.existsSync(fullOutputDir)) {
      fs.mkdirSync(fullOutputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    let executionMode: QualityAuditResult['executionMode'] = 'structure_only';

    const hasFigmaImages = Array.isArray(input.figmaImages) && input.figmaImages.length > 0;
    const hasGeneratedDocx = Boolean(input.generatedDocx && fs.existsSync(input.generatedDocx));
    const hasReferenceDocx = Boolean(input.referenceDocx && fs.existsSync(input.referenceDocx));

    if (hasFigmaImages && hasGeneratedDocx && hasReferenceDocx) {
      executionMode = 'full';
    } else if (hasFigmaImages && hasGeneratedDocx) {
      executionMode = 'figma_vs_generated';
    } else if (hasGeneratedDocx && hasReferenceDocx) {
      executionMode = 'reference_vs_generated';
    } else {
      executionMode = 'structure_only';
    }

    let generatedDocxResult: DocxRenderResult | undefined;
    let referenceDocxResult: DocxRenderResult | undefined;
    const pageVisualComparisons: PageVisualComparison[] = [];

    // 1. Render Generated DOCX (if provided)
    if (hasGeneratedDocx && input.generatedDocx) {
      const genRenderDir = path.resolve(fullOutputDir, 'rendered_generated');
      generatedDocxResult = await this.wordRenderer.renderDocxToImages(
        input.generatedDocx,
        genRenderDir,
        input.options
      );
    }

    // 2. Render Reference DOCX (if provided)
    if (hasReferenceDocx && input.referenceDocx) {
      const refRenderDir = path.resolve(fullOutputDir, 'rendered_reference');
      referenceDocxResult = await this.wordRenderer.renderDocxToImages(
        input.referenceDocx,
        refRenderDir,
        input.options
      );
    }

    // 3. Perform Page-by-Page Visual Comparison
    const visualDiffDir = path.resolve(fullOutputDir, 'visual_diffs');

    if (executionMode === 'full' || executionMode === 'figma_vs_generated') {
      // Compare against Figma 원본 스크린샷
      const baseImages = input.figmaImages || [];
      const testImages = generatedDocxResult?.pngPaths || [];
      const maxPages = Math.max(baseImages.length, testImages.length);

      for (let p = 1; p <= maxPages; p++) {
        const baseImg = baseImages[p - 1];
        const testImg = testImages[p - 1];

        if (baseImg && testImg) {
          const comp = await this.imageComparator.comparePageImages(
            p,
            baseImg,
            testImg,
            visualDiffDir,
            input.options
          );
          pageVisualComparisons.push(comp);
        } else if (baseImg && !testImg) {
          pageVisualComparisons.push({
            pageNumber: p,
            baseImagePath: baseImg,
            widthDiff: 0,
            heightDiff: 0,
            aspectRatioDiff: 0,
            totalEvaluatedPixels: 0,
            mismatchPixelCount: 0,
            mismatchRatio: 1.0,
            mae: 255,
            rmse: 255,
            visualSummary: `DOCX 생성 페이지 누락 (Page ${p} 생성 안 됨)`,
          });
        } else if (!baseImg && testImg) {
          pageVisualComparisons.push({
            pageNumber: p,
            testImagePath: testImg,
            widthDiff: 0,
            heightDiff: 0,
            aspectRatioDiff: 0,
            totalEvaluatedPixels: 0,
            mismatchPixelCount: 0,
            mismatchRatio: 1.0,
            mae: 255,
            rmse: 255,
            visualSummary: `초과 생성된 DOCX 페이지 (Figma 원본에는 없는 페이지 ${p})`,
          });
        }
      }
    } else if (executionMode === 'reference_vs_generated') {
      // Compare Generated DOCX vs Reference DOCX
      const baseImages = referenceDocxResult?.pngPaths || [];
      const testImages = generatedDocxResult?.pngPaths || [];
      const maxPages = Math.max(baseImages.length, testImages.length);

      for (let p = 1; p <= maxPages; p++) {
        const baseImg = baseImages[p - 1];
        const testImg = testImages[p - 1];

        if (baseImg && testImg) {
          const comp = await this.imageComparator.comparePageImages(
            p,
            baseImg,
            testImg,
            visualDiffDir,
            input.options
          );
          pageVisualComparisons.push(comp);
        } else {
          pageVisualComparisons.push({
            pageNumber: p,
            baseImagePath: baseImg,
            testImagePath: testImg,
            widthDiff: 0,
            heightDiff: 0,
            aspectRatioDiff: 0,
            totalEvaluatedPixels: 0,
            mismatchPixelCount: 0,
            mismatchRatio: 1.0,
            mae: 255,
            rmse: 255,
            visualSummary: `페이지 수 불일치 (Base: ${baseImages.length}p vs Test: ${testImages.length}p)`,
          });
        }
      }
    }

    // 4. DOCX OpenXML Structural Comparison
    let structureComparison: DocxStructureComparison | undefined;
    if (hasGeneratedDocx && input.generatedDocx) {
      structureComparison = await this.docxComparator.compareDocx(
        input.generatedDocx,
        input.referenceDocx
      );
    }

    // 5. Evaluate Summary Status
    let passedPages = 0;
    let warningPages = 0;
    for (const p of pageVisualComparisons) {
      if (p.mismatchRatio <= 0.05) {
        passedPages++;
      } else {
        warningPages++;
      }
    }

    const structuralDiscrepancies = structureComparison?.structuralNotices.length || 0;

    let overallStatus: QualityAuditResult['summary']['status'] = 'PASS';
    let statusMessage = '모든 검증 항목이 기준 허용치 내에서 정상 통과되었습니다.';

    if (generatedDocxResult?.skipped) {
      overallStatus = 'SKIPPED';
      statusMessage = `Word COM 렌더링이 건너뛰어졌습니다 (${generatedDocxResult.skipReason}). 구조 분석만 완료되었습니다.`;
    } else if (warningPages > 0 || structuralDiscrepancies > 0) {
      overallStatus = 'WARNING';
      statusMessage = `검토 필요 항목 감지: 시각적 주의 ${warningPages}페이지, 구조적 차이 ${structuralDiscrepancies}건.`;
    }

    const result: QualityAuditResult = {
      id: input.id,
      title: input.title,
      timestamp,
      executionMode,
      generatedDocxResult,
      referenceDocxResult,
      pageVisualComparisons,
      structureComparison,
      summary: {
        totalEvaluatedPages: pageVisualComparisons.length || (generatedDocxResult?.pageCount ?? 0),
        passedPages,
        warningPages,
        structuralDiscrepancies,
        status: overallStatus,
        statusMessage,
      },
      reproductionCommand: `npx tsx tools/quality-audit/index.ts --id "${input.id}"`,
    };

    // 6. Generate Reports (HTML & JSON)
    const reportHtmlPath = path.resolve(fullOutputDir, `quality-audit-${input.id}.html`);
    const reportJsonPath = path.resolve(fullOutputDir, `quality-audit-${input.id}.json`);

    this.reportGenerator.generateHtmlReport(result, reportHtmlPath);
    fs.writeFileSync(reportJsonPath, JSON.stringify(result, null, 2), 'utf8');

    result.reportHtmlPath = reportHtmlPath;
    result.reportJsonPath = reportJsonPath;

    return result;
  }
}
