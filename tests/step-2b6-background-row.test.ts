import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import { ContainerElement, DocElement, InternalDocument, ParagraphElement } from "../src/model/index.js";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const ROW = { r: 237, g: 247, b: 255, a: 1, hex: "EDF7FF" };
const CHIP = { r: 245, g: 247, b: 250, a: 1, hex: "F5F7FA" };
const OTHER = { r: 217, g: 224, b: 235, a: 1, hex: "D9E0EB" };
const LINE = { width: 1, style: "solid" as const, color: { r: 225, g: 232, b: 240, a: 1, hex: "E1E8F0" } };

function paragraph(text: string): ParagraphElement {
  return { type: "paragraph", alignment: "left", runs: [{ text }] };
}

function row(texts: string[], widths: number[]): ContainerElement {
  return {
    type: "container",
    layoutDirection: "horizontal",
    gap: 0,
    columnWidths: widths,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    children: texts.map((text) => paragraph(text)),
  };
}

function wrapped(child: ContainerElement, extra: Partial<ContainerElement> = {}): ContainerElement {
  return {
    type: "container",
    layoutDirection: "vertical",
    gap: 0,
    background: ROW,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    children: [child],
    ...extra,
  };
}

function documentOf(elements: DocElement[]): InternalDocument {
  return {
    version: "1.0.0",
    metadata: {
      title: "STEP 2-B-6",
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

function tableProperties(xml: string): string {
  const start = xml.indexOf("<w:tblPr>");
  const end = xml.indexOf("</w:tblPr>");
  return xml.slice(start, end);
}

describe("STEP 2-B-6: flatten only text-only background rows", () => {
  it("Test A: removes a zero-padding background wrapper around a 1x2 text row", async () => {
    const xml = await xmlOf([wrapped(row(["왼쪽", "오른쪽"], [60, 40]))]);
    expect(xml).toContain("왼쪽");
    expect(xml).toContain("오른쪽");
    expect(tableCount(xml)).toBe(1);
    expect(tableProperties(xml)).toContain('w:fill="EDF7FF"');
    expect(xml.match(/w:fill="EDF7FF"/g)).toHaveLength(1);
  });

  it("Test B: flattens a 1x3 row of text chips and keeps each chip fill", async () => {
    const chip = (text: string): ContainerElement => ({
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: CHIP,
      padding: { top: 6, right: 12, bottom: 10, left: 12 },
      children: [paragraph(text)],
    });
    const child = row(["01 고객 발굴", "02 FC 배정", "03 배정결과"], [34, 32, 34]);
    child.children = [chip("01 고객 발굴"), chip("02 FC 배정"), chip("03 배정결과")];
    const xml = await xmlOf([wrapped(child)]);
    expect(xml).toContain("01 고객 발굴");
    expect(xml).toContain("02 FC 배정");
    expect(xml).toContain("03 배정결과");
    expect(tableCount(xml)).toBe(1);
    expect(tableProperties(xml)).toContain('w:fill="EDF7FF"');
    expect(xml.match(/w:fill="F5F7FA"/g)).toHaveLength(3);
    expect(xml).toContain('w:w="1700"');
    expect(xml).toContain('w:w="1600"');
  });

  it("Test C: keeps the wrapper when the parent has padding", async () => {
    const xml = await xmlOf([
      wrapped(row(["왼쪽", "오른쪽"], [60, 40]), {
        padding: { top: 8, right: 0, bottom: 0, left: 0 },
      }),
    ]);
    expect(xml).toContain("왼쪽");
    expect(tableCount(xml)).toBe(2);
  });

  it("Test D: keeps the wrapper when the parent has a border", async () => {
    const xml = await xmlOf([wrapped(row(["왼쪽", "오른쪽"], [60, 40]), { border: LINE })]);
    expect(xml).toContain("왼쪽");
    expect(xml).toContain('w:color="E1E8F0"');
    expect(tableCount(xml)).toBe(2);
  });

  it("Test E: keeps the wrapper when a child cell has its own background", async () => {
    const child = row(["왼쪽", "오른쪽"], [60, 40]);
    child.background = OTHER;
    const xml = await xmlOf([wrapped(child)]);
    expect(xml).toContain('w:fill="EDF7FF"');
    expect(xml).toContain('w:fill="D9E0EB"');
    expect(tableCount(xml)).toBe(2);
  });

  it("Test F: keeps the wrapper when a column contains an image", async () => {
    const child = row(["왼쪽", "오른쪽"], [60, 40]);
    child.children[0] = { type: "image", source: PNG, width: 16, height: 16, altText: "아이콘" };
    const xml = await xmlOf([wrapped(child)]);
    expect(xml).toContain("오른쪽");
    expect(xml).toContain("<a:blip");
    expect(xml).not.toContain("[Image:");
    expect(tableCount(xml)).toBe(2);
  });

  it("Test G: keeps the row text after the wrapper is removed", async () => {
    const xml = await xmlOf([wrapped(row(["오늘 09:42", "이어하기"], [50, 50]))]);
    expect(xml).toContain("오늘 09:42");
    expect(xml).toContain("이어하기");
    expect(tableCount(xml)).toBe(1);
  });

  it("Test H: keeps the 1xN column widths", async () => {
    const xml = await xmlOf([wrapped(row(["왼쪽", "오른쪽"], [60, 40]))]);
    expect(xml).toContain('w:w="3000"');
    expect(xml).toContain('w:w="2000"');
    expect(tableCount(xml)).toBe(1);
  });

  it("keeps the wrapper when a column contains a nested table", async () => {
    const child = row(["가", "나"], [50, 50]);
    child.children[1] = {
      type: "container",
      layoutDirection: "horizontal",
      gap: 0,
      children: [paragraph("안"), paragraph("밖")],
    };
    const xml = await xmlOf([wrapped(child)]);
    expect(xml).toContain("가");
    expect(xml).toContain("안");
    expect(tableCount(xml)).toBe(3);
  });

  it("keeps the wrapper when a column is a shape", async () => {
    const child = row(["왼쪽", "오른쪽"], [70, 30]);
    child.children[0] = { type: "shape", shapeType: "rectangle", width: 12, height: 12 };
    const xml = await xmlOf([wrapped(child)]);
    expect(xml).toContain("오른쪽");
    expect(tableCount(xml)).toBe(2);
  });
});
