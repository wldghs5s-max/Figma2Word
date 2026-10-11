import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { DocxStructureComparator } from '../../tools/quality-audit/src/docxStructureComparator.js';
import { WordRenderer } from '../../tools/quality-audit/src/wordRenderer.js';
import { ReportGenerator } from '../../tools/quality-audit/src/reportGenerator.js';
import { QualityAuditResult } from '../../tools/quality-audit/src/types.js';

describe('Quality Audit Infrastructure Unit Tests', () => {
  const comparator = new DocxStructureComparator();
  const wordRenderer = new WordRenderer();
  const reportGenerator = new ReportGenerator();
  const fixturePath = path.resolve(process.cwd(), 'debug/quality-audit/synthetic/synthetic_basic.docx');

  it('verifies DocxStructureComparator extracts structural model from valid docx', async () => {
    if (!fs.existsSync(fixturePath)) return;

    const model = await comparator.extractModel(fixturePath);
    expect(model.pageSize.orientation).toBe('portrait');
    expect(model.sectionsCount).toBeGreaterThanOrEqual(1);
    expect(model.paragraphCount).toBeGreaterThan(0);
    expect(model.characterCount).toBeGreaterThan(0);
    expect(model.tableCount).toBe(0);
  });

  it('verifies DocxStructureComparator handles single docx in partial audit mode', async () => {
    if (!fs.existsSync(fixturePath)) return;

    const comp = await comparator.compareDocx(fixturePath);
    expect(comp.hasBothDocx).toBe(false);
    expect(comp.structuralNotices).toHaveLength(1);
    expect(comp.structuralNotices[0]).toContain('부분 감사 모드');
  });

  it('verifies WordRenderer reports error when file does not exist', async () => {
    const res = await wordRenderer.renderDocxToImages(
      'non-existent-file.docx',
      'debug/quality-audit/dummy'
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain('does not exist');
  });

  it('verifies ReportGenerator creates valid offline HTML without external dependencies', () => {
    const mockResult: QualityAuditResult = {
      id: 'test-audit-unit',
      title: 'Unit Test Audit Report',
      timestamp: new Date().toISOString(),
      executionMode: 'structure_only',
      pageVisualComparisons: [],
      summary: {
        totalEvaluatedPages: 1,
        passedPages: 1,
        warningPages: 0,
        structuralDiscrepancies: 0,
        status: 'PASS',
        statusMessage: '단위 테스트 정상 통과',
      },
    };

    const outPath = path.resolve(process.cwd(), 'debug/quality-audit/unit_report.html');
    reportGenerator.generateHtmlReport(mockResult, outPath);

    expect(fs.existsSync(outPath)).toBe(true);
    const content = fs.readFileSync(outPath, 'utf8');
    expect(content).toContain('Figma2Word 품질 감사 보고서');
    expect(content).toContain('test-audit-unit');
    expect(content).not.toContain('http://');
    expect(content).not.toContain('https://');
  });
});
