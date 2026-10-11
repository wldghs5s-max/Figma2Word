import { describe, it, expect } from "vitest";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import { InternalDocument } from "../src/model/document.js";
import { ContainerElement, ParagraphElement } from "../src/model/elements.js";
import { Table, Paragraph, TableCell, TableRow } from "docx";

describe("Step 4B: Adjacent Table Isolation & 1x1 Card Cell Width", () => {
  const renderer = new DocxRenderer();

  it("inserts an isolating zero-spacing paragraph between adjacent tables in renderSequence when gap is 0", () => {
    // Two card containers that render to Table
    const card1: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      border: { style: "solid", width: 1, color: { r: 200, g: 200, b: 200, a: 1, hex: "C8C8C8" } },
      children: [
        {
          type: "paragraph",
          runs: [{ type: "run", text: "Card 1" }],
          alignment: "left",
        },
        {
          type: "paragraph",
          runs: [{ type: "run", text: "Sub 1" }],
          alignment: "left",
        },
      ],
    };

    const card2: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      border: { style: "solid", width: 1, color: { r: 248, g: 250, b: 252, a: 1, hex: "F8FAFC" } },
      padding: { top: 12, left: 18, bottom: 18, right: 18 },
      children: [
        {
          type: "paragraph",
          runs: [{ type: "run", text: "Card 2 Answer" }],
          alignment: "left",
        },
      ],
    };

    const parent: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      children: [card1, card2],
    };

    const rendered = renderer.renderElements([parent]);
    // The parent has 2 children that each render to Table.
    // They must be separated by an isolating Paragraph so Word does not merge them.
    expect(rendered.length).toBe(3);
    expect(rendered[0]).toBeInstanceOf(Table);
    expect(rendered[1]).toBeInstanceOf(Paragraph);
    expect(rendered[2]).toBeInstanceOf(Table);
  });

  it("does not insert extra paragraphs when a paragraph already separates tables", () => {
    const card1: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      border: { style: "solid", width: 1, color: { r: 200, g: 200, b: 200, a: 1, hex: "C8C8C8" } },
      children: [
        { type: "paragraph", runs: [{ type: "run", text: "Card 1" }], alignment: "left" },
        { type: "paragraph", runs: [{ type: "run", text: "Sub 1" }], alignment: "left" },
      ],
    };

    const textBetween: ParagraphElement = {
      type: "paragraph",
      runs: [{ type: "run", text: "Divider text" }],
      alignment: "left",
    };

    const card2: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      border: { style: "solid", width: 1, color: { r: 200, g: 200, b: 200, a: 1, hex: "C8C8C8" } },
      children: [
        { type: "paragraph", runs: [{ type: "run", text: "Card 2" }], alignment: "left" },
        { type: "paragraph", runs: [{ type: "run", text: "Sub 2" }], alignment: "left" },
      ],
    };

    const parent: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      children: [card1, textBetween, card2],
    };

    const rendered = renderer.renderElements([parent]);
    // card1 (Table), textBetween (Paragraph), card2 (Table) -> exactly 3 items, no extra paragraphs
    expect(rendered.length).toBe(3);
    expect(rendered[0]).toBeInstanceOf(Table);
    expect(rendered[1]).toBeInstanceOf(Paragraph);
    expect(rendered[2]).toBeInstanceOf(Table);
  });

  it("specifies explicit 100% width on 1x1 card TableCell to prevent Word starvation", async () => {
    const card: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      border: { style: "solid", width: 1, color: { r: 248, g: 250, b: 252, a: 1, hex: "F8FAFC" } },
      padding: { top: 12, left: 18, bottom: 18, right: 18 },
      children: [
        {
          type: "paragraph",
          runs: [{ type: "run", text: "FAQ Answer text that should have 100% width" }],
          alignment: "left",
        },
      ],
    };

    const doc: InternalDocument = {
      metadata: { title: "Test Doc", convertedAt: new Date().toISOString() },
      sections: [{ elements: [card] }],
    };

    const buffer = await renderer.renderToBuffer(doc);
    expect(buffer).toBeDefined();

    // Inspect the generated OpenXML to verify <w:tcW w:type="pct" w:w="5000"/> exists in the cell
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")!.async("string");

    // Must contain <w:tcW w:type="pct" w:w="5000"/> inside <w:tcPr>
    expect(xml).toMatch(/<w:tcPr>[^<]*<w:tcW\s+w:type="pct"\s+w:w="5000"\/>/);
  });

  it("handles FAQ question (multi-col) followed by FAQ answer (1x1 card) with separation and explicit cell widths", async () => {
    // Question: horizontal row with Question text and accordion spacer
    const questionRow: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      gap: 8,
      columnWidths: [96, 4],
      children: [
        {
          type: "paragraph",
          runs: [{ type: "run", text: "How to use community points?" }],
          alignment: "left",
        },
        {
          type: "paragraph",
          runs: [{ type: "run", text: "" }],
          alignment: "left",
        },
      ],
    };

    // Answer: 1x1 card container with hairline border
    const answerCard: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      border: { style: "solid", width: 1, color: { r: 248, g: 250, b: 252, a: 1, hex: "F8FAFC" } },
      padding: { top: 12, left: 18, bottom: 18, right: 18 },
      children: [
        {
          type: "paragraph",
          runs: [{ type: "run", text: "Points earned from reviews can be used like cash." }],
          alignment: "left",
        },
      ],
    };

    const faqAccordion: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      children: [questionRow, answerCard],
    };

    const doc: InternalDocument = {
      metadata: { title: "FAQ Test", convertedAt: new Date().toISOString() },
      sections: [{ elements: [faqAccordion] }],
    };

    const buffer = await renderer.renderToBuffer(doc);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")!.async("string");

    // Verify there is an isolating <w:p> between the two tables
    // In OpenXML, question table ends with </w:tbl>, then a <w:p> must appear before the next <w:tbl>
    const qIdx = xml.indexOf("How to use community points?");
    const aIdx = xml.indexOf("Points earned from reviews");
    expect(qIdx).toBeGreaterThan(-1);
    expect(aIdx).toBeGreaterThan(-1);

    const betweenXml = xml.substring(qIdx, aIdx);
    expect(betweenXml).toContain("</w:tbl>");
    expect(betweenXml).toContain("<w:p");
    expect(betweenXml).toContain("<w:tbl");

    // Verify </w:tbl> is followed by <w:p before the next <w:tbl
    const firstTblEnd = betweenXml.indexOf("</w:tbl>");
    const secondTblStart = betweenXml.lastIndexOf("<w:tbl");
    const middleSlice = betweenXml.substring(firstTblEnd, secondTblStart);
    expect(middleSlice).toContain("<w:p");
  });

  it("preserves intentionally narrow icon columns in search bars without forcing 100%", () => {
    const searchBar: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      gap: 8,
      columnWidths: [8, 92], // 8% icon, 92% input field
      children: [
        {
          type: "container",
          layoutDirection: "vertical",
          gap: 0,
          children: [
            { type: "paragraph", runs: [{ type: "run", text: "🔍" }], alignment: "center" },
          ],
        },
        {
          type: "paragraph",
          runs: [{ type: "run", text: "Search destinations..." }],
          alignment: "left",
        },
      ],
    };

    const rendered = renderer.renderElements([searchBar]);
    expect(rendered.length).toBe(1);
    expect(rendered[0]).toBeInstanceOf(Table);
  });

  it("preserves normal 2-column and 3-column card layouts", () => {
    const cardGrid: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      gap: 16,
      columnWidths: [33, 33, 34],
      children: [
        {
          type: "container",
          layoutDirection: "vertical",
          gap: 4,
          border: { style: "solid", width: 1, color: { r: 220, g: 220, b: 220, a: 1, hex: "DCDCDC" } },
          children: [{ type: "paragraph", runs: [{ type: "run", text: "Card A" }], alignment: "left" }],
        },
        {
          type: "container",
          layoutDirection: "vertical",
          gap: 4,
          border: { style: "solid", width: 1, color: { r: 220, g: 220, b: 220, a: 1, hex: "DCDCDC" } },
          children: [{ type: "paragraph", runs: [{ type: "run", text: "Card B" }], alignment: "left" }],
        },
        {
          type: "container",
          layoutDirection: "vertical",
          gap: 4,
          border: { style: "solid", width: 1, color: { r: 220, g: 220, b: 220, a: 1, hex: "DCDCDC" } },
          children: [{ type: "paragraph", runs: [{ type: "run", text: "Card C" }], alignment: "left" }],
        },
      ],
    };

    const rendered = renderer.renderElements([cardGrid]);
    expect(rendered.length).toBe(1);
    expect(rendered[0]).toBeInstanceOf(Table);
  });
});
