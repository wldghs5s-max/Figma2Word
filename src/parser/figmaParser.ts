import {
  FigmaNode,
  FigmaPaint,
  FigmaColor,
  FigmaTypeStyle,
  FigmaFileResponse,
} from "./types.js";
import {
  InternalDocument,
  DocumentSection,
  DocElement,
  ParagraphElement,
  HeadingElement,
  ImageElement,
  LineElement,
  ShapeElement,
  ContainerElement,
  Color,
  TextStyle,
  Alignment,
} from "../model/index.js";

import { LayoutEngine } from "../layout/index.js";

export type FeatureSupportStatus = "Supported" | "Partially Supported" | "Unsupported" | "Fallback";

export interface ConversionNotice {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: FeatureSupportStatus;
  message: string;
}

export interface ParseResult {
  document: InternalDocument;
  notices: ConversionNotice[];
  stats: {
    totalNodes: number;
    supportedNodes: number;
    partiallySupportedNodes: number;
    unsupportedNodes: number;
    fallbackNodes: number;
  };
}

export class FigmaParser {
  private notices: ConversionNotice[] = [];
  private imageMap: Record<string, string> = {}; // imageRef -> url/base64
  private layoutEngine = new LayoutEngine();

  constructor(options?: { imageMap?: Record<string, string>; layoutEngine?: LayoutEngine }) {
    if (options?.imageMap) {
      this.imageMap = options.imageMap;
    }
    if (options?.layoutEngine) {
      this.layoutEngine = options.layoutEngine;
    }
  }

  /**
   * Main parsing entrypoint
   */
  public parse(input: FigmaNode | FigmaFileResponse): ParseResult {
    this.notices = [];

    const rootNode = "document" in input ? input.document : input;
    const docTitle = "name" in input && typeof input.name === "string" ? input.name : "Figma Export Document";

    // Flatten or collect top-level frames/canvases
    const sections: DocumentSection[] = [];

    if (rootNode.type === "DOCUMENT") {
      // Figma root document contains canvases (pages)
      const canvases = (rootNode.children || []).filter((c) => c.visible !== false);
      for (const canvas of canvases) {
        const elements = this.parseChildren(canvas.children || []);
        sections.push({
          id: canvas.id,
          title: canvas.name,
          elements,
        });
      }
    } else {
      // Single Frame or Root Node
      const elements = this.parseNodeToElements(rootNode);
      sections.push({
        id: rootNode.id,
        title: rootNode.name,
        elements,
      });
    }

    // Ensure at least one section
    if (sections.length === 0) {
      sections.push({
        id: "default-sec",
        title: "Default Section",
        elements: [],
      });
    }

    // Calculate statistics
    const stats = {
      totalNodes: this.notices.length,
      supportedNodes: this.notices.filter((n) => n.status === "Supported").length,
      partiallySupportedNodes: this.notices.filter((n) => n.status === "Partially Supported").length,
      unsupportedNodes: this.notices.filter((n) => n.status === "Unsupported").length,
      fallbackNodes: this.notices.filter((n) => n.status === "Fallback").length,
    };

    const document: InternalDocument = {
      version: "1.0.0",
      metadata: {
        title: docTitle,
        sourceFigmaFile: rootNode.id,
        convertedAt: new Date().toISOString(),
        conversionMode: "balanced",
      },
      pageConfig: {
        size: "A4",
        widthMm: 210,
        heightMm: 297,
        orientation: "portrait",
        marginsMm: {
          top: 25.4,
          right: 25.4,
          bottom: 25.4,
          left: 25.4,
        },
      },
      sections,
    };

    return {
      document,
      notices: this.notices,
      stats,
    };
  }

  private parseChildren(nodes: FigmaNode[]): DocElement[] {
    const visibleNodes = nodes.filter((n) => n.visible !== false);

    // Layout Engine processes spatial relations (P1-1 row clusters, P1-2 overlay containment, P1-3 sizing)
    const structuredNodes = this.layoutEngine.processNodes(visibleNodes);

    // Sort by vertical position (Y) to preserve natural document flow
    structuredNodes.sort((a, b) => {
      const aY = a.absoluteBoundingBox?.y ?? 0;
      const bY = b.absoluteBoundingBox?.y ?? 0;
      return aY - bY;
    });

    const result: DocElement[] = [];
    for (const node of structuredNodes) {
      const elements = this.parseNodeToElements(node);
      result.push(...elements);
    }
    return result;
  }

