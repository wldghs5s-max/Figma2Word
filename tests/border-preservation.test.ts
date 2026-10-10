import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import {
  ContainerElement,
  DocElement,
  InternalDocument,
  LineElement,
  ParagraphElement,
} from "../src/model/index.js";

function paragraph(text: string): ParagraphElement {
  return { type: "paragraph", alignment: "left", runs: [{ text }] };
}

function documentOf(elements: DocElement[]): InternalDocument {
  return {
    version: "1.0.0",
    metadata: {
      title: "Border Preservation Test",
      convertedAt: "2026-10-10T00:00:00.000Z",
      conversionMode: "balanced",
    },
    pageConfig: {
      size: "A4",
      widthMm: 210,
      heightMm: 297,
      orientation: "portrait",
      marginsMm: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    },
    sections: [{ id: "sec", elements }],
  };
}

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

async function xmlOf(elements: DocElement[]): Promise<string> {
  const buffer = await new DocxRenderer().renderToBuffer(documentOf(elements));
  return readZipEntry(buffer, "word/document.xml");
}

function tableCount(xml: string): number {
  return (xml.match(/<w:tbl[\s>]/g) ?? []).length;
}

describe("Border Preservation & Empty Container Defect Prevention (Step 1)", () => {
  // Case 1: Empty container with #000000 black border is preserved as 1x1 table
  it("Case 1: empty container with #000000 black border is preserved and not deleted", async () => {
    const blackBorderContainer: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      border: {
        width: 1,
        style: "solid",
        color: { r: 0, g: 0, b: 0, a: 1, hex: "000000" },
      },
      children: [],
    };

    const xml = await xmlOf([paragraph("Before"), blackBorderContainer, paragraph("After")]);
    expect(tableCount(xml)).toBe(1);
    expect(xml).toContain('w:color="000000"');
    expect(xml).toContain("Before");
    expect(xml).toContain("After");
  });

  // Case 2: Empty container with #E5E7EB gray border is preserved as 1x1 table
  it("Case 2: empty container with #E5E7EB gray border is preserved and not deleted", async () => {
    const grayBorderContainer: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      border: {
        width: 1,
        style: "solid",
        color: { r: 229, g: 231, b: 235, a: 1, hex: "E5E7EB" },
      },
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
      children: [],
    };

    const xml = await xmlOf([paragraph("Top"), grayBorderContainer, paragraph("Bottom")]);
    expect(tableCount(xml)).toBe(1);
    expect(xml).toContain('w:color="E5E7EB"');
    expect(xml).toContain("Top");
    expect(xml).toContain("Bottom");
  });

  // Case 3: Empty container with background fill only (no border) is suppressed (existing design intent)
  it("Case 3: empty container with background only suppresses table creation as intended", async () => {
    const bgOnlyContainer: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      background: { r: 240, g: 240, b: 240, a: 1, hex: "F0F0F0" },
      children: [],
    };

    const xml = await xmlOf([paragraph("Start"), bgOnlyContainer, paragraph("End")]);
    expect(tableCount(xml)).toBe(0);
    expect(xml).toContain("Start");
    expect(xml).toContain("End");
  });

  // Case 4: Pure empty container (no border, no background) produces zero tables
  it("Case 4: pure empty container without border or background creates zero tables", async () => {
    const pureEmptyContainer: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      children: [],
    };

    const xml = await xmlOf([paragraph("Alpha"), pureEmptyContainer, paragraph("Beta")]);
    expect(tableCount(xml)).toBe(0);
    expect(xml).toContain("Alpha");
    expect(xml).toContain("Beta");
  });

  // Case 5: Explicit LineElement is preserved as a border paragraph
  it("Case 5: explicit LineElement is preserved", async () => {
    const line: LineElement = {
      type: "line",
      thickness: 1,
      color: { r: 200, g: 200, b: 200, a: 1, hex: "C8C8C8" },
      length: "100%",
    };

    const xml = await xmlOf([paragraph("Above Line"), line, paragraph("Below Line")]);
    expect(xml).toContain('w:color="C8C8C8"');
    expect(xml).toContain("Above Line");
    expect(xml).toContain("Below Line");
  });

  // Case 6: Existing SAFE-B regression test works for non-A1B0BF colors as well
  it("Case 6: SAFE-B wrapper flattening works for generalized colors (e.g. #3BC7D1)", async () => {
    const TEAL = { r: 59, g: 199, b: 209, a: 1, hex: "3BC7D1" };
    const parent: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      border: { width: 1, style: "solid", color: TEAL },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      children: [
        {
          type: "container",
          layoutDirection: "vertical",
          gap: 0,
          background: TEAL,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          children: [],
        },
      ],
    };

    const xml = await xmlOf([parent]);
    expect(xml).toContain('w:fill="3BC7D1"');
    expect(xml).toContain('w:color="3BC7D1"');
    expect(tableCount(xml)).toBe(1);
  });

  // Case 7: Real cards, tab bars, and multi-element containers remain intact
  it("Case 7: preserves real cards with header and text as 1x1 table", async () => {
    const card: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      background: { r: 255, g: 255, b: 255, a: 1, hex: "FFFFFF" },
      border: { color: { r: 0, g: 0, b: 0, a: 1, hex: "000000" }, width: 1, style: "solid" },
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
      children: [
        { type: "heading", level: 2, runs: [{ text: "Card Heading" }] },
        paragraph("Card Body Content"),
      ],
    };

    const xml = await xmlOf([card]);
    expect(tableCount(xml)).toBe(1);
    expect(xml).toContain("Card Heading");
    expect(xml).toContain("Card Body Content");
    expect(xml).toContain('w:color="000000"');
  });
});

