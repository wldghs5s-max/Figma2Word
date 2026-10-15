/**
 * SVG Path Parser & Geometry Transpiler for Canvas IR, VML, and OWPML (HWPX).
 *
 * Supports SVG path commands:
 * - M / m (Move to)
 * - L / l (Line to)
 * - H / h (Horizontal line to)
 * - V / v (Vertical line to)
 * - C / c (Cubic Bezier)
 * - S / s (Smooth cubic Bezier)
 * - Q / q (Quadratic Bezier)
 * - T / t (Smooth quadratic Bezier)
 * - A / a (Elliptical Arc)
 * - Z / z (Close path)
 */

export interface Point2D {
  x: number;
  y: number;
}

export type NormalizedCommandType = "M" | "L" | "C" | "Z";

export interface NormalizedPathCommand {
  type: NormalizedCommandType;
  // For 'M' and 'L': [p1]
  // For 'C': [cp1, cp2, endPoint]
  // For 'Z': []
  points: Point2D[];
}

export interface PathBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Normalize SVG path string to unpack compact arc flags and consecutive signs.
 */
function normalizeSvgPathString(d: string): string {
  // Normalize compact arc flags:
  // e.g. "A 25 25 0 11 150 150" or "A 25 25 0 01 150 150"
  // Match 'A' or 'a', followed by 3 numbers (rx ry rot), then two flags (0 or 1).
  return d.replace(
    /([Aa])((?:\s*[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?[\s,]*){3})\s*([01])[\s,]*([01])/gi,
    (_m, cmd, first3, f1, f2) => `${cmd}${first3} ${f1} ${f2} `
  );
}

/**
 * Tokenize an SVG path string into command letters and numerical tokens.
 */
function tokenizeSvgPath(d: string): (string | number)[] {
  const normalizedD = normalizeSvgPathString(d);
  const tokens: (string | number)[] = [];
  // Matches command letters, or floats including scientific notation and negative numbers
  const regex = /([a-df-z])|([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalizedD)) !== null) {
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else if (match[2] !== undefined) {
      const num = parseFloat(match[2]);
      if (!isNaN(num)) {
        tokens.push(num);
      }
    }
  }
  return tokens;
}

/**
 * Convert an SVG elliptical arc segment into one or more cubic Bezier curve commands.
 * Based on the W3C SVG 1.1 implementation notes (F.6 Elliptical arc implementation notes).
 */
function arcToCubicBeziers(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  angleDegrees: number,
  largeArcFlag: boolean,
  sweepFlag: boolean,
  x2: number,
  y2: number
): NormalizedPathCommand[] {
  const commands: NormalizedPathCommand[] = [];

  // If endpoints are identical, arc is degenerate
  if (Math.abs(x1 - x2) < 1e-6 && Math.abs(y1 - y2) < 1e-6) {
    return commands;
  }

  // Ensure radii are positive
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < 1e-6 || ry < 1e-6) {
    // Treat as straight line
    commands.push({ type: "L", points: [{ x: x2, y: y2 }] });
    return commands;
  }

  const phi = (angleDegrees * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: Compute (x1', y1')
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Correct radii if necessary
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
  }

  // Step 2: Compute (cx', cy')
  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const sq =
    Math.max(
      0,
      rx * rx * (ry * ry) - rx * rx * (y1p * y1p) - ry * ry * (x1p * x1p)
    ) / (rx * rx * (y1p * y1p) + ry * ry * (x1p * x1p));
  const coef = sign * Math.sqrt(sq);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  // Step 3: Compute (cx, cy) from (cx', cy')
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // Step 4: Compute theta1 and deltaTheta
  const v1x = (x1p - cxp) / rx;
  const v1y = (y1p - cyp) / ry;
  const v2x = (-x1p - cxp) / rx;
  const v2y = (-y1p - cyp) / ry;

  function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let ang = Math.acos(Math.max(-1, Math.min(1, dot / (len || 1))));
    if (ux * vy - uy * vx < 0) ang = -ang;
    return ang;
  }

  const theta1 = vectorAngle(1, 0, v1x, v1y);
  let deltaTheta = vectorAngle(v1x, v1y, v2x, v2y);

  if (!sweepFlag && deltaTheta > 0) {
    deltaTheta -= 2 * Math.PI;
  } else if (sweepFlag && deltaTheta < 0) {
    deltaTheta += 2 * Math.PI;
  }

  // Split arc into segments of at most pi/2
  const segments = Math.max(1, Math.ceil(Math.abs(deltaTheta) / (Math.PI / 2)));
  const dTheta = deltaTheta / segments;
  const halfDTheta = dTheta / 2;
  const alpha =
    (Math.sin(dTheta) * (Math.sqrt(4 + 3 * Math.tan(halfDTheta) ** 2) - 1)) / 3;

  let currentTheta = theta1;

  for (let i = 0; i < segments; i++) {
    const nextTheta = currentTheta + dTheta;

    const cosTheta = Math.cos(currentTheta);
    const sinTheta = Math.sin(currentTheta);
    const cosNextTheta = Math.cos(nextTheta);
    const sinNextTheta = Math.sin(nextTheta);

    const ep1x = cosPhi * rx * cosTheta - sinPhi * ry * sinTheta + cx;
    const ep1y = sinPhi * rx * cosTheta + cosPhi * ry * sinTheta + cy;

    const ep2x = cosPhi * rx * cosNextTheta - sinPhi * ry * sinNextTheta + cx;
    const ep2y = sinPhi * rx * cosNextTheta + cosPhi * ry * sinNextTheta + cy;

    const dTheta1x = -cosPhi * rx * sinTheta - sinPhi * ry * cosTheta;
    const dTheta1y = -sinPhi * rx * sinTheta + cosPhi * ry * cosTheta;

    const dTheta2x = -cosPhi * rx * sinNextTheta - sinPhi * ry * cosNextTheta;
    const dTheta2y = -sinPhi * rx * sinNextTheta + cosPhi * ry * cosNextTheta;

    const cp1 = { x: ep1x + alpha * dTheta1x, y: ep1y + alpha * dTheta1y };
    const cp2 = { x: ep2x - alpha * dTheta2x, y: ep2y - alpha * dTheta2y };
    const targetPt = i === segments - 1 ? { x: x2, y: y2 } : { x: ep2x, y: ep2y };

    commands.push({
      type: "C",
      points: [cp1, cp2, targetPt],
    });

    currentTheta = nextTheta;
  }

  return commands;
}

