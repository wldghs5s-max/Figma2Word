import {
  CanvasDocument,
  CanvasPage,
  CanvasElement,
  CanvasTextRun,
  CanvasStyle,
  ScalePolicy,
  resolveScale,
  CanvasResource,
} from "../types.js";
import { FigmaNode, FigmaFileResponse, FigmaColor, FigmaPaint } from "../../parser/types.js";
import { isA4Ratio } from "../../pipeline/index.js";

export interface FigmaCanvasParserOptions {
  imageMap?: Record<string, string>;
  selectedFrameIds?: string[];
  scalePolicy?: ScalePolicy;
  titleOverride?: string;
}

export class FigmaCanvasParser {
  private imageMap: Record<string, string>;
  private scalePolicy: ScalePolicy;
  private selectedFrameIds?: Set<string>;
  private titleOverride?: string;
  private resources: Record<string, CanvasResource> = {};
  private imageCounter = 0;
  private imageRefMap = new Map<string, string>(); // figmaRef -> resourceId

  constructor(options?: FigmaCanvasParserOptions) {
    this.imageMap = options?.imageMap || {};
    this.scalePolicy = options?.scalePolicy || "fit-a4";
    this.selectedFrameIds = options?.selectedFrameIds
      ? new Set(options.selectedFrameIds)
      : undefined;
    this.titleOverride = options?.titleOverride;
  }

  public parse(input: FigmaNode | FigmaFileResponse): CanvasDocument {
    this.resources = {};
    this.imageCounter = 0;
    this.imageRefMap.clear();

    const rootNode = "document" in input ? input.document : input;
    const documentName =
      this.titleOverride ||
      ("name" in input && input.name ? input.name : "Figma Document");

    const notices: string[] = [];
    const warnings: string[] = [];

    // Step 1: Discover top-level frames representing document pages
    const pageFrames = this.discoverPageFrames(rootNode);

    if (pageFrames.length === 0) {
      warnings.push("No candidate page frames found. Using root as single page.");
    }

    const pages: CanvasPage[] = [];

    // If no page frames found, treat root itself as a page
    const framesToProcess = pageFrames.length > 0 ? pageFrames : [rootNode];

    for (let i = 0; i < framesToProcess.length; i++) {
      const frame = framesToProcess[i];
      const pageIndex = i + 1;
      const page = this.parsePageFrame(frame, pageIndex, notices, warnings);
      pages.push(page);
    }

    return {
      title: documentName,
      pageSize: {
        name: "A4",
        widthPt: 595.28,
        heightPt: 841.89,
        unit: "pt",
      },
      marginsPt: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
      pages,
      resources: this.resources,
      diagnostics: {
        notices,
        warnings,
      },
    };
  }

  /**
   * Discovers top-level frames that qualify as document pages (e.g. A4 frames).
   */
  private discoverPageFrames(root: FigmaNode): FigmaNode[] {
    const candidateFrames: FigmaNode[] = [];

    const visitCanvasOrDoc = (node: FigmaNode) => {
      if (node.children) {
        for (const child of node.children) {
          if (child.visible === false) continue;

          // If frame selection filter is active
          if (this.selectedFrameIds && !this.selectedFrameIds.has(child.id)) {
            continue;
          }

          // Check if child is a frame or component
          if (
            child.type === "FRAME" ||
            child.type === "COMPONENT" ||
            child.type === "GROUP"
          ) {
            candidateFrames.push(child);
          } else if (child.type === "CANVAS") {
            visitCanvasOrDoc(child);
          }
        }
      }
    };

    if (root.type === "DOCUMENT" || root.type === "CANVAS") {
      visitCanvasOrDoc(root);
    } else {
      candidateFrames.push(root);
    }

    // Sort candidate frames in reading order (top-to-bottom, left-to-right)
    candidateFrames.sort((a, b) => {
      const boxA = a.absoluteBoundingBox || { x: 0, y: 0 };
      const boxB = b.absoluteBoundingBox || { x: 0, y: 0 };
      const rowA = Math.round(boxA.y / 100);
      const rowB = Math.round(boxB.y / 100);
      if (rowA !== rowB) return rowA - rowB;
      return boxA.x - boxB.x;
    });

    return candidateFrames;
  }

