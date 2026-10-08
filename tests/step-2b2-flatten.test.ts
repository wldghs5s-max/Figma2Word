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

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const CHIP_FILL = { r: 22, g: 163, b: 74, a: 1, hex: "16A34A" };
const BUTTON_FILL = { r: 37, g: 99, b: 235, a: 1, hex: "2563EB" };
const CARD_FILL = { r: 255, g: 247, b: 237, a: 1, hex: "FFF7ED" };

function paragraph(text: string): ParagraphElement {
  return { type: "paragraph", alignment: "left", runs: [{ text }] };
}

function chip(text: string): ContainerElement {
  return {
    type: "container",
    layoutDirection: "vertical",
    gap: 0,
    background: CHIP_FILL,
    padding: { top: 4, right: 8, bottom: 4, left: 8 },
    children: [paragraph(text)],
  };
}

function documentOf(elements: DocElement[]): InternalDocument {
  return {
    version: "1.0.0",
    metadata: {
      title: "STEP 2-B-2",
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

describe("STEP 2-B-2: flatten unnecessary UI tables", () => {
  const renderer = new DocxRenderer();

  it("Test A: simple text chip keeps the label and fill without a nested table", async () => {
    const row: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      gap: 8,
      children: [chip("신규"), chip("완료")],
    };

    const rendered = renderer.renderElement(row);
    expect((rendered as { constructor: { name: string } }).constructor.name).toBe("Table");

    const xml = await xmlOf([row]);
    expect(xml).toContain("신규");
    expect(xml).toContain("완료");
    expect(xml).toContain('w:fill="16A34A"');
    expect(tableCount(xml)).toBe(1);
  });

  it("Test B: simple button keeps text, fill, and border without a table", async () => {
    const button: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: BUTTON_FILL,
      border: { width: 1, style: "solid", color: { r: 30, g: 64, b: 175, a: 1 } },
      padding: { top: 6, right: 12, bottom: 6, left: 12 },
      children: [paragraph("확인")],
    };

    const rendered = renderer.renderElement(button);
    expect((rendered as { constructor: { name: string } }).constructor.name).toBe("Paragraph");

    const xml = await xmlOf([button]);
    expect(xml).toContain("확인");
    expect(xml).toContain('w:fill="2563EB"');
    expect(xml).toContain("<w:pBdr>");
    expect(tableCount(xml)).toBe(0);
  });

  it("Test C: icon plus text button keeps both children inside one layout table", async () => {
    const button: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      gap: 8,
      background: BUTTON_FILL,
      children: [
        {
          type: "image",
          source: PNG,
          width: 16,
          height: 16,
          altText: "저장 아이콘",
        },
        paragraph("저장"),
      ],
    };

    const rendered = renderer.renderElement(button);
    expect((rendered as { constructor: { name: string } }).constructor.name).toBe("Table");

    const xml = await xmlOf([button]);
    expect(xml).toContain("저장");
    expect(xml).toContain("<a:blip");
    expect(xml).not.toContain("[Image:");
    expect(tableCount(xml)).toBe(1);
  });

  it("Test D: a transparent single-child wrapper does not add a table", async () => {
    const wrapper: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      children: [
        {
          type: "container",
          layoutDirection: "vertical",
          gap: 0,
          children: [paragraph("본문")],
        },
      ],
    };

    const rendered = renderer.renderElement(wrapper);
    expect(Array.isArray(rendered)).toBe(true);
    const pieces = rendered as { constructor: { name: string } }[];
    expect(pieces).toHaveLength(1);
    expect(pieces[0].constructor.name).toBe("Paragraph");

    const xml = await xmlOf([wrapper]);
    expect(xml).toContain("본문");
    expect(tableCount(xml)).toBe(0);
  });

  it("Test E: a real multi-column row still renders as a table", async () => {
    const row: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      gap: 12,
      columnWidths: [40, 60],
      children: [paragraph("왼쪽"), paragraph("오른쪽")],
    };

    const rendered = renderer.renderElement(row);
    expect((rendered as { constructor: { name: string } }).constructor.name).toBe("Table");

    const xml = await xmlOf([row]);
    expect(xml).toContain("왼쪽");
    expect(xml).toContain("오른쪽");
    expect(tableCount(xml)).toBe(1);
  });

  it("Test F: a visual card with background, border, and several children stays a table", async () => {
    const card: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 8,
      background: CARD_FILL,
      border: { width: 1, style: "solid", color: { r: 180, g: 83, b: 9, a: 1 } },
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
      children: [
        { type: "heading", level: 3, alignment: "left", runs: [{ text: "카드 제목" }] },
        paragraph("카드 본문"),
      ],
    };

    const rendered = renderer.renderElement(card);
    expect((rendered as { constructor: { name: string } }).constructor.name).toBe("Table");

    const xml = await xmlOf([card]);
    expect(xml).toContain("카드 제목");
    expect(xml).toContain("카드 본문");
    expect(xml).toContain('w:fill="FFF7ED"');
    expect(tableCount(xml)).toBe(1);
  });

  it("Test G: an image and text card keeps both the picture and the text", async () => {
    const card: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 8,
      background: CARD_FILL,
      backgroundImage: {
        type: "image",
        source: PNG,
        width: 320,
        height: 180,
        altText: "커버",
      },
      children: [
        { type: "heading", level: 2, alignment: "left", runs: [{ text: "사진 위 제목" }] },
        paragraph("사진 위 설명"),
      ],
    };

    const rendered = renderer.renderElement(card);
    expect(Array.isArray(rendered)).toBe(true);

    const xml = await xmlOf([card]);
    expect(xml).toContain("사진 위 제목");
    expect(xml).toContain("사진 위 설명");
    expect(xml).toContain("<a:blip");
    expect(xml).not.toContain("[Image:");
    expect(xml).toContain('w:fill="FFF7ED"');
    expect(tableCount(xml)).toBeGreaterThanOrEqual(1);
  });

  it("keeps a multi-content shape as a table and flattens a single-text shape", async () => {
    const badge: ShapeElement = {
      type: "shape",
      shapeType: "rounded_rectangle",
      fill: CHIP_FILL,
      content: [paragraph("선택")],
    };
    const rendered = renderer.renderElement(badge);
    expect((rendered as { constructor: { name: string } }).constructor.name).toBe("Paragraph");

    const xml = await xmlOf([badge]);
    expect(xml).toContain("선택");
    expect(xml).toContain('w:fill="16A34A"');
    expect(tableCount(xml)).toBe(0);
  });
});
