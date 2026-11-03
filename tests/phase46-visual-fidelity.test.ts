import { describe, it, expect } from "vitest";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { detectSemanticTable, classifyCellContent } from "../src/canvas/parser/semanticTableDetector.js";
import { FigmaNode } from "../src/parser/types.js";

describe("Phase 46: Visual Fidelity & Semantic Table Rendering Hardening", () => {
  const frameBox = { x: 0, y: 0, width: 800, height: 600 };

  it("1. P1-01: Table cells with TEXT node fills NEVER use text color as cell background", () => {
    // Create a 2x2 table where cells are TEXT nodes with dark navy font (#1A253C)
    const tableNode: FigmaNode = {
      id: "tbl_1",
      name: "data-table",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 50, y: 50, width: 400, height: 100 },
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }], // White table background
      children: [
        {
          id: "row_0",
          name: "row-header",
          type: "FRAME",
          visible: true,
          layoutMode: "HORIZONTAL",
          absoluteBoundingBox: { x: 50, y: 50, width: 400, height: 50 },
          children: [
            {
              id: "cell_0_0",
              name: "Header 1",
              type: "TEXT",
              visible: true,
              characters: "Header 1",
              fills: [{ type: "SOLID", visible: true, color: { r: 0.1, g: 0.145, b: 0.235, a: 1 } }], // Navy text fill
              absoluteBoundingBox: { x: 50, y: 50, width: 200, height: 50 },
            },
            {
              id: "cell_0_1",
              name: "Header 2",
              type: "TEXT",
              visible: true,
              characters: "Header 2",
              fills: [{ type: "SOLID", visible: true, color: { r: 0.1, g: 0.145, b: 0.235, a: 1 } }],
              absoluteBoundingBox: { x: 250, y: 50, width: 200, height: 50 },
            },
          ],
        },
        {
          id: "row_1",
          name: "row-data",
          type: "FRAME",
          visible: true,
          layoutMode: "HORIZONTAL",
          absoluteBoundingBox: { x: 50, y: 100, width: 400, height: 50 },
          children: [
            {
              id: "cell_1_0",
              name: "Data 1",
              type: "TEXT",
              visible: true,
              characters: "Data 1",
              fills: [{ type: "SOLID", visible: true, color: { r: 0.1, g: 0.145, b: 0.235, a: 1 } }],
              absoluteBoundingBox: { x: 50, y: 100, width: 200, height: 50 },
            },
            {
              id: "cell_1_1",
              name: "Data 2",
              type: "TEXT",
              visible: true,
              characters: "Data 2",
              fills: [{ type: "SOLID", visible: true, color: { r: 0.1, g: 0.145, b: 0.235, a: 1 } }],
              absoluteBoundingBox: { x: 250, y: 100, width: 200, height: 50 },
            },
          ],
        },
      ],
    };

    const result = detectSemanticTable(tableNode, 1.0, 1.0, frameBox);
    expect(result.isTable).toBe(true);
    expect(result.tableData).toBeDefined();

    // Verify cell backgrounds are NOT set to the dark navy font color
    for (const row of result.tableData!.cells) {
      for (const cell of row) {
        // Cell background must NOT be #1A253C
        expect(cell.backgroundColor).toBeUndefined();
        // Text run color should be preserved as #1A253C
        expect(cell.textRuns[0]?.color?.toUpperCase()).toBe("#1A253C");
      }
    }
  });

  it("2. P1-02: Vertically stacked children inside candidate rows are NOT mistaken for table columns", () => {
    // A vertical container with header and vertical list items (like left-column-personal)
    const listContainer: FigmaNode = {
      id: "list_container",
      name: "personal-info-column",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 100, y: 100, width: 400, height: 300 },
      children: [
        {
          id: "header_row",
          name: "column-header",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 100, y: 100, width: 400, height: 30 },
          children: [
            {
              id: "h_text",
              name: "Header",
              type: "TEXT",
              visible: true,
              characters: "개인정보",
              absoluteBoundingBox: { x: 100, y: 100, width: 100, height: 30 },
            },
          ],
        },
        {
          id: "info_list",
          name: "info-list",
          type: "FRAME",
          visible: true,
          layoutMode: "VERTICAL", // Children are vertically stacked!
          absoluteBoundingBox: { x: 100, y: 135, width: 400, height: 260 },
          children: [
            {
              id: "item_1",
              name: "Item 1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 100, y: 135, width: 400, height: 40 },
            },
            {
              id: "item_2",
              name: "Item 2",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 100, y: 180, width: 400, height: 40 },
            },
            {
              id: "item_3",
              name: "Item 3",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 100, y: 225, width: 400, height: 40 },
            },
          ],
        },
      ],
    };

    const result = detectSemanticTable(listContainer, 1.0, 1.0, frameBox);
    expect(result.isTable).toBe(false);
    expect(result.consumedNodeIds.size).toBe(0);
  });

  it("3. P1-02: Composite cards with progress bars and badges trigger Atomic Fallback", () => {
    // A card cell with progress bar and badges
    const cardCell: FigmaNode = {
      id: "card_kpi",
      name: "card-death",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 10, y: 10, width: 200, height: 140 },
      children: [
        {
          id: "top_row",
          name: "top",
          type: "FRAME",
          visible: true,
          children: [
            { id: "t_title", name: "사망", type: "TEXT", visible: true, characters: "사망" },
            {
              id: "badge",
              name: "badge",
              type: "FRAME",
              visible: true,
              fills: [{ type: "SOLID", visible: true, color: { r: 0.9, g: 0.95, b: 1, a: 1 } }],
              children: [{ id: "t_badge", name: "충분", type: "TEXT", visible: true, characters: "충분" }],
            },
          ],
        },
        { id: "desc", name: "desc", type: "TEXT", visible: true, characters: "기준 대비 충분합니다." },
        {
          id: "progress",
          name: "progress",
          type: "FRAME",
          visible: true,
          fills: [{ type: "SOLID", visible: true, color: { r: 0.9, g: 0.9, b: 0.9, a: 1 } }],
          children: [
            {
              id: "fill",
              name: "fill",
              type: "FRAME",
              visible: true,
              fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0.33, b: 0.65, a: 1 } }],
            },
          ],
        },
        { id: "pct", name: "92%", type: "TEXT", visible: true, characters: "92%" },
        {
          id: "amt_row",
          name: "amounts-row",
          type: "FRAME",
          visible: true,
          children: [
            { id: "l1", name: "필요", type: "TEXT", visible: true, characters: "필요" },
            { id: "v1", name: "3억", type: "TEXT", visible: true, characters: "3억" },
          ],
        },
      ],
    };

    const classification = classifyCellContent(cardCell, 1.0);
    expect(classification.isLosslessInNativeTable).toBe(false);
    expect(classification.lossReason).toMatch(/composite card|graphical shape/);
  });

  it("4. P2-01: Clips decorative background shapes extending beyond canvas boundaries", () => {
    const parentFrame: FigmaNode = {
      id: "home_frame",
      name: "홈",
      type: "FRAME",
      visible: true,
      clipsContent: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 960, height: 600 },
      children: [
        {
          id: "drift_top_right",
          name: "aqua-bg-drift-top-right",
          type: "ELLIPSE",
          visible: true,
          // Starts 100px above page top! (y = -100, height = 250)
          absoluteBoundingBox: { x: 500, y: -100, width: 400, height: 250 },
          fills: [{ type: "SOLID", visible: true, color: { r: 0.8, g: 0.95, b: 1, a: 0.5 } }],
        },
        {
          id: "drift_left",
          name: "aqua-bg-drift-left",
          type: "ELLIPSE",
          visible: true,
          // Starts 50px to the left of page! (x = -50, width = 300)
          absoluteBoundingBox: { x: -50, y: 100, width: 300, height: 200 },
          fills: [{ type: "SOLID", visible: true, color: { r: 0.8, g: 0.95, b: 1, a: 0.5 } }],
        },
      ],
    };

    const parser = new FigmaCanvasParser({ selectedFrameIds: new Set(["home_frame"]) });
    const doc = parser.parse({
      document: {
        type: "DOCUMENT",
        children: [{ id: "canvas", type: "CANVAS", children: [parentFrame] }],
      },
    } as any);

    const page = doc.pages[0];
    expect(page.elements.length).toBe(2);

    const driftTopRight = page.elements.find((e) => e.name === "aqua-bg-drift-top-right");
    expect(driftTopRight).toBeDefined();
    // Must be clamped to y >= 0
    expect(driftTopRight!.bounds.y).toBe(0);
    // Height must be clamped to visible portion scaled by scalePolicy (150 * 0.75 = 112.5)
    expect(driftTopRight!.bounds.height).toBe(112.5);

    const driftLeft = page.elements.find((e) => e.name === "aqua-bg-drift-left");
    expect(driftLeft).toBeDefined();
    // Must be clamped to x >= 0
    expect(driftLeft!.bounds.x).toBe(0);
    // Width must be clamped to visible portion scaled by scalePolicy (250 * 0.75 = 187.5)
    expect(driftLeft!.bounds.width).toBe(187.5);
  });
});
