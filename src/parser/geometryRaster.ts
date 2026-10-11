/**
 * Step 10C: geometry-cluster preservation.
 *
 * Figma charts, progress bars and similar widgets are exported as groups of plain RECTANGLE and
 * straight-line VECTOR nodes without any text. The Word renderer intentionally drops contentless
 * shapes (decorative-shape minimization), so such widgets vanished completely.
 *
 * This module detects a container whose visible subtree consists ONLY of geometry that can be
 * reproduced exactly from node data (boxes, rounded boxes, axis-aligned lines) and rasterizes it
 * into a PNG using the absolute bounding boxes, fills (with stacked paint + opacity), strokes and
 * corner radii found in the snapshot. Nodes whose real outline is unknown (free-form VECTOR paths,
 * ellipses, rotated rectangles, gradients, images, text) disqualify the cluster, so no shape is ever
 * invented. It is dependency free (no zlib / Buffer) so it also runs inside the browser bundle.
 */
import { FigmaNode, FigmaPaint } from "./types.js";

const CONTAINER_TYPES = new Set(["FRAME", "GROUP", "INSTANCE", "COMPONENT", "SECTION"]);
const LINE_EPSILON = 0.5; // px: bbox extent at or below this is a straight line
const MAX_DIMENSION_PX = 2000;
const MAX_DEVICE_PIXELS = 1_600_000;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface ClipBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BoxOp {
  x: number;
  y: number;
  w: number;
  h: number;
  radii: [number, number, number, number]; // top-left, top-right, bottom-right, bottom-left
  fills: Rgba[];
  stroke?: { color: Rgba; weight: number; align: "INSIDE" | "CENTER" | "OUTSIDE" };
  alpha: number;
  clip?: ClipBox;
}

export interface GeometryCluster {
  width: number;
  height: number;
  ops: BoxOp[];
  leafCount: number;
  offsetX?: number;
  offsetY?: number;
}

export interface GeometryRaster {
  dataUrl: string;
  width: number;
  height: number;
  leafCount: number;
  opCount: number;
}

function visibleChildren(node: FigmaNode): FigmaNode[] {
  return (node.children ?? []).filter((c) => c.visible !== false);
}

function solidOf(paint: FigmaPaint): Rgba | null {
  if (paint.type !== "SOLID" || !paint.color) return null;
  const a = (paint.opacity ?? 1) * (paint.color.a ?? 1);
  return {
    r: Math.round(paint.color.r * 255),
    g: Math.round(paint.color.g * 255),
    b: Math.round(paint.color.b * 255),
    a,
  };
}

/** Returns visible solid paints in paint order, or null when an unsupported paint is visible. */
function solidPaints(paints?: FigmaPaint[]): Rgba[] | null {
  const result: Rgba[] = [];
  for (const paint of paints ?? []) {
    if (paint.visible === false) continue;
    const solid = solidOf(paint);
    if (!solid) return null; // IMAGE, gradients, ...
    if (solid.a > 0) result.push(solid);
  }
  return result;
}

function isLineLike(node: FigmaNode): boolean {
  if (node.type !== "VECTOR" && node.type !== "LINE") return false;
  const box = node.absoluteBoundingBox;
  if (!box) return false;
  const thin = box.width <= LINE_EPSILON || box.height <= LINE_EPSILON;
  const longEnough = box.width > LINE_EPSILON || box.height > LINE_EPSILON;
  return thin && longEnough;
}

function strokeAlignOf(node: FigmaNode): "INSIDE" | "CENTER" | "OUTSIDE" {
  const align = (node as { strokeAlign?: string }).strokeAlign;
  return align === "CENTER" || align === "OUTSIDE" ? align : "INSIDE";
}

interface ClipRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface RawBoxOp {
  absX: number;
  absY: number;
  absW: number;
  absH: number;
  radii: [number, number, number, number];
  fills: Rgba[];
  stroke?: { color: Rgba; weight: number; align: "INSIDE" | "CENTER" | "OUTSIDE" };
  alpha: number;
  clipRect?: ClipRect;
  visualBounds: ClipRect;
}