/**
 * Compute the analytical minimum and maximum coordinates of a 1D cubic Bezier curve segment.
 */
function getCubicBezierExtrema(p0: number, p1: number, p2: number, p3: number): [number, number] {
  let min = Math.min(p0, p3);
  let max = Math.max(p0, p3);

  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
  const b = 6 * (p0 - 2 * p1 + p2);
  const c = 3 * (p1 - p0);

  const testT = (t: number) => {
    if (t > 0 && t < 1) {
      const omt = 1 - t;
      const val =
        omt * omt * omt * p0 +
        3 * omt * omt * t * p1 +
        3 * omt * t * t * p2 +
        t * t * t * p3;
      if (val < min) min = val;
      if (val > max) max = val;
    }
  };

  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) {
      testT(-c / b);
    }
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sqrtDisc = Math.sqrt(disc);
      testT((-b - sqrtDisc) / (2 * a));
      testT((-b + sqrtDisc) / (2 * a));
    }
  }

  return [min, max];
}

export class SvgPath {
  public commands: NormalizedPathCommand[];

  constructor(commands: NormalizedPathCommand[] = []) {
    this.commands = commands;
  }

  /**
   * Parse any SVG path string into normalized absolute commands (M, L, C, Z).
   */
  public static parse(d: string): SvgPath {
    if (!d || typeof d !== "string") {
      return new SvgPath([]);
    }

    const tokens = tokenizeSvgPath(d);
    const normalized: NormalizedPathCommand[] = [];

    let curX = 0;
    let curY = 0;
    let startX = 0;
    let startY = 0;
    let lastCpX = 0;
    let lastCpY = 0;
    let lastCmd = "";

    let idx = 0;
    while (idx < tokens.length) {
      const tok = tokens[idx];
      if (typeof tok !== "string") {
        idx++;
        continue;
      }

      let cmd = tok;
      idx++;

      while (idx < tokens.length && typeof tokens[idx] === "number") {
        const isRelative = cmd >= "a" && cmd <= "z";
        const upper = cmd.toUpperCase();

        switch (upper) {
          case "M": {
            const x = (tokens[idx++] as number) + (isRelative ? curX : 0);
            const y = (tokens[idx++] as number) + (isRelative ? curY : 0);
            curX = x;
            curY = y;
            startX = x;
            startY = y;
            lastCpX = x;
            lastCpY = y;
            normalized.push({ type: "M", points: [{ x, y }] });
            // Subsequent coordinate pairs treated as implicit L / l
            cmd = isRelative ? "l" : "L";
            break;
          }
          case "L": {
            const x = (tokens[idx++] as number) + (isRelative ? curX : 0);
            const y = (tokens[idx++] as number) + (isRelative ? curY : 0);
            curX = x;
            curY = y;
            lastCpX = x;
            lastCpY = y;
            normalized.push({ type: "L", points: [{ x, y }] });
            break;
          }
          case "H": {
            const x = (tokens[idx++] as number) + (isRelative ? curX : 0);
            curX = x;
            lastCpX = x;
            lastCpY = curY;
            normalized.push({ type: "L", points: [{ x, y: curY }] });
            break;
          }
          case "V": {
            const y = (tokens[idx++] as number) + (isRelative ? curY : 0);
            curY = y;
            lastCpX = curX;
            lastCpY = y;
            normalized.push({ type: "L", points: [{ x: curX, y }] });
            break;
          }
          case "C": {
            const x1 = (tokens[idx++] as number) + (isRelative ? curX : 0);
            const y1 = (tokens[idx++] as number) + (isRelative ? curY : 0);
            const x2 = (tokens[idx++] as number) + (isRelative ? curX : 0);
            const y2 = (tokens[idx++] as number) + (isRelative ? curY : 0);
            const x = (tokens[idx++] as number) + (isRelative ? curX : 0);
            const y = (tokens[idx++] as number) + (isRelative ? curY : 0);

            normalized.push({
              type: "C",
              points: [
                { x: x1, y: y1 },
                { x: x2, y: y2 },
                { x, y },
              ],
            });
            lastCpX = x2;
            lastCpY = y2;
            curX = x;
            curY = y;
            break;
          }
          case "S": {
            // Smooth cubic: cp1 is reflection of lastCp about cur
            let x1 = curX;
            let y1 = curY;
            if (lastCmd === "C" || lastCmd === "S") {
              x1 = 2 * curX - lastCpX;
              y1 = 2 * curY - lastCpY;
            }
            const x2 = (tokens[idx++] as number) + (isRelative ? curX : 0);
            const y2 = (tokens[idx++] as number) + (isRelative ? curY : 0);
            const x = (tokens[idx++] as number) + (isRelative ? curX : 0);
            const y = (tokens[idx++] as number) + (isRelative ? curY : 0);

            normalized.push({
              type: "C",
              points: [
                { x: x1, y: y1 },
                { x: x2, y: y2 },
                { x, y },
              ],
            });
            lastCpX = x2;
            lastCpY = y2;
            curX = x;
            curY = y;
            break;
          }
          case "Q": {
            // Quadratic Bezier -> convert to cubic
            const qx = (tokens[idx++] as number) + (isRelative ? curX : 0);
            const qy = (tokens[idx++] as number) + (isRelative ? curY : 0);
            const x = (tokens[idx++] as number) + (isRelative ? curX : 0);
            const y = (tokens[idx++] as number) + (isRelative ? curY : 0);

            const x1 = curX + (2 / 3) * (qx - curX);
            const y1 = curY + (2 / 3) * (qy - curY);
            const x2 = x + (2 / 3) * (qx - x);
            const y2 = y + (2 / 3) * (qy - y);

            normalized.push({
              type: "C",
              points: [
                { x: x1, y: y1 },
                { x: x2, y: y2 },
                { x, y },
              ],
            });
            lastCpX = qx;
            lastCpY = qy;
            curX = x;
            curY = y;
            break;
          }
          case "T": {
            // Smooth quadratic Bezier -> convert to cubic
            let qx = curX;
            let qy = curY;
            if (lastCmd === "Q" || lastCmd === "T") {
              qx = 2 * curX - lastCpX;
              qy = 2 * curY - lastCpY;
            }
            const x = (tokens[idx++] as number) + (isRelative ? curX : 0);
            const y = (tokens[idx++] as number) + (isRelative ? curY : 0);

            const x1 = curX + (2 / 3) * (qx - curX);
            const y1 = curY + (2 / 3) * (qy - curY);
            const x2 = x + (2 / 3) * (qx - x);
            const y2 = y + (2 / 3) * (qy - y);

            normalized.push({
              type: "C",
              points: [
                { x: x1, y: y1 },
                { x: x2, y: y2 },
                { x, y },
              ],
            });
            lastCpX = qx;
            lastCpY = qy;
            curX = x;
            curY = y;
            break;
          }
          case "A": {
            const rx = tokens[idx++] as number;
            const ry = tokens[idx++] as number;
            const rot = tokens[idx++] as number;
            const largeArc = (tokens[idx++] as number) !== 0;
            const sweep = (tokens[idx++] as number) !== 0;
            const x = (tokens[idx++] as number) + (isRelative ? curX : 0);
            const y = (tokens[idx++] as number) + (isRelative ? curY : 0);

            const arcBeziers = arcToCubicBeziers(
              curX,
              curY,
              rx,
              ry,
              rot,
              largeArc,
              sweep,
              x,
              y
            );
            for (const b of arcBeziers) {
              normalized.push(b);
            }
            curX = x;
            curY = y;
            lastCpX = x;
            lastCpY = y;
            break;
          }
          case "Z": {
            normalized.push({ type: "Z", points: [] });
            curX = startX;
            curY = startY;
            lastCpX = curX;
            lastCpY = curY;
            break;
          }
          default: {
            idx++;
            break;
          }
        }
        lastCmd = upper;
      }

      if (cmd.toUpperCase() === "Z") {
        normalized.push({ type: "Z", points: [] });
        curX = startX;
        curY = startY;
        lastCpX = curX;
        lastCpY = curY;
        lastCmd = "Z";
      }
    }

    return new SvgPath(normalized);
  }

