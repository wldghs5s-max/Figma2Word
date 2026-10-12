import { describe, it, expect } from "vitest";
import { DocxRenderer } from "../src/renderer/index.js";
import { FigmaParser } from "../src/parser/index.js";
import {
  ParagraphElement,
  TableElement,
  ContainerElement,
  PageBreakElement,
  InternalDocument,
} from "../src/model/index.js";
import { FigmaNode } from "../src/parser/types.js";
import JSZip from "jszip";

async function extractDocumentXml(docxBuffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const docXml = zip.file("word/document.xml");
  if (!docXml) throw new Error("word/document.xml not found");
  return await docXml.async("string");
}

describe("Step 12C: Real Multi-Page A4 Document Fidelity Improvements", () => {
  const renderer = new DocxRenderer();
  const parser = new FigmaParser();

  it("Requirement 1: unwraps top-level container in multi-page A4 documents to prevent 1x1 nested table imprisonment", async () => {
    // Top-level container representing an A4 multi-page document with page breaks
    const innerTable: TableElement = {
      id: "tbl-data-1",
      type: "table",
      columnWidths: [50, 50],
      rows: [
        {
          id: "row-1",
          isHeader: false,
          cells: [
            {
              id: "c-1",
              colSpan: 1,
              rowSpan: 1,
              children: [
                {
                  id: "p-cell-1",
                  type: "paragraph",
                  alignment: "left",
                  runs: [{ type: "run", text: "Cell Content 1" }],
                },
              ],
            },
            {
              id: "c-2",
              colSpan: 1,
              rowSpan: 1,
              children: [
                {
                  id: "p-cell-2",
                  type: "paragraph",
                  alignment: "left",
                  runs: [{ type: "run", text: "Cell Content 2" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const pageBreak: PageBreakElement = {
      id: "pb-1",
      type: "page_break",
    };

    const secondPageParagraph: ParagraphElement = {
      id: "p-page2",
      type: "paragraph",
      alignment: "left",
      runs: [{ type: "run", text: "Page 2 Content" }],
    };

    const topContainer: ContainerElement = {
      id: "cnt-a4-multipage",
      type: "container",
      style: {
        width: 595,
        height: 1684,
        backgroundColor: "#FFFFFF",
      },
      children: [innerTable, pageBreak, secondPageParagraph],
    };

    const doc: InternalDocument = {
      metadata: { title: "A4 Multi-page Unwrapping Test" },
      pageConfig: { widthMm: 210, heightMm: 297, orientation: "portrait" },
      sections: [{ elements: [topContainer] }],
    };

    const buffer = await renderer.renderToBuffer(doc);
    const xml = await extractDocumentXml(buffer);

    // Verify page break is rendered directly in body
    expect(xml).toContain('<w:br w:type="page"/>');
    expect(xml).toContain("Cell Content 1");
    expect(xml).toContain("Page 2 Content");

    // In unwrapped rendering, innerTable is NOT placed inside a 1x1 wrapper table.
    // There should only be 1 <w:tbl> (the innerTable itself), not a nested wrapper table.
    const tableMatches = xml.match(/<w:tbl>/g) || [];
    expect(tableMatches.length).toBe(1);
  });

  it("Requirement 2: absorbs sequence gap into previous paragraph spacing.bottom instead of creating empty paragraphs", async () => {
    const p1: ParagraphElement = {
      id: "p1",
      type: "paragraph",
      alignment: "left",
      spacing: { top: 0, bottom: 4 },
      runs: [{ type: "run", text: "Paragraph 1" }],
    };

    const p2: ParagraphElement = {
      id: "p2",
      type: "paragraph",
      alignment: "left",
      spacing: { top: 0, bottom: 4 },
      runs: [{ type: "run", text: "Paragraph 2" }],
    };

    // Container with gap = 16px (12pt = 240 dxa)
    const container: ContainerElement = {
      id: "cnt-gap",
      type: "container",
      layoutDirection: "vertical",
      gap: 16,
      children: [p1, p2],
    };

    const doc: InternalDocument = {
      metadata: { title: "Gap Absorption Test" },
      pageConfig: { widthMm: 210, heightMm: 297, orientation: "portrait" },
      sections: [{ elements: [container] }],
    };

    const buffer = await renderer.renderToBuffer(doc);
    const xml = await extractDocumentXml(buffer);

    // Verify that p1's spacing.bottom absorbed the 16px gap (12pt = 240 dxa): max(4, 12) = 12pt = 240 dxa
    expect(xml).toContain('w:after="240"');
    expect(xml).toContain("Paragraph 1");
    expect(xml).toContain("Paragraph 2");

    // Count paragraphs: exactly 2 content paragraphs inside the cell, no empty filler paragraphs
    const paragraphsWithRuns = (xml.match(/<w:r>/g) || []).length;
    expect(paragraphsWithRuns).toBe(2);
  });

  it("Requirement 3: parser applies adaptive compact margins when A4 screens are detected", () => {
    const figmaA4Node: FigmaNode = {
      id: "canvas-root",
      name: "Canvas",
      type: "CANVAS",
      children: [
        {
          id: "frame-a4-page1",
          name: "A4 - 1",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 794, height: 1123 },
          children: [
            {
              id: "txt-title",
              name: "Title",
              type: "TEXT",
              characters: "Business Proposal",
              style: { fontSize: 18, fontFamily: "Pretendard" },
            },
          ],
        },
      ],
    };

    const result = parser.parse(figmaA4Node);
    expect(result.document.pageConfig.marginsMm).toBeDefined();
    expect(result.document.pageConfig.marginsMm?.top).toBe(5);
    expect(result.document.pageConfig.marginsMm?.bottom).toBe(5);
    expect(result.document.pageConfig.marginsMm?.left).toBe(8);
    expect(result.document.pageConfig.marginsMm?.right).toBe(8);
  });

  it("Requirement 4: preserves exactly 9 pages for a 9-frame A4 document structure", async () => {
    // Construct 9 frames with page breaks between them
    const elements = [];
    for (let i = 1; i <= 9; i++) {
      if (i > 1) {
        elements.push({
          id: `pb-${i}`,
          type: "page_break" as const,
        });
      }
      elements.push({
        id: `p-frame-${i}`,
        type: "paragraph" as const,
        alignment: "left" as const,
        runs: [{ type: "run" as const, text: `Report Page ${i} Content` }],
      });
    }

    const doc: InternalDocument = {
      metadata: { title: "9-Page Document Test" },
      pageConfig: { widthMm: 210, heightMm: 297, orientation: "portrait" },
      sections: [{ elements }],
    };

    const buffer = await renderer.renderToBuffer(doc);
    const xml = await extractDocumentXml(buffer);

    // Exactly 8 explicit page breaks for 9 pages
    const pageBreakMatches = xml.match(/<w:br w:type="page"\/>/g) || [];
    expect(pageBreakMatches.length).toBe(8);
  });
});
