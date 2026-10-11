import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import {
  analyzeGeometryCluster,
  rasterizeGeometryCluster,
} from "../src/parser/geometryRaster.js";
import { FigmaParser } from "../src/parser/figmaParser.js";
import { FigmaNode } from "../src/parser/types.js";
import { ConversionPipeline } from "../src/pipeline/index.js";
import { DocElement } from "../src/model/index.js";

function collectAllElements(elements: DocElement[]): DocElement[] {
  const result: DocElement[] = [];
  for (const el of elements) {
    result.push(el);
    if ("children" in el && Array.isArray((el as any).children)) {
      result.push(...collectAllElements((el as any).children));
    }
    if ("content" in el && Array.isArray((el as any).content)) {
      result.push(...collectAllElements((el as any).content));
    }
  }
  return result;
}

describe("Step 10C: Geometry Cluster Preservation", () => {
  it("detects and rasterizes a simple rectangle cluster with valid PNG header and IDAT", () => {
    const node: FigmaNode = {
      id: "chart-1",
      name: "BarChart",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
      children: [
        {
          id: "bar-1",
          name: "Bar1",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 10, y: 10, width: 20, height: 30 },
          fills: [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 0.8 }, opacity: 1 }],
        },
        {
          id: "bar-2",
          name: "Bar2",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 40, y: 20, width: 20, height: 20 },
          fills: [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 0.8 }, opacity: 1 }],
        },
      ],
    };

    const cluster = analyzeGeometryCluster(node);
    expect(cluster).not.toBeNull();
    expect(cluster!.width).toBe(100);
    expect(cluster!.height).toBe(50);
    expect(cluster!.leafCount).toBe(2);

    const result = rasterizeGeometryCluster(cluster!);
    expect(result.dataUrl.startsWith("data:image/png;base64,")).toBe(true);

    const base64Data = result.dataUrl.replace("data:image/png;base64,", "");
    const pngBuffer = Buffer.from(base64Data, "base64");

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(pngBuffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );

    // Verify IHDR chunk exists and is valid
    const ihdrChunk = pngBuffer.subarray(8, 33);
    expect(ihdrChunk.subarray(4, 8).toString("ascii")).toBe("IHDR");

    // Decompress IDAT to verify standard deflate integrity
    const idatIdx = pngBuffer.indexOf("IDAT");
    expect(idatIdx).toBeGreaterThan(0);
    const idatLength = pngBuffer.readUInt32BE(idatIdx - 4);
    const idatData = pngBuffer.subarray(idatIdx + 4, idatIdx + 4 + idatLength);
    const decompressed = zlib.inflateSync(idatData);
    expect(decompressed.length).toBeGreaterThan(0);
  });

  it("preserves horizontal and vertical thin lines at correct coordinates", () => {
    const node: FigmaNode = {
      id: "grid-1",
      name: "GridLines",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 },
      children: [
        {
          id: "hline-1",
          name: "HLine",
          type: "VECTOR",
          absoluteBoundingBox: { x: 0, y: 50, width: 200, height: 0 },
          strokes: [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 }, opacity: 1 }],
          strokeWeight: 1,
        },
        {
          id: "vline-1",
          name: "VLine",
          type: "LINE",
          absoluteBoundingBox: { x: 100, y: 0, width: 0, height: 100 },
          strokes: [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 }, opacity: 1 }],
          strokeWeight: 1,
        },
      ],
    };

    const cluster = analyzeGeometryCluster(node);
    expect(cluster).not.toBeNull();
    expect(cluster!.ops.length).toBe(2);

    const hOp = cluster!.ops[0];
    expect(hOp.w).toBe(200);
    expect(hOp.h).toBe(1);

    const vOp = cluster!.ops[1];
    expect(vOp.w).toBe(1);
    expect(vOp.h).toBe(100);
  });

  it("handles stacked white + black@alpha fills to produce composite gray", () => {
    const parser = new FigmaParser();
    const rectNode: FigmaNode = {
      id: "bar-stacked",
      name: "StackedBar",
      type: "RECTANGLE",
      absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 100 },
      fills: [
        { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 },
        { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.5 },
      ],
    };

    const parseRes = parser.parse(rectNode);
    const element = parseRes.document.sections[0]?.elements[0] as any;
    expect(element).toBeDefined();
    // 255 * 0.5 + 0 * 0.5 = 128 (808080)
    expect(element?.fill?.hex?.toUpperCase()).toBe("808080");
  });

  it("handles per-corner radii (Progress pill case)", () => {
    const node: FigmaNode = {
      id: "progress-1",
      name: "ProgressBar",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 10 },
      rectangleCornerRadii: [5, 5, 5, 5],
      children: [
        {
          id: "track",
          name: "Track",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 10 },
          fills: [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 }, opacity: 1 }],
          rectangleCornerRadii: [5, 5, 5, 5],
        },
        {
          id: "fill",
          name: "Fill",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 10 },
          fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 }],
          rectangleCornerRadii: [5, 0, 0, 5],
        },
      ],
    };

    const cluster = analyzeGeometryCluster(node);
    expect(cluster).not.toBeNull();
    expect(cluster!.ops.length).toBe(2);
    expect(cluster!.ops[1].radii).toEqual([5, 0, 0, 5]);

    const result = rasterizeGeometryCluster(cluster!);
    expect(result.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("is strictly deterministic (identical output for identical input)", () => {
    const node: FigmaNode = {
      id: "chart-det",
      name: "Chart",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 40 },
      children: [
        {
          id: "b1",
          name: "B1",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 5, y: 5, width: 15, height: 30 },
          fills: [{ type: "SOLID", color: { r: 0.3, g: 0.6, b: 0.9 }, opacity: 1 }],
        },
        {
          id: "b2",
          name: "B2",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 25, y: 10, width: 15, height: 25 },
          fills: [{ type: "SOLID", color: { r: 0.4, g: 0.7, b: 0.2 }, opacity: 1 }],
        },
      ],
    };

    const c1 = analyzeGeometryCluster(node)!;
    const r1 = rasterizeGeometryCluster(c1);

    const c2 = analyzeGeometryCluster(node)!;
    const r2 = rasterizeGeometryCluster(c2);

    expect(r1.dataUrl).toBe(r2.dataUrl);
  });

  it("rejects non-geometry clusters (TEXT, image fills, rotated shapes, free-form vectors)", () => {
    const withText: FigmaNode = {
      id: "f-text",
      name: "WithText",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
      children: [
        {
          id: "t1",
          name: "Label",
          type: "TEXT",
          characters: "Hello",
          absoluteBoundingBox: { x: 10, y: 10, width: 50, height: 20 },
        },
      ],
    };
    expect(analyzeGeometryCluster(withText)).toBeNull();

    const withImage: FigmaNode = {
      id: "f-img",
      name: "WithImg",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
      children: [
        {
          id: "r1",
          name: "R1",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 10, y: 10, width: 50, height: 20 },
          fills: [{ type: "IMAGE", imageRef: "img1" }],
        },
      ],
    };
    expect(analyzeGeometryCluster(withImage)).toBeNull();

    const withRotated: FigmaNode = {
      id: "f-rot",
      name: "WithRot",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
      children: [
        {
          id: "r2",
          name: "R2",
          type: "RECTANGLE",
          rotation: 45,
          absoluteBoundingBox: { x: 10, y: 10, width: 50, height: 20 },
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
        },
      ],
    };
    expect(analyzeGeometryCluster(withRotated)).toBeNull();

    const withFreeformVector: FigmaNode = {
      id: "f-vec",
      name: "WithVec",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
      children: [
        {
          id: "v1",
          name: "CustomPath",
          type: "VECTOR",
          absoluteBoundingBox: { x: 10, y: 10, width: 50, height: 20 },
          fills: [{ type: "SOLID", color: { r: 0, g: 1, b: 0 } }],
        },
      ],
    };
    expect(analyzeGeometryCluster(withFreeformVector)).toBeNull();
  });

  it("yields exactly one ImageElement in parser for a valid geometry cluster", () => {
    const parser = new FigmaParser();
    const clusterContainer: FigmaNode = {
      id: "chart-root",
      name: "ChartWidget",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 150 },
      children: [
        {
          id: "bar-1",
          name: "Bar1",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 20, y: 20, width: 30, height: 100 },
          fills: [{ type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.3 } }],
        },
        {
          id: "bar-2",
          name: "Bar2",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 60, y: 40, width: 30, height: 80 },
          fills: [{ type: "SOLID", color: { r: 0.4, g: 0.5, b: 0.6 } }],
        },
      ],
    };

    const parseRes = parser.parse(clusterContainer);
    const element = parseRes.document.sections[0]?.elements[0];
    expect(element).toBeDefined();
    expect(element?.type).toBe("image");
    expect(element?.id).toBe("chart-root-geometry");
    expect((element as any)?.width).toBe(300);
    expect((element as any)?.height).toBe(150);
  });

  const snapshotPath = path.resolve(process.cwd(), "debug/customer/testnewpage.json");
  const hasSnapshot = fs.existsSync(snapshotPath);

  it.runIf(hasSnapshot)("preserves A4-3 chart node 1:9060 as ImageElement from real snapshot", async () => {
    const raw = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
    const rootNode = raw.figmaNode || raw.document || raw;

    const pipeline = new ConversionPipeline({ imageMap: raw.imageMap });
    const result = await pipeline.convert(rootNode, {
      selectedFrameIds: ["1:8990"], // A4-3
      imageMap: raw.imageMap,
      pageOrientation: "portrait",
    });

    // Check IR elements recursively
    const allElements = collectAllElements(
      result.internalDocument.sections.flatMap((s) => s.elements)
    );
    const chartImage = allElements.find((el) => el.id === "1:9060-geometry");

    expect(chartImage).toBeDefined();
    expect(chartImage?.type).toBe("image");
    expect((chartImage as any)?.width).toBe(467);
    expect((chartImage as any)?.height).toBe(288);

    // Verify Fallback notice is registered for the geometry cluster
    const clusterNotice = result.notices.find(
      (n) => n.nodeId === "1:9060" && n.status === "Fallback"
    );
    expect(clusterNotice).toBeDefined();
    expect(clusterNotice?.message).toContain("Geometry cluster (18 shapes)");
  });

  it.runIf(hasSnapshot)("preserves Progress bar node 1:9050 in A4-2 as ImageElement from real snapshot", async () => {
    const raw = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
    const rootNode = raw.figmaNode || raw.document || raw;

    const pipeline = new ConversionPipeline({ imageMap: raw.imageMap });
    const result = await pipeline.convert(rootNode, {
      selectedFrameIds: ["1:8987"], // A4-2
      imageMap: raw.imageMap,
      pageOrientation: "portrait",
    });

    const allElements = collectAllElements(
      result.internalDocument.sections.flatMap((s) => s.elements)
    );
    const progressImage = allElements.find((el) => el.id === "1:9050-geometry");

    expect(progressImage).toBeDefined();
    expect(progressImage?.type).toBe("image");
    expect((progressImage as any)?.width).toBe(280);
    expect((progressImage as any)?.height).toBe(8);
  });
});

