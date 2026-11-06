import { describe, it, expect } from "vitest";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { detectSemanticTable } from "../src/canvas/parser/semanticTableDetector.js";
import { FigmaNode } from "../src/parser/types.js";

describe("Phase 46.1: Universal Clipping Safety & Color Provenance Hardening", () => {
  const frameBox = { x: 0, y: 0, width: 800, height: 600 };

  // ==========================================================================
  // 1. Clipping Safety & Geometry Preservation Tests (Section 4-4)
  // ==========================================================================

  it("1.1 [P1 Clipping]: Partially clipped ellipse preserves original geometry and center", () => {
    // Ellipse starting at x = -50, width = 300, y = 100, height = 200 on 800x600 canvas
    // Expected center: x = (-50 + 300/2) * 0.75 = 100 * 0.75 = 75
    const parentFrame: FigmaNode = {
      id: "frame_clipping_ellipse",
      name: "frame",
      type: "FRAME",
      visible: true,
      clipsContent: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
      children: [
        {
          id: "ellipse_clipped_left",
          name: "ellipse-clipped-left",
          type: "ELLIPSE",
          visible: true,
          absoluteBoundingBox: { x: -50, y: 100, width: 300, height: 200 },
          fills: [{ type: "SOLID", visible: true, color: { r: 0.2, g: 0.4, b: 0.8, a: 1 } }],
        },
      ],
    };

    const parser = new FigmaCanvasParser({ selectedFrameIds: new Set(["frame_clipping_ellipse"]) });
    const doc = parser.parse({
      document: {
        type: "DOCUMENT",
        children: [{ id: "c", type: "CANVAS", children: [parentFrame] }],
      },
    } as any);

    const elem = doc.pages[0].elements[0];
    expect(elem).toBeDefined();

    // Render bounds is clamped to positive page coordinate [0, width]
    expect(elem.bounds.x).toBe(0);
    expect(elem.bounds.width).toBe(250 * 0.75); // 187.5

    // Original geometry MUST be preserved in originalBounds
    expect(elem.originalBounds).toBeDefined();
    expect(elem.originalBounds!.x).toBe(-50 * 0.75); // -37.5
    expect(elem.originalBounds!.width).toBe(300 * 0.75); // 225
    expect(elem.originalBounds!.y).toBe(100 * 0.75); // 75
    expect(elem.originalBounds!.height).toBe(200 * 0.75); // 150

    // Original center is mathematically preserved
    const origCenterX = elem.originalBounds!.x + elem.originalBounds!.width / 2;
    expect(origCenterX).toBe(75);

    // Active clipping region is separated
    expect(elem.clipBounds).toBeDefined();
    expect(elem.clipBounds!.x).toBe(0);
    expect(elem.clipBounds!.y).toBe(0);
  });

  it("1.2 [P1 Clipping]: Vector partially clipped at bottom preserves unskewed original geometry", () => {
    // Vector ending below page (page height = 600, vector y = 550, height = 100)
    const parentFrame: FigmaNode = {
      id: "frame_clipping_vector",
      name: "frame",
      type: "FRAME",
      visible: true,
      clipsContent: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
      children: [
        {
          id: "vector_bottom",
          name: "vector-bottom",
          type: "VECTOR",
          visible: true,
          absoluteBoundingBox: { x: 100, y: 550, width: 200, height: 100 },
          fillGeometry: [{ path: "M 0 0 L 200 0 L 200 100 L 0 100 Z" }],
          fills: [{ type: "SOLID", visible: true, color: { r: 0.1, g: 0.1, b: 0.1, a: 1 } }],
        },
      ],
    };

    const parser = new FigmaCanvasParser({ selectedFrameIds: new Set(["frame_clipping_vector"]) });
    const doc = parser.parse({
      document: {
        type: "DOCUMENT",
        children: [{ id: "c", type: "CANVAS", children: [parentFrame] }],
      },
    } as any);

    const elem = doc.pages[0].elements[0];
    expect(elem).toBeDefined();
    // Clamped height in bounds
    expect(elem.bounds.height).toBe(50 * 0.75); // 37.5
    // Original geometry preserved without skew
    expect(elem.originalBounds!.y).toBe(550 * 0.75);
    expect(elem.originalBounds!.height).toBe(100 * 0.75); // 75
    expect(elem.clipBounds).toBeDefined();
  });

  it("1.3 [P1 Clipping]: Container with clipsContent: false allows children outside container bounds", () => {
    // Parent container is at x = -200, width = 100 (completely outside page x = [0, 600])
    // BUT has clipsContent: false!
    // Its child is positioned at x = 50, width = 100 (inside page)!
    const parentFrame: FigmaNode = {
      id: "page_root",
      name: "page",
      type: "FRAME",
      visible: true,
      clipsContent: true, // Page clips
      absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
      children: [
        {
          id: "offscreen_container",
          name: "offscreen-container",
          type: "FRAME",
          visible: true,
          clipsContent: false, // DOES NOT clip!
          absoluteBoundingBox: { x: -200, y: 100, width: 100, height: 100 },
          children: [
            {
              id: "visible_child",
              name: "visible-child",
              type: "RECTANGLE",
              visible: true,
              absoluteBoundingBox: { x: 50, y: 100, width: 100, height: 100 },
              fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0, a: 1 } }],
            },
          ],
        },
      ],
    };

    const parser = new FigmaCanvasParser({ selectedFrameIds: new Set(["page_root"]) });
    const doc = parser.parse({
      document: {
        type: "DOCUMENT",
        children: [{ id: "c", type: "CANVAS", children: [parentFrame] }],
      },
    } as any);

    const elements = doc.pages[0].elements;
    // The offscreen container card itself is omitted, BUT its visible child inside the page is preserved!
    const visibleChild = elements.find((e) => e.name === "visible-child");
    expect(visibleChild).toBeDefined();
    expect(visibleChild!.bounds.x).toBe(50 * 0.75);
  });

  it("1.4 [P1 Clipping]: Nested clipsContent: true containers compute exact intersection", () => {
    // Outer frame [0, 0, 800, 600] clipsContent: true
    // Inner sub-frame [100, 100, 300, 300] clipsContent: true
    // Grandchild [50, 50, 400, 400]
    const parentFrame: FigmaNode = {
      id: "root_clip",
      name: "root",
      type: "FRAME",
      visible: true,
      clipsContent: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
      children: [
        {
          id: "inner_clip_frame",
          name: "inner-frame",
          type: "FRAME",
          visible: true,
          clipsContent: true,
          absoluteBoundingBox: { x: 100, y: 100, width: 300, height: 300 },
          children: [
            {
              id: "grandchild_card",
              name: "grandchild",
              type: "RECTANGLE",
              visible: true,
              absoluteBoundingBox: { x: 50, y: 50, width: 400, height: 400 },
              fills: [{ type: "SOLID", visible: true, color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } }],
            },
          ],
        },
      ],
    };

    const parser = new FigmaCanvasParser({ selectedFrameIds: new Set(["root_clip"]) });
    const doc = parser.parse({
      document: {
        type: "DOCUMENT",
        children: [{ id: "c", type: "CANVAS", children: [parentFrame] }],
      },
    } as any);

    const grandchild = doc.pages[0].elements.find((e) => e.name === "grandchild");
    expect(grandchild).toBeDefined();
    // Original geometry preserved
    expect(grandchild!.originalBounds!.x).toBe(50 * 0.75);
    expect(grandchild!.originalBounds!.width).toBe(400 * 0.75);
    // Clip bounds must be restricted to inner frame's intersection
    expect(grandchild!.clipBounds).toBeDefined();
    expect(grandchild!.clipBounds!.x).toBe(100 * 0.75);
    expect(grandchild!.clipBounds!.y).toBe(100 * 0.75);
    expect(grandchild!.clipBounds!.width).toBe(300 * 0.75);
    expect(grandchild!.clipBounds!.height).toBe(300 * 0.75);
  });

  // ==========================================================================
  // 2. Color Provenance & Background Handling Tests (Section 5-4)
  // ==========================================================================

  it("2.1 [P2 Color]: Preserves intentional subtle contrast background (dist < 35)", () => {
    // Intentional dark theme cell: background #202020, text #2A2A2A (RGB Euclidean dist = 17.3 < 35)
    // In Phase 46 this was wrongly wiped out. In Phase 46.1 it MUST be preserved!
    const tableNode: FigmaNode = {
      id: "tbl_subtle",
      name: "table-subtle",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 100 },
      children: [
        {
          id: "r0",
          name: "row-0",
          type: "FRAME",
          visible: true,
          layoutMode: "HORIZONTAL",
          absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 50 },
          children: [
            {
              id: "c0_0",
              name: "cell-subtle",
              type: "FRAME",
              visible: true,
              fills: [{ type: "SOLID", visible: true, color: { r: 0.125, g: 0.125, b: 0.125, a: 1 } }], // #202020
              absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 50 },
              children: [
                {
                  id: "t0_0",
                  name: "text",
                  type: "TEXT",
                  visible: true,
                  characters: "Subtle Label",
                  fills: [{ type: "SOLID", visible: true, color: { r: 0.165, g: 0.165, b: 0.165, a: 1 } }], // #2A2A2A
                  absoluteBoundingBox: { x: 10, y: 10, width: 100, height: 30 },
                },
              ],
            },
            {
              id: "c0_1",
              name: "cell-normal",
              type: "FRAME",
              visible: true,
              fills: [{ type: "SOLID", visible: true, color: { r: 0.125, g: 0.125, b: 0.125, a: 1 } }],
              absoluteBoundingBox: { x: 200, y: 0, width: 200, height: 50 },
              children: [
                {
                  id: "t0_1",
                  name: "text",
                  type: "TEXT",
                  visible: true,
                  characters: "Normal Value",
                  fills: [{ type: "SOLID", visible: true, color: { r: 0.9, g: 0.9, b: 0.9, a: 1 } }],
                  absoluteBoundingBox: { x: 210, y: 10, width: 100, height: 30 },
                },
              ],
            },
          ],
        },
        {
          id: "r1",
          name: "row-1",
          type: "FRAME",
          visible: true,
          layoutMode: "HORIZONTAL",
          absoluteBoundingBox: { x: 0, y: 50, width: 400, height: 50 },
          children: [
            {
              id: "c1_0",
              name: "cell-data-0",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 0, y: 50, width: 200, height: 50 },
              children: [
                {
                  id: "t1_0",
                  name: "text",
                  type: "TEXT",
                  visible: true,
                  characters: "Data A",
                  absoluteBoundingBox: { x: 10, y: 60, width: 100, height: 30 },
                },
              ],
            },
            {
              id: "c1_1",
              name: "cell-data-1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 200, y: 50, width: 200, height: 50 },
              children: [
                {
                  id: "t1_1",
                  name: "text",
                  type: "TEXT",
                  visible: true,
                  characters: "Data B",
                  absoluteBoundingBox: { x: 210, y: 60, width: 100, height: 30 },
                },
              ],
            },
          ],
        },
      ],
    };

    const result = detectSemanticTable(tableNode, 1.0, 1.0, frameBox);
    expect(result.isTable).toBe(true);

    const subtleCell = result.tableData!.cells[0][0];
    // Background must be preserved as #202020, NOT wiped out!
    expect(subtleCell.backgroundColor?.toUpperCase()).toBe("#202020");
  });

  it("2.2 [P2 Color]: Cell with empty fills [] properly falls back to row container background", () => {
    // Row has background #F2F4F7
    // Cell 0 has fills = [] (truthy empty array)
    const tableNode: FigmaNode = {
      id: "tbl_row_bg",
      name: "table-row-bg",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 100 },
      children: [
        {
          id: "r0",
          name: "row-header",
          type: "FRAME",
          visible: true,
          layoutMode: "HORIZONTAL",
          fills: [{ type: "SOLID", visible: true, color: { r: 0.949, g: 0.957, b: 0.969, a: 1 } }], // #F2F4F7
          absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 50 },
          children: [
            {
              id: "c0_0",
              name: "cell-empty-fills",
              type: "FRAME",
              visible: true,
              fills: [], // Empty fills array []
              absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 50 },
              children: [
                {
                  id: "t0_0",
                  name: "text",
                  type: "TEXT",
                  visible: true,
                  characters: "Header",
                  absoluteBoundingBox: { x: 10, y: 10, width: 100, height: 30 },
                },
              ],
            },
            {
              id: "c0_1",
              name: "cell-invisible-fill",
              type: "FRAME",
              visible: true,
              fills: [{ type: "SOLID", visible: false, color: { r: 1, g: 0, b: 0, a: 1 } }], // Invisible fill
              absoluteBoundingBox: { x: 200, y: 0, width: 200, height: 50 },
              children: [
                {
                  id: "t0_1",
                  name: "text",
                  type: "TEXT",
                  visible: true,
                  characters: "Header 2",
                  absoluteBoundingBox: { x: 210, y: 10, width: 100, height: 30 },
                },
              ],
            },
          ],
        },
        {
          id: "r1",
          name: "row-data",
          type: "FRAME",
          visible: true,
          layoutMode: "HORIZONTAL",
          absoluteBoundingBox: { x: 0, y: 50, width: 400, height: 50 },
          children: [
            {
              id: "c1_0",
              name: "data-0",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 0, y: 50, width: 200, height: 50 },
              children: [
                { id: "t1_0", name: "text", type: "TEXT", visible: true, characters: "V1" },
              ],
            },
            {
              id: "c1_1",
              name: "data-1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 200, y: 50, width: 200, height: 50 },
              children: [
                { id: "t1_1", name: "text", type: "TEXT", visible: true, characters: "V2" },
              ],
            },
          ],
        },
      ],
    };

    const result = detectSemanticTable(tableNode, 1.0, 1.0, frameBox);
    expect(result.isTable).toBe(true);

    // Both cells must inherit row's #F2F4F7
    const cell0 = result.tableData!.cells[0][0];
    const cell1 = result.tableData!.cells[0][1];
    expect(cell0.backgroundColor?.toUpperCase()).toBe("#F2F4F7");
    expect(cell1.backgroundColor?.toUpperCase()).toBe("#F2F4F7");
  });

  it("2.3 [P2 Color]: Explicit transparent fill (alpha === 0) prevents row background inheritance", () => {
    const tableNode: FigmaNode = {
      id: "tbl_trans",
      name: "table-trans",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 100 },
      children: [
        {
          id: "r0",
          name: "row-header",
          type: "FRAME",
          visible: true,
          layoutMode: "HORIZONTAL",
          fills: [{ type: "SOLID", visible: true, color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }], // Row has dark fill
          absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 50 },
          children: [
            {
              id: "c0_0",
              name: "cell-transparent",
              type: "FRAME",
              visible: true,
              // Explicitly transparent fill!
              fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 0 }, opacity: 0 }],
              absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 50 },
              children: [
                { id: "t0_0", name: "text", type: "TEXT", visible: true, characters: "Transparent" },
              ],
            },
            {
              id: "c0_1",
              name: "cell-inherited",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 200, y: 0, width: 200, height: 50 },
              children: [
                { id: "t0_1", name: "text", type: "TEXT", visible: true, characters: "Inherited" },
              ],
            },
          ],
        },
        {
          id: "r1",
          name: "row-data",
          type: "FRAME",
          visible: true,
          layoutMode: "HORIZONTAL",
          absoluteBoundingBox: { x: 0, y: 50, width: 400, height: 50 },
          children: [
            {
              id: "c1_0",
              name: "d0",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 0, y: 50, width: 200, height: 50 },
              children: [{ id: "t1_0", name: "text", type: "TEXT", visible: true, characters: "A" }],
            },
            {
              id: "c1_1",
              name: "d1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 200, y: 50, width: 200, height: 50 },
              children: [{ id: "t1_1", name: "text", type: "TEXT", visible: true, characters: "B" }],
            },
          ],
        },
      ],
    };

    const result = detectSemanticTable(tableNode, 1.0, 1.0, frameBox);
    expect(result.isTable).toBe(true);

    const transparentCell = result.tableData!.cells[0][0];
    const inheritedCell = result.tableData!.cells[0][1];

    // Transparent cell must NOT inherit row background
    expect(transparentCell.backgroundColor).toBeUndefined();
    // Normal cell inherits row background
    expect(inheritedCell.backgroundColor?.toUpperCase()).toBe("#1A334D");
  });
});
