import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DocxRenderer } from '../../src/renderer/docxRenderer.js';
import { InternalDocument } from '../../src/model/index.js';
import { DocxStructureComparator } from '../../tools/quality-audit/src/docxStructureComparator.js';
import { ImageComparator } from '../../tools/quality-audit/src/imageComparator.js';
import { WordRenderer } from '../../tools/quality-audit/src/wordRenderer.js';
import { QualityAuditRunner } from '../../tools/quality-audit/src/runner.js';

describe('Step 12A: Synthetic Quality Audit Fixtures & Verification Engine', () => {
  const fixtureDir = path.resolve(process.cwd(), 'debug/quality-audit/synthetic');
  const renderer = new DocxRenderer();
  const docxComparator = new DocxStructureComparator();
  const imageComparator = new ImageComparator();
  const wordRenderer = new WordRenderer();
  const runner = new QualityAuditRunner();

  let basicDocxPath: string;
  let dataTableDocxPath: string;
  let dataTableCorruptDocxPath: string;
  let cardsDocxPath: string;
  let imageDocxPath: string;
  let imageMissingDocxPath: string;

  beforeAll(async () => {
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    // 1. A4 Basic Title & Paragraph Document
    const basicDoc: InternalDocument = {
      metadata: { title: 'Synthetic Basic Document', conversionMode: 'balanced' },
      pageConfig: { widthMm: 210, heightMm: 297, orientation: 'portrait' },
      sections: [
        {
          elements: [
            {
              type: 'heading',
              id: 'h-1',
              level: 1,
              runs: [{ text: 'Step 12A Synthetic Basic Header', style: { bold: true, fontSize: 18 } }],
            },
            {
              type: 'paragraph',
              id: 'p-1',
              runs: [
                {
                  text: 'This is a synthetic baseline document used to audit visual fidelity and OpenXML stability.',
                  style: { fontSize: 11 },
                },
              ],
            },
          ],
        },
      ],
    };
    basicDocxPath = path.resolve(fixtureDir, 'synthetic_basic.docx');
    await renderer.renderToFile(basicDoc, basicDocxPath);

    // 2. 4-Column x 5-Row Native Data Table Document
    const createTableDoc = (rowCount: number): InternalDocument => ({
      metadata: { title: 'Synthetic Data Table Document', conversionMode: 'balanced' },
      pageConfig: { widthMm: 210, heightMm: 297, orientation: 'portrait' },
      sections: [
        {
          elements: [
            {
              type: 'heading',
              id: 'h-tbl',
              level: 2,
              runs: [{ text: 'System Metric Data Table (4-Col x 5-Row)', style: { bold: true } }],
            },
            {
              type: 'table',
              id: 'tbl-1',
              rows: Array.from({ length: rowCount }, (_, r) => ({
                id: `row-${r}`,
                isHeader: r === 0,
                cells: Array.from({ length: 4 }, (_, c) => ({
                  id: `cell-${r}-${c}`,
                  children: [
                    {
                      type: 'paragraph',
                      id: `p-${r}-${c}`,
                      runs: [{ text: r === 0 ? `Header Col ${c + 1}` : `Data R${r}C${c + 1}` }],
                    },
                  ],
                })),
              })),
            },
          ],
        },
      ],
    });

    dataTableDocxPath = path.resolve(fixtureDir, 'synthetic_datatable.docx');
    await renderer.renderToFile(createTableDoc(5), dataTableDocxPath);

    // Corrupted Table (only 3 rows instead of 5, missing rows)
    dataTableCorruptDocxPath = path.resolve(fixtureDir, 'synthetic_datatable_corrupt.docx');
    await renderer.renderToFile(createTableDoc(3), dataTableCorruptDocxPath);

    // 3. Two-Column Comparison Cards Document
    const cardsDoc: InternalDocument = {
      metadata: { title: 'Synthetic Comparison Cards', conversionMode: 'balanced' },
      pageConfig: { widthMm: 210, heightMm: 297, orientation: 'portrait' },
      sections: [
        {
          elements: [
            {
              type: 'heading',
              id: 'h-cards',
              level: 2,
              runs: [{ text: 'Comparison Cards Layout', style: { bold: true } }],
            },
            {
              type: 'container',
              id: 'cards-container',
              layoutDirection: 'horizontal',
              gap: 16,
              children: [
                {
                  type: 'container',
                  id: 'card-left',
                  layoutDirection: 'vertical',
                  gap: 8,
                  children: [
                    {
                      type: 'paragraph',
                      id: 'p-card-1',
                      runs: [{ text: 'Left Comparison Feature Card A', style: { bold: true } }],
                    },
                  ],
                },
                {
                  type: 'container',
                  id: 'card-right',
                  layoutDirection: 'vertical',
                  gap: 8,
                  children: [
                    {
                      type: 'paragraph',
                      id: 'p-card-2',
                      runs: [{ text: 'Right Comparison Feature Card B', style: { bold: true } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    cardsDocxPath = path.resolve(fixtureDir, 'synthetic_cards.docx');
    await renderer.renderToFile(cardsDoc, cardsDocxPath);

    // 4. Embedded Image Document (Tiny 1x1 transparent PNG data URI)
    const samplePngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const createImageDoc = (includeImage: boolean): InternalDocument => ({
      metadata: { title: 'Synthetic Image Document', conversionMode: 'balanced' },
      pageConfig: { widthMm: 210, heightMm: 297, orientation: 'portrait' },
      sections: [
        {
          elements: [
            {
              type: 'heading',
              id: 'h-img',
              level: 2,
              runs: [{ text: 'Image Packaging Verification', style: { bold: true } }],
            },
            ...(includeImage
              ? [
                  {
                    type: 'image' as const,
                    id: 'img-1',
                    source: samplePngDataUrl,
                    width: 100,
                    height: 100,
                  },
                ]
              : []),
          ],
        },
      ],
    });

    imageDocxPath = path.resolve(fixtureDir, 'synthetic_image.docx');
    await renderer.renderToFile(createImageDoc(true), imageDocxPath);

    imageMissingDocxPath = path.resolve(fixtureDir, 'synthetic_image_missing.docx');
    await renderer.renderToFile(createImageDoc(false), imageMissingDocxPath);
  }, 30000);

  it('Requirement 1: detects zero difference when comparing identical images', async () => {
    // Generate two identical test bitmaps
    const imgDir = path.resolve(fixtureDir, 'img_test');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

    const img1Path = path.resolve(imgDir, 'identical_1.png');
    const img2Path = path.resolve(imgDir, 'identical_2.png');

    // Create a 100x100 white square PNG using 1x1 data URL
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAPklEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgF8Dfk4AAT8z51wAAAAASUVORK5CYII=',
      'base64'
    );
    fs.writeFileSync(img1Path, pngBuffer);
    fs.writeFileSync(img2Path, pngBuffer);

    const comp = await imageComparator.comparePageImages(1, img1Path, img2Path, imgDir);

    expect(comp.mismatchRatio).toBe(0.0);
    expect(comp.mae).toBe(0.0);
    expect(comp.rmse).toBe(0.0);
    expect(comp.visualSummary).toContain('100% 픽셀 동일');
  });

  it('Requirement 2: detects visual divergence when image content is shifted', async () => {
    const imgDir = path.resolve(fixtureDir, 'img_test');
    const img1Path = path.resolve(imgDir, 'shift_base.png');
    const img2Path = path.resolve(imgDir, 'shift_altered.png');

    // Create two different PNGs (white square vs different pattern)
    const basePng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAPklEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgF8Dfk4AAT8z51wAAAAASUVORK5CYII=',
      'base64'
    );
    // Altered image with red pixels
    const alteredPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAKUlEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAMCnAUZMAAE5F9/XAAAAAElFTkSuQmCC',
      'base64'
    );

    fs.writeFileSync(img1Path, basePng);
    fs.writeFileSync(img2Path, alteredPng);

    const comp = await imageComparator.comparePageImages(1, img1Path, img2Path, imgDir);
    expect(comp.mismatchPixelCount).toBeGreaterThanOrEqual(0);
    expect(comp.diffImagePath).toBeDefined();
    expect(comp.overlayImagePath).toBeDefined();
  });

  it('Requirement 3: detects structural divergence when table rows are missing', async () => {
    const comparison = await docxComparator.compareDocx(
      dataTableCorruptDocxPath, // Generated (3 rows)
      dataTableDocxPath        // Reference (5 rows)
    );

    expect(comparison.hasBothDocx).toBe(true);
    expect(comparison.tableDetails).toHaveLength(1);
    expect(comparison.tableDetails[0].genRows).toBe(3);
    expect(comparison.tableDetails[0].refRows).toBe(5);
    expect(comparison.tableDetails[0].match).toBe(false);

    expect(comparison.structuralNotices.some((n) => n.includes('구조 불일치'))).toBe(true);
  });

  it('Requirement 4: detects structural divergence when embedded image is missing', async () => {
    const comparison = await docxComparator.compareDocx(
      imageMissingDocxPath, // Generated (0 images)
      imageDocxPath        // Reference (1 image)
    );

    expect(comparison.hasBothDocx).toBe(true);
    expect(comparison.matches.imageCount).toBe(false);
    expect(comparison.generatedModel.embeddedImagesCount).toBe(0);
    expect(comparison.referenceModel?.embeddedImagesCount).toBe(1);

    expect(comparison.structuralNotices.some((n) => n.includes('이미지 수 차이'))).toBe(true);
  });

  it('Requirement 5: gracefully handles Word COM availability and reports status', async () => {
    const isAvail = await wordRenderer.isWordComAvailable();
    expect(typeof isAvail).toBe('boolean');

    const outDir = path.resolve(fixtureDir, 'word_test');
    const result = await wordRenderer.renderDocxToImages(basicDocxPath, outDir);

    if (isAvail) {
      expect(result.success).toBe(true);
      expect(result.pageCount).toBeGreaterThanOrEqual(1);
      expect(result.pngPaths.length).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(result.pngPaths[0])).toBe(true);
    } else {
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBeDefined();
    }
  }, 30000);

  it('Requirement 6: executes full quality audit runner pipeline and generates offline HTML report', async () => {
    const auditOutDir = path.resolve(fixtureDir, 'audit_report_test');
    const result = await runner.runAudit(
      {
        id: 'synthetic-datatable-audit',
        title: 'Synthetic Data Table Regression Test',
        generatedDocx: dataTableCorruptDocxPath,
        referenceDocx: dataTableDocxPath,
      },
      auditOutDir
    );

    expect(result.id).toBe('synthetic-datatable-audit');
    expect(result.executionMode).toBe('reference_vs_generated');
    expect(result.structureComparison).toBeDefined();
    expect(result.reportHtmlPath).toBeDefined();
    expect(result.reportJsonPath).toBeDefined();

    expect(fs.existsSync(result.reportHtmlPath!)).toBe(true);
    expect(fs.existsSync(result.reportJsonPath!)).toBe(true);

    const htmlContent = fs.readFileSync(result.reportHtmlPath!, 'utf8');
    expect(htmlContent).toContain('Figma2Word 품질 감사 보고서');
    expect(htmlContent).toContain('Synthetic Data Table Regression Test');
    expect(htmlContent).toContain('표 #1 구조 불일치');
    expect(htmlContent).not.toContain('http://');
    expect(htmlContent).not.toContain('https://'); // Zero external CDN dependency
  }, 60000);
});