/**
 * Step 11C: Analyze a node. Returns paint operations with precise Union AABB
 * and clipping boundaries preserved, preventing outer strokes and protruding
 * children from being clipped.
 */
export function analyzeGeometryCluster(root: FigmaNode): GeometryCluster | null {
  if (!CONTAINER_TYPES.has(root.type)) return null;
  const rootBox = root.absoluteBoundingBox;
  if (!rootBox || rootBox.width < 40 || rootBox.height < 4) return null;
  if (rootBox.width > MAX_DIMENSION_PX || rootBox.height > MAX_DIMENSION_PX) return null;
  if (visibleChildren(root).length === 0) return null;

  const rawOps: RawBoxOp[] = [];
  let leafCount = 0;
  let supported = true;

  const visit = (node: FigmaNode, inheritedAlpha: number, parentClip: ClipRect | null): void => {
    if (!supported || node.visible === false) return;
    if (node.type === "TEXT") {
      supported = false;
      return;
    }
    const box = node.absoluteBoundingBox;
    if (!box) {
      if (CONTAINER_TYPES.has(node.type) && visibleChildren(node).length === 0) return;
      supported = false;
      return;
    }

    const fills = solidPaints(node.fills);
    const strokes = solidPaints(node.strokes);
    if (fills === null || strokes === null) {
      supported = false;
      return;
    }
    const alpha = inheritedAlpha * (node.opacity ?? 1);
    const kids = visibleChildren(node);
    const isContainer = CONTAINER_TYPES.has(node.type);
    const rotation = (node as { rotation?: number }).rotation ?? 0;

    // Clipping hierarchy: if this container clipsContent, compute intersected clip rect
    let currentClip = parentClip;
    if (isContainer && node.clipsContent === true) {
      const nodeClip: ClipRect = {
        x0: box.x,
        y0: box.y,
        x1: box.x + box.width,
        y1: box.y + box.height,
      };
      currentClip = parentClip
        ? {
            x0: Math.max(parentClip.x0, nodeClip.x0),
            y0: Math.max(parentClip.y0, nodeClip.y0),
            x1: Math.min(parentClip.x1, nodeClip.x1),
            y1: Math.min(parentClip.y1, nodeClip.y1),
          }
        : nodeClip;
    }

    const radiiOf = (): [number, number, number, number] => {
      const per = node.rectangleCornerRadii;
      if (per && per.length === 4) return [per[0], per[1], per[2], per[3]];
      const r = node.cornerRadius ?? 0;
      return [r, r, r, r];
    };

    const buildRawBoxOp = (): RawBoxOp => {
      let strokeDef: { color: Rgba; weight: number; align: "INSIDE" | "CENTER" | "OUTSIDE" } | undefined;
      let eo = 0;
      if (strokes.length > 0) {
        const top = strokes[strokes.length - 1];
        const weight = node.strokeWeight ?? 1;
        const align = strokeAlignOf(node);
        strokeDef = { color: top, weight, align };
        eo = align === "INSIDE" ? 0 : align === "CENTER" ? weight / 2 : weight;
      }

      const vx0 = box.x - eo;
      const vy0 = box.y - eo;
      const vx1 = box.x + box.width + eo;
      const vy1 = box.y + box.height + eo;

      let visualBounds: ClipRect = { x0: vx0, y0: vy0, x1: vx1, y1: vy1 };
      if (currentClip) {
        visualBounds = {
          x0: Math.max(vx0, currentClip.x0),
          y0: Math.max(vy0, currentClip.y0),
          x1: Math.min(vx1, currentClip.x1),
          y1: Math.min(vy1, currentClip.y1),
        };
      }

      return {
        absX: box.x,
        absY: box.y,
        absW: box.width,
        absH: box.height,
        radii: radiiOf(),
        fills,
        stroke: strokeDef,
        alpha,
        clipRect: currentClip ?? undefined,
        visualBounds,
      };
    };

    if (isContainer && kids.length > 0) {
      if (fills.length > 0 || strokes.length > 0) rawOps.push(buildRawBoxOp());
      for (const child of kids) visit(child, alpha, currentClip);
      return;
    }

    // Leaf nodes
    if (isLineLike(node)) {
      if (strokes.length === 0) return;
      const weight = node.strokeWeight ?? 1;
      const color = strokes[strokes.length - 1];
      const horizontal = box.height <= LINE_EPSILON;
      const absX = horizontal ? box.x : box.x - weight / 2;
      const absY = horizontal ? box.y - weight / 2 : box.y;
      const absW = horizontal ? box.width : weight;
      const absH = horizontal ? weight : box.height;

      let visualBounds: ClipRect = { x0: absX, y0: absY, x1: absX + absW, y1: absY + absH };
      if (currentClip) {
        visualBounds = {
          x0: Math.max(visualBounds.x0, currentClip.x0),
          y0: Math.max(visualBounds.y0, currentClip.y0),
          x1: Math.min(visualBounds.x1, currentClip.x1),
          y1: Math.min(visualBounds.y1, currentClip.y1),
        };
      }

      rawOps.push({
        absX,
        absY,
        absW,
        absH,
        radii: [0, 0, 0, 0],
        fills: [color],
        alpha,
        clipRect: currentClip ?? undefined,
        visualBounds,
      });
      leafCount++;
      return;
    }

    if (isContainer) {
      if (fills.length === 0 && strokes.length === 0) return;
      if (Math.abs(rotation) > 1e-3) {
        supported = false;
        return;
      }
      rawOps.push(buildRawBoxOp());
      leafCount++;
      return;
    }

    const rectangleLike =
      node.type === "RECTANGLE" ||
      (node.type === "VECTOR" &&
        (node.cornerRadius !== undefined || node.rectangleCornerRadii !== undefined));
    if (!rectangleLike || Math.abs(rotation) > 1e-3) {
      supported = false;
      return;
    }
    if (fills.length === 0 && strokes.length === 0) return;
    rawOps.push(buildRawBoxOp());
    leafCount++;
  };

  // Root clipping context: if root has clipsContent === true, initial clip is rootBox
  const rootClip: ClipRect | null = root.clipsContent === true
    ? { x0: rootBox.x, y0: rootBox.y, x1: rootBox.x + rootBox.width, y1: rootBox.y + rootBox.height }
    : null;

  const rootFills = solidPaints(root.fills);
  const rootStrokes = solidPaints(root.strokes);
  if (rootFills === null || rootStrokes === null) return null;
  visit(root, 1, rootClip);

  if (!supported) return null;
  if (leafCount === 0) return null;
  const rootPaints = rootFills.length > 0 || rootStrokes.length > 0 ? 1 : 0;
  if (leafCount + rootPaints < 2) return null;

  // Root visual boundary (considering root stroke)
  let rootEo = 0;
  if (rootStrokes.length > 0) {
    const rAlign = strokeAlignOf(root);
    const rWeight = root.strokeWeight ?? 1;
    rootEo = rAlign === "INSIDE" ? 0 : rAlign === "CENTER" ? rWeight / 2 : rWeight;
  }
  const rootVisual: ClipRect = {
    x0: rootBox.x - rootEo,
    y0: rootBox.y - rootEo,
    x1: rootBox.x + rootBox.width + rootEo,
    y1: rootBox.y + rootBox.height + rootEo,
  };

  // Compute final Union AABB bounds
  let minX = rootVisual.x0;
  let minY = rootVisual.y0;
  let maxX = rootVisual.x1;
  let maxY = rootVisual.y1;

  if (root.clipsContent !== true) {
    // Unclipped root: expand canvas to union AABB of root and all visible ops
    for (const ro of rawOps) {
      if (ro.visualBounds.x1 > ro.visualBounds.x0 && ro.visualBounds.y1 > ro.visualBounds.y0) {
        minX = Math.min(minX, ro.visualBounds.x0);
        minY = Math.min(minY, ro.visualBounds.y0);
        maxX = Math.max(maxX, ro.visualBounds.x1);
        maxY = Math.max(maxY, ro.visualBounds.y1);
      }
    }
  }

  const finalWidth = Math.ceil(maxX - minX);
  const finalHeight = Math.ceil(maxY - minY);
  if (finalWidth > MAX_DIMENSION_PX || finalHeight > MAX_DIMENSION_PX) return null;

  // Transform rawOps into relative BoxOps based on new origin (minX, minY)
  const ops: BoxOp[] = [];
  for (const ro of rawOps) {
    // If op is completely clipped out, skip
    if (ro.clipRect && (ro.visualBounds.x1 <= ro.visualBounds.x0 || ro.visualBounds.y1 <= ro.visualBounds.y0)) {
      continue;
    }
    const op: BoxOp = {
      x: ro.absX - minX,
      y: ro.absY - minY,
      w: ro.absW,
      h: ro.absH,
      radii: ro.radii,
      fills: ro.fills,
      stroke: ro.stroke,
      alpha: ro.alpha,
    };
    if (ro.clipRect) {
      op.clip = {
        x: ro.clipRect.x0 - minX,
        y: ro.clipRect.y0 - minY,
        w: ro.clipRect.x1 - ro.clipRect.x0,
        h: ro.clipRect.y1 - ro.clipRect.y0,
      };
    }
    ops.push(op);
  }

  return {
    width: finalWidth,
    height: finalHeight,
    ops,
    leafCount,
    offsetX: minX - rootBox.x,
    offsetY: minY - rootBox.y,
  };
}

