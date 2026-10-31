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
  const isDocScale = frameWidthPx <= 1250 && frameHeightPx <= 1250;
  const isA4Portrait = isDocScale && ratio >= 0.68 && ratio <= 0.73;
  const isA4Landscape = isDocScale && ratio >= 1.37 && ratio <= 1.47;

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

  // Fallback to standard 96 DPI CSS conversion (scale = 72 / 96 = 0.75)
  const baseScale = 0.75;
  const initialWidthPt = frameWidthPx * baseScale;
  const initialHeightPt = frameHeightPx * baseScale;

  // Microsoft Word physical hardware limit defense: max 22 inches (1,584 pt).
  // If either dimension exceeds 1,584 pt, apply uniform scale-down preserving exact aspect ratio
  // so that all internal objects, fonts, and bounding coordinates remain fully inside the printable page!
  const maxDimPt = Math.max(initialWidthPt, initialHeightPt);
  const uniformScaleFactor = maxDimPt > 1584 ? 1584 / maxDimPt : 1.0;

  const finalScale = baseScale * uniformScaleFactor;
  return {
    scaleX: finalScale,
    scaleY: finalScale,
    targetWidthPt: Number((initialWidthPt * uniformScaleFactor).toFixed(2)),
    targetHeightPt: Number((initialHeightPt * uniformScaleFactor).toFixed(2)),
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

export interface CanvasBorderSides {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface CanvasShadow {
  color?: string; // hex '#RRGGBB'
  opacity?: number; // 0.0 ~ 1.0
  offsetX?: number; // pt
  offsetY?: number; // pt
  blur?: number; // pt
  spread?: number; // pt
}

export interface CanvasStyle {
  fillColor?: string; // hex '#RRGGBB'
  fillOpacity?: number; // 0.0 ~ 1.0
  strokeColor?: string; // hex '#RRGGBB'
  strokeWidth?: number; // pt
  strokeDashed?: boolean;
  strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER";
  cornerRadius?: number; // pt
  cornerRadii?: [number, number, number, number]; // [tl, tr, br, bl] in pt
  borderSides?: CanvasBorderSides;
  shadow?: CanvasShadow;
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

export interface CanvasImageCrop {
  top: number; // 0.0 ~ 1.0 normalized crop fraction
  bottom: number;
  left: number;
  right: number;
}

export type GeometryProvenance =
  | "SOURCE_GEOMETRY"
  | "LOCALLY_RECOVERED_GEOMETRY"
  | "SEMANTIC_APPROXIMATION"
  | "GEOMETRIC_FALLBACK"
  | "UNRESOLVED";

export interface CanvasElement {
  id: string;
  name?: string;
  frameId?: string;
  type: CanvasElementType;
  bounds: CanvasBounds;
  zIndex: number;
  rotation?: number; // degrees
  opacity?: number; // 0.0 ~ 1.0
  style: CanvasStyle;
  
  // Text details
  textRuns?: CanvasTextRun[];
  paragraphAlign?: "left" | "center" | "right" | "justify";
  verticalAlign?: "top" | "center" | "bottom";
  innerPaddingPt?: CanvasPadding;
  textAutoResize?: "NONE" | "HEIGHT" | "WIDTH_AND_HEIGHT" | "TRUNCATE";
  contentHeightPt?: number;

  // Image details
  imageRef?: string; // key into CanvasDocument.resources
  imageScaleMode?: "FILL" | "FIT" | "CROP" | "TILE" | "STRETCH";
  imageCrop?: CanvasImageCrop;

  // Vector Path details
  vectorPath?: string; // Normalized VML path string (coordsize="1000,1000")
  rawSvgPath?: string; // Original SVG path string
  vectorPoints?: { x: number; y: number }[]; // Sampled polygon points for HWPX (<hp:polygon>)
  vectorSubpaths?: CanvasVectorSubpath[]; // Discrete subpaths for HWPX to avoid spurious connecting lines
  geometryProvenance?: GeometryProvenance;

  // Structured Table details
  tableData?: CanvasTableData;

  // Diagnostics and lineage
  sourceNodeId?: string;
  sourceNodeType?: string;
  unsupportedProperties?: string[];
}

export interface CanvasVectorSubpath {
  points: { x: number; y: number }[];
  closed: boolean;
}

export interface CanvasPage {
  pageNumber: number; // 1-indexed
  name?: string;
  frameId?: string;
  bounds: CanvasBounds; // e.g. { x: 0, y: 0, width: 595.28, height: 841.89 }
  backgroundColor?: string;
  elements: CanvasElement[]; // sorted by zIndex ascending
  diagnostics?: string[];
}

export interface CanvasResource {
  id: string;
  name: string;
  mimeType: string; // 'image/png', 'image/jpeg'
  data: Buffer | Uint8Array;
}

export interface CanvasDocument {
  title: string;
  pageSize: {
    name: "A4" | "Letter" | "Custom";
    widthPt: number;
    heightPt: number;
    orientation?: "portrait" | "landscape";
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
