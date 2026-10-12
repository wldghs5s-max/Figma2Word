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
  PageConfig,
  DocElement,
  ParagraphElement,
  HeadingElement,
  TextRun,
  ImageElement,
  LineElement,
  ShapeElement,
  ContainerElement,
  TableElement,
  TableRow,
  TableCell,
  Color,
  TextStyle,
  Alignment,
} from "../model/index.js";

import { LayoutEngine } from "../layout/index.js";
import { analyzeGeometryCluster, rasterizeGeometryCluster } from "./geometryRaster.js";

/** Largest cluster (px²) eligible for rasterization: widgets such as charts, never whole screens. */
const MAX_GEOMETRY_CLUSTER_AREA = 250_000;

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
      let framePageConfig: PageConfig | undefined;

      const box = rootNode.absoluteBoundingBox;
      if (box && box.width >= 240 && box.height >= 450) {
        // Mobile or single screen frame: calculate proportional page dimensions to fit content within single page
        const marginMm = 12; // Compact margin
        const targetWidthMm = 210; // Standard A4 width
        const usableWidthMm = targetWidthMm - marginMm * 2; // 186mm
        const aspectRatio = box.height / box.width;
        // Height needed to preserve exact aspect ratio + vertical padding for UI cards/buttons
        const proportionalHeightMm = Math.round(usableWidthMm * aspectRatio + marginMm * 2 + 60);
        const targetHeightMm = Math.max(297, proportionalHeightMm);

        framePageConfig = {
          size: targetHeightMm > 297 ? "Custom" : "A4",
          widthMm: targetWidthMm,
          heightMm: targetHeightMm,
          orientation: "portrait",
          marginsMm: {
            top: marginMm,
            bottom: marginMm,
            left: marginMm,
            right: marginMm,
          },
        };
      }

      sections.push({
        id: rootNode.id,
        title: rootNode.name,
        pageConfig: framePageConfig,
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

    // Screen Frame Candidate: FRAME, SECTION, or COMPONENT with screen-like dimensions and children
    const isScreenCandidate = (node: FigmaNode, parent?: FigmaNode): boolean => {
      if (node.type !== "FRAME" && node.type !== "SECTION" && node.type !== "COMPONENT") return false;
      const box = node.absoluteBoundingBox;
      if (!box) return false;
      if (!node.children || node.children.length === 0) return false;
      if (box.width < 240 || box.height < 240) return false;

      // If parent is a desktop/tablet page or container, a child that spans >= 85% of parent's width
      // is a horizontal content section/slice (e.g. Hero, Features, Pricing), not an independent screen!
      if (parent && parent.absoluteBoundingBox) {
        const pBox = parent.absoluteBoundingBox;
        if (pBox.width >= 600 && box.width >= pBox.width * 0.85) {
          return false;
        }
      }

      // If this container directly wraps 2 or more screen candidates,
      // it is an Artboard Group / Flow Section, not a leaf screen!
      const childScreens = node.children.filter((c) => isScreenCandidate(c, node));
      if (childScreens.length >= 2) {
        return false;
      }

      const aspect = box.height / box.width;
      // Mobile screen: width 240..500, height >= 360, aspect >= 0.8
      // Also include mobile modals/artboards (height >= 320, or aspect >= 0.7)
      if (box.width <= 500) {
        return box.height >= 450 || (box.height >= 320 && aspect >= 0.7);
      }
      // Tablet / Desktop screen: width >= 600, height >= 400
      if (box.width >= 600 && box.height >= 400) {
        return aspect >= 0.4 && aspect <= 2.5;
      }
      return box.height >= 360 && aspect >= 0.5 && aspect <= 4.0;
    };

    // Pre-process canvas children: unwrap any artboard group / flow section containers
    // that wrap multiple independent screens together.
    const unwrapArtboardGroups = (nodesToProcess: FigmaNode[]): FigmaNode[] => {
      const flattened: FigmaNode[] = [];
      for (const node of nodesToProcess) {
        if (node.visible === false) continue;
        if (
          (node.type === "FRAME" || node.type === "SECTION" || node.type === "GROUP") &&
          node.children &&
          node.children.length > 0
        ) {
          const childScreens = node.children.filter((c) => isScreenCandidate(c, node));
          if (childScreens.length >= 2) {
            // Guard 1: Do NOT unwrap a continuous vertical page where children are full-width stacked sections
            const isVerticalPageSections =
              node.type !== "SECTION" &&
              node.children.length >= 2 &&
              node.children.every((c) => {
                const cBox = c.absoluteBoundingBox;
                const nBox = node.absoluteBoundingBox;
                return cBox && nBox && cBox.width >= nBox.width * 0.85;
              });

            // Guard 2: An Artboard Group must contain at least one full-sized screen.
            // Content rows containing only medium cards (e.g. 360x400 pricing cards) must stay intact.
            const hasFullScreenChild = childScreens.some((c) => {
              const b = c.absoluteBoundingBox;
              if (!b) return false;
              return (
                (b.height >= 560 && b.width >= 280) ||
                (b.height >= 450 && b.height / b.width >= 1.2) ||
                (b.width >= 600 && b.height >= 500)
              );
            });

            if (!isVerticalPageSections && hasFullScreenChild) {
              flattened.push(...unwrapArtboardGroups(node.children));
              continue;
            }
          }
        }
        flattened.push(node);
      }
      return flattened;
    };

    const unwrappedNodes = unwrapArtboardGroups(visibleNodes);

    const screenCandidates = unwrappedNodes.filter((n) => isScreenCandidate(n));
    // Canvas-level titles or notes must not disable isolation when independent screen artboards are present.
    const isMultiScreen =
      screenCandidates.length >= 2 && this.areIndependentArtboards(screenCandidates);

    if (!isMultiScreen) {
      // Single screen or normal document flow (preserves existing fixtures and single-frame behaviors)
      return this.parseChildren(nodes);
    }

    // --- Multi-Screen Isolation Path ---
    // Sort screen-level nodes spatially: Primarily top-to-bottom (Y), then left-to-right (X)
    const sortedNodes = [...unwrappedNodes].sort((a, b) => {
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
        // Non-screen element at canvas level (e.g. background shape, canvas title text)
        const elements = this.parseNodeToElements(node);
        result.push(...elements);
      }
    }

    return result;
  }

  private areIndependentArtboards(screens: FigmaNode[]): boolean {
    const boxes = screens
      .map((screen) => screen.absoluteBoundingBox)
      .filter((box): box is NonNullable<typeof box> => !!box);
    if (boxes.length < 2) return false;

    // Check 1: Horizontal distribution across multiple columns (side-by-side or 2D grid)
    const distinctX: number[] = [];
    for (const b of boxes) {
      if (!distinctX.some((x) => Math.abs(x - b.x) < 60)) {
        distinctX.push(b.x);
      }
    }
    if (distinctX.length >= 2) {
      // Must contain at least one full-sized screen or screen-proportioned frame
      // (prevents small/medium content cards side-by-side from being mistaken for screens)
      const hasRealScreen = boxes.some(
        (b) =>
          (b.height >= 560 && b.width >= 280) ||
          (b.height >= 450 && b.height / b.width >= 1.2) ||
          (b.width >= 600 && b.height >= 500)
      );
      if (hasRealScreen) {
        return true;
      }
    }

    // Check 2: Vertical sequence of distinct full-sized screens (storyboard in 1 column)
    const allFullScreen = boxes.every(
      (b) => (b.height >= 560 && b.width >= 300) || (b.height >= 450 && b.height / b.width >= 1.2)
    );
    if (allFullScreen) {
      return true;
    }

    return false;
  }

  private parseChildren(nodes: FigmaNode[], parentLayoutMode?: string, parent?: FigmaNode): DocElement[] {
    const visibleNodes = nodes.filter((n) => n.visible !== false);

    // Layout Engine processes spatial relations (P1-1 row clusters, P1-2 overlay containment, P1-3 sizing)
    const structuredNodes = this.layoutEngine.processNodes(visibleNodes, parent);

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
      case "INSTANCE": {
        const clustered = this.tryGeometryCluster(node);
        if (clustered) return [clustered];
        const table = this.tryDataTable(node);
        if (table) return [table];
        return [this.parseContainer(node)];
      }

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

    const baseTextStyle: TextStyle = {
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
    const runs = this.buildTextRuns(node, text, baseTextStyle);

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
        runs,
      };
    }

    this.addNotice(node, "Supported", "Text mapped to Paragraph");
    return {
      id: node.id,
      type: "paragraph",
      alignment,
      runs,
    };
  }

  private buildTextRuns(node: FigmaNode, text: string, baseStyle: TextStyle): TextRun[] {
    const overrides = node.characterStyleOverrides;
    const table = node.styleOverrideTable;

    if (!text) {
      return [{ type: "run", text: "", style: baseStyle }];
    }

    if (!overrides || overrides.length === 0 || !table || Object.keys(table).length === 0) {
      return [{ type: "run", text, style: baseStyle }];
    }

    // Segment text into contiguous slices by overrideId
    const rawSegments: { text: string; style: TextStyle }[] = [];
    let start = 0;

    while (start < text.length) {
      const currentId = overrides[start] ?? 0;
      let end = start + 1;

      while (end < text.length) {
        // Guard against splitting surrogate pairs (e.g. emoji)
        if (this.isHighSurrogate(text.charCodeAt(end - 1)) && this.isLowSurrogate(text.charCodeAt(end))) {
          end++;
          continue;
        }

        const nextId = overrides[end] ?? 0;
        if (nextId !== currentId) {
          break;
        }
        end++;
      }

      // Final guard for surrogate pair at boundary
      if (end < text.length && this.isHighSurrogate(text.charCodeAt(end - 1)) && this.isLowSurrogate(text.charCodeAt(end))) {
        end++;
      }

      const segmentText = text.substring(start, end);
      const segmentStyle = this.resolveRunStyle(baseStyle, currentId, table);

      rawSegments.push({ text: segmentText, style: segmentStyle });
      start = end;
    }

    // Merge adjacent segments with identical resolved styles
    const mergedRuns: TextRun[] = [];
    for (const seg of rawSegments) {
      if (mergedRuns.length > 0 && this.areTextStylesEqual(mergedRuns[mergedRuns.length - 1].style, seg.style)) {
        mergedRuns[mergedRuns.length - 1].text += seg.text;
      } else {
        mergedRuns.push({ type: "run", text: seg.text, style: seg.style });
      }
    }

    return mergedRuns.length > 0 ? mergedRuns : [{ type: "run", text, style: baseStyle }];
  }

  private resolveRunStyle(
    baseStyle: TextStyle,
    overrideId: number,
    table: Record<string | number, FigmaTypeStyle>
  ): TextStyle {
    if (overrideId === 0) return baseStyle;

    const override = table[overrideId] ?? table[String(overrideId)];
    if (!override) return baseStyle;

    let fontSize = baseStyle.fontSize;
    if (override.fontSize) {
      fontSize = Math.round(override.fontSize * 0.75);
    }

    let color = baseStyle.color;
    if (override.fills && override.fills.length > 0) {
      const extracted = this.extractFillColor(override.fills);
      if (extracted) color = extracted;
    }

    let fontWeight = baseStyle.fontWeight;
    if (override.fontWeight !== undefined) {
      fontWeight = this.mapFontWeight(override.fontWeight);
    }

    let italic = baseStyle.italic;
    if (override.italic !== undefined) {
      italic = !!override.italic;
    }

    let underline = baseStyle.underline;
    let strike = baseStyle.strike;
    if (override.textDecoration !== undefined) {
      underline = override.textDecoration === "UNDERLINE";
      strike = override.textDecoration === "STRIKETHROUGH";
    }

    return {
      fontFamily: override.fontFamily || baseStyle.fontFamily,
      fontSize,
      fontWeight,
      italic,
      underline,
      strike,
      color,
      lineHeight: baseStyle.lineHeight,
      letterSpacing: override.letterSpacing ?? baseStyle.letterSpacing,
    };
  }

  private areTextStylesEqual(a?: Partial<TextStyle>, b?: Partial<TextStyle>): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
      a.fontFamily === b.fontFamily &&
      a.fontSize === b.fontSize &&
      a.fontWeight === b.fontWeight &&
      a.italic === b.italic &&
      a.underline === b.underline &&
      a.strike === b.strike &&
      a.color?.hex === b.color?.hex &&
      a.color?.a === b.color?.a
    );
  }

  private isHighSurrogate(code: number): boolean {
    return code >= 0xd800 && code <= 0xdbff;
  }

  private isLowSurrogate(code: number): boolean {
    return code >= 0xdc00 && code <= 0xdfff;
  }


  /**
   * Step 10C: a widget made only of exactly reproducible geometry (rectangles, rounded boxes,
   * straight lines) is emitted as ONE image instead of being dropped as "contentless shapes".
   * Synthetic layout wrappers are never candidates and anything with text, bitmap fills, free-form
   * vector paths or large (screen-sized) areas keeps the regular container path.
   */
  private tryGeometryCluster(node: FigmaNode): ImageElement | null {
    if (node.id.startsWith("row-cluster-") || node.id.startsWith("bento-col-")) return null;
    const box = node.absoluteBoundingBox;
    if (!box || box.width * box.height > MAX_GEOMETRY_CLUSTER_AREA) return null;

    const cluster = analyzeGeometryCluster(node);
    if (!cluster) return null;

    const raster = rasterizeGeometryCluster(cluster);
    this.addNotice(
      node,
      "Fallback",
      `Geometry cluster (${cluster.leafCount} shapes) rasterized to image (${raster.width}x${raster.height}px); not editable in Word.`
    );
    return {
      id: `${node.id}-geometry`,
      type: "image",
      source: raster.dataUrl,
      width: raster.width,
      height: raster.height,
      altText: node.name,
      alignment: "left",
    };
  }

  /** Composite stacked visible SOLID paints (bottom to top) into one color; first SOLID if only one. */
  private extractShapeFill(fills?: FigmaPaint[]): Color | undefined {
    const solids = (fills ?? []).filter((f) => f.type === "SOLID" && f.visible !== false && f.color);
    if (solids.length <= 1) return this.extractFillColor(fills);

    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (const paint of solids) {
      const sa = paint.opacity ?? paint.color?.a ?? 1;
      const outA = sa + a * (1 - sa);
      if (outA <= 0) continue;
      r = (paint.color!.r * 255 * sa + r * a * (1 - sa)) / outA;
      g = (paint.color!.g * 255 * sa + g * a * (1 - sa)) / outA;
      b = (paint.color!.b * 255 * sa + b * a * (1 - sa)) / outA;
      a = outA;
    }
    return this.figmaColorToColor({ r: r / 255, g: g / 255, b: b / 255 }, a);
  }

  /**
   * Step 11A: Detects a logical multi-row x multi-column data table in the Figma AST
   * and maps it to a single native Word TableElement instead of fragmented 1-row tables.
   */
  private tryDataTable(node: FigmaNode): TableElement | null {
    if (node.id.startsWith("row-cluster-") || node.id.startsWith("bento-col-")) return null;
    if (node.type === "SECTION" || node.type === "CANVAS" || node.type === "DOCUMENT") return null;

    const visibleRows = (node.children || []).filter((c) => c.visible !== false);
    if (visibleRows.length < 2) return null;

    const isVertical =
      node.layoutMode === "VERTICAL" ||
      (node.layoutMode !== "HORIZONTAL" && this.isVerticalStack(visibleRows));
    if (!isVertical) return null;

    const CONTAINER_TYPES = new Set(["FRAME", "GROUP", "INSTANCE", "COMPONENT"]);
    const firstRowCells = (visibleRows[0].children || []).filter((c) => c.visible !== false);
    const colCount = firstRowCells.length;
    if (colCount < 2) return null;

    const parsedRows: { rowNode: FigmaNode; cellNodes: FigmaNode[] }[] = [];
    for (const row of visibleRows) {
      if (!CONTAINER_TYPES.has(row.type)) return null;
      const cells = (row.children || []).filter((c) => c.visible !== false);
      if (cells.length !== colCount) return null; // Uniform column count required

      // A row must be horizontally oriented (Auto Layout HORIZONTAL or cells ordered on X axis)
      const isHorizontal =
        row.layoutMode === "HORIZONTAL" ||
        (row.layoutMode !== "VERTICAL" && this.isHorizontalRow(cells));
      if (!isHorizontal) return null;

      // A row's bounding box (if present) should be wider than it is tall
      const rBox = row.absoluteBoundingBox;
      if (rBox && rBox.height > rBox.width * 1.5) {
        return null; // Tall vertical card, not a table row
      }

      parsedRows.push({ rowNode: row, cellNodes: cells });
    }

    // Step 11B: Card Grid False-Positive Guard
    // Genuine data tables have compact rows (<= 100px) and minimal row spacing.
    // Rich comparison cards and KPI dashboards must remain containers.
    if (this.isCardGrid(node, parsedRows)) {
      return null;
    }

    // Grid Alignment & Column Width calculation
    const colWidths0 = firstRowCells.map((c) => c.absoluteBoundingBox?.width ?? 0);
    const row0Width = colWidths0.reduce((sum, w) => sum + w, 0);
    let colPercentages: number[] = [];

    if (row0Width > 0 && colWidths0.every((w) => w > 0)) {
      colPercentages = colWidths0.map((w) => Math.max(1, Math.round((w / row0Width) * 100)));
      const sumP = colPercentages.reduce((a, b) => a + b, 0);
      if (sumP !== 100 && colPercentages.length > 0) {
        colPercentages[colPercentages.length - 1] += 100 - sumP;
      }

      // Check column width consistency across rows (tolerance check: 0.65 ~ 1.5)
      for (let i = 1; i < parsedRows.length; i++) {
        const rowCells = parsedRows[i].cellNodes;
        for (let j = 0; j < colCount; j++) {
          const w = rowCells[j].absoluteBoundingBox?.width ?? 0;
          const w0 = colWidths0[j];
          if (w0 > 0 && w > 0) {
            const ratio = w / w0;
            if (ratio < 0.65 || ratio > 1.5) {
              return null; // Width pattern mismatch -> not a regular data table
            }
          }
        }
      }
    } else {
      const defaultCol = Math.floor(100 / colCount);
      colPercentages = Array(colCount).fill(defaultCol);
      colPercentages[colCount - 1] = 100 - defaultCol * (colCount - 1);
    }

    // Text density check: at least 35% of cells must contain text
    let textCellCount = 0;
    for (const r of parsedRows) {
      for (const c of r.cellNodes) {
        if (this.nodeHasText(c)) textCellCount++;
      }
    }
    const totalCells = parsedRows.length * colCount;
    if (textCellCount / totalCells < 0.35) {
      return null;
    }

    // Header row detection
    const isHeaderRow = (rowNode: FigmaNode, rowIndex: number): boolean => {
      if (rowIndex !== 0) return false;
      const name = (rowNode.name || "").toLowerCase();
      if (name.includes("head") || name.includes("th")) return true;
      const headFill = this.extractShapeFill(rowNode.fills);
      const row1Fill = this.extractShapeFill(parsedRows[1]?.rowNode.fills);
      if (headFill && (!row1Fill || headFill.hex !== row1Fill.hex)) return true;
      const t0 = this.findTextNodes(rowNode);
      const t1 = this.findTextNodes(parsedRows[1]?.rowNode);
      const isBold0 = t0.some((t) => {
        const w = t.style?.fontWeight;
        return w === "bold" || (typeof w === "number" && w >= 600);
      });
      const isBold1 = t1.some((t) => {
        const w = t.style?.fontWeight;
        return w === "bold" || (typeof w === "number" && w >= 600);
      });
      return isBold0 && !isBold1;
    };

    // Build TableElement
    const tableRows: TableRow[] = [];
    for (let rIdx = 0; rIdx < parsedRows.length; rIdx++) {
      const { rowNode, cellNodes } = parsedRows[rIdx];
      const isHeader = isHeaderRow(rowNode, rIdx);
      const rowBg = this.extractShapeFill(rowNode.fills);

      const tableCells: TableCell[] = [];
      for (let cIdx = 0; cIdx < cellNodes.length; cIdx++) {
        const cellNode = cellNodes[cIdx];
        const cellBg = this.extractShapeFill(cellNode.fills) || rowBg;
        const cellStroke = this.extractStroke(cellNode);

        const children = this.parseChildren(cellNode.children || [], cellNode.layoutMode, cellNode);
        const cellChildren: DocElement[] = children.length > 0 ? children : [
          {
            type: "paragraph" as const,
            runs: [{ type: "run" as const, text: "" }],
            alignment: "left" as const,
          },
        ];

        tableCells.push({
          id: cellNode.id,
          children: cellChildren,
          background: cellBg,
          border: cellStroke,
          padding: {
            top: cellNode.paddingTop || 4,
            right: cellNode.paddingRight || 6,
            bottom: cellNode.paddingBottom || 4,
            left: cellNode.paddingLeft || 6,
          },
          colSpan: 1,
          rowSpan: 1,
          width: colPercentages[cIdx],
        });
      }

      tableRows.push({
        id: rowNode.id,
        isHeader,
        cells: tableCells,
      });
    }

    const tableBorder = this.extractStroke(node);

    this.addNotice(
      node,
      "Supported",
      `Logical Data Table (${parsedRows.length} rows x ${colCount} cols) mapped to native Word Table.`
    );

    return {
      id: node.id,
      type: "table",
      rows: tableRows,
      columnWidths: colPercentages,
      borders: tableBorder,
      alignment: "left",
    };
  }

  /**
   * Step 11B: Distinguish card grids (comparison cards, KPI metrics, tile lists)
   * from genuine data tables. Card grids should remain containers for layout clustering.
   */
  private isCardGrid(
    node: FigmaNode,
    parsedRows: { rowNode: FigmaNode; cellNodes: FigmaNode[] }[]
  ): boolean {
    // 1. Large row spacing check: Table rows typically have minimal/no spacing (itemSpacing <= 8)
    const rowSpacing = node.itemSpacing ?? 0;
    if (rowSpacing >= 16) return true; // Large gap between rows -> Card Grid

    let totalHeight = 0;
    let complexCellCount = 0;
    let roundedCardCount = 0;
    let totalCells = 0;

    for (const pr of parsedRows) {
      const r = pr.rowNode;
      const h = r.absoluteBoundingBox?.height ?? 0;
      totalHeight += h;

      const colSpacing = r.itemSpacing ?? 0;
      for (const c of pr.cellNodes) {
        totalCells++;
        const cH = c.absoluteBoundingBox?.height ?? 0;
        const cRadius = c.cornerRadius ?? 0;

        // Rounded standalone cards with gutter (itemSpacing >= 8) or prominent radius (>= 8)
        if (cRadius >= 8 || (cRadius >= 4 && colSpacing >= 8)) {
          roundedCardCount++;
        }

        // Cell child complexity (e.g. Title + Body + Button, or Label + Value + Trend)
        const cellKids = (c.children || []).filter((k) => k.visible !== false);
        if (cellKids.length >= 3 && cH >= 60) {
          complexCellCount++;
        }
      }
    }

    const avgRowHeight = totalHeight / parsedRows.length;

    // 2. Average row height check: Table rows are compact (<= 100px)
    if (avgRowHeight > 100) return true;

    // 3. Medium height rows (>= 60px) with rounded card cells or gutters
    if (avgRowHeight >= 60 && roundedCardCount > 0) return true;

    // 4. Majority of cells are complex UI widgets (3+ children and height >= 60)
    if (totalCells > 0 && complexCellCount / totalCells >= 0.5) return true;

    // 5. Spaced rows (itemSpacing >= 10) with thick rows (>= 70px)
    if (rowSpacing >= 10 && avgRowHeight >= 70) return true;

    return false;
  }

  private isVerticalStack(nodes: FigmaNode[]): boolean {
    if (nodes.length <= 1) return false;
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i].absoluteBoundingBox;
      const b = nodes[i + 1].absoluteBoundingBox;
      if (!a || !b) return false;
      // Subsequent row must be lower than previous row (avoid side-by-side nodes with same Y)
      if (b.y < a.y + 10) return false;
    }
    return true;
  }

  private isHorizontalRow(cells: FigmaNode[]): boolean {
    if (cells.length < 2) return false;
    for (let i = 0; i < cells.length - 1; i++) {
      const a = cells[i].absoluteBoundingBox;
      const b = cells[i + 1].absoluteBoundingBox;
      if (!a || !b) return false;
      // Cell b should be to the right of cell a
      if (b.x < a.x + 5) return false;
    }
    return true;
  }

  private nodeHasText(node: FigmaNode): boolean {
    if (node.type === "TEXT" && (node.characters || "").trim().length > 0) return true;
    for (const child of node.children || []) {
      if (this.nodeHasText(child)) return true;
    }
    return false;
  }

  private findTextNodes(node?: FigmaNode): FigmaNode[] {
    if (!node) return [];
    const result: FigmaNode[] = [];
    if (node.type === "TEXT") result.push(node);
    for (const child of node.children || []) {
      result.push(...this.findTextNodes(child));
    }
    return result;
  }

  private parseRectangle(node: FigmaNode): ImageElement | ShapeElement {
    // Check if fill is an image
    const imageElement = this.imageElementFromNode(node, node.id);
    if (imageElement) {
      this.addNotice(node, "Supported", "Rectangle with IMAGE fill mapped to Word Image");
      return imageElement;
    }

    // Otherwise solid shape
    const fill = this.extractShapeFill(node.fills);
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
    const children = this.parseChildren(node.children || [], node.layoutMode, node);
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

    const trimmed = text.trim();
    // A long text block (e.g. > 150 chars or containing multiple line breaks) is body content, not a heading.
    if (trimmed.length > 150 || (trimmed.match(/\n/g) || []).length >= 2) {
      return false;
    }

    const name = (node.name || "").trim().toLowerCase();
    const content = trimmed.toLowerCase();
    const explicitRole = /^(h[1-6]|heading|title|subtitle|제목|부제)(\b|\d|$)/.test(name);

    // Normalize whitespace for mirror check (Figma layer names replace newlines with spaces)
    const normName = name.replace(/\s+/g, " ");
    const normContent = content.replace(/\s+/g, " ");
    const nameMirrorsText =
      !explicitRole &&
      normName.length >= 8 &&
      normContent.length > 0 &&
      (normName === normContent || normContent.startsWith(normName));

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