// ---------------------------------------------------------------------------------------------
// Rasterization
// ---------------------------------------------------------------------------------------------

function boxCoverage(x0: number, y0: number, x1: number, y1: number, px: number, py: number): number {
  const ox = Math.min(x1, px + 1) - Math.max(x0, px);
  const oy = Math.min(y1, py + 1) - Math.max(y0, py);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

type Radii = [number, number, number, number];

interface RoundedBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  radii: Radii;
}

function insideRounded(x: number, y: number, s: RoundedBox): boolean {
  if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) return false;
  const [tl, tr, br, bl] = s.radii;
  const corner = (r: number, cx: number, cy: number): boolean => {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };
  if (tl > 0 && x < s.x0 + tl && y < s.y0 + tl) return corner(tl, s.x0 + tl, s.y0 + tl);
  if (tr > 0 && x > s.x1 - tr && y < s.y0 + tr) return corner(tr, s.x1 - tr, s.y0 + tr);
  if (br > 0 && x > s.x1 - br && y > s.y1 - br) return corner(br, s.x1 - br, s.y1 - br);
  if (bl > 0 && x < s.x0 + bl && y > s.y1 - bl) return corner(bl, s.x0 + bl, s.y1 - bl);
  return true;
}

function roundedCoverage(s: RoundedBox, px: number, py: number): number {
  const base = boxCoverage(s.x0, s.y0, s.x1, s.y1, px, py);
  const maxR = Math.max(s.radii[0], s.radii[1], s.radii[2], s.radii[3]);
  if (base <= 0 || maxR <= 0) return base;
  const inCornerX = px < s.x0 + maxR || px + 1 > s.x1 - maxR;
  const inCornerY = py < s.y0 + maxR || py + 1 > s.y1 - maxR;
  if (!(inCornerX && inCornerY)) return base;
  const n = 4;
  let hits = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (insideRounded(px + (i + 0.5) / n, py + (j + 0.5) / n, s)) hits++;
    }
  }
  return hits / (n * n);
}

