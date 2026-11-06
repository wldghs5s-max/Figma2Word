import { describe, it, expect } from "vitest";
import { DocxCanvasRenderer, buildClippedEllipsePath } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer, buildClippedEllipseHwpxPoints } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument, CanvasElement, ptToHwpu } from "../src/canvas/types.js";
import { FigmaNode } from "../src/parser/types.js";

describe("Phase 46.2: Renderer-Level Clipping Completion & Real-World Visual Fidelity", () => {
  const docxRenderer = new DocxCanvasRenderer();
  const hwpxRenderer = new HwpxCanvasRenderer();

  function makeTestDoc(elem: CanvasElement): CanvasDocument {
    return {
      title: "Clipping Verification Test",
      pageSize: { widthPt: 800, heightPt: 600 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          elements: [elem],
        },
      ],
      resources: {},
    };
  }

  // --------------------------------------------------------------------------
  // Counter-Example 1: Clipped Ellipse preserves curvature & center
  // --------------------------------------------------------------------------
  it("1. Clipped Ellipse: DOCX renders <v:shape> path without squishing curvature, HWPX renders <hp:polygon>", async () => {
    // Original ellipse: x = -50, width = 300, y = 0, height = 200 (cx = 100, cy = 100, rx = 150, ry = 100)
    // Clipped to: x >= 0 (clipBounds = [0, 0, 1000, 1000])
    const elem: CanvasElement = {
      id: "clipped_ellipse_01",
      name: "aqua-bg-drift",
      type: "oval",
      bounds: { x: 0, y: 0, width: 250, height: 200 }, // visible window
      originalBounds: { x: -50, y: 0, width: 300, height: 200 },
      clipBounds: { x: 0, y: 0, width: 1000, height: 1000 },
      zIndex: 1,
      style: {
        fillColor: "#00E5FF",
        strokeWidth: 0,
      },
    };

    const doc = makeTestDoc(elem);

    // DOCX XML Verification
    const zip = await docxRenderer.buildZip(doc);
    const docXml = await zip.file("word/document.xml")!.async("string");

    // Must NOT be rendered as a squished <v:oval> with width=250!
    expect(docXml).not.toContain("<v:oval");
    // Must be rendered as <v:shape> with path following the exact sliced ellipse boundary
    expect(docXml).toContain("<v:shape");
    expect(docXml).toContain('coordsize="1000,1000"');
    expect(docXml).toContain('fillcolor="#00E5FF"');

    // Mathematically test path coordinates:
    const pathData = buildClippedEllipsePath(elem.originalBounds!, elem.clipBounds!);
    expect(pathData.bounds).toEqual({ x: 0, y: 0, width: 250, height: 200 });

    // True cubic Bézier curve segments for the smooth circular arcs
    expect(pathData.path).toContain(" c ");
    // Straight flat cut line along the clipped bounding edge
    expect(pathData.path).toContain(" l ");

    // Cut edge along x=0 has exactly the endpoints at y = 100 ± 100 * sqrt(1 - (-100/150)^2) = 100 ± 74.54 pt
    // Normalized to 0..1000 (where 200pt is 1000): 25.46pt -> 127, 174.54pt -> 873
    expect(pathData.path).toContain("0,873");
    expect(pathData.path).toContain("0,127");

    // HWPX Verification
    const hwpxZip = await hwpxRenderer.buildZip(doc);
    const sectionXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

    // Must NOT be <hp:oval> in HWPX!
    expect(sectionXml).not.toContain("<hp:oval");
    // Must be serialized as native KS X 6101 <hp:polygon>
    expect(sectionXml).toContain("<hp:polygon");

    const hwpuPts = buildClippedEllipseHwpxPoints(elem.originalBounds!, elem.clipBounds!);
    expect(hwpuPts.length).toBeGreaterThan(10);
    // Left cut edge must have points at x=0
    expect(hwpuPts.some((p) => p.x === 0)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Counter-Example 2: Unclipped Ellipse retains native <v:oval> and <hp:oval>
  // --------------------------------------------------------------------------
  it("2. Unclipped Ellipse: Renders authentic <v:oval> in DOCX and <hp:oval> in HWPX", async () => {
    const elem: CanvasElement = {
      id: "normal_ellipse_01",
      name: "status-indicator",
      type: "oval",
      bounds: { x: 100, y: 100, width: 40, height: 40 },
      originalBounds: { x: 100, y: 100, width: 40, height: 40 },
      clipBounds: { x: 0, y: 0, width: 800, height: 600 }, // entirely inside
      zIndex: 2,
      style: {
        fillColor: "#10B981",
        strokeWidth: 1,
        strokeColor: "#059669",
      },
    };

    const doc = makeTestDoc(elem);

    // DOCX
    const zip = await docxRenderer.buildZip(doc);
    const docXml = await zip.file("word/document.xml")!.async("string");
    expect(docXml).toContain("<v:oval");
    expect(docXml).toContain('fillcolor="#10B981"');
    expect(docXml).toContain('strokecolor="#059669"');

    // HWPX
    const hwpxZip = await hwpxRenderer.buildZip(doc);
    const sectionXml = await hwpxZip.file("Contents/section0.xml")!.async("string");
    expect(sectionXml).toContain("<hp:ellipse");
  });

  // --------------------------------------------------------------------------
  // Counter-Example 3: Clipped Vector maintains coordorigin & coordsize in DOCX
  // --------------------------------------------------------------------------
  it("3. Clipped Vector: DOCX adjusts coordorigin and coordsize preserving aspect ratio without distortion", async () => {
    // Vector with original bounds [-50, 0, 300, 200] clipped to [0, 0, 250, 200]
    const elem: CanvasElement = {
      id: "vector_clipped_01",
      name: "decorative-wave",
      type: "vector",
      bounds: { x: 0, y: 0, width: 250, height: 200 },
      originalBounds: { x: -50, y: 0, width: 300, height: 200 },
      clipBounds: { x: 0, y: 0, width: 1000, height: 1000 },
      vectorPath: "M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z",
      zIndex: 3,
      style: {
        fillColor: "#3B82F6",
        strokeWidth: 0,
      },
    };

    const doc = makeTestDoc(elem);
    const zip = await docxRenderer.buildZip(doc);
    const docXml = await zip.file("word/document.xml")!.async("string");

    // ox = (0 - (-50)) / 300 * 1000 = 167
    // oy = 0
    // cw = 250 / 300 * 1000 = 833
    // ch = 1000
    expect(docXml).toContain('coordorigin="167,0"');
    expect(docXml).toContain('coordsize="833,1000"');
    expect(docXml).toContain('margin-left:0.000pt');
    expect(docXml).toContain('width:250.000pt');

    // HWPX: Vector is clipped using Sutherland-Hodgman polygon clipping,
    // preserving 1:1 scale (w=250pt, h=200pt) without aspect-ratio squishing
    elem.rawSvgPath = "M 0 0 L 300 0 L 300 200 L 0 200 Z";
    const hwpxZip = await hwpxRenderer.buildZip(doc);
    const sectionXml = await hwpxZip.file("Contents/section0.xml")!.async("string");
    expect(sectionXml).toContain("<hp:polygon");
    // Width and height in HWPUs (250pt = 25000, 200pt = 20000)
    expect(sectionXml).toContain('width="25000"');
    expect(sectionXml).toContain('height="20000"');
  });

  // --------------------------------------------------------------------------
  // Counter-Example 4: Image with both existing Crop and Parent Clip
  // --------------------------------------------------------------------------
  it("4. Image with Crop + Parent Clip: Combines clip crop fractions into VML crop attributes without collision", async () => {
    // Image of 400x300, already cropped 10% on left (imageCrop.left = 0.1),
    // and parent clipped so that left 50pt of 400pt is hidden (12.5% clip)
    const elem: CanvasElement = {
      id: "img_clipped_01",
      name: "hero-photo",
      type: "image",
      imageRef: "res_hero_img",
      bounds: { x: 50, y: 0, width: 350, height: 300 },
      originalBounds: { x: 0, y: 0, width: 400, height: 300 },
      clipBounds: { x: 50, y: 0, width: 1000, height: 1000 },
      imageCrop: {
        top: 0,
        bottom: 0,
        left: 0.1, // 10% designer crop
        right: 0,
      },
      zIndex: 4,
      style: {},
    };

    const doc = makeTestDoc(elem);
    doc.resources = {
      res_hero_img: {
        id: "res_hero_img",
        mimeType: "image/png",
        data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0x90, 0, 0, 1, 0x2c, 8, 2, 0, 0, 0]),
      },
    };

    const zip = await docxRenderer.buildZip(doc);
    const docXml = await zip.file("word/document.xml")!.async("string");

    // Combined cropleft: 0.1 + (1 - 0.1) * (50/400 = 0.125) = 0.1 + 0.9 * 0.125 = 0.2125
    // 0.2125 * 65536 = 13926f
    expect(docXml).toContain('cropleft="13926f"');
    expect(docXml).toContain('margin-left:50.000pt');
    expect(docXml).toContain('width:350.000pt');
  });

  // --------------------------------------------------------------------------
  // Counter-Example 5: Card with Corner Radius clipped on left
  // --------------------------------------------------------------------------
  it("5. Clipped Card: Left corners become flat cut lines (radius=0) while right corners retain radius", async () => {
    // Card with cornerRadius: 20, clipped on the left so x starts at 50 instead of 0
    const elem: CanvasElement = {
      id: "card_clipped_01",
      name: "info-card",
      type: "card",
      bounds: { x: 50, y: 0, width: 250, height: 150 },
      originalBounds: { x: 0, y: 0, width: 300, height: 150 },
      clipBounds: { x: 50, y: 0, width: 1000, height: 1000 },
      zIndex: 5,
      style: {
        fillColor: "#FFFFFF",
        strokeColor: "#E2E8F0",
        strokeWidth: 1,
        cornerRadius: 20,
      },
    };

    const doc = makeTestDoc(elem);
    const zip = await docxRenderer.buildZip(doc);
    const docXml = await zip.file("word/document.xml")!.async("string");

    // Asymmetric cut: TL and BL radii are 0, TR and BR are 20 -> rendered as <v:shape> with path!
    expect(docXml).toContain("<v:shape");
    expect(docXml).toContain('fillcolor="#FFFFFF"');
    // Top-left starts with `m 0,0` (sharp 90-degree corner)
    expect(docXml).toContain("m 0,0");
  });

  // --------------------------------------------------------------------------
  // Counter-Example 6: Preserves Z-Index, Opacity, and Rotation for clipped shapes
  // --------------------------------------------------------------------------
  it("6. Clipped Element retains z-index, opacity, and rotation", async () => {
    const elem: CanvasElement = {
      id: "clipped_rot_01",
      name: "rotated-badge",
      type: "card",
      bounds: { x: 0, y: 10, width: 80, height: 80 },
      originalBounds: { x: -20, y: 10, width: 100, height: 80 },
      clipBounds: { x: 0, y: 0, width: 500, height: 500 },
      zIndex: 42,
      rotation: 45,
      opacity: 0.85,
      style: {
        fillColor: "#6366F1",
      },
    };

    const doc = makeTestDoc(elem);
    const zip = await docxRenderer.buildZip(doc);
    const docXml = await zip.file("word/document.xml")!.async("string");

    expect(docXml).toContain("z-index:42");
    expect(docXml).toContain("rotation:45.00");
    expect(docXml).toContain('opacity="0.85"');
  });

  // --------------------------------------------------------------------------
  // Counter-Example 7: Multi-page document with mixed clipped & unclipped elements
  // --------------------------------------------------------------------------
  it("7. Complex document with mixed clipped and unclipped elements serializes cleanly to valid DOCX and HWPX", async () => {
    const doc: CanvasDocument = {
      title: "Mixed Page Test",
      pageSize: { widthPt: 800, heightPt: 600 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          elements: [
            {
              id: "bg_drift",
              type: "oval",
              bounds: { x: 0, y: 0, width: 250, height: 200 },
              originalBounds: { x: -50, y: 0, width: 300, height: 200 },
              clipBounds: { x: 0, y: 0, width: 800, height: 600 },
              zIndex: 1,
              style: { fillColor: "#E0F2FE" },
            },
            {
              id: "headline",
              type: "text",
              bounds: { x: 50, y: 50, width: 300, height: 40 },
              zIndex: 10,
              textRuns: [{ text: "영업지원시스템 종합 대시보드", fontSizePt: 18, fontWeight: 700 }],
              style: {},
            },
          ],
        },
      ],
      resources: {},
    };

    const docxBuf = await docxRenderer.renderToBuffer(doc);
    expect(docxBuf.length).toBeGreaterThan(1000);

    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    expect(hwpxBuf.length).toBeGreaterThan(1000);
  });

  // --------------------------------------------------------------------------
  // Counter-Example 8: End-to-End Pipeline: Figma VECTOR -> Parser -> IR -> HWPX/DOCX
  // Verifies that the unified coordinate contract eliminates double-shrink
  // --------------------------------------------------------------------------
  it("8. End-to-End Pipeline: Figma VECTOR -> Parser -> IR -> HWPX/DOCX without double-shrink", async () => {
    const figmaTree: FigmaNode = {
      id: "frame_root",
      name: "Page Frame",
      type: "FRAME",
      clipsContent: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
      children: [
        {
          id: "vector_child_1",
          name: "Clipped Banner Wave",
          type: "VECTOR",
          absoluteBoundingBox: { x: -50, y: 0, width: 300, height: 200 },
          fillGeometry: [{ path: "M 0 0 L 300 0 L 300 200 L 0 200 Z" }],
          fills: [{ type: "SOLID", visible: true, color: { r: 0.2, g: 0.4, b: 0.8, a: 1 } }],
        },
      ],
    };

    const parser = new FigmaCanvasParser({ scalePolicy: "1:1" });
    const canvasDoc = parser.parse(figmaTree);

    // 1. Verify Canvas IR contract:
    const elem = canvasDoc.pages[0].elements[0];
    expect(elem.bounds).toEqual({ x: 0, y: 0, width: 250, height: 200 });
    expect(elem.originalBounds).toEqual({ x: -50, y: 0, width: 300, height: 200 });
    expect(elem.vectorSubpaths).toBeDefined();
    // Subpaths in IR are scaled to original bounds (300pt = 30000 HWPU):
    const maxXInIR = Math.max(...elem.vectorSubpaths![0].points.map((p) => p.x));
    expect(maxXInIR).toBe(30000);

    // 2. Verify HWPX Renderer output:
    const hwpxZip = await hwpxRenderer.buildZip(canvasDoc);
    const sectionXml = await hwpxZip.file("Contents/section0.xml")!.async("string");
    expect(sectionXml).toContain("<hp:polygon");
    expect(sectionXml).toContain('width="25000"');
    expect(sectionXml).toContain('height="20000"');

    // Extract all points in <hp:polygon>:
    const ptMatches = [...sectionXml.matchAll(/<hc:pt x="(-?\d+)" y="(-?\d+)"\/>/g)];
    const pts = ptMatches.map((m) => ({ x: parseInt(m[1], 10), y: parseInt(m[2], 10) }));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minX = Math.min(...pts.map((p) => p.x));

    // Must span the entire visible window 0 to 25000 HWPU (250pt), NOT double-squished to 20000 HWPU!
    expect(minX).toBe(0);
    expect(maxX).toBe(25000);

    // 3. Verify DOCX Renderer output on the same Canvas IR:
    const docxZip = await docxRenderer.buildZip(canvasDoc);
    const docXml = await docxZip.file("word/document.xml")!.async("string");
    expect(docXml).toContain('coordorigin="167,0"');
    expect(docXml).toContain('coordsize="833,1000"');
    expect(docXml).toContain('width:250.000pt');
  });
});
