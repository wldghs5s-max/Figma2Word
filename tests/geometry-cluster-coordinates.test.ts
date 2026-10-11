import { describe, it, expect } from "vitest";
import { FigmaNode } from "../src/parser/types.js";
import {
  analyzeGeometryCluster,
  rasterizeOps,
  chooseRasterScale,
  rasterizeGeometryCluster,
} from "../src/parser/geometryRaster.js";

describe("Step 11C: Geometry Cluster Clipping & Coordinate System", () => {
  // Case A: Protruding child beyond parent bounds, clipsContent = false
  it("Case A: preserves protruding child geometry when clipsContent is false", () => {
    const root: FigmaNode = {
      id: "root-case-a",
      name: "Unclipped Root",
      type: "FRAME",
      clipsContent: false,
      absoluteBoundingBox: { x: 100, y: 100, width: 100, height: 50 },
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
      children: [
        {
          id: "child-protruding",
          name: "Protruding Bar",
          type: "RECTANGLE",
          // Child extends 2px to the left (x: 98) and 2px to the right (x+w: 204), total width 106
          absoluteBoundingBox: { x: 98, y: 110, width: 106, height: 30 },
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
        },
      ],
    };

    const cluster = analyzeGeometryCluster(root);
    expect(cluster).not.toBeNull();
    if (!cluster) return;

    // In current implementation, cluster.width is fixed to 100 and left is clipped!
    // Expected in Step 11C: union bounding box should cover from x=98 to x=204 (width >= 106)
    expect(cluster.width).toBeGreaterThanOrEqual(106);

    // Verify rasterization doesn't clip left or right
    const scale = 1;
    const { rgba, w, h } = rasterizeOps(cluster, scale);
    expect(w).toBeGreaterThanOrEqual(106);

    // Leftmost pixel (x=0) and rightmost pixel (x=w-1) of the red bar should have red color
    // In child-protruding at y=110 (offset from top: y0 in cluster), check red color (r=255, g=0, b=0)
    const midY = Math.round(cluster.height / 2);
    const leftPixelIdx = (midY * w + 0) * 4;
    expect(rgba[leftPixelIdx]).toBe(255); // Red component at left protrusion
  });

  // Case B: Protruding child beyond parent bounds, clipsContent = true
  it("Case B: clips protruding child geometry strictly to parent bounds when clipsContent is true", () => {
    const root: FigmaNode = {
      id: "root-case-b",
      name: "Clipped Root",
      type: "FRAME",
      clipsContent: true,
      absoluteBoundingBox: { x: 100, y: 100, width: 100, height: 50 },
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
      children: [
        {
          id: "child-protruding",
          name: "Protruding Bar",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 98, y: 110, width: 106, height: 30 },
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
        },
      ],
    };

    const cluster = analyzeGeometryCluster(root);
    expect(cluster).not.toBeNull();
    if (!cluster) return;

    // With clipsContent = true, cluster dimension must be bounded by root (width = 100, height = 50)
    expect(cluster.width).toBe(100);
    expect(cluster.height).toBe(50);
    expect(cluster.offsetX).toBe(0);
    expect(cluster.offsetY).toBe(0);

    const { rgba, w, h } = rasterizeOps(cluster, 1);
    expect(w).toBe(100);
    expect(h).toBe(50);

    // Inside bounds: at midY, x=0 should be rendered (red child within root)
    const midY = Math.round(h / 2);
    const leftPixelIdx = (midY * w + 0) * 4;
    expect(rgba[leftPixelIdx]).toBe(255); // Red bar rendered at left border
  });

  // Case C: OUTSIDE Stroke on root / child
  it("Case C: preserves OUTSIDE stroke boundaries without clipping", () => {
    const root: FigmaNode = {
      id: "root-case-c",
      name: "Outside Stroke Root",
      type: "FRAME",
      clipsContent: false,
      absoluteBoundingBox: { x: 100, y: 100, width: 100, height: 50 },
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
      children: [
        {
          id: "box-outside-stroke",
          name: "Box with Outside Stroke",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 100, y: 100, width: 100, height: 50 },
          fills: [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 }, opacity: 1 }],
          strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 1 }, opacity: 1 }],
          strokeWeight: 4,
          strokeAlign: "OUTSIDE",
        },
      ],
    };

    const cluster = analyzeGeometryCluster(root);
    expect(cluster).not.toBeNull();
    if (!cluster) return;

    // 4px stroke OUTSIDE on left, right, top, bottom expands bounds by 4px on each side:
    // width: 100 + 4*2 = 108, height: 50 + 4*2 = 58
    expect(cluster.width).toBeGreaterThanOrEqual(108);
    expect(cluster.height).toBeGreaterThanOrEqual(58);
    expect(cluster.offsetX).toBe(-4);
    expect(cluster.offsetY).toBe(-4);

    // Rasterize and check blue border at top-left edge
    const { rgba, w, h } = rasterizeOps(cluster, 1);
    // At y=0, x=0, there should be stroke color (blue: r=0, g=0, b=255)
    const edgePixelIdx = (0 * w + 0) * 4;
    expect(rgba[edgePixelIdx + 2]).toBe(255); // Blue stroke present at outer boundary

    // At inner coordinate (x=4, y=4), stroke transition to fill
    const innerPixelIdx = (4 * w + 4) * 4;
    expect(rgba[innerPixelIdx + 3]).toBeGreaterThan(0); // Filled pixel

    // At right edge (x=w-1, y=h-1), blue stroke must also exist
    const rightEdgeIdx = ((h - 1) * w + (w - 1)) * 4;
    expect(rgba[rightEdgeIdx + 2]).toBe(255);
  });

  // Case D: INSIDE and CENTER stroke distinctions
  it("Case D: correctly distinguishes INSIDE, CENTER, and OUTSIDE strokes", () => {
    const createNodeWithStroke = (align: "INSIDE" | "CENTER" | "OUTSIDE"): FigmaNode => ({
      id: `node-${align}`,
      name: `Box ${align}`,
      type: "FRAME",
      clipsContent: false,
      absoluteBoundingBox: { x: 100, y: 100, width: 100, height: 50 },
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
      children: [
        {
          id: `child-${align}`,
          name: "Child",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 100, y: 100, width: 100, height: 50 },
          fills: [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }],
          strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
          strokeWeight: 6,
          strokeAlign: align,
        },
      ],
    });

    const cInside = analyzeGeometryCluster(createNodeWithStroke("INSIDE"));
    const cCenter = analyzeGeometryCluster(createNodeWithStroke("CENTER"));
    const cOutside = analyzeGeometryCluster(createNodeWithStroke("OUTSIDE"));

    expect(cInside).not.toBeNull();
    expect(cCenter).not.toBeNull();
    expect(cOutside).not.toBeNull();

    // INSIDE stroke stays within 100x50
    expect(cInside!.width).toBe(100);
    expect(cInside!.height).toBe(50);

    // CENTER stroke extends by weight / 2 (3px on each side) -> 106x56
    expect(cCenter!.width).toBeGreaterThanOrEqual(106);
    expect(cCenter!.height).toBeGreaterThanOrEqual(56);

    // OUTSIDE stroke extends by weight (6px on each side) -> 112x62
    expect(cOutside!.width).toBeGreaterThanOrEqual(112);
    expect(cOutside!.height).toBeGreaterThanOrEqual(62);
  });

  // Case E: Regression test on Step 10C charts and progress bars
  it("Case E: preserves existing A4-3 chart and progress bar geometry structures", () => {
    // 6-bar chart fixture simulating A4-3 (node 1:9060)
    const barChart: FigmaNode = {
      id: "bar-chart-1-9060",
      name: "Chart Container",
      type: "FRAME",
      clipsContent: false,
      absoluteBoundingBox: { x: 100, y: 200, width: 300, height: 180 },
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
      strokes: [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }],
      strokeWeight: 1,
      children: [
        // Grid lines
        { id: "grid-1", type: "LINE", absoluteBoundingBox: { x: 100, y: 240, width: 300, height: 0 }, strokes: [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }], strokeWeight: 1 },
        { id: "grid-2", type: "LINE", absoluteBoundingBox: { x: 100, y: 280, width: 300, height: 0 }, strokes: [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }], strokeWeight: 1 },
        { id: "grid-3", type: "LINE", absoluteBoundingBox: { x: 100, y: 320, width: 300, height: 0 }, strokes: [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }], strokeWeight: 1 },
        // 6 bars
        ...[40, 70, 110, 55, 85, 140].map((h, i) => ({
          id: `bar-${i}`,
          name: `Bar ${i}`,
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 120 + i * 45, y: 380 - h, width: 25, height: h },
          fills: [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 0.8 } }],
        })),
      ],
    };

    const cluster = analyzeGeometryCluster(barChart);
    expect(cluster).not.toBeNull();
    expect(cluster!.leafCount).toBe(9); // 3 lines + 6 bars
    const raster = rasterizeGeometryCluster(cluster!);
    expect(raster.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(raster.leafCount).toBe(9);
  });

  // Case F: Nested containers with different clipsContent
  it("Case F: respects clipping hierarchy in nested containers", () => {
    const nested: FigmaNode = {
      id: "parent-unclipped",
      name: "Parent",
      type: "FRAME",
      clipsContent: false,
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 200 },
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
      children: [
        {
          id: "child-clipped-frame",
          name: "Clipped Frame",
          type: "FRAME",
          clipsContent: true,
          absoluteBoundingBox: { x: 20, y: 20, width: 80, height: 80 },
          fills: [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }],
          children: [
            {
              id: "grandchild-overflow",
              name: "Overflowing Grandchild",
              type: "RECTANGLE",
              // Grandchild extends outside child-clipped-frame (from x:10 to x:120)
              absoluteBoundingBox: { x: 10, y: 20, width: 110, height: 40 },
              fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
            },
          ],
        },
      ],
    };

    const cluster = analyzeGeometryCluster(nested);
    expect(cluster).not.toBeNull();
    // In unclipped parent, the grandchild inside a clipped frame should not expand beyond the clipped frame bounds
    // or parent bounds
    expect(cluster!.width).toBeLessThanOrEqual(200);
  });

  // Case G: Unsupported shapes safely fall back (return null)
  it("Case G: safely falls back on unsupported shapes (rotations, free-form paths, text)", () => {
    const rotated: FigmaNode = {
      id: "rot-root",
      name: "Rotated Root",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [
        {
          id: "rot-box",
          name: "Rotated Box",
          type: "RECTANGLE",
          rotation: 45, // 45 degree rotation
          absoluteBoundingBox: { x: 10, y: 10, width: 80, height: 80 },
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
        },
      ],
    };
    expect(analyzeGeometryCluster(rotated)).toBeNull();

    const withText: FigmaNode = {
      id: "text-root",
      name: "Text Root",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [
        { id: "box", type: "RECTANGLE", absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 50 } },
        { id: "txt", type: "TEXT", characters: "Hello", absoluteBoundingBox: { x: 50, y: 50, width: 50, height: 50 } },
      ],
    };
    expect(analyzeGeometryCluster(withText)).toBeNull();
  });
});