  /**
   * Parses a single top-level frame into a CanvasPage.
   */
  private parsePageFrame(
    frame: FigmaNode,
    pageNumber: number,
    notices: string[],
    warnings: string[]
  ): CanvasPage {
    const frameBox = frame.absoluteBoundingBox || {
      x: 0,
      y: 0,
      width: 794,
      height: 1123,
    };

    const resolved = resolveScale(
      frameBox.width,
      frameBox.height,
      this.scalePolicy
    );
    const { scaleX, scaleY, targetWidthPt, targetHeightPt } = resolved;

    // Check background color
    let backgroundColor: string | undefined;
    const rawBg = (frame as any).backgroundColor;
    if (rawBg) {
      backgroundColor = this.figmaColorToHex(rawBg);
    } else if (frame.fills && frame.fills.length > 0) {
      const solid = frame.fills.find(
        (f) => f.type === "SOLID" && f.visible !== false
      );
      if (solid && solid.color) {
        backgroundColor = this.figmaColorToHex(solid.color);
      }
    }

    const elements: CanvasElement[] = [];
    let currentZIndex = 1;

    // Helper to recursively process children
    const processChildren = (node: FigmaNode) => {
      if (!node.children) return;

      for (const child of node.children) {
        if (child.visible === false) continue;

        const childBox = child.absoluteBoundingBox;
        if (!childBox) {
          // If no absolute bounding box, still process children if any
          processChildren(child);
          continue;
        }

        // Relative coordinate to page frame
        const relX = childBox.x - frameBox.x;
        const relY = childBox.y - frameBox.y;

        const xPt = relX * scaleX;
        const yPt = relY * scaleY;
        const wPt = childBox.width * scaleX;
        const hPt = childBox.height * scaleY;

        // Diagnostic: clipsContent check
        if (child.clipsContent) {
          notices.push(
            `Page ${pageNumber}, node ${child.name || child.id} has clipsContent=true.`
          );
        }

        // Check if node is an image fill
        const imageFill = child.fills?.find(
          (f) => f.type === "IMAGE" && f.visible !== false && f.imageRef
        );

        if (imageFill && imageFill.imageRef) {
          const resId = this.resolveImageResource(imageFill.imageRef);
          elements.push({
            id: child.id,
            name: child.name,
            type: "image",
            bounds: { x: xPt, y: yPt, width: wPt, height: hPt },
            zIndex: currentZIndex++,
            rotation: (child as any).rotation,
            opacity: child.opacity,
            style: this.extractStyle(child, scaleX),
            imageRef: resId,
            sourceNodeId: child.id,
            sourceNodeType: child.type,
          });
        } else if (child.type === "TEXT") {
          const textRuns = this.extractTextRuns(child, scaleX);
          const style = this.extractStyle(child, scaleX);
          const align = this.extractTextAlign(child);

          elements.push({
            id: child.id,
            name: child.name,
            type: "text",
            bounds: { x: xPt, y: yPt, width: wPt, height: hPt },
            zIndex: currentZIndex++,
            rotation: (child as any).rotation,
            opacity: child.opacity,
            style,
            textRuns,
            paragraphAlign: align,
            sourceNodeId: child.id,
            sourceNodeType: child.type,
          });
        } else if (child.type === "LINE") {
          elements.push({
            id: child.id,
            name: child.name,
            type: "line",
            bounds: { x: xPt, y: yPt, width: wPt, height: Math.max(hPt, 1) },
            zIndex: currentZIndex++,
            rotation: (child as any).rotation,
            opacity: child.opacity,
            style: this.extractStyle(child, scaleX),
            sourceNodeId: child.id,
            sourceNodeType: child.type,
          });
        } else if (
          child.type === "RECTANGLE" ||
          child.type === "FRAME" ||
          child.type === "COMPONENT" ||
          child.type === "INSTANCE"
        ) {
          const style = this.extractStyle(child, scaleX);
          const hasFill = !!style.fillColor;
          const hasStroke = !!style.strokeColor && (style.strokeWidth || 0) > 0;

          // If frame has visible background/border, register card
          if (hasFill || hasStroke) {
            elements.push({
              id: child.id,
              name: child.name,
              type: "card",
              bounds: { x: xPt, y: yPt, width: wPt, height: hPt },
              zIndex: currentZIndex++,
              rotation: (child as any).rotation,
              opacity: child.opacity,
              style,
              sourceNodeId: child.id,
              sourceNodeType: child.type,
            });
          }

          // Process nested children inside this container
          processChildren(child);
        } else if (child.type === "GROUP") {
          processChildren(child);
        } else {
          // Fallback for VECTOR, STAR, ELLIPSE, etc.
          const style = this.extractStyle(child, scaleX);
          if (style.fillColor || style.strokeColor) {
            elements.push({
              id: child.id,
              name: child.name,
              type: "card",
              bounds: { x: xPt, y: yPt, width: wPt, height: hPt },
              zIndex: currentZIndex++,
              rotation: (child as any).rotation,
              opacity: child.opacity,
              style,
              sourceNodeId: child.id,
              sourceNodeType: child.type,
            });
          }
          processChildren(child);
        }
      }
    };

    processChildren(frame);

    // Sort elements by zIndex
    elements.sort((a, b) => a.zIndex - b.zIndex);

    return {
      pageNumber,
      name: frame.name || `Page ${pageNumber}`,
      bounds: {
        x: 0,
        y: 0,
        width: targetWidthPt,
        height: targetHeightPt,
      },
      backgroundColor,
      elements,
    };
  }

