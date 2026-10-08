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
    totalElements: number;
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
        const elements = this.parseCanvasChildren(canvas.children || []);
        sections.push({
          id: canvas.id,
          title: canvas.name,
          elements,
        });
      }
    } else if (rootNode.type === "CANVAS") {
      // Single Canvas (e.g. from targeted URL node-id=0-1)
      const elements = this.parseCanvasChildren(rootNode.children || []);
      sections.push({
        id: rootNode.id,
        title: rootNode.name,
        elements,
      });
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

    const totalElements = sections.reduce((sum, sec) => sum + sec.elements.length, 0);

    // Calculate statistics
    const stats = {
      totalNodes: this.notices.length,
      totalElements,
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

  /**
   * Parse children of a CANVAS node with Screen Grouping & Layout Isolation.
   * If the canvas contains multiple independent top-level screen frames,
   * they are isolated (processed separately by LayoutEngine) and separated by PageBreak.
   * Otherwise (single screen, or document flow with text/cards), normal flow is preserved.
   */
  private parseCanvasChildren(nodes: FigmaNode[]): DocElement[] {
    const visibleNodes = nodes.filter((n) => n.visible !== false);
    if (visibleNodes.length === 0) return [];

    // Screen Frame Candidate: FRAME or SECTION with screen-like dimensions and children
    const isScreenCandidate = (node: FigmaNode): boolean => {
      if (node.type !== "FRAME" && node.type !== "SECTION") return false;
      const box = node.absoluteBoundingBox;
      if (!box) return false;
      return box.width >= 240 && box.height >= 240 && !!node.children && node.children.length > 0;
    };

    // Canvas-level inline content check: Direct TEXT or LINE indicates a single document page flow
    const hasCanvasLevelInlineContent = visibleNodes.some(
      (n) => n.type === "TEXT" || n.type === "LINE"
    );

    const screenCandidates = visibleNodes.filter(isScreenCandidate);
    // A canvas-level caption must not disable isolation when the frames are
    // side-by-side artboards. Stacked document cards still stay in one flow.
    const isMultiScreen =
      screenCandidates.length >= 2 &&
      (!hasCanvasLevelInlineContent || this.areSideBySideArtboards(screenCandidates));

    if (!isMultiScreen) {
      // Single screen or normal document flow (preserves existing fixtures and single-frame behaviors)
      return this.parseChildren(nodes);
    }

    // --- Multi-Screen Isolation Path ---
    // Sort screen-level nodes spatially: Primarily top-to-bottom (Y), then left-to-right (X)
    const sortedNodes = [...visibleNodes].sort((a, b) => {
      const aBox = a.absoluteBoundingBox;
      const bBox = b.absoluteBoundingBox;
      if (!aBox || !bBox) return 0;
      if (Math.abs(aBox.y - bBox.y) > 100) {
        return aBox.y - bBox.y;
      }
      return aBox.x - bBox.x;
    });

    const result: DocElement[] = [];
    const screenSet = new Set(screenCandidates.map((s) => s.id));
    let previousScreenRendered = false;

    for (const node of sortedNodes) {
      if (screenSet.has(node.id)) {
        if (previousScreenRendered) {
          result.push({
            id: `pb-${node.id}`,
            type: "page_break",
          });
        }

        // Process this screen frame ISOLATED from sibling screens
        const screenElements = this.parseNodeToElements(node);
        result.push(...screenElements);
        previousScreenRendered = true;
      } else {
        // Non-screen element at canvas level (e.g. background shape)
        const elements = this.parseNodeToElements(node);
        result.push(...elements);
      }
    }

    return result;
  }

  private areSideBySideArtboards(screens: FigmaNode[]): boolean {
    const boxes = screens
      .map((screen) => screen.absoluteBoundingBox)
      .filter((box): box is NonNullable<typeof box> => !!box);
    if (boxes.length < 2) return false;

    const sorted = [...boxes].sort((a, b) => a.x - b.x);
    let separated = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const overlap =
        Math.min(current.x + current.width, next.x + next.width) - Math.max(current.x, next.x);
      if (overlap < Math.min(current.width, next.width) * 0.5) {
        separated++;
      }
    }

    return separated >= 1 && separated >= Math.ceil((sorted.length - 1) / 2);
  }

  private parseChildren(nodes: FigmaNode[], parentLayoutMode?: string): DocElement[] {
    const visibleNodes = nodes.filter((n) => n.visible !== false);

    // Layout Engine processes spatial relations (P1-1 row clusters, P1-2 overlay containment, P1-3 sizing)
    const structuredNodes = this.layoutEngine.processNodes(visibleNodes);

    // Sort: If parent is horizontal, preserve left-to-right flow (X); otherwise top-to-bottom flow (Y)
    if (parentLayoutMode === "HORIZONTAL") {
      structuredNodes.sort((a, b) => {
        const aX = a.absoluteBoundingBox?.x ?? 0;
        const bX = b.absoluteBoundingBox?.x ?? 0;
        return aX - bX;
      });
    } else {
      structuredNodes.sort((a, b) => {
        const aY = a.absoluteBoundingBox?.y ?? 0;
        const bY = b.absoluteBoundingBox?.y ?? 0;
        return aY - bY;
      });
    }

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

      case "CANVAS":
        return this.parseCanvasChildren(node.children || []);

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

    const color = this.extractFillColor(this.textFills(node));
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

    const isHeading = this.isHeadingText(node, text, fontSize);

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
    const imageElement = this.imageElementFromNode(node, node.id);
    if (imageElement) {
      this.addNotice(node, "Supported", "Rectangle with IMAGE fill mapped to Word Image");
      return imageElement;
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
    const children = this.parseChildren(node.children || [], node.layoutMode);
    const fill = this.extractFillColor(node.fills);
    const backgroundImage = this.imageElementFromNode(node, `${node.id}-fill`);

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
      backgroundImage: backgroundImage || undefined,
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
    const solid = fills.find((f) => f.type === "SOLID" && f.visible !== false && f.color);
    if (solid?.color) {
      return this.figmaColorToColor(solid.color, solid.opacity);
    }

    const gradient = fills.find(
      (f) => f.visible !== false && String(f.type).startsWith("GRADIENT") && f.gradientStops?.length
    );
    const stop = gradient?.gradientStops?.find((item) => item.color);
    if (stop?.color) {
      return this.figmaColorToColor(stop.color, gradient?.opacity);
    }

    return undefined;
  }

  private textFills(node: FigmaNode): FigmaPaint[] | undefined {
    const own = (node.fills ?? []).filter((fill) => fill.visible !== false);
    if (own.length > 0) return node.fills;
    return node.style?.fills;
  }

  private imageElementFromNode(node: FigmaNode, id: string): ImageElement | null {
    const imagePaint = (node.fills || []).find((fill) => fill.type === "IMAGE" && fill.visible !== false);
    if (!imagePaint) return null;

    const imgRef = imagePaint.imageRef || node.imageRef || "";
    const imgSrc =
      this.imageMap[imgRef] ||
      imgRef ||
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    return {
      id,
      type: "image",
      source: imgSrc,
      width: node.absoluteBoundingBox?.width || 200,
      height: node.absoluteBoundingBox?.height || 100,
      altText: node.name,
      alignment: "left",
    };
  }

  private isHeadingText(node: FigmaNode, text: string, fontSizePt: number): boolean {
    if (fontSizePt >= 16) return true;

    const name = node.name.trim().toLowerCase();
    const content = text.trim().toLowerCase();
    const explicitRole = /^(h[1-6]|heading|title|subtitle|제목|부제)(\b|\d|$)/.test(name);
    const nameMirrorsText =
      !explicitRole &&
      name.length >= 8 &&
      content.length > 0 &&
      (name === content || content.startsWith(name));

    if (nameMirrorsText) return false;
    return name.includes("heading") || name.includes("title") || name.includes("제목");
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