  /**
   * Compute exact bounding box across all path commands, accounting for cubic Bezier extrema.
   */
  public getBounds(): PathBounds {
    if (this.commands.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    let curX = 0;
    let curY = 0;

    for (const cmd of this.commands) {
      switch (cmd.type) {
        case "M":
        case "L": {
          const pt = cmd.points[0];
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
          curX = pt.x;
          curY = pt.y;
          break;
        }
        case "C": {
          const [cp1, cp2, ep] = cmd.points;
          const [xMin, xMax] = getCubicBezierExtrema(curX, cp1.x, cp2.x, ep.x);
          const [yMin, yMax] = getCubicBezierExtrema(curY, cp1.y, cp2.y, ep.y);
          if (xMin < minX) minX = xMin;
          if (xMax > maxX) maxX = xMax;
          if (yMin < minY) minY = yMin;
          if (yMax > maxY) maxY = yMax;
          curX = ep.x;
          curY = ep.y;
          break;
        }
        case "Z": {
          break;
        }
      }
    }

    if (minX === Infinity) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1e-6, maxX - minX),
      height: Math.max(1e-6, maxY - minY),
    };
  }

  /**
   * Convert normalized SVG path into a standard VML path string scaled to coordsize.
   * e.g. "m 0,0 l 1000,0 l 1000,1000 x e"
   */
  public toVmlPath(targetCoordWidth = 1000, targetCoordHeight = 1000): string {
    if (this.commands.length === 0) {
      return "";
    }

    const bounds = this.getBounds();
    const scaleX = targetCoordWidth / bounds.width;
    const scaleY = targetCoordHeight / bounds.height;

    const parts: string[] = [];

    for (const cmd of this.commands) {
      switch (cmd.type) {
        case "M": {
          const pt = cmd.points[0];
          const vx = Math.round((pt.x - bounds.minX) * scaleX);
          const vy = Math.round((pt.y - bounds.minY) * scaleY);
          parts.push(`m ${vx},${vy}`);
          break;
        }
        case "L": {
          const pt = cmd.points[0];
          const vx = Math.round((pt.x - bounds.minX) * scaleX);
          const vy = Math.round((pt.y - bounds.minY) * scaleY);
          parts.push(`l ${vx},${vy}`);
          break;
        }
        case "C": {
          const [cp1, cp2, ep] = cmd.points;
          const cx1 = Math.round((cp1.x - bounds.minX) * scaleX);
          const cy1 = Math.round((cp1.y - bounds.minY) * scaleY);
          const cx2 = Math.round((cp2.x - bounds.minX) * scaleX);
          const cy2 = Math.round((cp2.y - bounds.minY) * scaleY);
          const ex = Math.round((ep.x - bounds.minX) * scaleX);
          const ey = Math.round((ep.y - bounds.minY) * scaleY);
          parts.push(`c ${cx1},${cy1},${cx2},${cy2},${ex},${ey}`);
          break;
        }
        case "Z": {
          parts.push("x e");
          break;
        }
      }
    }

    if (!parts[parts.length - 1]?.endsWith("e")) {
      parts.push("e");
    }

    return parts.join(" ");
  }

  /**
   * Sample path into separate subpaths for HWPX, preserving multi-contour shapes.
   */
  public toHwpxSubpaths(
    targetWidthHwpu: number,
    targetHeightHwpu: number,
    stepsPerCurve = 6
  ): Point2D[][] {
    if (this.commands.length === 0) {
      return [];
    }

    const bounds = this.getBounds();
    const scaleX = targetWidthHwpu / bounds.width;
    const scaleY = targetHeightHwpu / bounds.height;

    const subpaths: Point2D[][] = [];
    let currentPath: Point2D[] = [];
    let curX = bounds.minX;
    let curY = bounds.minY;

    for (const cmd of this.commands) {
      switch (cmd.type) {
        case "M": {
          if (currentPath.length > 0) {
            subpaths.push(currentPath);
            currentPath = [];
          }
          const p = cmd.points[0];
          curX = p.x;
          curY = p.y;
          currentPath.push({
            x: Math.round((p.x - bounds.minX) * scaleX),
            y: Math.round((p.y - bounds.minY) * scaleY),
          });
          break;
        }
        case "L": {
          const p = cmd.points[0];
          curX = p.x;
          curY = p.y;
          currentPath.push({
            x: Math.round((p.x - bounds.minX) * scaleX),
            y: Math.round((p.y - bounds.minY) * scaleY),
          });
          break;
        }
        case "C": {
          const [cp1, cp2, ep] = cmd.points;
          for (let step = 1; step <= stepsPerCurve; step++) {
            const t = step / stepsPerCurve;
            const omt = 1 - t;
            const b0 = omt * omt * omt;
            const b1 = 3 * omt * omt * t;
            const b2 = 3 * omt * t * t;
            const b3 = t * t * t;

            const px = b0 * curX + b1 * cp1.x + b2 * cp2.x + b3 * ep.x;
            const py = b0 * curY + b1 * cp1.y + b2 * cp2.y + b3 * ep.y;

            currentPath.push({
              x: Math.round((px - bounds.minX) * scaleX),
              y: Math.round((py - bounds.minY) * scaleY),
            });
          }
          curX = ep.x;
          curY = ep.y;
          break;
        }
        case "Z": {
          if (currentPath.length > 0) {
            subpaths.push(currentPath);
            currentPath = [];
          }
          break;
        }
      }
    }

    if (currentPath.length > 0) {
      subpaths.push(currentPath);
    }

    return subpaths;
  }

  /**
   * Sample path into discrete polygon vertices for HWPX (<hp:pt x="..." y="..."/>).
   * Cubic curves are sampled into intermediate vertices based on steps.
   */
  public toHwpxPolygonPoints(
    targetWidthHwpu: number,
    targetHeightHwpu: number,
    stepsPerCurve = 6
  ): Point2D[] {
    const subpaths = this.toHwpxSubpaths(targetWidthHwpu, targetHeightHwpu, stepsPerCurve);
    return subpaths.flat();
  }

  /**
   * Parse a VML path string into an SvgPath, correctly translating VML coordinate semantics.
   */
  public static fromVml(vmlPath: string): SvgPath {
    return SvgPath.parse(vmlToSvgPath(vmlPath));
  }
}

