/**
 * Figma2Word Quality Audit Infrastructure Types
 * Step 12A: Document conversion quality verification and regression audit
 */

export interface QualityAuditOptions {
  targetWidth?: number; // Target raster width in px (default: 1400)
  toleranceThreshold?: number; // Pixel delta tolerance (0-255, default: 10)
  timeoutSec?: number; // Word COM execution timeout (default: 60)
  generateOverlay?: boolean; // Generate 50% opacity overlay image (default: true)
  generateDiff?: boolean; // Generate highlighted difference image (default: true)
}

export interface QualityAuditInput {
  id: string;
  title: string;
  description?: string;
  figmaImages?: string[]; // Array of Figma screenshot PNG paths (per page)
  generatedDocx?: string; // Path to Figma2Word-generated DOCX
  referenceDocx?: string; // Path to human reference DOCX (optional)
  options?: QualityAuditOptions;
}

export interface DocxRenderStats {
  pages: number;
  tables: number;
  inlineShapes: number;
  floatingShapes: number;
}

export interface DocxRenderResult {
  success: boolean;
  docPath: string;
  pageCount: number;
  pngPaths: string[];
  pdfPath?: string;
  stats?: DocxRenderStats;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface PageVisualComparison {
  pageNumber: number;
  baseImagePath?: string;
  testImagePath?: string;
  diffImagePath?: string;
  overlayImagePath?: string;
  baseDimensions?: { width: number; height: number; aspectRatio: number };
  testDimensions?: { width: number; height: number; aspectRatio: number };
  widthDiff: number;
  heightDiff: number;
  aspectRatioDiff: number;
  totalEvaluatedPixels: number;
  mismatchPixelCount: number;
  mismatchRatio: number; // 0.0 ~ 1.0 (0% to 100%)
  mae: number; // Mean Absolute Error (0 ~ 255)
  rmse: number; // Root Mean Square Error (0 ~ 255)
  visualSummary: string;
}

export interface TableStructuralDetail {
  index: number;
  genRows: number;
  genCols: number;
  refRows?: number;
  refCols?: number;
  isNative: boolean;
  match: boolean;
}

export interface DocxStructuralModel {
  sectionsCount: number;
  pageSize: {
    widthMm: number;
    heightMm: number;
    orientation: 'portrait' | 'landscape';
  };
  paragraphCount: number;
  characterCount: number;
  tableCount: number;
  tables: Array<{
    rows: number;
    cols: number;
  }>;
  embeddedImagesCount: number;
  shapesCount: number;
  hasHeader: boolean;
  hasFooter: boolean;
  textSnippet: string;
}

export interface DocxStructureComparison {
  hasBothDocx: boolean;
  generatedModel: DocxStructuralModel;
  referenceModel?: DocxStructuralModel;
  matches: {
    sections: boolean;
    pageOrientation: boolean;
    pageSize: boolean;
    tableCount: boolean;
    imageCount: boolean;
  };
  tableDetails: TableStructuralDetail[];
  textJaccardSimilarity?: number; // 0.0 ~ 1.0
  structuralNotices: string[];
}

export interface QualityAuditResult {
  id: string;
  title: string;
  timestamp: string;
  executionMode: 'full' | 'figma_vs_generated' | 'reference_vs_generated' | 'structure_only';
  generatedDocxResult?: DocxRenderResult;
  referenceDocxResult?: DocxRenderResult;
  pageVisualComparisons: PageVisualComparison[];
  structureComparison?: DocxStructureComparison;
  overallScore?: {
    visualFidelityRatio?: number;
    structuralIntegrityRatio?: number;
  };
  summary: {
    totalEvaluatedPages: number;
    passedPages: number;
    warningPages: number;
    structuralDiscrepancies: number;
    status: 'PASS' | 'WARNING' | 'FAIL' | 'SKIPPED';
    statusMessage: string;
  };
  reproductionCommand?: string;
  reportHtmlPath?: string;
  reportJsonPath?: string;
}