  /**
   * Resolves a Figma imageRef to a local CanvasResource.
   */
  private resolveImageResource(imageRef: string): string {
    if (this.imageRefMap.has(imageRef)) {
      return this.imageRefMap.get(imageRef)!;
    }

    this.imageCounter++;
    const resId = `image${this.imageCounter}.png`;
    const dataUrl = this.imageMap[imageRef];

    let buffer: Buffer;
    let mimeType = "image/png";

    if (dataUrl && dataUrl.startsWith("data:")) {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        buffer = Buffer.from(match[2], "base64");
      } else {
        buffer = Buffer.alloc(0);
      }
    } else {
      // 1x1 transparent placeholder
      buffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64"
      );
    }

    this.resources[resId] = {
      id: resId,
      name: resId,
      mimeType,
      data: buffer,
    };

    this.imageRefMap.set(imageRef, resId);
    return resId;
  }

  /**
   * Extracts visual style (fill, stroke, corner radius) from a Figma node.
   */
  private extractStyle(node: FigmaNode, scale: number): CanvasStyle {
    const style: CanvasStyle = {};

    // 1. Fills
    if (node.fills && node.fills.length > 0) {
      const solid = node.fills.find(
        (f) => f.type === "SOLID" && f.visible !== false
      );
      if (solid && solid.color) {
        style.fillColor = this.figmaColorToHex(solid.color);
        style.fillOpacity = solid.opacity ?? solid.color.a ?? 1.0;
      }
    }

    // 2. Strokes
    if (node.strokes && node.strokes.length > 0) {
      const stroke = node.strokes.find(
        (s) => s.type === "SOLID" && s.visible !== false
      );
      if (stroke && stroke.color) {
        style.strokeColor = this.figmaColorToHex(stroke.color);
        style.strokeWidth = (node.strokeWeight || 1) * scale;
        const dashes = (node as any).strokeDashes;
        if (dashes && dashes.length > 0) {
          style.strokeDashed = true;
        }
      }
    }

    // 3. Corner Radius
    if (node.cornerRadius) {
      style.cornerRadius = node.cornerRadius * scale;
    }

    return style;
  }

  /**
   * Extracts text runs from a Figma TEXT node, taking into account
   * character style overrides if present.
   */
  private extractTextRuns(node: FigmaNode, scale: number): CanvasTextRun[] {
    const characters = node.characters || "";
    if (!characters) return [];

    const defaultFontFamily = node.style?.fontFamily || "Inter";
    const defaultFontSize = (node.style?.fontSize || 12) * scale;
    const rawWeight = node.style?.fontWeight;
    const defaultFontWeight =
      typeof rawWeight === "number"
        ? rawWeight
        : rawWeight
        ? parseInt(String(rawWeight), 10) || 400
        : 400;
    const defaultItalic =
      node.style?.italic ||
      node.style?.fontPostScriptName?.toLowerCase().includes("italic") ||
      false;
    const defaultUnderline = node.style?.textDecoration === "UNDERLINE";
    const defaultStrike = node.style?.textDecoration === "STRIKETHROUGH";

    // Text color from fills
    let defaultColor = "#000000";
    if (node.fills && node.fills.length > 0) {
      const solid = node.fills.find(
        (f) => f.type === "SOLID" && f.visible !== false
      );
      if (solid && solid.color) {
        defaultColor = this.figmaColorToHex(solid.color);
      }
    }

    const runs: CanvasTextRun[] = [];

    // Check for characterStyleOverrides
    const overrides = node.characterStyleOverrides;
    const styleTable = node.styleOverrideTable;

    if (
      overrides &&
      Array.isArray(overrides) &&
      overrides.length > 0 &&
      styleTable
    ) {
      let currentRunText = "";
      let currentStyleKey: string | number = overrides[0] ?? 0;

      for (let i = 0; i < characters.length; i++) {
        const char = characters[i];
        const styleKey: string | number = overrides[i] ?? 0;

        if (styleKey === currentStyleKey) {
          currentRunText += char;
        } else {
          if (currentRunText) {
            runs.push(
              this.createRun(
                currentRunText,
                currentStyleKey,
                styleTable,
                defaultFontFamily,
                defaultFontSize,
                defaultFontWeight,
                defaultItalic,
                defaultUnderline,
                defaultStrike,
                defaultColor,
                scale
              )
            );
          }
          currentRunText = char;
          currentStyleKey = styleKey;
        }
      }

      if (currentRunText) {
        runs.push(
          this.createRun(
            currentRunText,
            currentStyleKey,
            styleTable,
            defaultFontFamily,
            defaultFontSize,
            defaultFontWeight,
            defaultItalic,
            defaultUnderline,
            defaultStrike,
            defaultColor,
            scale
          )
        );
      }
    } else {
      // Single run
      runs.push({
        text: characters,
        fontFamily: defaultFontFamily,
        fontSizePt: defaultFontSize,
        fontWeight: defaultFontWeight,
        italic: defaultItalic,
        underline: defaultUnderline,
        strike: defaultStrike,
        color: defaultColor,
      });
    }

    return runs;
  }

  private createRun(
    text: string,
    styleKey: number | string,
    styleTable: Record<string | number, any>,
    defaultFamily: string,
    defaultSize: number,
    defaultWeight: number,
    defaultItalic: boolean,
    defaultUnderline: boolean,
    defaultStrike: boolean,
    defaultColor: string,
    scale: number
  ): CanvasTextRun {
    const override = styleTable[String(styleKey)];
    if (!override) {
      return {
        text,
        fontFamily: defaultFamily,
        fontSizePt: defaultSize,
        fontWeight: defaultWeight,
        italic: defaultItalic,
        underline: defaultUnderline,
        strike: defaultStrike,
        color: defaultColor,
      };
    }

    let color = defaultColor;
    if (override.fills && override.fills.length > 0) {
      const solid = override.fills.find(
        (f: FigmaPaint) => f.type === "SOLID" && f.visible !== false
      );
      if (solid && solid.color) {
        color = this.figmaColorToHex(solid.color);
      }
    }

    const rawWeight = override.fontWeight;
    const resolvedWeight =
      typeof rawWeight === "number"
        ? rawWeight
        : rawWeight
        ? parseInt(String(rawWeight), 10) || defaultWeight
        : defaultWeight;

    return {
      text,
      fontFamily: override.fontFamily || defaultFamily,
      fontSizePt: override.fontSize ? override.fontSize * scale : defaultSize,
      fontWeight: resolvedWeight,
      italic:
        override.italic !== undefined
          ? override.italic
          : override.fontPostScriptName?.toLowerCase().includes("italic") ||
            defaultItalic,
      underline:
        override.textDecoration === "UNDERLINE" ? true : defaultUnderline,
      strike:
        override.textDecoration === "STRIKETHROUGH" ? true : defaultStrike,
      color,
    };
  }

  private extractTextAlign(node: FigmaNode): "left" | "center" | "right" | "justify" {
    const align = node.style?.textAlignHorizontal;
    if (align === "CENTER") return "center";
    if (align === "RIGHT") return "right";
    if (align === "JUSTIFIED") return "justify";
    return "left";
  }

  private figmaColorToHex(c: FigmaColor): string {
    const r = Math.round((c.r ?? 0) * 255);
    const g = Math.round((c.g ?? 0) * 255);
    const b = Math.round((c.b ?? 0) * 255);
    return (
      "#" +
      [r, g, b]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()
    );
  }
}
