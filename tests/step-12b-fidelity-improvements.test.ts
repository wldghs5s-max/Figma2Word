import { describe, it, expect } from "vitest";
import { DocxRenderer } from "../src/renderer/index.js";
import { FigmaParser } from "../src/parser/index.js";
import { ParagraphElement, TableElement, InternalDocument } from "../src/model/index.js";
import { FigmaNode } from "../src/parser/types.js";
import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
import { ConversionPipeline } from "../src/pipeline/index.js";

async function extractDocumentXml(docxBuffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const docXml = zip.file("word/document.xml");
  if (!docXml) throw new Error("word/document.xml not found");
  return await docXml.async("string");
}

describe("Step 12B: Real Reference Document Quality Improvements", () => {
  const renderer = new DocxRenderer();
  const parser = new FigmaParser();

  it("Requirement 1: preserves newlines in multi-line text runs as Word line breaks (<w:br/>)", async () => {
    const paragraph: ParagraphElement = {
      id: "p-multiline-1",
      type: "paragraph",
      alignment: "left",
      runs: [
        {
          type: "run",
          text: "Header Line\nSecond Line\n\nFourth Line after blank",
          style: {
            fontSize: 11,
            fontFamily: "Inter",
          },
        },
      ],
    };

    const doc: InternalDocument = {
      metadata: { title: "Multiline Test" },
      pageConfig: { widthMm: 210, heightMm: 297, orientation: "portrait" },
      sections: [{ elements: [paragraph] }],
    };

    const buffer = await renderer.renderToBuffer(doc);
    const xml = await extractDocumentXml(buffer);

    // Verify that <w:br/> tags are generated
    const brMatches = xml.match(/<w:br\/>/g) || [];
    expect(brMatches.length).toBe(3); // 3 newline breaks in the text
    expect(xml).toContain("Header Line");
    expect(xml).toContain("Second Line");
    expect(xml).toContain("Fourth Line after blank");
  });

  it("Requirement 2: does not classify long multi-line body text as a heading even if name contains 'Title'", () => {
    const longText =
      "Document Title: 2026 Annual Performance Report\n" +
      "1. Major achievements: revenue increased by 15%\n" +
      "2. Core tasks: accelerate digital transformation\n" +
      "3. Outlook: expand global strategic partnerships and achieve 35% overseas sales target.";

    const node: FigmaNode = {
      id: "node-text-report",
      name: "Document Title: Annual Summary",
      type: "TEXT",
      characters: longText,
      style: {
        fontSize: 14, // below 16pt threshold
        fontFamily: "Inter",
      },
    };

    const result = parser.parse(node);
    const element = result.document.sections[0].elements[0];

    // Must be mapped to paragraph, NOT heading!
    expect(element.type).toBe("paragraph");
  });

  it("Requirement 3: ensures TableElement renders default professional cell margins (<w:tblCellMar>)", async () => {
    const table: TableElement = {
      id: "tbl-sample-1",
      type: "table",
      columnWidths: [50, 50],
      rows: [
        {
          id: "row-1",
          isHeader: true,
          cells: [
            {
              id: "c-1",
              colSpan: 1,
              rowSpan: 1,
              children: [
                {
                  id: "p-c1",
                  type: "paragraph",
                  alignment: "left",
                  runs: [{ type: "run", text: "Metric" }],
                },
              ],
            },
            {
              id: "c-2",
              colSpan: 1,
              rowSpan: 1,
              children: [
                {
                  id: "p-c2",
                  type: "paragraph",
                  alignment: "left",
                  runs: [{ type: "run", text: "Value" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const doc: InternalDocument = {
      metadata: { title: "Table Margin Test" },
      pageConfig: { widthMm: 210, heightMm: 297, orientation: "portrait" },
      sections: [{ elements: [table] }],
    };

    const buffer = await renderer.renderToBuffer(doc);
    const xml = await extractDocumentXml(buffer);

    // Verify <w:tblCellMar> with comfortable breathing room exists
    expect(xml).toContain("<w:tblCellMar>");
    expect(xml).toContain('<w:top w:type="dxa" w:w="100"/>'); // 5pt = 100 dxa
    expect(xml).toContain('<w:bottom w:type="dxa" w:w="100"/>');
    expect(xml).toContain('<w:left w:type="dxa" w:w="160"/>'); // 8pt = 160 dxa
    expect(xml).toContain('<w:right w:type="dxa" w:w="160"/>');
  });

  it("Requirement 4: converts testnewpage.json A4-1 with preserved line breaks into valid DOCX", async () => {
    const fixturePath = path.resolve(process.cwd(), "debug/customer/testnewpage.json");
    if (!fs.existsSync(fixturePath)) return;

    const raw = fs.readFileSync(fixturePath, "utf8");
    const snapshot = JSON.parse(raw);
    const pipeline = new ConversionPipeline({ imageMap: snapshot.imageMap });

    const result = await pipeline.convert(snapshot.figmaNode, {
      selectedFrameIds: ["1:24"], // A4 - 1
      pageOrientation: "portrait",
    });

    const xml = await extractDocumentXml(result.docxBuffer);
    const brMatches = xml.match(/<w:br\/>/g) || [];

    // The text contains ~30 line breaks that must now all be rendered as <w:br/>
    expect(brMatches.length).toBeGreaterThan(15);
    expect(xml).toContain("2026년 연간 비즈니스 성과 보고서");
  });

  it("Requirement 5: propagates custom page margins via marginsMm in pipeline options", async () => {
    const pipeline = new ConversionPipeline();
    const node: FigmaNode = {
      id: "node-p1",
      name: "Margin Node",
      type: "FRAME",
      children: [
        {
          id: "t1",
          name: "Text",
          type: "TEXT",
          characters: "Sample Text",
        },
      ],
    };

    const result = await pipeline.convert(node, {
      marginsMm: { top: 12, right: 12, bottom: 12, left: 12 },
    });

    const xml = await extractDocumentXml(result.docxBuffer);
    // 12mm in dxa: Math.round(12 * 1440 / 25.4) = 680 dxa
    expect(xml).toContain('w:top="680"');
    expect(xml).toContain('w:bottom="680"');
  });
});

