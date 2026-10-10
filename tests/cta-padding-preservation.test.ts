import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import {
  ContainerElement,
  DocElement,
  InternalDocument,
  ParagraphElement,
} from "../src/model/index.js";

function paragraph(text: string, fontSize?: number): ParagraphElement {
  return {
    type: "paragraph",
    alignment: "center",
    runs: [{ text, style: fontSize ? { fontSize } : undefined }],
  };
}

function documentOf(elements: DocElement[]): InternalDocument {
  return {
    version: "1.0.0",
    metadata: {
      title: "CTA Padding Preservation Test",
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

describe("CTA Button Padding Preservation (Step 2-A)", () => {
  // Case A: 작은 컴팩트 칩 (Small Compact Chip)
  it("Case A: keeps compact chip clamped to compact padding limits without extra nested tables", async () => {
    const compactChipRow: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      children: [
        {
          type: "container",
          layoutDirection: "horizontal",
          background: { r: 240, g: 240, b: 240, a: 1, hex: "F0F0F0" },
          padding: { top: 4, right: 8, bottom: 4, left: 8 },
          children: [paragraph("상태 배지", 11)],
        },
        {
          type: "container",
          layoutDirection: "horizontal",
          background: { r: 229, g: 243, b: 255, a: 1, hex: "E5F3FF" },
          padding: { top: 4, right: 8, bottom: 4, left: 8 },
          children: [paragraph("활성 칩", 11)],
        },
      ],
    };

    const xml = await xmlOf([compactChipRow]);
    // Single outer table row, 0 nested tables
    expect(tableCount(xml)).toBe(1);
    expect(xml).toContain("상태 배지");
    expect(xml).toContain("활성 칩");
    // Padding was clamped to compact limits (top 4pt = 80 dxa, left 3pt = 60 dxa)
    // 8px = 6pt = 120 dxa clamped to 60 dxa
    expect(xml).toContain('w:left w:type="dxa" w:w="60"');
    expect(xml).toContain('w:right w:type="dxa" w:w="60"');
  });

  // Case B: 큰 CTA 버튼 (Large CTA Button)
  it("Case B: preserves full 16px/24px padding on large CTA buttons without clamping to 4pt/3pt", async () => {
    // 16px = 12pt = 240 dxa; 24px = 18pt = 360 dxa
    const ctaButtonRow: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      children: [
        {
          type: "container",
          layoutDirection: "horizontal",
          background: { r: 56, g: 135, b: 245, a: 1, hex: "3887F5" },
          border: { width: 1, style: "solid", color: { r: 40, g: 100, b: 200, a: 1, hex: "2864C8" } },
          padding: { top: 16, right: 24, bottom: 16, left: 24 },
          children: [paragraph("상담 신청하기", 14)],
        },
        {
          type: "container",
          layoutDirection: "horizontal",
          background: { r: 240, g: 244, b: 248, a: 1, hex: "F0F4F8" },
          padding: { top: 16, right: 24, bottom: 16, left: 24 },
          children: [paragraph("취소", 14)],
        },
      ],
    };

    const xml = await xmlOf([ctaButtonRow]);
    // Flat 1-row table, 0 nested tables
    expect(tableCount(xml)).toBe(1);
    expect(xml).toContain("상담 신청하기");
    expect(xml).toContain("취소");
    expect(xml).toContain('w:fill="3887F5"');

    // Crucial check: Cell margins must NOT be clamped to 80 (4pt) or 60 (3pt)!
    // They must preserve the full 240 dxa (top/bottom) and 360 dxa (left/right)!
    expect(xml).toContain('w:top w:type="dxa" w:w="240"');
    expect(xml).toContain('w:bottom w:type="dxa" w:w="240"');
    expect(xml).toContain('w:left w:type="dxa" w:w="360"');
    expect(xml).toContain('w:right w:type="dxa" w:w="360"');
  });

  // Case C: 큰 글꼴의 버튼 (Large Font Button)
  it("Case C: button with large 18px font is not misclassified as compact and preserves full padding", async () => {
    // Even with moderate padding (top 10px = 150 dxa, left 14px = 210 dxa), large 18px font prevents clamping
    const largeFontButtonRow: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      children: [
        {
          type: "container",
          layoutDirection: "horizontal",
          background: { r: 255, g: 107, b: 107, a: 1, hex: "FF6B6B" },
          padding: { top: 10, right: 14, bottom: 10, left: 14 },
          children: [paragraph("지금 구매하기", 18)],
        },
      ],
    };

    const xml = await xmlOf([largeFontButtonRow]);
    expect(xml).toContain("지금 구매하기");
    // 10px = 7.5pt = 150 dxa; 14px = 10.5pt = 210 dxa
    // Must NOT be clamped to 80 dxa (4pt) or 60 dxa (3pt)!
    expect(xml).toContain('w:top w:type="dxa" w:w="150"');
    expect(xml).toContain('w:bottom w:type="dxa" w:w="150"');
    expect(xml).toContain('w:left w:type="dxa" w:w="210"');
    expect(xml).toContain('w:right w:type="dxa" w:w="210"');
  });

  // Case D: Standalone CTA Button (1-child container in body flow)
  it("Case D: standalone large CTA button preserves 1x1 table structure with full 16px/24px padding", async () => {
    const standaloneCta: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      background: { r: 56, g: 135, b: 245, a: 1, hex: "3887F5" },
      border: { width: 1, style: "solid", color: { r: 40, g: 100, b: 200, a: 1, hex: "2864C8" } },
      padding: { top: 16, right: 24, bottom: 16, left: 24 },
      children: [paragraph("단독 CTA 버튼 신청", 16)],
    };

    const xml = await xmlOf([standaloneCta]);
    // Stays as structured 1x1 table, not collapsed into paragraph with 4pt indent
    expect(tableCount(xml)).toBe(1);
    expect(xml).toContain("단독 CTA 버튼 신청");
    expect(xml).toContain('w:fill="3887F5"');
    expect(xml).toContain('w:top w:type="dxa" w:w="240"');
    expect(xml).toContain('w:bottom w:type="dxa" w:w="240"');
    expect(xml).toContain('w:left w:type="dxa" w:w="360"');
    expect(xml).toContain('w:right w:type="dxa" w:w="360"');
  });
});
