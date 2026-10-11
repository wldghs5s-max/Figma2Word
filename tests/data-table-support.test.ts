import { describe, it, expect } from "vitest";
import { FigmaNode } from "../src/parser/types.js";
import { FigmaParser } from "../src/parser/figmaParser.js";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import { TableElement, ContainerElement } from "../src/model/elements.js";
import { LayoutEngine } from "../src/layout/layoutEngine.js";
import * as jszip from "jszip";

function createTableFixture(rows: number, cols: number, withHeaderBg: boolean = true): FigmaNode {
  const rowNodes: FigmaNode[] = [];
  const colWidth = 120;
  const rowHeight = 36;
  const tableWidth = cols * colWidth;
  const tableHeight = rows * rowHeight;

  for (let r = 0; r < rows; r++) {
    const isHead = r === 0;
    const cellNodes: FigmaNode[] = [];
    for (let c = 0; c < cols; c++) {
      cellNodes.push({
        id: `cell-${r}-${c}`,
        name: `Cell ${r},${c}`,
        type: "FRAME",
        layoutMode: "HORIZONTAL",
        paddingTop: 6,
        paddingBottom: 6,
        paddingLeft: 8,
        paddingRight: 8,
        absoluteBoundingBox: {
          x: c * colWidth,
          y: r * rowHeight,
          width: colWidth,
          height: rowHeight,
        },
        children: [
          {
            id: `text-${r}-${c}`,
            name: `Text ${r},${c}`,
            type: "TEXT",
            characters: isHead ? `Header Col ${c + 1}` : `Val (${r}, ${c})`,
            style: {
              fontWeight: isHead ? "bold" : "normal",
              fontSize: 11,
            },
            absoluteBoundingBox: {
              x: c * colWidth + 8,
              y: r * rowHeight + 6,
              width: colWidth - 16,
              height: rowHeight - 12,
            },
          },
        ],
      });
    }

    rowNodes.push({
      id: `row-${r}`,
      name: isHead ? "Table Header Row" : `Data Row ${r}`,
      type: "FRAME",
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
      absoluteBoundingBox: {
        x: 0,
        y: r * rowHeight,
        width: tableWidth,
        height: rowHeight,
      },
      fills: isHead && withHeaderBg
        ? [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 0.8 }, opacity: 1 }]
        : [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
      children: cellNodes,
    });
  }

  return {
    id: "table-root-node",
    name: "Customer Summary Table",
    type: "FRAME",
    layoutMode: "VERTICAL",
    itemSpacing: 0,
    absoluteBoundingBox: {
      x: 0,
      y: 0,
      width: tableWidth,
      height: tableHeight,
    },
    strokes: [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }],
    strokeWeight: 1,
    children: rowNodes,
  };
}

