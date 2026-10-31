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
import { SvgPath } from "../geometry/svgPathParser.js";
import { decodeBase64, decodeDataUrl } from "../utils/binaryUtils.js";

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

  public parse(input: FigmaNode | FigmaFileResponse | any): CanvasDocument {
    this.resources = {};
    this.imageCounter = 0;
    this.imageRefMap.clear();

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Invalid Figma JSON input: expected a JSON object representing a Figma node, file response, or snapshot.");
    }

    if ("imageMap" in input && input.imageMap && typeof input.imageMap === "object") {
      this.imageMap = { ...input.imageMap, ...this.imageMap };
    }

    let rootNode: FigmaNode;
    if ("figmaNode" in input && input.figmaNode && typeof input.figmaNode === "object") {
      rootNode = input.figmaNode;
    } else if ("document" in input && input.document && typeof input.document === "object") {
      rootNode = input.document;
    } else if ("nodes" in input && input.nodes && typeof input.nodes === "object") {
      const firstEntry = Object.values(input.nodes)[0] as any;
      rootNode = firstEntry?.document || firstEntry;
    } else {
      rootNode = input as FigmaNode;
    }

    if (!rootNode || typeof rootNode !== "object" || (!rootNode.type && !Array.isArray(rootNode.children))) {
      throw new Error("Invalid Figma JSON structure: missing valid root Figma node ('type' or 'children').");
    }

    const documentName =
      this.titleOverride ||
      (input.metadata?.fileName ? String(input.metadata.fileName) : "") ||
      ("name" in input && input.name ? String(input.name) : "") ||
      (rootNode.name ? String(rootNode.name) : "Figma Document");

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

    const primaryWidthPt = pages.length > 0 ? pages[0].bounds.width : 595.28;
    const primaryHeightPt = pages.length > 0 ? pages[0].bounds.height : 841.89;
    const isLandscape = primaryWidthPt > primaryHeightPt;
    const isA4 = Math.abs(primaryWidthPt * primaryHeightPt - 595.28 * 841.89) < 200;
    const pageSizeName = isA4 ? "A4" : "Custom";

    return {
      title: documentName,
      pageSize: {
        name: pageSizeName,
        widthPt: Number(primaryWidthPt.toFixed(2)),
        heightPt: Number(primaryHeightPt.toFixed(2)),
        orientation: isLandscape ? "landscape" : "portrait",
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
      if (!node.children) return;

      if (node.type === "CANVAS") {
        const visChildren = node.children.filter((c) => c.visible !== false);
        const frameChildren = visChildren.filter(
          (c) => c.type === "FRAME" || c.type === "COMPONENT" || c.type === "GROUP"
        );
        const leafChildren = visChildren.filter(
          (c) =>
            c.type === "TEXT" ||
            c.type === "LINE" ||
            c.type === "RECTANGLE" ||
            c.type === "VECTOR" ||
            c.type === "ELLIPSE"
        );
        const allFramesSelected =
          !this.selectedFrameIds ||
          frameChildren.every((f) => this.selectedFrameIds!.has(f.id));
        const allFramesAreShortSections =
          frameChildren.length >= 1 &&
          frameChildren.every(
            (f) =>
              (f.absoluteBoundingBox?.height || 0) > 0 &&
              (f.absoluteBoundingBox?.height || 0) < 500
          );
        const hasMixedLeafAndFrames = leafChildren.length > 0 && frameChildren.length > 0;

        if (
          allFramesSelected &&
          allFramesAreShortSections &&
          (hasMixedLeafAndFrames || frameChildren.length >= 2)
        ) {
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const c of visChildren) {
            const b = c.absoluteBoundingBox;
            if (b) {
              if (b.x < minX) minX = b.x;
              if (b.y < minY) minY = b.y;
              if (b.x + b.width > maxX) maxX = b.x + b.width;
              if (b.y + b.height > maxY) maxY = b.y + b.height;
            }
          }
          if (!isFinite(minX)) {
            minX = 0;
            minY = 0;
            maxX = 794;
            maxY = 1123;
          }
          const spanW = Math.max(794, maxX - minX);
          const spanH = Math.max(maxY - minY + 48, Math.round(spanW * (841.89 / 595.28)));
          candidateFrames.push({
            ...node,
            type: "FRAME",
            absoluteBoundingBox: { x: minX, y: minY, width: spanW, height: spanH },
            children: visChildren,
          });
          return;
        }
      }

      for (const child of node.children) {
        if (child.visible === false) continue;

        if (child.type === "CANVAS") {
          visitCanvasOrDoc(child);
          continue;
        }

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
          // If it is a GROUP, filter out non-screen guide/measurement plugin containers
          if (child.type === "GROUP" && !this.selectedFrameIds) {
            const name = (child.name || "").trim().toLowerCase();
            const hasGuideChildren =
              Array.isArray(child.children) &&
              child.children.some(
                (c) =>
                  c.name &&
                  (c.name.includes("INNER_PADDING") ||
                    c.name.includes("OUTER_SPACING") ||
                    c.name.includes("REDLINE") ||
                    c.name.includes("DIMENSION") ||
                    c.name.includes("GUIDE_LINE"))
              );

            // Avoid false positives: "container" alone is commonly used for legitimate UI groups (e.g. "Main Container").
            // Only filter if it has the measurement ruler emoji "📏", explicit "redline"/"measurement" keywords,
            // or structural proof of guide/padding children.
            const isMeasurementGuide =
              name.includes("📏") ||
              name.includes("redline") ||
              name.includes("measurement") ||
              (name.includes("container") && hasGuideChildren) ||
              hasGuideChildren;

            if (isMeasurementGuide) {
              continue;
            }
          }
          candidateFrames.push(child);
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
   * Synthesizes deterministic absoluteBoundingBox coordinates for child nodes inside
   * Auto-Layout frames (layoutMode: VERTICAL | HORIZONTAL) when absoluteBoundingBox is omitted.
   */
  private synthesizeMissingChildBounds(
    parent: FigmaNode,
    parentBox: { x: number; y: number; width: number; height: number }
  ): void {
    if (!parent.children || parent.children.length === 0) return;

    const pl = (parent as any).paddingLeft || 0;
    const pr = (parent as any).paddingRight || 0;
    const pt = (parent as any).paddingTop || 0;
    const pb = (parent as any).paddingBottom || 0;
    const gap = (parent as any).itemSpacing || 12;
    const layoutMode = (parent as any).layoutMode || "VERTICAL";

    const innerX = parentBox.x + pl;
    const innerY = parentBox.y + pt;
    const innerW = Math.max(20, parentBox.width - pl - pr);
    const innerH = Math.max(16, parentBox.height - pt - pb);

    const visChildren = parent.children.filter((c) => c.visible !== false);
    if (visChildren.length === 0) return;

    if (layoutMode === "HORIZONTAL") {
      let cursorX = innerX;
      const missingCount = visChildren.filter((c) => !c.absoluteBoundingBox).length;
      const usedW = visChildren.reduce(
        (acc, c) => acc + (c.absoluteBoundingBox ? c.absoluteBoundingBox.width + gap : 0),
        0
      );
      const remW = Math.max(40, innerW - usedW);
      const defaultColW =
        missingCount > 0
          ? Math.max(40, (remW - gap * Math.max(0, missingCount - 1)) / missingCount)
          : innerW;

      for (const child of visChildren) {
        if (!child.absoluteBoundingBox) {
          let cw = defaultColW;
          let ch = innerH;
          if (child.type === "TEXT") {
            const fs = child.style?.fontSize || 12;
            const lh = child.style?.lineHeightPx || Math.round(fs * 1.35);
            ch = Math.min(innerH, Math.max(lh + 4, innerH));
          }
          (child as any).absoluteBoundingBox = {
            x: cursorX,
            y: innerY,
            width: cw,
            height: ch,
          };
        }
        const cb = child.absoluteBoundingBox!;
        cursorX = Math.max(cursorX, cb.x + cb.width + gap);
        this.synthesizeMissingChildBounds(child, cb);
      }
    } else {
      let cursorY = innerY;
      for (const child of visChildren) {
        if (!child.absoluteBoundingBox) {
          let cw = innerW;
          let ch = 32;

          if (child.type === "TEXT") {
            const fs = child.style?.fontSize || 12;
            const lh = child.style?.lineHeightPx || Math.round(fs * 1.4);
            const chars = child.characters || "";
            const explicitLines = chars.split(/\r\n|\r|\n/);
            const totalLines = explicitLines.reduce((sum, line) => {
              if (line.length === 0) return sum + 1;
              let lineW = 0;
              for (let i = 0; i < line.length; i++) {
                const code = line.charCodeAt(i);
                if (
                  (code >= 0x1100 && code <= 0x11ff) ||
                  (code >= 0x3130 && code <= 0x318f) ||
                  (code >= 0xac00 && code <= 0xd7a3) ||
                  (code >= 0x4e00 && code <= 0x9fff) ||
                  (code >= 0xff00 && code <= 0xffef)
                ) {
                  lineW += fs * 1.0;
                } else {
                  lineW += fs * 0.55;
                }
              }
              return sum + Math.max(1, Math.ceil(lineW / innerW));
            }, 0);
            cw = innerW;
            ch = Math.max(lh + 4, totalLines * lh + 4);
          } else if (
            child.type === "FRAME" ||
            child.type === "COMPONENT" ||
            child.type === "GROUP"
          ) {
            const cpl = (child as any).paddingLeft || 0;
            const cpr = (child as any).paddingRight || 0;
            const cpt = (child as any).paddingTop || 0;
            const cpb = (child as any).paddingBottom || 0;
            if (
              (child as any).primaryAxisSizingMode === "AUTO" &&
              child.children &&
              child.children.length === 1 &&
              child.children[0].type === "TEXT"
            ) {
              const tNode = child.children[0];
              const fs = tNode.style?.fontSize || 12;
              const lh = tNode.style?.lineHeightPx || Math.round(fs * 1.35);
              const tLen = (tNode.characters || "").length;
              cw = Math.min(innerW, Math.max(60, Math.round(tLen * fs * 0.8 + cpl + cpr + 12)));
              ch = lh + cpt + cpb + 4;
            } else {
              cw = innerW;
              ch = Math.max(48, Math.min(200, innerH - Math.max(0, cursorY - innerY)));
            }
          }

          (child as any).absoluteBoundingBox = {
            x: innerX,
            y: cursorY,
            width: cw,
            height: ch,
          };
        }
        const cb = child.absoluteBoundingBox!;
        cursorY = Math.max(cursorY, cb.y + cb.height + gap);
        this.synthesizeMissingChildBounds(child, cb);
      }
    }
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

    // Synthesize bounds for Auto-Layout child nodes that omit explicit absoluteBoundingBox
    this.synthesizeMissingChildBounds(frame, frameBox);

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

    // Helper to recursively process children with cascading opacity propagation (Phase 33)
    const processChildren = (node: FigmaNode, parentOpacity: number = 1.0) => {
      if (!node.children) return;

      for (const child of node.children) {
        if (child.visible === false) continue;

        const childRawOpacity = typeof child.opacity === "number" ? child.opacity : 1.0;
        const effectiveOpacity = Math.max(0, Math.min(1.0, parentOpacity * childRawOpacity));
        const finalElemOpacity = effectiveOpacity < 1.0 ? effectiveOpacity : (child.opacity !== undefined ? child.opacity : undefined);

        const childBox = child.absoluteBoundingBox;
        if (!childBox) {
          // If no absolute bounding box, still process children if any
          processChildren(child, effectiveOpacity);
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
          const scaleModeRaw = (imageFill as any).scaleMode as
            | "FILL"
            | "FIT"
            | "CROP"
            | "TILE"
            | undefined;
          const imageScaleMode = scaleModeRaw || "FILL";
          let imageCrop:
            | { top: number; bottom: number; left: number; right: number }
            | undefined;

          const transform = (imageFill as any).imageTransform as
            | [[number, number, number], [number, number, number]]
            | undefined;
          if (
            Array.isArray(transform) &&
            transform.length === 2 &&
            Array.isArray(transform[0]) &&
            Array.isArray(transform[1])
          ) {
            const sx = transform[0][0] ?? 1;
            const tx = transform[0][2] ?? 0;
            const sy = transform[1][1] ?? 1;
            const ty = transform[1][2] ?? 0;
            let left = Math.max(0, Math.min(0.95, tx));
            let top = Math.max(0, Math.min(0.95, ty));
            let right = Math.max(0, Math.min(0.95, 1 - (tx + sx)));
            let bottom = Math.max(0, Math.min(0.95, 1 - (ty + sy)));

            if (left === 0 && right === 0 && top === 0 && bottom === 0 && sx > 0 && sy > 0 && (sx !== 1 || sy !== 1)) {
              left = Math.max(0, Math.min(0.95, -tx / sx));
              top = Math.max(0, Math.min(0.95, -ty / sy));
              right = Math.max(0, Math.min(0.95, 1 - (1 - tx) / sx));
              bottom = Math.max(0, Math.min(0.95, 1 - (1 - ty) / sy));
            }

            if (left > 0.001 || top > 0.001 || right > 0.001 || bottom > 0.001) {
              imageCrop = { top, bottom, left, right };
            }
          }

          elements.push({
            id: child.id,
            name: child.name,
            type: "image",
            bounds: { x: xPt, y: yPt, width: wPt, height: hPt },
            zIndex: currentZIndex++,
            rotation: (child as any).rotation,
            opacity: finalElemOpacity,
            style: this.extractStyle(child, scaleX),
            imageRef: resId,
            imageScaleMode,
            imageCrop,
            sourceNodeId: child.id,
            sourceNodeType: child.type,
          });
        } else if (child.type === "TEXT") {
          const textRuns = this.extractTextRuns(child, scaleX);
          const style = this.extractStyle(child, scaleX);
          const align = this.extractTextAlign(child);

          let verticalAlign: "top" | "center" | "bottom" | undefined;
          const vAlignRaw = child.style?.textAlignVertical || (child as any).textAlignVertical;
          if (vAlignRaw === "CENTER") {
            verticalAlign = "center";
          } else if (vAlignRaw === "BOTTOM") {
            verticalAlign = "bottom";
          } else if (vAlignRaw === "TOP") {
            verticalAlign = "top";
          }

          let isCenteredInParent = false;
          let textYPt = yPt;
          let textHPt = hPt;
          const parentBox = node.absoluteBoundingBox;

          // Check if text is vertically centered in parent container (badge, button, table cell, row)
          if (
            node.id !== frame.id &&
            parentBox &&
            childBox &&
            parentBox.height < 600 &&
            parentBox.height > childBox.height + 2
          ) {
            const topGap = childBox.y - parentBox.y;
            const bottomGap = (parentBox.y + parentBox.height) - (childBox.y + childBox.height);
            const isSymmetric = Math.abs(topGap - bottomGap) <= 2.5;

            // Only consider centered if parent is NOT a vertical stack of multiple children
            const isVerticalStack =
              (node as any).layoutMode === "VERTICAL" &&
              node.children &&
              node.children.length > 1;

            if (isSymmetric && !isVerticalStack) {
              isCenteredInParent = true;
              verticalAlign = "center";
              const parentRelY = parentBox.y - frameBox.y;
              textYPt = parentRelY * scaleY;
              textHPt = parentBox.height * scaleY;
            }
          }

          // For Figma TEXT nodes, 'fills' represents character font colors (stored in textRuns),
          // NOT a container background fill. Remove fillColor so the text box has a transparent background.
          delete style.fillColor;
          delete style.fillOpacity;

          const padTop = ((child as any).paddingTop || 0) * scaleY;
          const padRight = ((child as any).paddingRight || 0) * scaleX;
          const padBottom = ((child as any).paddingBottom || 0) * scaleY;
          const padLeft = ((child as any).paddingLeft || 0) * scaleX;
          const innerPaddingPt =
            padTop > 0 || padRight > 0 || padBottom > 0 || padLeft > 0
              ? { top: padTop, right: padRight, bottom: padBottom, left: padLeft }
              : undefined;

          const rawTar = (child.style as any)?.textAutoResize || (child as any).textAutoResize;
          const textAutoResize: "NONE" | "HEIGHT" | "WIDTH_AND_HEIGHT" | "TRUNCATE" | undefined =
            rawTar === "HEIGHT" || rawTar === "WIDTH_AND_HEIGHT" || rawTar === "NONE" || rawTar === "TRUNCATE"
              ? rawTar
              : undefined;

          elements.push({
            id: child.id,
            name: child.name,
            type: "text",
            bounds: { x: xPt, y: textYPt, width: wPt, height: textHPt },
            zIndex: currentZIndex++,
            rotation: (child as any).rotation,
            opacity: finalElemOpacity,
            style,
            textRuns,
            paragraphAlign: align,
            verticalAlign,
            innerPaddingPt,
            textAutoResize,
            contentHeightPt: isCenteredInParent ? hPt : undefined,
            sourceNodeId: child.id,
            sourceNodeType: child.type,
          });
        } else if (child.type === "LINE") {
          let lineW = wPt;
          let lineH = hPt;
          const rawRot = (child as any).rotation;
          if (typeof rawRot === "number" && lineW > 0 && lineH === 0) {
            const absRot = Math.abs(rawRot);
            if (Math.abs(absRot - Math.PI / 2) < 0.1 || Math.abs(absRot - 90) < 5) {
              lineH = lineW;
              lineW = 0;
            }
          }
          elements.push({
            id: child.id,
            name: child.name,
            type: "line",
            bounds: {
              x: xPt,
              y: yPt,
              width: lineW,
              height: lineW === 0 && lineH > 0 ? lineH : Math.max(lineH, 1),
            },
            zIndex: currentZIndex++,
            rotation: rawRot,
            opacity: finalElemOpacity,
            style: this.extractStyle(child, scaleX),
            sourceNodeId: child.id,
            sourceNodeType: child.type,
          });
        } else if (child.type === "ELLIPSE") {
          const style = this.extractStyle(child, scaleX);
          const hasFill = !!style.fillColor;
          const hasStroke = !!style.strokeColor && (style.strokeWidth || 0) > 0;
          if (hasFill || hasStroke) {
            const arcData = (child as any).arcData as
              | { startingAngle?: number; endingAngle?: number; innerRadius?: number }
              | undefined;
            const innerRadius = arcData?.innerRadius ?? 0;
            const startAngle = arcData?.startingAngle ?? 0;
            const endAngle = arcData?.endingAngle ?? Math.PI * 2;
            const sweepDelta = endAngle - startAngle;
            const isPartialArc =
              arcData !== undefined &&
              Math.abs(Math.abs(sweepDelta) - Math.PI * 2) > 0.01;
            const isDonutOrSector = innerRadius > 0.001 || isPartialArc;

            if (isDonutOrSector && Math.abs(sweepDelta) > 1e-4) {
              const rawPath = this.buildEllipseArcSvgPath(
                startAngle,
                endAngle,
                innerRadius
              );
              const parsed = SvgPath.parse(rawPath);
              const unitBounds = {
                minX: 0,
                minY: 0,
                maxX: 1000,
                maxY: 1000,
                width: 1000,
                height: 1000,
              };
              const vmlPath = parsed.toVmlPath(1000, 1000, unitBounds);
              const wHwpu = Math.max(10, Math.round(wPt * 100));
              const hHwpu = Math.max(10, Math.round(hPt * 100));
              const vectorSubpaths = parsed.toHwpxSubpathsWithClosed(
                wHwpu,
                hHwpu,
                6,
                unitBounds
              );
              const vectorPoints = vectorSubpaths.flatMap((s) => s.points);

              elements.push({
                id: child.id,
                name: child.name,
                type: "vector",
                bounds: { x: xPt, y: yPt, width: wPt, height: hPt },
                zIndex: currentZIndex++,
                rotation: (child as any).rotation,
                opacity: finalElemOpacity,
                style,
                vectorPath: vmlPath,
                rawSvgPath: rawPath,
                vectorPoints,
                vectorSubpaths,
                sourceNodeId: child.id,
                sourceNodeType: child.type,
              });
            } else {
              elements.push({
                id: child.id,
                name: child.name,
                type: "oval",
                bounds: { x: xPt, y: yPt, width: wPt, height: hPt },
                zIndex: currentZIndex++,
                rotation: (child as any).rotation,
                opacity: finalElemOpacity,
                style,
                sourceNodeId: child.id,
                sourceNodeType: child.type,
              });
            }
          }
          processChildren(child, effectiveOpacity);
        } else if (
          child.type === "VECTOR" ||
          child.type === "STAR" ||
          child.type === "POLYGON" ||
          child.type === "BOOLEAN_OPERATION"
        ) {
          const style = this.extractStyle(child, scaleX);
          const hasFill = !!style.fillColor;
          const hasStroke = !!style.strokeColor && (style.strokeWidth || 0) > 0;

          if (hasFill || hasStroke) {
            const parentName = node.name || "";
            const nodeName = child.name || "";
            let rawPath = "";

            if ((child as any).fillGeometry?.[0]?.path) {
              rawPath = (child as any).fillGeometry[0].path;
            } else if ((child as any).strokeGeometry?.[0]?.path) {
              rawPath = (child as any).strokeGeometry[0].path;
            } else if ((child as any).vectorPaths?.[0]?.data) {
              rawPath = (child as any).vectorPaths[0].data;
            } else if (child.type === "STAR") {
              rawPath = "M 500 0 L 618 353 L 990 353 L 689 572 L 804 925 L 500 706 L 196 925 L 311 572 L 10 353 L 382 353 Z";
            } else if (child.type === "POLYGON") {
              rawPath = "M 500 0 L 1000 866 L 0 866 Z";
            } else {
              // Standard UI icon path normalization (SVG format)
              const nameLower = (parentName + " " + nodeName).toLowerCase();
              if (nameLower.includes("alert") || nameLower.includes("warn") || nameLower.includes("triangle")) {
                rawPath = "M 500 60 L 950 920 L 50 920 Z M 500 380 L 500 640 M 500 780 L 500 840";
              } else if (nameLower.includes("check") || nameLower.includes("tick")) {
                rawPath = "M 150 520 L 400 780 L 880 180";
              } else if (nameLower.includes("info")) {
                rawPath = "M 500 50 C 748 50 950 252 950 500 C 950 748 748 950 500 950 C 252 950 50 748 50 500 C 50 252 252 50 500 50 Z M 500 280 L 500 340 M 500 460 L 500 740";
              } else if (nameLower.includes("file") || nameLower.includes("doc")) {
                rawPath = "M 200 80 L 620 80 L 820 280 L 820 920 L 200 920 Z M 620 80 L 620 280 L 820 280 M 340 480 L 680 480 M 340 640 L 680 640";
              }
            }

            let vmlPath = "";
            let vectorPoints: { x: number; y: number }[] | undefined;
            let vectorSubpaths: { points: { x: number; y: number }[]; closed: boolean }[] | undefined;

            if (rawPath) {
              const parsed = SvgPath.parse(rawPath);
              vmlPath = parsed.toVmlPath(1000, 1000);
              const wHwpu = Math.max(10, Math.round(wPt * 100));
              const hHwpu = Math.max(10, Math.round(hPt * 100));
              vectorSubpaths = parsed.toHwpxSubpathsWithClosed(wHwpu, hHwpu);
              vectorPoints = vectorSubpaths.flatMap((s) => s.points);
            }

            elements.push({
              id: child.id,
              name: child.name,
              type: "vector",
              bounds: { x: xPt, y: yPt, width: wPt, height: hPt },
              zIndex: currentZIndex++,
              rotation: (child as any).rotation,
              opacity: child.opacity,
              style,
              vectorPath: vmlPath,
              rawSvgPath: rawPath,
              vectorPoints,
              vectorSubpaths,
              sourceNodeId: child.id,
              sourceNodeType: child.type,
            });
          }
          processChildren(child, effectiveOpacity);
        } else if (
          child.type === "RECTANGLE" ||
          child.type === "FRAME" ||
          child.type === "COMPONENT" ||
          child.type === "INSTANCE"
        ) {
          const style = this.extractStyle(child, scaleX);
          const hasFill = !!style.fillColor;
          const hasStroke = !!style.strokeColor && (style.strokeWidth || 0) > 0;

          const bs = style.borderSides;
          const isPartialBorder =
            hasStroke &&
            bs !== undefined &&
            ((bs.top ?? 0) === 0 ||
              (bs.right ?? 0) === 0 ||
              (bs.bottom ?? 0) === 0 ||
              (bs.left ?? 0) === 0);

          if (isPartialBorder) {
            // 1. If has background fill, emit a card with fill only (no 4-sided stroke)
            if (hasFill) {
              elements.push({
                id: child.id,
                name: child.name,
                type: "card",
                bounds: { x: xPt, y: yPt, width: wPt, height: hPt },
                zIndex: currentZIndex++,
                rotation: (child as any).rotation,
                opacity: finalElemOpacity,
                style: {
                  fillColor: style.fillColor,
                  fillOpacity: style.fillOpacity,
                  cornerRadius: style.cornerRadius,
                  cornerRadii: style.cornerRadii,
                  shadow: style.shadow,
                },
                sourceNodeId: child.id,
                sourceNodeType: child.type,
              });
            }

            // 2. Emit separate line elements for the active border sides
            const strokeColor = style.strokeColor;
            const strokeDashed = style.strokeDashed;

            if ((bs.bottom ?? 0) > 0) {
              elements.push({
                id: `${child.id}_b`,
                name: `${child.name || "border"}_bottom`,
                type: "line",
                bounds: { x: xPt, y: yPt + hPt, width: wPt, height: 1 },
                zIndex: currentZIndex++,
                rotation: 0,
                opacity: finalElemOpacity,
                style: {
                  strokeColor,
                  strokeWidth: bs.bottom,
                  strokeDashed,
                },
                sourceNodeId: child.id,
                sourceNodeType: child.type,
              });
            }
            if ((bs.top ?? 0) > 0) {
              elements.push({
                id: `${child.id}_t`,
                name: `${child.name || "border"}_top`,
                type: "line",
                bounds: { x: xPt, y: yPt, width: wPt, height: 1 },
                zIndex: currentZIndex++,
                rotation: 0,
                opacity: finalElemOpacity,
                style: {
                  strokeColor,
                  strokeWidth: bs.top,
                  strokeDashed,
                },
                sourceNodeId: child.id,
                sourceNodeType: child.type,
              });
            }
            if ((bs.left ?? 0) > 0) {
              elements.push({
                id: `${child.id}_l`,
                name: `${child.name || "border"}_left`,
                type: "line",
                bounds: { x: xPt, y: yPt, width: 1, height: hPt },
                zIndex: currentZIndex++,
                rotation: 0,
                opacity: finalElemOpacity,
                style: {
                  strokeColor,
                  strokeWidth: bs.left,
                  strokeDashed,
                },
                sourceNodeId: child.id,
                sourceNodeType: child.type,
              });
            }
            if ((bs.right ?? 0) > 0) {
              elements.push({
                id: `${child.id}_r`,
                name: `${child.name || "border"}_right`,
                type: "line",
                bounds: { x: xPt + wPt, y: yPt, width: 1, height: hPt },
                zIndex: currentZIndex++,
                rotation: 0,
                opacity: finalElemOpacity,
                style: {
                  strokeColor,
                  strokeWidth: bs.right,
                  strokeDashed,
                },
                sourceNodeId: child.id,
                sourceNodeType: child.type,
              });
            }
          } else if (hasFill || hasStroke) {
            elements.push({
              id: child.id,
              name: child.name,
              type: "card",
              bounds: { x: xPt, y: yPt, width: wPt, height: hPt },
              zIndex: currentZIndex++,
              rotation: (child as any).rotation,
              opacity: finalElemOpacity,
              style,
              sourceNodeId: child.id,
              sourceNodeType: child.type,
            });
          }

          // Process nested children inside this container
          processChildren(child, effectiveOpacity);
        } else if (child.type === "GROUP") {
          processChildren(child, effectiveOpacity);
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
              opacity: finalElemOpacity,
              style,
              sourceNodeId: child.id,
              sourceNodeType: child.type,
            });
          }
          processChildren(child, effectiveOpacity);
        }
      }
    };

    processChildren(frame);

    // Sort elements by zIndex
    elements.sort((a, b) => a.zIndex - b.zIndex);

    return {
      pageNumber,
      name: frame.name || `Page ${pageNumber}`,
      frameId: frame.id,
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

    let data: Uint8Array;
    let mimeType = "image/png";

    if (dataUrl && dataUrl.startsWith("data:")) {
      const decoded = decodeDataUrl(dataUrl);
      if (decoded) {
        mimeType = decoded.mime || "image/png";
        data = decoded.bytes;
      } else {
        data = new Uint8Array(0);
      }
    } else {
      // 1x1 transparent placeholder
      data = decodeBase64(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
      );
    }

    this.resources[resId] = {
      id: resId,
      name: resId,
      mimeType,
      data,
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
    const rawWeight = typeof node.strokeWeight === "number" ? node.strokeWeight : 1;
    const isw = (node as any).individualStrokeWeights as
      | { top?: number; right?: number; bottom?: number; left?: number }
      | undefined;

    let hasNonZeroWeight = rawWeight > 0;
    if (isw) {
      style.borderSides = {
        top: typeof isw.top === "number" ? isw.top * scale : undefined,
        right: typeof isw.right === "number" ? isw.right * scale : undefined,
        bottom: typeof isw.bottom === "number" ? isw.bottom * scale : undefined,
        left: typeof isw.left === "number" ? isw.left * scale : undefined,
      };
      hasNonZeroWeight =
        (style.borderSides.top ?? 0) > 0 ||
        (style.borderSides.right ?? 0) > 0 ||
        (style.borderSides.bottom ?? 0) > 0 ||
        (style.borderSides.left ?? 0) > 0;
    }

    if (hasNonZeroWeight && node.strokes && node.strokes.length > 0) {
      const stroke = node.strokes.find(
        (s) => s.type === "SOLID" && s.visible !== false
      );
      if (stroke && stroke.color) {
        style.strokeColor = this.figmaColorToHex(stroke.color);
        style.strokeWidth = rawWeight * scale;
        const dashes = (node as any).strokeDashes;
        if (dashes && dashes.length > 0) {
          style.strokeDashed = true;
        }
        if (node.strokeAlign === "INSIDE" || node.strokeAlign === "OUTSIDE" || node.strokeAlign === "CENTER") {
          style.strokeAlign = node.strokeAlign;
        } else {
          style.strokeAlign = "INSIDE";
        }
      }
    }

    // 3. Corner Radius
    if (
      Array.isArray(node.rectangleCornerRadii) &&
      node.rectangleCornerRadii.length === 4
    ) {
      const radii = node.rectangleCornerRadii.map((r) => (r || 0) * scale) as [
        number,
        number,
        number,
        number
      ];
      style.cornerRadii = radii;
      const nonZero = radii.filter((r) => r > 0);
      if (nonZero.length > 0) {
        style.cornerRadius = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
      }
    } else if (node.cornerRadius) {
      style.cornerRadius = node.cornerRadius * scale;
    }

    // 4. Drop Shadow Effect
    if (node.effects && Array.isArray(node.effects)) {
      const shadowEffect = node.effects.find(
        (e: any) => e.type === "DROP_SHADOW" && e.visible !== false
      );
      if (shadowEffect && shadowEffect.color) {
        style.shadow = {
          color: this.figmaColorToHex(shadowEffect.color),
          opacity:
            typeof shadowEffect.color.a === "number"
              ? shadowEffect.color.a
              : 1.0,
          offsetX: (shadowEffect.offset?.x || 0) * scale,
          offsetY: (shadowEffect.offset?.y || 0) * scale,
          blur: (shadowEffect.radius || 0) * scale,
          spread: (shadowEffect.spread || 0) * scale,
        };
      }
    }

    return style;
  }

  /**
   * Builds an exact SVG path in [0..1000, 0..1000] coordinate space for an ELLIPSE node
   * that defines Figma arcData (donut sector or pie slice).
   */
  private buildEllipseArcSvgPath(
    startAngle: number,
    endAngle: number,
    innerRadius: number
  ): string {
    const cx = 500;
    const cy = 500;
    const outerR = 500;
    const innerR = Math.max(0, Math.min(499, outerR * innerRadius));
    const delta = endAngle - startAngle;
    const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
    const dTheta = delta / segments;
    const alpha = (4 / 3) * Math.tan(dTheta / 4);

    const parts: string[] = [];

    const x0 = cx + outerR * Math.cos(startAngle);
    const y0 = cy + outerR * Math.sin(startAngle);
    parts.push(`M ${x0.toFixed(3)} ${y0.toFixed(3)}`);

    for (let i = 0; i < segments; i++) {
      const t0 = startAngle + i * dTheta;
      const t1 = t0 + dTheta;
      const p0x = cx + outerR * Math.cos(t0);
      const p0y = cy + outerR * Math.sin(t0);
      const p1x = cx + outerR * Math.cos(t1);
      const p1y = cy + outerR * Math.sin(t1);
      const cp1x = p0x - alpha * outerR * Math.sin(t0);
      const cp1y = p0y + alpha * outerR * Math.cos(t0);
      const cp2x = p1x + alpha * outerR * Math.sin(t1);
      const cp2y = p1y - alpha * outerR * Math.cos(t1);
      parts.push(
        `C ${cp1x.toFixed(3)} ${cp1y.toFixed(3)} ${cp2x.toFixed(3)} ${cp2y.toFixed(3)} ${p1x.toFixed(3)} ${p1y.toFixed(3)}`
      );
    }

    if (innerR > 0.5) {
      const ixEnd = cx + innerR * Math.cos(endAngle);
      const iyEnd = cy + innerR * Math.sin(endAngle);
      parts.push(`L ${ixEnd.toFixed(3)} ${iyEnd.toFixed(3)}`);

      const revAlpha = -alpha;
      for (let i = 0; i < segments; i++) {
        const t0 = endAngle - i * dTheta;
        const t1 = t0 - dTheta;
        const p0x = cx + innerR * Math.cos(t0);
        const p0y = cy + innerR * Math.sin(t0);
        const p1x = cx + innerR * Math.cos(t1);
        const p1y = cy + innerR * Math.sin(t1);
        const cp1x = p0x - revAlpha * innerR * Math.sin(t0);
        const cp1y = p0y + revAlpha * innerR * Math.cos(t0);
        const cp2x = p1x + revAlpha * innerR * Math.sin(t1);
        const cp2y = p1y - revAlpha * innerR * Math.cos(t1);
        parts.push(
          `C ${cp1x.toFixed(3)} ${cp1y.toFixed(3)} ${cp2x.toFixed(3)} ${cp2y.toFixed(3)} ${p1x.toFixed(3)} ${p1y.toFixed(3)}`
        );
      }
      parts.push("Z");
    } else {
      parts.push(`L ${cx} ${cy} Z`);
    }

    return parts.join(" ");
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

    const lineHeightUnit = (node.style as any)?.lineHeightUnit as string | undefined;
    let defaultLineHeightPt: number | undefined;
    if (lineHeightUnit !== "INTRINSIC_%") {
      if (typeof node.style?.lineHeightPx === "number" && node.style.lineHeightPx > 0) {
        defaultLineHeightPt = node.style.lineHeightPx * scale;
      } else if (
        typeof (node.style as any)?.lineHeightPercentFontSize === "number" &&
        (node.style as any).lineHeightPercentFontSize > 0
      ) {
        defaultLineHeightPt =
          defaultFontSize * ((node.style as any).lineHeightPercentFontSize / 100);
      }
    }

    const defaultLetterSpacingPt =
      typeof node.style?.letterSpacing === "number" && node.style.letterSpacing !== 0
        ? node.style.letterSpacing * scale
        : undefined;

    // Text color from fills (or style.fills fallback in simplified fixtures)
    let defaultColor = "#000000";
    const textFills =
      node.fills && node.fills.length > 0
        ? node.fills
        : ((node.style as any)?.fills as any[] | undefined);
    if (textFills && textFills.length > 0) {
      const solid = textFills.find(
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
                defaultLineHeightPt,
                defaultLetterSpacingPt,
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
            defaultLineHeightPt,
            defaultLetterSpacingPt,
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
        lineHeightPt: defaultLineHeightPt,
        letterSpacingPt: defaultLetterSpacingPt,
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
    defaultLineHeightPt: number | undefined,
    defaultLetterSpacingPt: number | undefined,
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
        lineHeightPt: defaultLineHeightPt,
        letterSpacingPt: defaultLetterSpacingPt,
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

    let lineHeightPt = defaultLineHeightPt;
    if (override.lineHeightUnit !== "INTRINSIC_%") {
      if (typeof override.lineHeightPx === "number" && override.lineHeightPx > 0) {
        lineHeightPt = override.lineHeightPx * scale;
      }
    }

    const letterSpacingPt =
      typeof override.letterSpacing === "number" && override.letterSpacing !== 0
        ? override.letterSpacing * scale
        : defaultLetterSpacingPt;

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
      lineHeightPt,
      letterSpacingPt,
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