export function chooseRasterScale(width: number, height: number): number {
  return width * height * 4 <= MAX_DEVICE_PIXELS ? 2 : 1;
}

/** Straight-alpha RGBA buffer, transparent background, painted back-to-front. */
export function rasterizeOps(cluster: GeometryCluster, scale: number): { rgba: Uint8Array; w: number; h: number } {
  const w = Math.max(1, Math.round(cluster.width * scale));
  const h = Math.max(1, Math.round(cluster.height * scale));
  const buf = new Float32Array(w * h * 4); // r, g, b (0..255), a (0..1)

  const blend = (index: number, color: Rgba, coverage: number) => {
    const sa = coverage * color.a;
    if (sa <= 0) return;
    const da = buf[index + 3];
    const outA = sa + da * (1 - sa);
    if (outA <= 0) return;
    buf[index] = (color.r * sa + buf[index] * da * (1 - sa)) / outA;
    buf[index + 1] = (color.g * sa + buf[index + 1] * da * (1 - sa)) / outA;
    buf[index + 2] = (color.b * sa + buf[index + 2] * da * (1 - sa)) / outA;
    buf[index + 3] = outA;
  };

  for (const op of cluster.ops) {
    const x0 = op.x * scale;
    const y0 = op.y * scale;
    const x1 = (op.x + op.w) * scale;
    const y1 = (op.y + op.h) * scale;
    const maxRadius = Math.min((x1 - x0) / 2, (y1 - y0) / 2);
    const radii = op.radii.map((r) => Math.min(r * scale, maxRadius)) as Radii;

    const fillShape: RoundedBox = { x0, y0, x1, y1, radii };
    let outer = fillShape;
    let inner = fillShape;
    if (op.stroke) {
      const strokeWidth = op.stroke.weight * scale;
      const eo = op.stroke.align === "INSIDE" ? 0 : op.stroke.align === "CENTER" ? strokeWidth / 2 : strokeWidth;
      const ei = op.stroke.align === "INSIDE" ? strokeWidth : op.stroke.align === "CENTER" ? strokeWidth / 2 : 0;
      outer = {
        x0: x0 - eo,
        y0: y0 - eo,
        x1: x1 + eo,
        y1: y1 + eo,
        radii: radii.map((r) => (r > 0 ? r + eo : 0)) as Radii,
      };
      inner = {
        x0: x0 + ei,
        y0: y0 + ei,
        x1: x1 - ei,
        y1: y1 - ei,
        radii: radii.map((r) => Math.max(0, r - ei)) as Radii,
      };
    }

    let minX = Math.max(0, Math.floor(outer.x0));
    let maxX = Math.min(w - 1, Math.ceil(outer.x1) - 1);
    let minY = Math.max(0, Math.floor(outer.y0));
    let maxY = Math.min(h - 1, Math.ceil(outer.y1) - 1);

    if (op.clip) {
      const clipX0 = Math.floor(op.clip.x * scale);
      const clipY0 = Math.floor(op.clip.y * scale);
      const clipX1 = Math.ceil((op.clip.x + op.clip.w) * scale) - 1;
      const clipY1 = Math.ceil((op.clip.y + op.clip.h) * scale) - 1;
      minX = Math.max(minX, clipX0);
      maxX = Math.min(maxX, clipX1);
      minY = Math.max(minY, clipY0);
      maxY = Math.min(maxY, clipY1);
    }

    if (minX > maxX || minY > maxY) continue;

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const index = (py * w + px) * 4;
        if (op.fills.length > 0) {
          const fillCoverage = roundedCoverage(fillShape, px, py);
          if (fillCoverage > 0) {
            for (const fill of op.fills) {
              blend(index, { ...fill, a: fill.a * op.alpha }, fillCoverage);
            }
          }
        }
        if (op.stroke) {
          const outerCov = roundedCoverage(outer, px, py);
          const innerCov = inner.x1 > inner.x0 && inner.y1 > inner.y0 ? roundedCoverage(inner, px, py) : 0;
          const ring = outerCov - innerCov;
          if (ring > 0) blend(index, { ...op.stroke.color, a: op.stroke.color.a * op.alpha }, ring);
        }
      }
    }
  }

  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = buf[i * 4 + 3];
    rgba[i * 4] = Math.round(buf[i * 4]);
    rgba[i * 4 + 1] = Math.round(buf[i * 4 + 1]);
    rgba[i * 4 + 2] = Math.round(buf[i * 4 + 2]);
    rgba[i * 4 + 3] = Math.round(a * 255);
  }
  return { rgba, w, h };
}

