import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import { ContainerElement, DocElement, InternalDocument, ParagraphElement } from "../src/model/index.js";

function paragraph(text: string): ParagraphElement {
  return { type: "paragraph", alignment: "center", runs: [{ text }] };
}

function documentOf(elements: DocElement[]): InternalDocument {
  return {
    version: "1.0.0",
    metadata: {
      title: "Tab Bar Test",
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

describe("Horizontal Tab Bar & Button Flattening", () => {
  const renderer = new DocxRenderer();

  it("Test A: horizontal button row absorbs child button chrome directly into table cells without nested 1x1 tables", async () => {
    const buttonRow: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      gap: 8,
      children: [
        {
          type: "container",
          layoutDirection: "horizontal",
          gap: 4,
          background: { r: 217, g: 240, b: 255, a: 1, hex: "D9F0FF" },
          border: { color: { r: 178, g: 224, b: 255, a: 1, hex: "B2E0FF" }, width: 1, style: "solid" },
          padding: { top: 12, right: 24, bottom: 12, left: 24 },
          children: [paragraph("보장 상세분석")],
        },
        {
          type: "container",
          layoutDirection: "horizontal",
          gap: 4,
          background: { r: 209, g: 247, b: 245, a: 1, hex: "D1F7F5" },
          border: { color: { r: 166, g: 235, b: 229, a: 1, hex: "A6EBE5" }, width: 1, style: "solid" },
          padding: { top: 12, right: 24, bottom: 12, left: 24 },
          children: [paragraph("부족보장 리모델링")],
        },
        {
          type: "container",
          layoutDirection: "horizontal",
          gap: 4,
          background: { r: 230, g: 225, b: 245, a: 1, hex: "E6E1F5" },
          border: { color: { r: 200, g: 190, b: 225, a: 1, hex: "C8BEE1" }, width: 1, style: "solid" },
          padding: { top: 10, right: 20, bottom: 10, left: 20 },
          children: [paragraph("인쇄")],
        },
      ],
    };

    const xml = await xmlOf([buttonRow]);

    // Outer table only (1 table total, exactly 0 nested 1x1 tables!)
    expect(tableCount(xml)).toBe(1);

    // Labels are preserved
    expect(xml).toContain("보장 상세분석");
    expect(xml).toContain("부족보장 리모델링");
    expect(xml).toContain("인쇄");

    // Shading fills are placed on the cells
    expect(xml).toContain('w:fill="D9F0FF"');
    expect(xml).toContain('w:fill="D1F7F5"');
    expect(xml).toContain('w:fill="E6E1F5"');

    // cantSplit is applied to row
    expect(xml).toContain("<w:cantSplit/>");
  });

  it("Test B: preserves multi-element cards with nested structure when children are complex", async () => {
    const complexRow: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      gap: 16,
      children: [
        {
          type: "container",
          layoutDirection: "vertical",
          background: { r: 255, g: 255, b: 255, a: 1, hex: "FFFFFF" },
          border: { color: { r: 220, g: 220, b: 220, a: 1, hex: "DCDCDC" }, width: 1, style: "solid" },
          children: [
            paragraph("Card Header"),
            {
              type: "container",
              layoutDirection: "horizontal",
              children: [paragraph("Left"), paragraph("Right")],
            },
          ],
        },
      ],
    };

    const xml = await xmlOf([complexRow]);
    expect(xml).toContain("Card Header");
    expect(xml).toContain("Left");
    expect(xml).toContain("Right");
  });
});

