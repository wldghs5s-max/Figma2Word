import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import { ContainerElement, DocElement, InternalDocument, ParagraphElement } from "../src/model/index.js";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const WHITE = { r: 255, g: 255, b: 255, a: 1, hex: "FFFFFF" };
const SWATCH = { r: 161, g: 176, b: 191, a: 1, hex: "A1B0BF" };
const OTHER = { r: 59, g: 199, b: 209, a: 1, hex: "3BC7D1" };
const LINE = { width: 1, style: "solid" as const, color: { r: 225, g: 232, b: 240, a: 1, hex: "E1E8F0" } };

function paragraph(text: string): ParagraphElement {
  return { type: "paragraph", alignment: "left", runs: [{ text }] };
}

function documentOf(elements: DocElement[]): InternalDocument {
  return {
    version: "1.0.0",
    metadata: {
      title: "STEP 2-B-5",
      convertedAt: "2026-10-08T00:00:00.000Z",
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

function safeChild(): ContainerElement {
  return {
    type: "container",
    layoutDirection: "vertical",
    gap: 0,
    background: WHITE,
    border: LINE,
    padding: { top: 18, right: 18, bottom: 18, left: 18 },
    children: [
      paragraph("개인정보"),
      {
        type: "container",
        layoutDirection: "horizontal",
        gap: 0,
        children: [paragraph("항목"), paragraph("값")],
      },
    ],
  };
}

describe("STEP 2-B-5: flatten only the three measured SAFE wrappers", () => {
  it("Test A: removes a zero-padding white parent and keeps the child card", async () => {
    const parent: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: WHITE,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      children: [safeChild()],
    };

    const xml = await xmlOf([parent]);
    expect(xml).toContain("개인정보");
    expect(xml).toContain("항목");
    expect(xml).toContain('w:fill="FFFFFF"');
    expect(xml).toContain('w:color="E1E8F0"');
    expect(tableCount(xml)).toBe(2);
  });

  it("Test B: moves the A1B0BF parent border onto the empty child cell", async () => {
    const parent: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      border: { width: 1, style: "solid", color: SWATCH },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      children: [
        {
          type: "container",
          layoutDirection: "vertical",
          gap: 0,
          background: SWATCH,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          children: [],
        },
      ],
    };

    const xml = await xmlOf([parent]);
    expect(xml).toContain('w:fill="A1B0BF"');
    expect(xml).toContain('w:color="A1B0BF"');
    expect(tableCount(xml)).toBe(1);
  });

  it("Test C: keeps a parent wrapper around a multi-column child", async () => {
    const parent: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: WHITE,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      children: [
        {
          type: "container",
          layoutDirection: "horizontal",
          gap: 8,
          background: WHITE,
          border: LINE,
          children: [paragraph("왼쪽"), paragraph("오른쪽")],
        },
      ],
    };

    const xml = await xmlOf([parent]);
    expect(xml).toContain("왼쪽");
    expect(xml).toContain("오른쪽");
    expect(tableCount(xml)).toBe(2);
  });

  it("Test D: keeps nested tables when parent and child fills differ", async () => {
    const parent: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: WHITE,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      children: [
        {
          ...safeChild(),
          background: OTHER,
        },
      ],
    };

    const xml = await xmlOf([parent]);
    expect(xml).toContain("개인정보");
    expect(xml).toContain('w:fill="FFFFFF"');
    expect(xml).toContain('w:fill="3BC7D1"');
    expect(tableCount(xml)).toBe(3);
  });

  it("Test E: keeps the parent table when parent padding is non-zero", async () => {
    const parent: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: WHITE,
      padding: { top: 8, right: 0, bottom: 0, left: 0 },
      children: [safeChild()],
    };

    const xml = await xmlOf([parent]);
    expect(xml).toContain("개인정보");
    expect(xml).toContain('w:color="E1E8F0"');
    expect(tableCount(xml)).toBe(3);
  });

  it("Test F: keeps the parent table when the child contains an image", async () => {
    const child = safeChild();
    child.children = [
      ...child.children,
      { type: "image", source: PNG, width: 16, height: 16, altText: "아이콘" },
    ];
    const parent: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: WHITE,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      children: [child],
    };

    const xml = await xmlOf([parent]);
    expect(xml).toContain("개인정보");
    expect(xml).toContain("<a:blip");
    expect(xml).not.toContain("[Image:");
    expect(tableCount(xml)).toBe(3);
  });
});