  private parseNodeToElements(node: FigmaNode): DocElement[] {
    if (node.visible === false) return [];

    switch (node.type) {
      case "TEXT":
        return [this.parseText(node)];

      case "FRAME":
      case "GROUP":
      case "SECTION":
      case "COMPONENT":
      case "INSTANCE":
        return [this.parseContainer(node)];

      case "RECTANGLE":
        return [this.parseRectangle(node)];

      case "LINE":
        return [this.parseLine(node)];

      case "VECTOR":
      case "ELLIPSE":
      case "STAR":
      case "POLYGON":
        return [this.parseVectorFallback(node)];

      default:
        this.addNotice(node, "Unsupported", `Node type ${node.type} is not natively supported.`);
        return [];
    }
  }

  private parseText(node: FigmaNode): HeadingElement | ParagraphElement {
    const text = node.characters || "";
    const style = node.style || {};

    const color = this.extractFillColor(node.fills || style.fills);
    const fontSize = style.fontSize ? Math.round(style.fontSize * 0.75) : 11; // px to pt approx

    const textStyle: TextStyle = {
      fontFamily: style.fontFamily || "Calibri",
      fontSize,
      fontWeight: this.mapFontWeight(style.fontWeight),
      italic: style.italic || false,
      underline: style.textDecoration === "UNDERLINE",
      strike: style.textDecoration === "STRIKETHROUGH",
      color: color || { r: 0, g: 0, b: 0, a: 1, hex: "000000" },
    };

    const alignment: Alignment = this.mapAlignment(style.textAlignHorizontal);

    // Classification: If font size >= 16pt or node name contains 'Heading' / 'Title'
    const isHeading =
      fontSize >= 16 ||
      node.name.toLowerCase().includes("heading") ||
      node.name.toLowerCase().includes("title");

    if (isHeading) {
      let level: 1 | 2 | 3 | 4 | 5 | 6 = 1;
      if (fontSize < 16) level = 3;
      else if (fontSize < 20) level = 2;
      else level = 1;

      this.addNotice(node, "Supported", `Text mapped to Heading (Level ${level})`);
      return {
        id: node.id,
        type: "heading",
        level,
        alignment,
        runs: [{ type: "run", text, style: textStyle }],
      };
    }

    this.addNotice(node, "Supported", "Text mapped to Paragraph");
    return {
      id: node.id,
      type: "paragraph",
      alignment,
      runs: [{ type: "run", text, style: textStyle }],
    };
  }

  private parseRectangle(node: FigmaNode): ImageElement | ShapeElement {
    // Check if fill is an image
    const imagePaint = (node.fills || []).find((f) => f.type === "IMAGE" && f.visible !== false);
    if (imagePaint) {
      const imgRef = imagePaint.imageRef || node.imageRef || "";
      const imgSrc = this.imageMap[imgRef] || imgRef || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      this.addNotice(node, "Supported", "Rectangle with IMAGE fill mapped to Word Image");
      return {
        id: node.id,
        type: "image",
        source: imgSrc,
        width: node.absoluteBoundingBox?.width || 200,
        height: node.absoluteBoundingBox?.height || 100,
        altText: node.name,
        alignment: "left",
      };
    }

    // Otherwise solid shape
    const fill = this.extractFillColor(node.fills);
    const stroke = this.extractStroke(node);

    this.addNotice(node, "Partially Supported", "Rectangle mapped to Shape (Card Container)");
    return {
      id: node.id,
      type: "shape",
      shapeType: node.cornerRadius ? "rounded_rectangle" : "rectangle",
      width: node.absoluteBoundingBox?.width,
      height: node.absoluteBoundingBox?.height,
      fill,
      stroke,
      cornerRadius: node.cornerRadius,
    };
  }

