import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { LayoutEngine } from "../src/layout/layoutEngine.js";
import { FigmaParser } from "../src/parser/figmaParser.js";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import { FigmaNode } from "../src/parser/types.js";
import { ContainerElement, DocElement } from "../src/model/index.js";

function readZipEntry(buffer: Buffer, entryName: string): string {
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    let compSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    if (flags & 0x8) {
      const nextHeader = buffer.indexOf(Buffer.from([0x50, 0x4b]), dataStart + 4);
      compSize = (nextHeader === -1 ? buffer.length : nextHeader) - dataStart;
    }
    const compressed = buffer.subarray(dataStart, dataStart + compSize);
    if (name === entryName) {
      const bytes = method === 0 ? compressed : inflateRawSync(compressed);
      return bytes.toString("utf8");
    }
    offset = dataStart + compSize;
    if (flags & 0x8) offset += 16;
  }
  throw new Error(`ZIP entry not found: ${entryName}`);
}

function createBentoFixture(): {
  parent: FigmaNode;
  cardLarge: FigmaNode;
  cardWide: FigmaNode;
  cardSmall1: FigmaNode;
  cardSmall2: FigmaNode;
} {
  const cardLarge: FigmaNode = {
    id: "card-large",
    name: "Container - Large",
    type: "FRAME",
    layoutMode: "VERTICAL",
    gridRowAnchorIndex: 0,
    gridColumnAnchorIndex: 0,
    gridRowSpan: 2,
    gridColumnSpan: 2,
    absoluteBoundingBox: { x: 100, y: 100, width: 600, height: 600 },
    children: [{ id: "t-large", name: "Text", type: "TEXT", characters: "Large Bento Card" }],
  };

  const cardWide: FigmaNode = {
    id: "card-wide",
    name: "Container - Wide",
    type: "FRAME",
    layoutMode: "VERTICAL",
    gridRowAnchorIndex: 0,
    gridColumnAnchorIndex: 2,
    gridRowSpan: 1,
    gridColumnSpan: 2,
    absoluteBoundingBox: { x: 716, y: 100, width: 600, height: 292 },
    children: [{ id: "t-wide", name: "Text", type: "TEXT", characters: "Wide Bento Card" }],
  };

  const cardSmall1: FigmaNode = {
    id: "card-small-1",
    name: "Container - Small 1",
    type: "FRAME",
    layoutMode: "VERTICAL",
    gridRowAnchorIndex: 1,
    gridColumnAnchorIndex: 2,
    gridRowSpan: 1,
    gridColumnSpan: 1,
    absoluteBoundingBox: { x: 716, y: 408, width: 292, height: 292 },
    children: [{ id: "t-s1", name: "Text", type: "TEXT", characters: "Small Card 1" }],
  };

  const cardSmall2: FigmaNode = {
    id: "card-small-2",
    name: "Container - Small 2",
    type: "FRAME",
    layoutMode: "VERTICAL",
    gridRowAnchorIndex: 1,
    gridColumnAnchorIndex: 3,
    gridRowSpan: 1,
    gridColumnSpan: 1,
    absoluteBoundingBox: { x: 1024, y: 408, width: 292, height: 292 },
    children: [{ id: "t-s2", name: "Text", type: "TEXT", characters: "Small Card 2" }],
  };

  const parent: FigmaNode = {
    id: "bento-parent",
    name: "Container - Bento Root",
    type: "FRAME",
    layoutMode: "GRID",
    gridRowCount: 2,
    gridColumnCount: 4,
    gridRowGap: 16,
    gridColumnGap: 16,
    absoluteBoundingBox: { x: 100, y: 100, width: 1216, height: 600 },
    children: [cardLarge, cardWide, cardSmall1, cardSmall2],
  };

  return { parent, cardLarge, cardWide, cardSmall1, cardSmall2 };
}

