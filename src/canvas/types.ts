/**
 * Canvas IR (Intermediate Representation) v1
 * 
 * Represents a document as a set of pages, each containing elements with
 * exact 2D coordinates (x, y, width, height, z-index), styling, typography,
 * and media resources.
 */

// ============================================================================
// 1. Coordinate & Unit Conversions
// ============================================================================

/**
 * Standard unit conversions:
 * Internal unit is PostScript point (pt, 1/72 inch).
 * 
 * - 1 pt = 20 twips (dxa)
 * - 1 pt = 12,700 EMUs (English Metric Units)
 * - 1 pt = 100 HWPUs (Hancom Word Processor Units)
 * - 1 pt = 25.4 / 72 mm ≈ 0.352778 mm
 * - 1 mm = 72 / 25.4 pt ≈ 2.834646 pt
 * - 1 CSS px (96 DPI) = 72 / 96 pt = 0.75 pt
 */

export function ptToTwip(pt: number): number {
  return Math.round(pt * 20);
}

export function twipToPt(twip: number): number {
  return twip / 20;
}

export function ptToEmu(pt: number): number {
  return Math.round(pt * 12700);
}

export function emuToPt(emu: number): number {
  return emu / 12700;
}

export function ptToHwpu(pt: number): number {
  return Math.round(pt * 100);
}

export function hwpuToPt(hwpu: number): number {
  return hwpu / 100;
}

export function ptToMm(pt: number): number {
  return (pt * 25.4) / 72;
}

export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

export function figmaPxToPt(px: number, dpi: number = 96): number {
  return (px * 72) / dpi;
}

// ============================================================================
// 2. Scale Policy
// ============================================================================

export type ScalePolicy = "css-96dpi" | "fit-a4" | "1:1";

export interface ResolvedScale {
  scaleX: number;
  scaleY: number;
  targetWidthPt: number;
  targetHeightPt: number;
  policy: ScalePolicy;
}

/**
 * Resolves scaling from Figma frame dimensions to output canvas dimensions.
 * Standard A4 portrait in pt: 595.28 x 841.89 pt (210 x 297 mm).
 */
export function resolveScale(
  frameWidthPx: number,
  frameHeightPx: number,
  policy: ScalePolicy = "fit-a4"
): ResolvedScale {
  const A4_WIDTH_PT = 595.28;
  const A4_HEIGHT_PT = 841.89;

  if (policy === "1:1") {
    return {
      scaleX: 1.0,
      scaleY: 1.0,
      targetWidthPt: frameWidthPx,
      targetHeightPt: frameHeightPx,
      policy,
    };
  }

  if (policy === "css-96dpi") {
    const scale = 0.75; // 72 / 96
    return {
      scaleX: scale,
      scaleY: scale,
      targetWidthPt: frameWidthPx * scale,
      targetHeightPt: frameHeightPx * scale,
      policy,
    };
  }

  // policy === 'fit-a4'
  // If frame aspect ratio is close to A4 (0.68 ~ 0.73), scale to fit exact A4 width/height
  const ratio = frameWidthPx / frameHeightPx;
  const isA4Portrait = ratio >= 0.65 && ratio <= 0.75;
  const isA4Landscape = ratio >= 1.35 && ratio <= 1.50;

  if (isA4Portrait) {
    const scaleX = A4_WIDTH_PT / frameWidthPx;
    const scaleY = A4_HEIGHT_PT / frameHeightPx;
    return {
      scaleX,
      scaleY,
      targetWidthPt: A4_WIDTH_PT,
      targetHeightPt: A4_HEIGHT_PT,
      policy,
    };
  }

  if (isA4Landscape) {
    const scaleX = A4_HEIGHT_PT / frameWidthPx;
    const scaleY = A4_WIDTH_PT / frameHeightPx;
    return {
      scaleX,
      scaleY,
      targetWidthPt: A4_HEIGHT_PT,
      targetHeightPt: A4_WIDTH_PT,
      policy,
    };
  }

  // Fallback to standard 96 DPI CSS conversion
  const scale = 0.75;
  return {
    scaleX: scale,
    scaleY: scale,
    targetWidthPt: frameWidthPx * scale,
    targetHeightPt: frameHeightPx * scale,
    policy,
  };
}

// ============================================================================
// 3. Canvas IR Data Model
// ============================================================================

export interface CanvasBounds {
  x: number; // pt, relative to page top-left origin (0, 0)
  y: number; // pt, relative to page top-left origin (0, 0)
  width: number; // pt
  height: number; // pt
}

export interface CanvasStyle {
  fillColor?: string; // hex '#RRGGBB'
  fillOpacity?: number; // 0.0 ~ 1.0
  strokeColor?: string; // hex '#RRGGBB'
  strokeWidth?: number; // pt
  strokeDashed?: boolean;
  cornerRadius?: number; // pt
}

export interface CanvasTextRun {
  text: string;
  fontFamily?: string; // 'Inter', 'Pretendard', '맑은 고딕'
  fontSizePt?: number; // pt
  fontWeight?: number; // 400, 500, 600, 700
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string; // hex '#RRGGBB'
  lineHeightPt?: number;
  letterSpacingPt?: number;
}

export interface CanvasTableCell {
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
  widthPt: number;
  heightPt: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  textRuns: CanvasTextRun[];
  align?: "left" | "center" | "right";
}

export interface CanvasTableData {
  rowCount: number;
  colCount: number;
  colWidthsPt: number[];
  rowHeightsPt?: number[];
  cells: CanvasTableCell[][];
}

export type CanvasElementType = "card" | "text" | "image" | "line" | "table" | "group" | "oval" | "vector";

export interface CanvasPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface CanvasElement {
  id: string;
  name?: string;
  type: CanvasElementType;
  bounds: CanvasBounds;
  zIndex: number;
  rotation?: number; // degrees
  opacity?: number; // 0.0 ~ 1.0
  style: CanvasStyle;
  
  // Text details
  textRuns?: CanvasTextRun[];
  paragraphAlign?: "left" | "center" | "right" | "justify";
  innerPaddingPt?: CanvasPadding;

  // Image details
  imageRef?: string; // key into CanvasDocument.resources

  // Vector Path details
  vectorPath?: string; // Normalized VML or SVG path string

  // Structured Table details
  tableData?: CanvasTableData;

  // Diagnostics and lineage
  sourceNodeId?: string;
  sourceNodeType?: string;
  unsupportedProperties?: string[];
}

export interface CanvasPage {
  pageNumber: number; // 1-indexed
  name?: string;
  bounds: CanvasBounds; // e.g. { x: 0, y: 0, width: 595.28, height: 841.89 }
  backgroundColor?: string;
  elements: CanvasElement[]; // sorted by zIndex ascending
  diagnostics?: string[];
}

export interface CanvasResource {
  id: string;
  name: string;
  mimeType: string; // 'image/png', 'image/jpeg'
  data: Buffer;
}

export interface CanvasDocument {
  title: string;
  pageSize: {
    name: "A4" | "Letter" | "Custom";
    widthPt: number;
    heightPt: number;
    unit: "pt";
  };
  marginsPt: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  pages: CanvasPage[];
  resources: Record<string, CanvasResource>;
  metadata?: Record<string, unknown>;
  diagnostics: {
    notices: string[];
    warnings: string[];
  };
}
