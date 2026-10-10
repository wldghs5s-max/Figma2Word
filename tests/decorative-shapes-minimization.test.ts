import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import {
  ContainerElement,
  DocElement,
  InternalDocument,
  ParagraphElement,
  ShapeElement,
} from "../src/model/index.js";

function paragraph(text: string): ParagraphElement {
  return { type: "paragraph", alignment: "center", runs: [{ text }] };
}

function documentOf(elements: DocElement[]): InternalDocument {
  return {
    version: "1.0.0",
    metadata: {
      title: "Decorative Shapes Minimization Test",
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

describe("Decorative Shapes Minimization & Badge Flattening", () => {
  const emptyShape: ShapeElement = {
    type: "shape",
    shapeType: "rectangle",
    width: 16,
    height: 16,
  };

  // 1. Empty decorative container with background/border suppresses independent Word table
  it("Test A: suppresses table creation for empty decorative containers with background or border", async () => {
    const emptyContainer: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      background: { r: 240, g: 240, b: 240, a: 1, hex: "F0F0F0" },
      children: [],
    };

    const xml = await xmlOf([paragraph("Before"), emptyContainer, paragraph("After")]);
    expect(tableCount(xml)).toBe(0);
    expect(xml).toContain("Before");
    expect(xml).toContain("After");
  });

  // 2. Container containing only empty shape suppresses table creation
  it("Test B: suppresses table creation for containers whose only children are empty shapes", async () => {
    const shapeContainer: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      background: { r: 224, g: 224, b: 224, a: 1, hex: "E0E0E0" },
      children: [emptyShape],
    };

    const xml = await xmlOf([shapeContainer]);
    expect(tableCount(xml)).toBe(0);
  });

  // 3. Badges/chips with a single text element flanked by decorative empty shapes render as paragraphs
  it("Test C: renders badge with flanking empty icon shapes as styled paragraph instead of multi-column table", async () => {
    const userBadge: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      background: { r: 255, g: 255, b: 255, a: 1, hex: "FFFFFF" },
      border: { color: { r: 56, g: 135, b: 245, a: 1, hex: "3887F5" }, width: 1, style: "solid" },
      padding: { top: 4, right: 8, bottom: 4, left: 8 },
      children: [emptyShape, paragraph("김*훈"), emptyShape],
    };

    const xml = await xmlOf([userBadge]);
    // Exactly 0 tables! Rendered directly as a styled paragraph with chrome
    expect(tableCount(xml)).toBe(0);
    expect(xml).toContain("김*훈");
    expect(xml).toContain('w:color="3887F5"');
  });

  // 4. Horizontal step bar row flattens step buttons with number badge + text into table cells with 0 nested tables
  it("Test D: flattens composite step buttons with inner number badges into parent row cells with 0 nested tables", async () => {
    const stepRow: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      gap: 8,
      children: [
        {
          type: "container",
          layoutDirection: "horizontal",
          background: { r: 229, g: 243, b: 255, a: 1, hex: "E5F3FF" },
          padding: { top: 4, right: 8, bottom: 4, left: 8 },
          children: [
            {
              type: "container",
              background: { r: 56, g: 135, b: 245, a: 1, hex: "3887F5" },
              children: [paragraph("1")],
            },
            paragraph("보장분석 요약"),
          ],
        },
        {
          type: "container",
          background: { r: 209, g: 214, b: 222, a: 1, hex: "D1D6DE" },
          children: [], // empty divider line
        },
        {
          type: "container",
          layoutDirection: "horizontal",
          background: { r: 240, g: 240, b: 240, a: 1, hex: "F0F0F0" },
          padding: { top: 4, right: 8, bottom: 4, left: 8 },
          children: [
            {
              type: "container",
              background: { r: 217, g: 222, b: 227, a: 1, hex: "D9DEE3" },
              children: [paragraph("2")],
            },
            paragraph("보장 상세분석"),
          ],
        },
      ],
    };

    const xml = await xmlOf([stepRow]);
    // The outer row table is created, but exactly 0 nested tables inside!
    expect(tableCount(xml)).toBe(1);
    expect(xml).toContain("보장분석 요약");
    expect(xml).toContain("보장 상세분석");
    expect(xml).toContain("1");
    expect(xml).toContain("2");
  });

  // 5. Preserves multi-element cards with headers and descriptions as 1x1 tables
  it("Test E: preserves real cards with multiple content children as 1x1 Word tables", async () => {
    const card: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      background: { r: 255, g: 255, b: 255, a: 1, hex: "FFFFFF" },
      border: { color: { r: 220, g: 220, b: 220, a: 1, hex: "DCDCDC" }, width: 1, style: "solid" },
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
      children: [
        { type: "heading", level: 3, runs: [{ text: "Card Title" }] },
        paragraph("Card description body text."),
      ],
    };

    const xml = await xmlOf([card]);
    expect(tableCount(xml)).toBe(1);
    expect(xml).toContain("Card Title");
    expect(xml).toContain("Card description body text.");
  });
});