describe("Step 11A: Logical Data Table Support & False-Positive Guards", () => {
  const parser = new FigmaParser();
  const renderer = new DocxRenderer();

  it("Scenario 1: maps 3 columns x 2 rows Figma layout to a single native TableElement and OpenXML <w:tbl>", async () => {
    const fixture = createTableFixture(2, 3, true);
    const parseRes = parser.parse(fixture);

    const elements = parseRes.document.sections[0].elements;
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("table");

    const tableElem = elements[0] as TableElement;
    expect(tableElem.rows).toHaveLength(2);
    expect(tableElem.rows[0].cells).toHaveLength(3);
    expect(tableElem.rows[1].cells).toHaveLength(3);
    expect(tableElem.rows[0].isHeader).toBe(true);
    expect(tableElem.rows[1].isHeader).toBe(false);

    // Verify cell texts
    const h1Text = (tableElem.rows[0].cells[0].children[0] as any).runs[0].text;
    expect(h1Text).toBe("Header Col 1");
    const d1Text = (tableElem.rows[1].cells[2].children[0] as any).runs[0].text;
    expect(d1Text).toBe("Val (1, 2)");

    // Verify OpenXML structure
    const blob = await renderer.renderToBlob(parseRes.document);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const zip = await jszip.default.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")!.async("text");

    const tblMatches = docXml.match(/<w:tbl[\s>]/g) || [];
    expect(tblMatches).toHaveLength(1); // Exactly 1 table, NO fragmented tables or nesting

    const trMatches = docXml.match(/<w:tr[\s>]/g) || [];
    expect(trMatches).toHaveLength(2); // Exactly 2 rows

    const tcMatches = docXml.match(/<w:tc[\s>]/g) || [];
    expect(tcMatches).toHaveLength(6); // Exactly 6 cells (3 per row)
  });

  it("Scenario 2: preserves 4 columns x 5 rows complex table with header shading and consistent column widths", async () => {
    const fixture = createTableFixture(5, 4, true);
    const parseRes = parser.parse(fixture);

    const elements = parseRes.document.sections[0].elements;
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("table");

    const tableElem = elements[0] as TableElement;
    expect(tableElem.rows).toHaveLength(5);
    expect(tableElem.columnWidths).toHaveLength(4);
    // 100% split across 4 cols = [25, 25, 25, 25]
    expect(tableElem.columnWidths).toEqual([25, 25, 25, 25]);

    // Check header cell background
    const headCellBg = tableElem.rows[0].cells[0].background;
    expect(headCellBg).toBeDefined();
    expect(headCellBg?.hex).toBe("3366CC"); // { r: 0.2, g: 0.4, b: 0.8 } -> 3366CC

    // Render to DOCX
    const blob = await renderer.renderToBlob(parseRes.document);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const zip = await jszip.default.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")!.async("text");

    expect((docXml.match(/<w:tbl[\s>]/g) || []).length).toBe(1);
    expect((docXml.match(/<w:tr[\s>]/g) || []).length).toBe(5);
    expect((docXml.match(/<w:tc[\s>]/g) || []).length).toBe(20);
    expect(docXml).toContain("<w:tblHeader"); // Word native table header repeat support
  });

  it("Scenario 3: guards against false positive on asymmetric card lists with irregular column counts", () => {
    const asymmetricCards: FigmaNode = {
      id: "asymmetric-list",
      name: "Mixed Card Grid",
      type: "FRAME",
      layoutMode: "VERTICAL",
      children: [
        {
          id: "r1",
          name: "Row 1",
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          children: [
            { id: "c1", name: "C1", type: "FRAME", children: [{ id: "t1", name: "T1", type: "TEXT", characters: "Card 1" }] },
            { id: "c2", name: "C2", type: "FRAME", children: [{ id: "t2", name: "T2", type: "TEXT", characters: "Card 2" }] },
            { id: "c3", name: "C3", type: "FRAME", children: [{ id: "t3", name: "T3", type: "TEXT", characters: "Card 3" }] },
          ],
        },
        {
          id: "r2",
          name: "Row 2",
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          children: [
            { id: "c4", name: "C4", type: "FRAME", children: [{ id: "t4", name: "T4", type: "TEXT", characters: "Card 4" }] },
            // Only 1 card in row 2 -> irregular column count!
          ],
        },
      ],
    };

    const parseRes = parser.parse(asymmetricCards);
    const elements = parseRes.document.sections[0].elements;
    expect(elements).toHaveLength(1);
    // Must NOT be classified as a data table
    expect(elements[0].type).toBe("container");
  });

  it("Scenario 4: guards against false positive on side-by-side tall cards without row hierarchy", () => {
    const sideBySideCards: FigmaNode = {
      id: "cards-container",
      name: "Pricing Cards",
      type: "FRAME",
      layoutMode: "VERTICAL",
      children: [
        {
          id: "card-pro",
          name: "Pro Plan",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 100, width: 280, height: 450 },
          children: [{ id: "tp", name: "Title Pro", type: "TEXT", characters: "Pro Plan" }],
        },
        {
          id: "card-ent",
          name: "Enterprise Plan",
          type: "FRAME",
          absoluteBoundingBox: { x: 300, y: 100, width: 280, height: 450 },
          children: [{ id: "te", name: "Title Ent", type: "TEXT", characters: "Enterprise Plan" }],
        },
      ],
    };

    const parseRes = parser.parse(sideBySideCards);
    const elements = parseRes.document.sections[0].elements;
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("container");
  });

  it("Scenario 5: guards against false positive on non-text graphic matrix (icon / color palette grids)", () => {
    const iconGrid: FigmaNode = {
      id: "icon-matrix",
      name: "Icon Matrix",
      type: "FRAME",
      layoutMode: "VERTICAL",
      children: [
        {
          id: "row-1",
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          children: [
            { id: "ico-1", type: "RECTANGLE", fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }] },
            { id: "ico-2", type: "RECTANGLE", fills: [{ type: "SOLID", color: { r: 0, g: 1, b: 0 } }] },
          ],
        },
        {
          id: "row-2",
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          children: [
            { id: "ico-3", type: "RECTANGLE", fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1 } }] },
            { id: "ico-4", type: "RECTANGLE", fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 0 } }] },
          ],
        },
      ],
    };

    const parseRes = parser.parse(iconGrid);
    const elements = parseRes.document.sections[0].elements;
    expect(elements).toHaveLength(1);
    // No text in cells -> must not be a data table
    expect(elements[0].type).not.toBe("table");
  });

  it("Scenario 6: guards against false positive on 2 cols x 3 rows rich comparison card grid (keeps container)", () => {
    const rows: FigmaNode[] = [];
    for (let r = 0; r < 3; r++) {
      rows.push({
        id: `card-row-${r}`,
        name: `Card Row ${r}`,
        type: "FRAME",
        layoutMode: "HORIZONTAL",
        itemSpacing: 20,
        absoluteBoundingBox: { x: 0, y: r * 220, width: 600, height: 200 },
        children: [
          {
            id: `card-${r}-1`,
            name: `Feature Card ${r}-1`,
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: r * 220, width: 290, height: 200 },
            children: [
              { id: `c-t-${r}-1`, name: "Title", type: "TEXT", characters: `기능 안내 카드 ${r}-A` },
              { id: `c-b-${r}-1`, name: "Body", type: "TEXT", characters: "상세 기능 설명 내용이 여러 줄로 풍부하게 서술되어 있습니다." },
              { id: `c-btn-${r}-1`, name: "Button", type: "FRAME", children: [{ id: `b-t-${r}-1`, name: "BtnText", type: "TEXT", characters: "자세히 보기" }] },
            ],
          },
          {
            id: `card-${r}-2`,
            name: `Feature Card ${r}-2`,
            type: "FRAME",
            absoluteBoundingBox: { x: 310, y: r * 220, width: 290, height: 200 },
            children: [
              { id: `c-t-${r}-2`, name: "Title", type: "TEXT", characters: `기능 안내 카드 ${r}-B` },
              { id: `c-b-${r}-2`, name: "Body", type: "TEXT", characters: "상세 기능 설명 내용이 여러 줄로 풍부하게 서술되어 있습니다." },
              { id: `c-btn-${r}-2`, name: "Button", type: "FRAME", children: [{ id: `b-t-${r}-2`, name: "BtnText", type: "TEXT", characters: "자세히 보기" }] },
            ],
          },
        ],
      });
    }

    const cardGrid: FigmaNode = {
      id: "card-grid-container",
      name: "2x3 Comparison Card Grid",
      type: "FRAME",
      layoutMode: "VERTICAL",
      itemSpacing: 20,
      children: rows,
    };

    const parseRes = parser.parse(cardGrid);
    const elements = parseRes.document.sections[0].elements;
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("container");
  });

  it("Scenario 7: guards against false positive on 3 cols x 2 rows KPI metrics card grid (keeps container)", () => {
    const rows: FigmaNode[] = [];
    for (let r = 0; r < 2; r++) {
      rows.push({
        id: `kpi-row-${r}`,
        name: `KPI Row ${r}`,
        type: "FRAME",
        layoutMode: "HORIZONTAL",
        itemSpacing: 10,
        absoluteBoundingBox: { x: 0, y: r * 130, width: 600, height: 110 },
        children: [1, 2, 3].map((c) => ({
          id: `kpi-${r}-${c}`,
          name: `Metric Card ${r}-${c}`,
          type: "FRAME",
          cornerRadius: 8,
          absoluteBoundingBox: { x: (c - 1) * 200, y: r * 130, width: 190, height: 110 },
          children: [
            { id: `k-lbl-${r}-${c}`, name: "Label", type: "TEXT", characters: `총 매출액 ${c}` },
            { id: `k-val-${r}-${c}`, name: "Value", type: "TEXT", characters: `$12,450,000` },
            { id: `k-sub-${r}-${c}`, name: "Trend", type: "TEXT", characters: `+12.4% 전년 대비` },
          ],
        })),
      });
    }

    const kpiGrid: FigmaNode = {
      id: "kpi-grid-container",
      name: "KPI Metrics Dashboard Grid",
      type: "FRAME",
      layoutMode: "VERTICAL",
      itemSpacing: 20,
      children: rows,
    };

    const parseRes = parser.parse(kpiGrid);
    const elements = parseRes.document.sections[0].elements;
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("container");
  });

  it("Scenario 8: guards against false positive on multi-row bento layout (keeps container)", () => {
    const bentoGrid: FigmaNode = {
      id: "bento-container",
      name: "Bento Layout",
      type: "FRAME",
      layoutMode: "VERTICAL",
      children: [
        {
          id: "bento-row-1",
          name: "Row 1",
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          children: [
            { id: "b1", name: "Wide Card", type: "FRAME", absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 180 }, children: [{ id: "bt1", name: "T1", type: "TEXT", characters: "Wide" }] },
            { id: "b2", name: "Narrow Card", type: "FRAME", absoluteBoundingBox: { x: 420, y: 0, width: 180, height: 180 }, children: [{ id: "bt2", name: "T2", type: "TEXT", characters: "Narrow" }] },
          ],
        },
        {
          id: "bento-row-2",
          name: "Row 2",
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          children: [
            { id: "b3", name: "Narrow Card", type: "FRAME", absoluteBoundingBox: { x: 0, y: 200, width: 180, height: 180 }, children: [{ id: "bt3", name: "T3", type: "TEXT", characters: "Narrow" }] },
            { id: "b4", name: "Wide Card", type: "FRAME", absoluteBoundingBox: { x: 200, y: 200, width: 400, height: 180 }, children: [{ id: "bt4", name: "T4", type: "TEXT", characters: "Wide" }] },
          ],
        },
      ],
    };

    const parseRes = parser.parse(bentoGrid);
    const elements = parseRes.document.sections[0].elements;
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("container");
  });

  it("Scenario 9: preserves structured 4 cols x 4 rows specification table with lower text density (keeps table)", () => {
    // 4 cols x 4 rows table where only some cells have text (e.g. 8 of 16 cells have text = 50% density)
    const rowNodes: FigmaNode[] = [];
    const colWidth = 100;
    const rowHeight = 32;

    for (let r = 0; r < 4; r++) {
      const cellNodes: FigmaNode[] = [];
      for (let c = 0; c < 4; c++) {
        const hasText = (r + c) % 2 === 0; // 8 cells have text, 8 cells are empty
        cellNodes.push({
          id: `spec-cell-${r}-${c}`,
          name: `Cell ${r},${c}`,
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          absoluteBoundingBox: { x: c * colWidth, y: r * rowHeight, width: colWidth, height: rowHeight },
          children: hasText
            ? [{ id: `st-${r}-${c}`, type: "TEXT", characters: `Spec ${r}-${c}` }]
            : [],
        });
      }
      rowNodes.push({
        id: `spec-row-${r}`,
        name: `Spec Row ${r}`,
        type: "FRAME",
        layoutMode: "HORIZONTAL",
        itemSpacing: 0,
        absoluteBoundingBox: { x: 0, y: r * rowHeight, width: 400, height: rowHeight },
        children: cellNodes,
      });
    }

    const specTable: FigmaNode = {
      id: "spec-table-root",
      name: "Product Specifications Table",
      type: "FRAME",
      layoutMode: "VERTICAL",
      itemSpacing: 0,
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 128 },
      children: rowNodes,
    };

    const parseRes = parser.parse(specTable);
    const elements = parseRes.document.sections[0].elements;
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("table");
    const tbl = elements[0] as TableElement;
    expect(tbl.rows).toHaveLength(4);
    expect(tbl.rows[0].cells).toHaveLength(4);
  });

  it("Scenario 10 (A4 Layout): clusters side-by-side tall comparison cards (270x650) inside A4 document into horizontal row", () => {
    const a4Doc: FigmaNode = {
      id: "a4-doc-root",
      name: "A4 Report Document",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 595, height: 842 },
      children: [
        {
          id: "card-left",
          name: "Plan A Card",
          type: "FRAME",
          absoluteBoundingBox: { x: 20, y: 100, width: 270, height: 650 },
          children: [
            { id: "t-a1", type: "TEXT", characters: "Plan A Standard" },
            { id: "t-a2", type: "TEXT", characters: "상세 비교 내역 항목들..." },
          ],
        },
        {
          id: "card-right",
          name: "Plan B Card",
          type: "FRAME",
          absoluteBoundingBox: { x: 305, y: 100, width: 270, height: 650 },
          children: [
            { id: "t-b1", type: "TEXT", characters: "Plan B Premium" },
            { id: "t-b2", type: "TEXT", characters: "상세 비교 내역 항목들..." },
          ],
        },
      ],
    };

    const engine = new LayoutEngine();
    const clustered = engine.clusterHorizontalRows(a4Doc.children!, a4Doc);

    // Both cards must be clustered into 1 horizontal row cluster
    expect(clustered).toHaveLength(1);
    expect(clustered[0]._isRowCluster).toBe(true);
    expect(clustered[0].children).toHaveLength(2);

    // Full parse verification
    const parseRes = parser.parse(a4Doc);
    const elements = parseRes.document.sections[0].elements;
    expect(elements).toHaveLength(1);
    const rootContainer = elements[0] as ContainerElement;
    expect(rootContainer.type).toBe("container");
    // Row cluster inside root container has direction 'horizontal'
    const rowCluster = rootContainer.children[0] as ContainerElement;
    expect(rowCluster.type).toBe("container");
    expect(rowCluster.layoutDirection).toBe("horizontal");
    expect(rowCluster.children).toHaveLength(2);
  });

  it("Scenario 11 (Isolation): preserves screen isolation for genuine standalone mobile screens (375x812) on canvas", () => {
    const mobileScreen1: FigmaNode = {
      id: "screen-login",
      name: "Login Screen",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
      children: [
        { id: "t-l1", type: "TEXT", characters: "로그인" },
        { id: "t-l2", type: "TEXT", characters: "아이디를 입력하세요" },
      ],
    };

    const mobileScreen2: FigmaNode = {
      id: "screen-home",
      name: "Home Screen",
      type: "FRAME",
      absoluteBoundingBox: { x: 420, y: 0, width: 375, height: 812 },
      children: [
        { id: "t-h1", type: "TEXT", characters: "메인 홈" },
        { id: "t-h2", type: "TEXT", characters: "환영합니다" },
      ],
    };

    const engine = new LayoutEngine();
    // When on canvas (no parent or parent is CANVAS), each mobile screen is an independent screen
    const clustered = engine.clusterHorizontalRows([mobileScreen1, mobileScreen2]);

    // Independent screens MUST NOT be merged into a row cluster!
    expect(clustered).toHaveLength(2);
    expect(clustered[0]._isRowCluster).toBeFalsy();
    expect(clustered[1]._isRowCluster).toBeFalsy();
  });
});