describe("Step 8D: Figma Grid Metadata-driven Bento Layout Restoration", () => {
  const engine = new LayoutEngine();
  const parser = new FigmaParser();
  const renderer = new DocxRenderer();

  it("reconstructs 4-card asymmetric Bento Grid into outer 2-column table with nested right column", async () => {
    const { parent, cardLarge, cardWide, cardSmall1, cardSmall2 } = createBentoFixture();

    // 1. LayoutEngine level check
    const structured = engine.processNodes(parent.children!, parent);

    // Expect outer horizontal grouping with 2 columns: [cardLarge, rightColumn]
    expect(structured.length).toBe(1);
    const outerCluster = structured[0];
    expect((outerCluster as any)._isRowCluster).toBe(true);
    expect(outerCluster.layoutMode).toBe("HORIZONTAL");
    expect((outerCluster as any)._computedColumnWidths).toEqual([50, 50]);
    expect(outerCluster.children?.length).toBe(2);

    const [leftCol, rightCol] = outerCluster.children!;
    expect(leftCol.id).toBe(cardLarge.id);
    expect((rightCol as any)._isBentoSyntheticColumn).toBe(true);
    expect(rightCol.layoutMode).toBe("VERTICAL");

    // Inside right column: cardWide on top, and inner horizontal cluster for small cards
    const rightColChildren = engine.processNodes(rightCol.children!, rightCol);
    expect(rightColChildren.length).toBe(2);
    expect(rightColChildren[0].id).toBe(cardWide.id);
    expect((rightColChildren[1] as any)._isRowCluster).toBe(true);
    expect(rightColChildren[1].layoutMode).toBe("HORIZONTAL");
    expect((rightColChildren[1] as any)._computedColumnWidths).toEqual([50, 50]);
    expect(rightColChildren[1].children?.map((c) => c.id)).toEqual([cardSmall1.id, cardSmall2.id]);

    // 2. Parser / InternalDocument level check
    const parseResult = parser.parse(parent);
    const rootContainer = parseResult.document.sections[0].elements[0] as ContainerElement;
    expect(rootContainer.type).toBe("container");

    // The root should have 1 outer horizontal container with 2 children
    expect(rootContainer.children.length).toBe(1);
    const outerTableElem = rootContainer.children[0] as ContainerElement;
    expect(outerTableElem.type).toBe("container");
    expect(outerTableElem.layoutDirection).toBe("horizontal");
    expect(outerTableElem.columnWidths).toEqual([50, 50]);
    expect(outerTableElem.children.length).toBe(2);

    const [leftCardElem, rightColElem] = outerTableElem.children as [ContainerElement, ContainerElement];
    expect(leftCardElem.id).toBe(cardLarge.id);
    expect(rightColElem.layoutDirection).toBe("vertical");
    expect(rightColElem.children.length).toBe(2);

    // Right column top child: wide card
    const rightTopElem = rightColElem.children[0] as ContainerElement;
    expect(rightTopElem.id).toBe(cardWide.id);

    // Right column bottom child: nested horizontal container (inner table) with 2 small cards
    const rightBottomRow = rightColElem.children[1] as ContainerElement;
    expect(rightBottomRow.layoutDirection).toBe("horizontal");
    expect(rightBottomRow.columnWidths).toEqual([50, 50]);
    expect(rightBottomRow.children.length).toBe(2);
    expect((rightBottomRow.children[0] as ContainerElement).id).toBe(cardSmall1.id);
    expect((rightBottomRow.children[1] as ContainerElement).id).toBe(cardSmall2.id);

    // 3. OpenXML level check
    const docxBuffer = await renderer.renderToBuffer(parseResult.document);
    const xml = readZipEntry(docxBuffer, "word/document.xml");

    // Outer table: should have 2 columns of 50%
    const tblCount = (xml.match(/<w:tbl[\s>]/g) || []).length;
    // Outer table (1) + nested bottom table (1) = at least 2 tables
    expect(tblCount).toBeGreaterThanOrEqual(2);

    // Verify presence of text in correct hierarchy
    expect(xml).toContain("Large Bento Card");
    expect(xml).toContain("Wide Bento Card");
    expect(xml).toContain("Small Card 1");
    expect(xml).toContain("Small Card 2");
  });

  it("supports mirror Bento (large card on right, stacked cards on left)", () => {
    const cardSmall1: FigmaNode = {
      id: "mirror-s1",
      name: "Small 1",
      type: "FRAME",
      layoutMode: "VERTICAL",
      gridRowAnchorIndex: 1,
      gridColumnAnchorIndex: 0,
      gridRowSpan: 1,
      gridColumnSpan: 1,
      absoluteBoundingBox: { x: 100, y: 408, width: 292, height: 292 },
      children: [{ id: "t-s1", name: "Text", type: "TEXT", characters: "Left Small 1" }],
    };

    const cardSmall2: FigmaNode = {
      id: "mirror-s2",
      name: "Small 2",
      type: "FRAME",
      layoutMode: "VERTICAL",
      gridRowAnchorIndex: 1,
      gridColumnAnchorIndex: 1,
      gridRowSpan: 1,
      gridColumnSpan: 1,
      absoluteBoundingBox: { x: 408, y: 408, width: 292, height: 292 },
      children: [{ id: "t-s2", name: "Text", type: "TEXT", characters: "Left Small 2" }],
    };

    const cardWide: FigmaNode = {
      id: "mirror-wide",
      name: "Wide",
      type: "FRAME",
      layoutMode: "VERTICAL",
      gridRowAnchorIndex: 0,
      gridColumnAnchorIndex: 0,
      gridRowSpan: 1,
      gridColumnSpan: 2,
      absoluteBoundingBox: { x: 100, y: 100, width: 600, height: 292 },
      children: [{ id: "t-wide", name: "Text", type: "TEXT", characters: "Left Wide" }],
    };

    const cardLargeRight: FigmaNode = {
      id: "mirror-large",
      name: "Large Right",
      type: "FRAME",
      layoutMode: "VERTICAL",
      gridRowAnchorIndex: 0,
      gridColumnAnchorIndex: 2,
      gridRowSpan: 2,
      gridColumnSpan: 2,
      absoluteBoundingBox: { x: 716, y: 100, width: 600, height: 600 },
      children: [{ id: "t-large", name: "Text", type: "TEXT", characters: "Right Large" }],
    };

    const parent: FigmaNode = {
      id: "mirror-bento-parent",
      name: "Mirror Bento Root",
      type: "FRAME",
      layoutMode: "GRID",
      gridRowCount: 2,
      gridColumnCount: 4,
      gridRowGap: 16,
      gridColumnGap: 16,
      absoluteBoundingBox: { x: 100, y: 100, width: 1216, height: 600 },
      children: [cardWide, cardSmall1, cardSmall2, cardLargeRight],
    };

    const structured = engine.processNodes(parent.children!, parent);
    expect(structured.length).toBe(1);
    const outerCluster = structured[0];
    expect((outerCluster as any)._isRowCluster).toBe(true);
    expect((outerCluster as any)._computedColumnWidths).toEqual([50, 50]);
    expect(outerCluster.children?.length).toBe(2);

    const [leftCol, rightCol] = outerCluster.children!;
    expect((leftCol as any)._isBentoSyntheticColumn).toBe(true);
    expect(rightCol.id).toBe(cardLargeRight.id);
  });

  it("regression guard: normal uniform 2x2 grid (4 cards with span 1x1) falls back to normal 2 row clusters", () => {
    const c1: FigmaNode = {
      id: "grid-c1",
      name: "C1",
      type: "FRAME",
      gridRowAnchorIndex: 0,
      gridColumnAnchorIndex: 0,
      gridRowSpan: 1,
      gridColumnSpan: 1,
      absoluteBoundingBox: { x: 100, y: 100, width: 400, height: 300 },
    };
    const c2: FigmaNode = {
      id: "grid-c2",
      name: "C2",
      type: "FRAME",
      gridRowAnchorIndex: 0,
      gridColumnAnchorIndex: 1,
      gridRowSpan: 1,
      gridColumnSpan: 1,
      absoluteBoundingBox: { x: 520, y: 100, width: 400, height: 300 },
    };
    const c3: FigmaNode = {
      id: "grid-c3",
      name: "C3",
      type: "FRAME",
      gridRowAnchorIndex: 1,
      gridColumnAnchorIndex: 0,
      gridRowSpan: 1,
      gridColumnSpan: 1,
      absoluteBoundingBox: { x: 100, y: 420, width: 400, height: 300 },
    };
    const c4: FigmaNode = {
      id: "grid-c4",
      name: "C4",
      type: "FRAME",
      gridRowAnchorIndex: 1,
      gridColumnAnchorIndex: 1,
      gridRowSpan: 1,
      gridColumnSpan: 1,
      absoluteBoundingBox: { x: 520, y: 420, width: 400, height: 300 },
    };

    const parent: FigmaNode = {
      id: "grid-2x2-parent",
      name: "Grid 2x2",
      type: "FRAME",
      layoutMode: "GRID",
      gridRowCount: 2,
      gridColumnCount: 2,
      absoluteBoundingBox: { x: 100, y: 100, width: 820, height: 620 },
      children: [c1, c2, c3, c4],
    };

    const structured = engine.processNodes(parent.children!, parent);
    // Should produce 2 separate row clusters, not a Bento synthetic column
    expect(structured.length).toBe(2);
    expect(structured[0].children?.map((c) => c.id)).toEqual(["grid-c1", "grid-c2"]);
    expect(structured[1].children?.map((c) => c.id)).toEqual(["grid-c3", "grid-c4"]);
  });

  it("regression guard: containers without grid metadata or with incomplete metadata are safe", () => {
    const c1: FigmaNode = {
      id: "plain-c1",
      name: "C1",
      type: "FRAME",
      absoluteBoundingBox: { x: 100, y: 100, width: 400, height: 300 },
    };
    const c2: FigmaNode = {
      id: "plain-c2",
      name: "C2",
      type: "FRAME",
      absoluteBoundingBox: { x: 520, y: 100, width: 400, height: 300 },
    };

    const parent: FigmaNode = {
      id: "plain-parent",
      name: "Plain Parent",
      type: "FRAME",
      absoluteBoundingBox: { x: 100, y: 100, width: 820, height: 300 },
      children: [c1, c2],
    };

    const structured = engine.processNodes(parent.children!, parent);
    expect(structured.length).toBe(1);
    expect((structured[0] as any)._isRowCluster).toBe(true);
    expect(structured[0].children?.map((c) => c.id)).toEqual(["plain-c1", "plain-c2"]);
  });

  it("regression guard: 3-column and 4-column cards remain single horizontal row clusters", () => {
    const cards3: FigmaNode[] = [
      { id: "c3-1", name: "C1", type: "FRAME", absoluteBoundingBox: { x: 100, y: 100, width: 300, height: 250 } },
      { id: "c3-2", name: "C2", type: "FRAME", absoluteBoundingBox: { x: 420, y: 100, width: 300, height: 250 } },
      { id: "c3-3", name: "C3", type: "FRAME", absoluteBoundingBox: { x: 740, y: 100, width: 300, height: 250 } },
    ];
    const parent3: FigmaNode = {
      id: "parent-3col",
      name: "3 Col Grid",
      type: "FRAME",
      layoutMode: "GRID",
      gridRowCount: 1,
      gridColumnCount: 3,
      absoluteBoundingBox: { x: 100, y: 100, width: 940, height: 250 },
      children: cards3,
    };

    const structured = engine.processNodes(cards3, parent3);
    expect(structured.length).toBe(1);
    expect((structured[0] as any)._isRowCluster).toBe(true);
    expect(structured[0].children?.length).toBe(3);
  });

  it("regression guard: sidebar + body layout remains normal 2-column row cluster", () => {
    const sidebar: FigmaNode = {
      id: "sidebar",
      name: "Sidebar",
      type: "FRAME",
      absoluteBoundingBox: { x: 100, y: 100, width: 260, height: 800 },
    };
    const mainContent: FigmaNode = {
      id: "main-content",
      name: "Main",
      type: "FRAME",
      absoluteBoundingBox: { x: 380, y: 100, width: 800, height: 800 },
    };
    const desktopPage: FigmaNode = {
      id: "desktop-page",
      name: "Desktop Page",
      type: "FRAME",
      absoluteBoundingBox: { x: 100, y: 100, width: 1200, height: 900 },
      children: [sidebar, mainContent],
    };

    const structured = engine.processNodes([sidebar, mainContent], desktopPage);
    expect(structured.length).toBe(1);
    expect((structured[0] as any)._isRowCluster).toBe(true);
    expect((structured[0] as any)._computedColumnWidths).toEqual([25, 75]);
  });

  it("regression guard: vertical card list remains separate items without clustering", () => {
    const vCards: FigmaNode[] = [
      { id: "vc-1", name: "VC 1", type: "FRAME", absoluteBoundingBox: { x: 100, y: 100, width: 600, height: 120 } },
      { id: "vc-2", name: "VC 2", type: "FRAME", absoluteBoundingBox: { x: 100, y: 240, width: 600, height: 120 } },
      { id: "vc-3", name: "VC 3", type: "FRAME", absoluteBoundingBox: { x: 100, y: 380, width: 600, height: 120 } },
    ];
    const vParent: FigmaNode = {
      id: "v-list-parent",
      name: "Vertical List",
      type: "FRAME",
      layoutMode: "VERTICAL",
      absoluteBoundingBox: { x: 100, y: 100, width: 600, height: 400 },
      children: vCards,
    };

    const structured = engine.processNodes(vCards, vParent);
    expect(structured.length).toBe(3);
    expect(structured.every((s) => !(s as any)._isRowCluster)).toBe(true);
  });

  it("regression guard: incomplete or inconsistent grid metadata falls back safely to regular clustering", () => {
    const c1: FigmaNode = {
      id: "inc-1",
      name: "Inc 1",
      type: "FRAME",
      // Has rowSpan but missing colSpan / anchors
      gridRowSpan: 2,
      absoluteBoundingBox: { x: 100, y: 100, width: 600, height: 600 },
    };
    const c2: FigmaNode = {
      id: "inc-2",
      name: "Inc 2",
      type: "FRAME",
      absoluteBoundingBox: { x: 716, y: 100, width: 600, height: 292 },
    };
    const c3: FigmaNode = {
      id: "inc-3",
      name: "Inc 3",
      type: "FRAME",
      absoluteBoundingBox: { x: 716, y: 408, width: 292, height: 292 },
    };

    const parent: FigmaNode = {
      id: "inc-parent",
      name: "Incomplete Grid Parent",
      type: "FRAME",
      layoutMode: "GRID",
      // Grid dimensions indicate 1x1, which contradicts 2x2 spans
      gridRowCount: 1,
      gridColumnCount: 1,
      absoluteBoundingBox: { x: 100, y: 100, width: 1216, height: 600 },
      children: [c1, c2, c3],
    };

    // Should not throw, should fall back safely to standard clustering
    expect(() => engine.processNodes(parent.children!, parent)).not.toThrow();
    const structured = engine.processNodes(parent.children!, parent);
    expect(structured.length).toBeGreaterThanOrEqual(1);
  });
});