/**
 * Converts a VML path string to a standard SVG path string.
 * In VML, lowercase commands (m, l, c) are ABSOLUTE coordinates,
 * whereas in SVG lowercase commands are RELATIVE.
 * In VML, relative commands are r (rel lineto), t (rel moveto), v (rel curveto).
 * Also VML uses x for closepath and e for end of path.
 */
export function vmlToSvgPath(vmlPath: string): string {
  if (!vmlPath) return "";

  // Strip standalone formatting flags (nf = nofill, ns = nostroke)
  let s = vmlPath.replace(/\b(nf|ns)\b/gi, " ");

  // Strip path end marker 'e' (standalone or at end of segment)
  s = s.replace(/(^|[\s,])e(?=[\s,]|$)/gi, " ");

  // In VML:
  // m -> M (absolute moveto)
  // l -> L (absolute lineto)
  // c -> C (absolute curveto)
  // r -> l (relative lineto)
  // t -> m (relative moveto)
  // v -> c (relative curveto)
  // x -> Z (closepath)
  // z -> Z (closepath)
  return s.replace(/([a-df-wyzA-DF-WYZ])/g, (cmd) => {
    switch (cmd.toLowerCase()) {
      case "m": return "M";
      case "l": return "L";
      case "c": return "C";
      case "r": return "l";
      case "t": return "m";
      case "v": return "c";
      case "x":
      case "z": return "Z";
      default: return cmd;
    }
  });
}

