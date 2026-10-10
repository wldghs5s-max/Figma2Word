import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/index.js";
import { ConversionPipeline } from "../src/pipeline/index.js";
import { FigmaNode } from "../src/parser/types.js";
import { ContainerElement, PageBreakElement } from "../src/model/elements.js";
import * as fs from "fs";
import * as path from "path";

/**
 * Note: These tests use a synthetic reproduction matching the exact structure
 * observed in Screen 36 of the real Figma document (WKt8IKaBJFhbE5kqTPeS6q).
 */
describe("Screen 36 Modal & Flow Frames Isolation Guard", () => {
  const parser = new FigmaParser();
  const pipeline = new ConversionPipeline();

  // Synthetic Screen 36 structure: Top-level Flow container wrapping 3 mobile screens (Touch ID, Dashboard, Budgets)
  const syntheticScreen36Group: FigmaNode = {
    id: "screen-36-flow-group",
    name: "Screen 36 - 온보딩/인증 플로우",
    type: "FRAME",
    layoutMode: "HORIZONTAL",
    absoluteBoundingBox: { x: 0, y: 1000, width: 1250, height: 900 },
    fills: [{ type: "SOLID", color: { r: 0.945, g: 0.96, b: 0.96 } }],
    children: [
      {
        id: "screen-36-touch-id",
        name: "Touch ID Screen",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 1000, width: 375, height: 350 },
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
        children: [
          {
            id: "status-bar-1",
            name: "Status Bar",
            type: "TEXT",
            characters: "9:41",
            style: { fontSize: 14 },
          },
          {
            id: "touch-id-title",
            name: "Title",
            type: "TEXT",
            characters: "Touch ID",
            style: { fontSize: 20 },
          },
          {
            id: "touch-id-desc",
            name: "Desc",
            type: "TEXT",
            characters: "Please place your finger to your phone",
            style: { fontSize: 14 },
          },
        ],
      },
      {
        id: "screen-36-dashboard",
        name: "Home Dashboard",
        type: "FRAME",
        absoluteBoundingBox: { x: 420, y: 1000, width: 375, height: 812 },
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
        children: [
          {
            id: "status-bar-2",
            name: "Status Bar",
            type: "TEXT",
            characters: "9:41",
            style: { fontSize: 14 },
          },
          {
            id: "dash-greeting",
            name: "Greeting",
            type: "TEXT",
            characters: "이름으로님 반갑습니다.",
            style: { fontSize: 20 },
          },
          {
            id: "dash-balance",
            name: "Balance",
            type: "TEXT",
            characters: "3,435,200원",
            style: { fontSize: 24 },
          },
        ],
      },
      {
        id: "screen-36-budgets",
        name: "Budgets Management",
        type: "FRAME",
        absoluteBoundingBox: { x: 840, y: 1000, width: 375, height: 812 },
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
        children: [
          {
            id: "status-bar-3",
            name: "Status Bar",
            type: "TEXT",
            characters: "9:41",
            style: { fontSize: 14 },
          },
          {
            id: "budget-title",
            name: "Budget Title",
            type: "TEXT",
            characters: "Today Budgets",
            style: { fontSize: 20 },
          },
          {
            id: "budget-total",
            name: "Total",
            type: "TEXT",
            characters: "TOTAL 28,000",
            style: { fontSize: 24 },
          },
        ],
      },
    ],
  };

  // Case A: 3 Independent screens / modal frames must NOT merge into a single 3-column table
  it("Case A: unwraps multi-screen flow group into isolated screens separated by page breaks", () => {
    const canvasNode: FigmaNode = {
      id: "canvas-root",
      name: "Canvas with Screen 36 Group",
      type: "CANVAS",
      children: [
        {
          id: "screen-01",
          name: "Screen 01 - Normal Screen",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
          children: [
            { id: "s1-t", name: "Title", type: "TEXT", characters: "Screen 01 Content" },
          ],
        },
        syntheticScreen36Group,
      ],
    };

    const res = parser.parse(canvasNode);
    const elements = res.document.sections[0].elements;

    // Elements should have Screen 01, PageBreak, Touch ID, PageBreak, Dashboard, PageBreak, Budgets
    const containers = elements.filter((e) => e.type === "container") as ContainerElement[];
    const pageBreaks = elements.filter((e) => e.type === "page_break") as PageBreakElement[];

    expect(containers.length).toBe(4); // Screen 01, Touch ID, Dashboard, Budgets
    expect(pageBreaks.length).toBe(3); // 3 PageBreaks separating the 4 screens

    // Ensure none of the screen containers are forced into horizontal 3-column layout
    for (const c of containers) {
      expect(c.layoutDirection).not.toBe("horizontal");
    }

    // Verify container IDs correspond to individual screens
    expect(containers.map((c) => c.id)).toEqual([
      "screen-01",
      "screen-36-touch-id",
      "screen-36-dashboard",
      "screen-36-budgets",
    ]);
  });

  // Case B: Normal 3-column comparison cards inside a single screen MUST keep horizontal 3-column layout
  it("Case B: preserves horizontal 3-column layout for normal comparison cards", () => {
    const screenWithCards: FigmaNode = {
      id: "screen-03-comparison",
      name: "Screen 03 - 3-Card Comparison",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
      children: [
        {
          id: "comparison-row",
          name: "Plan Cards Row",
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          absoluteBoundingBox: { x: 16, y: 200, width: 343, height: 260 },
          children: [
            {
              id: "card-1",
              name: "실속형",
              type: "FRAME",
              absoluteBoundingBox: { x: 16, y: 200, width: 110, height: 260 },
              children: [{ id: "c1-t", name: "T", type: "TEXT", characters: "실속형 +20,000원" }],
            },
            {
              id: "card-2",
              name: "표준형",
              type: "FRAME",
              absoluteBoundingBox: { x: 132, y: 200, width: 110, height: 260 },
              children: [{ id: "c2-t", name: "T", type: "TEXT", characters: "표준형 +37,000원" }],
            },
            {
              id: "card-3",
              name: "고급형",
              type: "FRAME",
              absoluteBoundingBox: { x: 248, y: 200, width: 110, height: 260 },
              children: [{ id: "c3-t", name: "T", type: "TEXT", characters: "고급형 +65,000원" }],
            },
          ],
        },
      ],
    };

    const res = parser.parse(screenWithCards);
    const rootContainer = res.document.sections[0].elements[0] as ContainerElement;
    expect(rootContainer).toBeDefined();

    // Find the horizontal row container or its inner clustered row
    const rowContainer = rootContainer.children.find(
      (c: any) => c.type === "container" && c.layoutDirection === "horizontal"
    ) as ContainerElement;

    expect(rowContainer).toBeDefined();
    // The 3 cards are either directly in rowContainer or clustered in a row-cluster container inside it
    const cards =
      rowContainer.children.length === 3
        ? rowContainer.children
        : (rowContainer.children[0] as ContainerElement).children;
    expect(cards.length).toBe(3);
  });

  // Case C: Normal sibling elements inside container (e.g. 2 buttons or text+icon) do not get broken
  it("Case C: preserves normal button row inside container without premature splitting", () => {
    const screenWithButtons: FigmaNode = {
      id: "screen-buttons",
      name: "Screen With Buttons",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
      children: [
        {
          id: "button-row",
          name: "Buttons",
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          absoluteBoundingBox: { x: 20, y: 700, width: 335, height: 48 },
          children: [
            {
              id: "btn-prev",
              name: "이전 버튼",
              type: "FRAME",
              absoluteBoundingBox: { x: 20, y: 700, width: 160, height: 48 },
              children: [{ id: "b1", name: "T", type: "TEXT", characters: "이전" }],
            },
            {
              id: "btn-next",
              name: "다음 버튼",
              type: "FRAME",
              absoluteBoundingBox: { x: 195, y: 700, width: 160, height: 48 },
              children: [{ id: "b2", name: "T", type: "TEXT", characters: "다음" }],
            },
          ],
        },
      ],
    };

    const res = parser.parse(screenWithButtons);
    const rootContainer = res.document.sections[0].elements[0] as ContainerElement;
    const btnRow = rootContainer.children.find(
      (c: any) => c.type === "container" && c.layoutDirection === "horizontal"
    ) as ContainerElement;

    expect(btnRow).toBeDefined();
    const buttons =
      btnRow.children.length === 2
        ? btnRow.children
        : (btnRow.children[0] as ContainerElement).children;
    expect(buttons.length).toBe(2);
  });

  // Case D: End-to-end DOCX generation with synthetic Screen 36
  it("Case D: generates valid DOCX with individual full-width pages for each screen of Screen 36", async () => {
    const canvasNode: FigmaNode = {
      id: "canvas-root",
      name: "Canvas Synthetic Screen 36",
      type: "CANVAS",
      children: [syntheticScreen36Group],
    };

    const outputPath = path.join(process.cwd(), "debug/test-screen36-unwrapped.docx");
    const result = await pipeline.convert(canvasNode, { outputPath });

    expect(result.docxBuffer).toBeInstanceOf(Buffer);
    expect(result.docxBuffer.length).toBeGreaterThan(3000);
    expect(fs.existsSync(outputPath)).toBe(true);

    // Verify OpenXML has PageBreaks separating the 3 screens
    const { inflateRawSync } = await import("node:zlib");
    const buffer = result.docxBuffer;
    let offset = 0;
    let xml = "";
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
      if (name === "word/document.xml") {
        const bytes = method === 0 ? compressed : inflateRawSync(compressed);
        xml = bytes.toString("utf8");
        break;
      }
      offset = dataStart + compSize;
      if (flags & 0x8) offset += 16;
    }

    // Must have 2 page breaks separating the 3 screens
    const pageBreakMatches = xml.match(/<w:br[^>]*w:type="page"[^>]*>/g) || [];
    expect(pageBreakMatches.length).toBe(2);

    // Must contain texts of all 3 screens
    expect(xml).toContain("Touch ID");
    expect(xml).toContain("이름으로님 반갑습니다.");
    expect(xml).toContain("Today Budgets");

    // The root table must NOT have a 3-column table
    // A 3-column table would have 3 w:gridCol tags inside tblGrid
    const gridCols = [...xml.matchAll(/<w:gridCol\s+w:w="([^"]+)"/g)];
    // Ensure there is no 3-way equal split like 2979 / 2979 / 2979
    const gridWidths = gridCols.map((m) => parseInt(m[1], 10));
    const hasThreeEqualColumns = gridWidths.filter((w) => w === 2979).length >= 3;
    expect(hasThreeEqualColumns).toBe(false);
  });
});