// ---------------------------------------------------------------------------------------------
// PNG encoding (deflate with fixed Huffman codes + simple LZ77, no external dependency)
// ---------------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

class BitWriter {
  private bytes: number[] = [];
  private bitBuffer = 0;
  private bitCount = 0;

  writeBits(value: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.bitBuffer |= ((value >>> i) & 1) << this.bitCount;
      this.bitCount++;
      if (this.bitCount === 8) {
        this.bytes.push(this.bitBuffer);
        this.bitBuffer = 0;
        this.bitCount = 0;
      }
    }
  }

  /** Huffman codes are packed most-significant bit first. */
  writeCode(code: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.writeBits((code >>> i) & 1, 1);
  }

  finish(): Uint8Array {
    if (this.bitCount > 0) this.bytes.push(this.bitBuffer);
    return Uint8Array.from(this.bytes);
  }
}

function writeLiteralLength(writer: BitWriter, symbol: number): void {
  if (symbol <= 143) writer.writeCode(0x30 + symbol, 8);
  else if (symbol <= 255) writer.writeCode(0x190 + (symbol - 144), 9);
  else if (symbol <= 279) writer.writeCode(symbol - 256, 7);
  else writer.writeCode(0xc0 + (symbol - 280), 8);
}

function deflateFixed(data: Uint8Array): Uint8Array {
  const writer = new BitWriter();
  writer.writeBits(1, 1); // BFINAL
  writer.writeBits(1, 2); // BTYPE = fixed Huffman

  const HASH_SIZE = 1 << 15;
  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(data.length).fill(-1);
  const hashAt = (i: number) => ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & (HASH_SIZE - 1);
  const insert = (i: number) => {
    if (i + 2 >= data.length) return;
    const h = hashAt(i);
    prev[i] = head[h];
    head[h] = i;
  };

  let i = 0;
  while (i < data.length) {
    let bestLen = 0;
    let bestDist = 0;
    if (i + 2 < data.length) {
      let candidate = head[hashAt(i)];
      let chain = 24;
      const maxLen = Math.min(258, data.length - i);
      while (candidate >= 0 && chain-- > 0 && i - candidate <= 32768) {
        let len = 0;
        while (len < maxLen && data[candidate + len] === data[i + len]) len++;
        if (len > bestLen) {
          bestLen = len;
          bestDist = i - candidate;
          if (len === maxLen) break;
        }
        candidate = prev[candidate];
      }
    }

    if (bestLen >= 3) {
      let k = LEN_BASE.length - 1;
      while (LEN_BASE[k] > bestLen) k--;
      writeLiteralLength(writer, 257 + k);
      if (LEN_EXTRA[k] > 0) writer.writeBits(bestLen - LEN_BASE[k], LEN_EXTRA[k]);
      let d = DIST_BASE.length - 1;
      while (DIST_BASE[d] > bestDist) d--;
      writer.writeCode(d, 5);
      if (DIST_EXTRA[d] > 0) writer.writeBits(bestDist - DIST_BASE[d], DIST_EXTRA[d]);
      for (let j = 0; j < bestLen; j++) insert(i + j);
      i += bestLen;
    } else {
      writeLiteralLength(writer, data[i]);
      insert(i);
      i++;
    }
  }
  writeLiteralLength(writer, 256); // end of block
  return writer.finish();
}

function zlibCompress(data: Uint8Array): Uint8Array {
  const body = deflateFixed(data);
  const out = new Uint8Array(2 + body.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  out.set(body, 2);
  const adler = adler32(data);
  const end = 2 + body.length;
  out[end] = (adler >>> 24) & 0xff;
  out[end + 1] = (adler >>> 16) & 0xff;
  out[end + 2] = (adler >>> 8) & 0xff;
  out[end + 3] = adler & 0xff;
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlibCompress(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? BASE64_ALPHABET[b2 & 63] : "=";
  }
  return out;
}

export function rasterizeGeometryCluster(cluster: GeometryCluster): GeometryRaster {
  const scale = chooseRasterScale(cluster.width, cluster.height);
  const { rgba, w, h } = rasterizeOps(cluster, scale);
  const png = encodePng(rgba, w, h);
  return {
    dataUrl: `data:image/png;base64,${bytesToBase64(png)}`,
    width: cluster.width,
    height: cluster.height,
    leafCount: cluster.leafCount,
    opCount: cluster.ops.length,
  };
}
