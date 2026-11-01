import { describe, it, expect } from "vitest";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { detectSemanticTable } from "../src/canvas/parser/semanticTableDetector.js";
import { FigmaNode } from "../src/parser/types.js";
import {
  createBusinessDataTableFixture,
  createManagementDashboardFixture,
} from "./fixtures/generalization/figmaFixtures.js";

describe("Phase 44.1: Targeted Corrective Patch & Generalization Readiness", () => {
  const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
  const frameBox = { x: 0, y: 0, width: 800, height: 600 };

  // =========================================================================
  // Track 1: P0-02 Name-Bypass Elimination & Invariance
  // =========================================================================

  it("1. Card grid named 'Data_Table_Grid_표' is NOT recognized as a table (Name cannot bypass structural guards)", () => {
    // Card grid with jagged/misaligned row items named "table"
    const cardGridNamedTable: FigmaNode = {
      id: "card_grid_frame",
      name: "Data_Table_Grid_표",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 50, y: 50, width: 600, height: 200 },
      children: [
        // Row 1: 3 cards
        {
          id: "row_1",
          name: "Row 1",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 50, width: 600, height: 80 },
          children: [
            {
              id: "c1_1",
              name: "Card 1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 50, y: 50, width: 180, height: 80 },
              children: [{ id: "t1_1", name: "T", type: "TEXT", visible: true, characters: "Card 1" }],
            },
            {
              id: "c1_2",
              name: "Card 2",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 250, y: 50, width: 180, height: 80 },
              children: [{ id: "t1_2", name: "T", type: "TEXT", visible: true, characters: "Card 2" }],
            },
            {
              id: "c1_3",
              name: "Card 3",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 450, y: 50, width: 180, height: 80 },
              children: [{ id: "t1_3", name: "T", type: "TEXT", visible: true, characters: "Card 3" }],
            },
          ],
        },
        // Row 2: 2 cards with different alignment/width
        {
          id: "row_2",
          name: "Row 2",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 140, width: 450, height: 80 },
          children: [
            {
              id: "c2_1",
              name: "Card 4",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 50, y: 140, width: 220, height: 80 },
              children: [{ id: "t2_1", name: "T", type: "TEXT", visible: true, characters: "Card 4" }],
            },
            {
              id: "c2_2",
              name: "Card 5",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 290, y: 140, width: 200, height: 80 },
              children: [{ id: "t2_2", name: "T", type: "TEXT", visible: true, characters: "Card 5" }],
            },
          ],
        },
      ],
    };

    const result = detectSemanticTable(cardGridNamedTable, 1.0, 1.0, frameBox);
    expect(result.isTable).toBe(false);
    expect(result.consumedNodeIds.size).toBe(0);
  });

  it("2. Valid data table named 'Monthly_Calendar_Schedule_달력' IS recognized as a table (No keyword exclusion)", () => {
    // 3-column table named "달력"
    const calendarTable: FigmaNode = {
      id: "cal_tbl",
      name: "월간 업무 일정 달력 (Monthly Calendar Table)",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 50, y: 50, width: 600, height: 120 },
      children: [
        {
          id: "r0",
          name: "Header",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 50, width: 600, height: 40 },
          fills: [{ type: "SOLID", visible: true, color: { r: 0.9, g: 0.9, b: 0.9, a: 1 } }],
          children: [
            {
              id: "c0_0",
              name: "H0",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 50, y: 50, width: 200, height: 40 },
              children: [{ id: "t0_0", name: "T", type: "TEXT", visible: true, characters: "일자" }],
            },
            {
              id: "c0_1",
              name: "H1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 250, y: 50, width: 200, height: 40 },
              children: [{ id: "t0_1", name: "T", type: "TEXT", visible: true, characters: "주요 일정" }],
            },
            {
              id: "c0_2",
              name: "H2",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 450, y: 50, width: 200, height: 40 },
              children: [{ id: "t0_2", name: "T", type: "TEXT", visible: true, characters: "담당 부서" }],
            },
          ],
        },
        {
          id: "r1",
          name: "Row 1",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 90, width: 600, height: 40 },
          children: [
            {
              id: "c1_0",
              name: "D0",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 50, y: 90, width: 200, height: 40 },
              children: [{ id: "t1_0", name: "T", type: "TEXT", visible: true, characters: "2026-11-05" }],
            },
            {
              id: "c1_1",
              name: "D1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 250, y: 90, width: 200, height: 40 },
              children: [{ id: "t1_1", name: "T", type: "TEXT", visible: true, characters: "안전 점검 착수" }],
            },
            {
              id: "c1_2",
              name: "D2",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 450, y: 90, width: 200, height: 40 },
              children: [{ id: "t1_2", name: "T", type: "TEXT", visible: true, characters: "안전진단팀" }],
            },
          ],
        },
        {
          id: "r2",
          name: "Row 2",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 130, width: 600, height: 40 },
          children: [
            {
              id: "c2_0",
              name: "D0",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 50, y: 130, width: 200, height: 40 },
              children: [{ id: "t2_0", name: "T", type: "TEXT", visible: true, characters: "2026-11-12" }],
            },
            {
              id: "c2_1",
              name: "D1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 250, y: 130, width: 200, height: 40 },
              children: [{ id: "t2_1", name: "T", type: "TEXT", visible: true, characters: "중간 보고회" }],
            },
            {
              id: "c2_2",
              name: "D2",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 450, y: 130, width: 200, height: 40 },
              children: [{ id: "t2_2", name: "T", type: "TEXT", visible: true, characters: "기술총괄실" }],
            },
          ],
        },
      ],
    };

    const result = detectSemanticTable(calendarTable, 1.0, 1.0, frameBox);
    expect(result.isTable).toBe(true);
    expect(result.tableData!.rowCount).toBe(3);
    expect(result.tableData!.colCount).toBe(3);
  });

  it("3. Valid data table named 'Sidebar_Control_Panel' IS recognized as a table (Name 'panel' does not exclude)", () => {
    const panelTable: FigmaNode = {
      id: "panel_tbl",
      name: "Sidebar_Control_Panel",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 50, y: 50, width: 400, height: 80 },
      children: [
        {
          id: "p_r0",
          name: "R0",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 50, width: 400, height: 40 },
          children: [
            {
              id: "p_c0_0",
              name: "C0",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 50, y: 50, width: 200, height: 40 },
              children: [{ id: "t0", name: "T", type: "TEXT", visible: true, characters: "항목" }],
            },
            {
              id: "p_c0_1",
              name: "C1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 250, y: 50, width: 200, height: 40 },
              children: [{ id: "t1", name: "T", type: "TEXT", visible: true, characters: "수치" }],
            },
          ],
        },
        {
          id: "p_r1",
          name: "R1",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 90, width: 400, height: 40 },
          children: [
            {
              id: "p_c1_0",
              name: "C0",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 50, y: 90, width: 200, height: 40 },
              children: [{ id: "t2", name: "T", type: "TEXT", visible: true, characters: "장력" }],
            },
            {
              id: "p_c1_1",
              name: "C1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 250, y: 90, width: 200, height: 40 },
              children: [{ id: "t3", name: "T", type: "TEXT", visible: true, characters: "120 kN" }],
            },
          ],
        },
      ],
    };

    const result = detectSemanticTable(panelTable, 1.0, 1.0, frameBox);
    expect(result.isTable).toBe(true);
    expect(result.tableData!.rowCount).toBe(2);
    expect(result.tableData!.colCount).toBe(2);
  });

  // =========================================================================
  // Track 2: P0-03 Silent Dropping Prevention & Grid Span Completeness
  // =========================================================================

  it("4. Grid Overflow: Row having more cells than grid column count triggers Atomic Fallback (ZERO silent drop)", () => {
    // 3-column table (Row 0 has 3 cells)
    // Row 1 has:
    // - Cell 0 (width 400 -> spans 2 columns: col 0 and 1)
    // - Cell 1 (width 200 -> occupies col 2)
    // - Cell 2 (width 200 -> EXTRA cell that exceeds colCount=3!)
    const overflowTable: FigmaNode = {
      id: "overflow_tbl",
      name: "Overflow Spanned Table",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 50, y: 50, width: 600, height: 80 },
      children: [
        // Row 0: 3 cells -> establishes colCount = 3
        {
          id: "o_r0",
          name: "Row 0",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 50, width: 600, height: 40 },
          children: [
            {
              id: "o_c0_0",
              name: "C0",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 50, y: 50, width: 200, height: 40 },
              children: [{ id: "t0", name: "T", type: "TEXT", visible: true, characters: "H0" }],
            },
            {
              id: "o_c0_1",
              name: "C1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 250, y: 50, width: 200, height: 40 },
              children: [{ id: "t1", name: "T", type: "TEXT", visible: true, characters: "H1" }],
            },
            {
              id: "o_c0_2",
              name: "C2",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 450, y: 50, width: 200, height: 40 },
              children: [{ id: "t2", name: "T", type: "TEXT", visible: true, characters: "H2" }],
            },
          ],
        },
        // Row 1: 3 cells, but first cell spans 2 cols, so 3rd cell overflows!
        {
          id: "o_r1",
          name: "Row 1",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 90, width: 600, height: 40 },
          children: [
            {
              id: "o_c1_0",
              name: "Span 2 Cols",
              type: "FRAME",
              visible: true,
              // Width 400 spans 2 columns (col 0, 1)
              absoluteBoundingBox: { x: 50, y: 90, width: 400, height: 40 },
              children: [{ id: "t3", name: "T", type: "TEXT", visible: true, characters: "Spans 2 cols" }],
            },
            {
              id: "o_c1_1",
              name: "Col 2 Cell",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 450, y: 90, width: 200, height: 40 },
              children: [{ id: "t4", name: "T", type: "TEXT", visible: true, characters: "Occupies col 2" }],
            },
            {
              id: "o_c1_2",
              name: "Extra Overflow Cell",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 650, y: 90, width: 200, height: 40 },
              children: [{ id: "t5", name: "T", type: "TEXT", visible: true, characters: "Overflow Cell" }],
            },
          ],
        },
      ],
    };

    const result = detectSemanticTable(overflowTable, 1.0, 1.0, frameBox);
    // MUST NOT drop o_c1_2 silently! Must trigger atomic fallback!
    expect(result.isTable).toBe(false);
    expect(result.consumedNodeIds.size).toBe(0);
    expect(result.reason).toContain("Atomic Fallback (Grid Span Integrity)");
  });

  it("5. Span Collision: Row 1 cell attempting to occupy an already spanned slot triggers Atomic Fallback", () => {
    // Row 0 Cell 0 has rowSpan=2, colSpan=2 (covers (0,0), (0,1), (1,0), (1,1))
    // Row 1 also defines 2 cells, which would collide on (1,0) and (1,1)
    const collisionTable: FigmaNode = {
      id: "collision_tbl",
      name: "Collision Spanned Table",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 50, y: 50, width: 400, height: 80 },
      children: [
        {
          id: "c_r0",
          name: "Row 0",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 50, width: 400, height: 40 },
          children: [
            {
              id: "c_c0_0",
              name: "Spanning Block",
              type: "FRAME",
              visible: true,
              // Width 400 (colSpan=2), Height 80 (rowSpan=2)
              absoluteBoundingBox: { x: 50, y: 50, width: 400, height: 80 },
              children: [{ id: "t0", name: "T", type: "TEXT", visible: true, characters: "Mega Cell" }],
            },
          ],
        },
        {
          id: "c_r1",
          name: "Row 1",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 90, width: 400, height: 40 },
          children: [
            {
              id: "c_c1_0",
              name: "Colliding Cell 1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 50, y: 90, width: 200, height: 40 },
              children: [{ id: "t1", name: "T", type: "TEXT", visible: true, characters: "Collide 1" }],
            },
            {
              id: "c_c1_1",
              name: "Colliding Cell 2",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 250, y: 90, width: 200, height: 40 },
              children: [{ id: "t2", name: "T", type: "TEXT", visible: true, characters: "Collide 2" }],
            },
          ],
        },
      ],
    };

    const result = detectSemanticTable(collisionTable, 1.0, 1.0, frameBox);
    expect(result.isTable).toBe(false);
    expect(result.consumedNodeIds.size).toBe(0);
    expect(result.reason).toContain("Atomic Fallback (Grid Span Integrity)");
  });

  it("6. Multi-Row Span with pre-occupied column skips correctly without dropping cells", () => {
    // 3x3 Table:
    // Row 0: Cell 0 (rowSpan=2, colSpan=1 at col 0), Cell 1 (col 1), Cell 2 (col 2)
    // Row 1: Cell 0 (should be placed at col 1 because col 0 is spanned!), Cell 1 (col 2)
    // Row 2: Cell 0 (col 0), Cell 1 (col 1), Cell 2 (col 2)
    const multiRowSpanTable: FigmaNode = {
      id: "multi_row_tbl",
      name: "Multi-Row Span Table",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 50, y: 50, width: 600, height: 120 },
      children: [
        {
          id: "m_r0",
          name: "Row 0",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 50, width: 600, height: 40 },
          children: [
            {
              id: "m_c0_0",
              name: "Spanned Row Cell",
              type: "FRAME",
              visible: true,
              // Height 80 means rowSpan=2
              absoluteBoundingBox: { x: 50, y: 50, width: 200, height: 80 },
              children: [{ id: "t0", name: "T", type: "TEXT", visible: true, characters: "Span Row 0-1" }],
            },
            {
              id: "m_c0_1",
              name: "C0_1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 250, y: 50, width: 200, height: 40 },
              children: [{ id: "t1", name: "T", type: "TEXT", visible: true, characters: "H1" }],
            },
            {
              id: "m_c0_2",
              name: "C0_2",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 450, y: 50, width: 200, height: 40 },
              children: [{ id: "t2", name: "T", type: "TEXT", visible: true, characters: "H2" }],
            },
          ],
        },
        {
          id: "m_r1",
          name: "Row 1",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 90, width: 600, height: 40 },
          children: [
            {
              id: "m_c1_0",
              name: "C1_0",
              type: "FRAME",
              visible: true,
              // This cell is at x=250, so it fits at col 1!
              absoluteBoundingBox: { x: 250, y: 90, width: 200, height: 40 },
              children: [{ id: "t3", name: "T", type: "TEXT", visible: true, characters: "D1_1" }],
            },
            {
              id: "m_c1_1",
              name: "C1_1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 450, y: 90, width: 200, height: 40 },
              children: [{ id: "t4", name: "T", type: "TEXT", visible: true, characters: "D1_2" }],
            },
          ],
        },
        {
          id: "m_r2",
          name: "Row 2",
          type: "FRAME",
          visible: true,
          absoluteBoundingBox: { x: 50, y: 130, width: 600, height: 40 },
          children: [
            {
              id: "m_c2_0",
              name: "C2_0",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 50, y: 130, width: 200, height: 40 },
              children: [{ id: "t5", name: "T", type: "TEXT", visible: true, characters: "D2_0" }],
            },
            {
              id: "m_c2_1",
              name: "C2_1",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 250, y: 130, width: 200, height: 40 },
              children: [{ id: "t6", name: "T", type: "TEXT", visible: true, characters: "D2_1" }],
            },
            {
              id: "m_c2_2",
              name: "C2_2",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 450, y: 130, width: 200, height: 40 },
              children: [{ id: "t7", name: "T", type: "TEXT", visible: true, characters: "D2_2" }],
            },
          ],
        },
      ],
    };

    const result = detectSemanticTable(multiRowSpanTable, 1.0, 1.0, frameBox);
    expect(result.isTable).toBe(true);
    expect(result.tableData!.rowCount).toBe(3);
    expect(result.tableData!.colCount).toBe(3);

    // Verify Row 0 Cell 0 has rowSpan = 2
    const r0c0 = result.tableData!.cells[0][0];
    expect(r0c0.rowSpan).toBe(2);
    expect(r0c0.col).toBe(0);

    // Verify Row 1 Cell 0 starts at col 1 because col 0 was occupied by Row 0 Cell 0
    const r1c0 = result.tableData!.cells[1][0];
    expect(r1c0.col).toBe(1);

    // Verify Row 1 Cell 1 starts at col 2
    const r1c1 = result.tableData!.cells[1][1];
    expect(r1c1.col).toBe(2);

    // Verify Row 2 Cell 0 starts at col 0 (span ended)
    const r2c0 = result.tableData!.cells[2][0];
    expect(r2c0.col).toBe(0);
  });

  it("7. Random UUID name table has identical table recognition (Name Invariance)", () => {
    const originalFixture = createBusinessDataTableFixture();
    const mutatedFixture = JSON.parse(JSON.stringify(originalFixture));
    mutatedFixture.children[0].name = "uuid-9f82c3-4811-ba77-9912019";

    const resOrig = detectSemanticTable(originalFixture.children[0], 1.0, 1.0, frameBox);
    const resMut = detectSemanticTable(mutatedFixture.children[0], 1.0, 1.0, frameBox);

    expect(resOrig.isTable).toBe(true);
    expect(resMut.isTable).toBe(true);
    expect(resMut.tableData!.rowCount).toBe(resOrig.tableData!.rowCount);
    expect(resMut.tableData!.colCount).toBe(resOrig.tableData!.colCount);
    expect(resMut.tableData!.cells.length).toBe(resOrig.tableData!.cells.length);
  });

  it("8. Renaming table from 'table' to 'container' maintains identical structural output", () => {
    const originalFixture = createBusinessDataTableFixture();
    const renamedFixture = JSON.parse(JSON.stringify(originalFixture));
    renamedFixture.children[0].name = "Main_Card_Container_Wrapper";

    const resOrig = detectSemanticTable(originalFixture.children[0], 1.0, 1.0, frameBox);
    const resRenamed = detectSemanticTable(renamedFixture.children[0], 1.0, 1.0, frameBox);

    expect(resRenamed.isTable).toBe(true);
    expect(resRenamed.tableData!.rowCount).toBe(resOrig.tableData!.rowCount);
    expect(resRenamed.tableData!.colCount).toBe(resOrig.tableData!.colCount);
    expect(resRenamed.tableData!.cells[0].length).toBe(resOrig.tableData!.cells[0].length);
  });
});
