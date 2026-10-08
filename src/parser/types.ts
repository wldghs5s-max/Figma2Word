/**
 * Figma API & JSON export raw node definitions
 */

export interface FigmaColor {
  r: number; // 0 to 1 in Figma API
  g: number;
  b: number;
  a?: number;
}

export interface FigmaPaint {
  type: "SOLID" | "IMAGE" | "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  imageRef?: string;
  gradientStops?: { color: FigmaColor; position?: number }[];
}

export interface FigmaBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontPostScriptName?: string;
  fontSize?: number;
  fontWeight?: number | string;
  textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  textAlignVertical?: "TOP" | "CENTER" | "BOTTOM";
  letterSpacing?: number;
  lineHeightPx?: number;
  italic?: boolean;
  textDecoration?: "NONE" | "UNDERLINE" | "STRIKETHROUGH";
  fills?: FigmaPaint[];
}

export type FigmaNodeType =
  | "DOCUMENT"
  | "CANVAS"
  | "FRAME"
  | "GROUP"
  | "SECTION"
  | "TEXT"
  | "RECTANGLE"
  | "LINE"
  | "ELLIPSE"
  | "VECTOR"
  | "INSTANCE"
  | "COMPONENT"
  | string;

export interface FigmaNode {
  id: string;
  name: string;
  type: FigmaNodeType;
  visible?: boolean;
  children?: FigmaNode[];
  absoluteBoundingBox?: FigmaBoundingBox;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  opacity?: number;

  // Auto Layout attributes
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "BASELINE";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;

  // Text attributes
  characters?: string;
  style?: FigmaTypeStyle;
  characterStyleOverrides?: number[];
  styleOverrideTable?: Record<string | number, FigmaTypeStyle>;

  // Image metadata map (when images are embedded or referenced)
  imageRef?: string;
}

export interface FigmaFileResponse {
  name: string;
  lastModified?: string;
  version?: string;
  document: FigmaNode;
}