  private parseLine(node: FigmaNode): LineElement {
    const stroke = this.extractStroke(node);
    this.addNotice(node, "Supported", "Line mapped to Line Divider");
    return {
      id: node.id,
      type: "line",
      thickness: node.strokeWeight || 1,
      color: stroke?.color,
      length: "100%",
    };
  }

  private parseContainer(node: FigmaNode): ContainerElement {
    const children = this.parseChildren(node.children || []);
    const fill = this.extractFillColor(node.fills);
    const stroke = this.extractStroke(node);

    const layoutDirection =
      node.layoutMode === "HORIZONTAL"
        ? "horizontal"
        : node.layoutMode === "VERTICAL"
        ? "vertical"
        : "none";

    const status: FeatureSupportStatus =
      node.layoutMode && node.layoutMode !== "NONE" ? "Supported" : "Partially Supported";

    this.addNotice(
      node,
      status,
      `Container with ${layoutDirection} layout and ${children.length} children`
    );

    return {
      id: node.id,
      type: "container",
      layoutDirection: layoutDirection === "none" ? "vertical" : layoutDirection,
      gap: node.itemSpacing || 0,
      padding: {
        top: node.paddingTop || 0,
        right: node.paddingRight || 0,
        bottom: node.paddingBottom || 0,
        left: node.paddingLeft || 0,
      },
      background: fill,
      border: stroke,
      cornerRadius: node.cornerRadius,
      columnWidths: (node as any)._computedColumnWidths,
      children,
    };
  }

  private parseVectorFallback(node: FigmaNode): ShapeElement {
    this.addNotice(
      node,
      "Fallback",
      `Vector graphics (${node.type}) approximated as generic Shape.`
    );

    const fill = this.extractFillColor(node.fills);
    const stroke = this.extractStroke(node);

    return {
      id: node.id,
      type: "shape",
      shapeType: "rectangle",
      fill: fill || { r: 220, g: 220, b: 220, a: 1, hex: "DCDCDC" },
      stroke,
      width: node.absoluteBoundingBox?.width,
      height: node.absoluteBoundingBox?.height,
    };
  }

  private extractFillColor(fills?: FigmaPaint[]): Color | undefined {
    if (!fills || fills.length === 0) return undefined;
    const solid = fills.find((f) => f.type === "SOLID" && f.visible !== false);
    if (!solid || !solid.color) return undefined;

    return this.figmaColorToColor(solid.color, solid.opacity);
  }

  private extractStroke(node: FigmaNode) {
    if (!node.strokes || node.strokes.length === 0) return undefined;
    const strokePaint = node.strokes.find((s) => s.type === "SOLID" && s.visible !== false);
    if (!strokePaint || !strokePaint.color) return undefined;

    return {
      color: this.figmaColorToColor(strokePaint.color, strokePaint.opacity),
      width: node.strokeWeight || 1,
      style: "solid" as const,
    };
  }

  private figmaColorToColor(fc: FigmaColor, opacity?: number): Color {
    const r = Math.round(fc.r * 255);
    const g = Math.round(fc.g * 255);
    const b = Math.round(fc.b * 255);
    const a = opacity !== undefined ? opacity : fc.a !== undefined ? fc.a : 1;

    const hexR = r.toString(16).padStart(2, "0");
    const hexG = g.toString(16).padStart(2, "0");
    const hexB = b.toString(16).padStart(2, "0");

    return {
      r,
      g,
      b,
      a,
      hex: `${hexR}${hexG}${hexB}`.toUpperCase(),
    };
  }

  private mapAlignment(align?: string): Alignment {
    switch (align) {
      case "CENTER":
        return "center";
      case "RIGHT":
        return "right";
      case "JUSTIFIED":
        return "justify";
      default:
        return "left";
    }
  }

  private mapFontWeight(weight?: number | string): TextStyle["fontWeight"] {
    if (!weight) return "normal";
    if (typeof weight === "number") {
      return weight >= 600 ? "bold" : "normal";
    }
    const lower = weight.toLowerCase();
    if (lower.includes("bold") || lower.includes("black") || lower.includes("heavy")) {
      return "bold";
    }
    return "normal";
  }

  private addNotice(node: FigmaNode, status: FeatureSupportStatus, message: string) {
    this.notices.push({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status,
      message,
    });
  }
}
