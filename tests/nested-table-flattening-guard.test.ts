import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import {
  ContainerElement,
  DocElement,
  InternalDocument,
  ParagraphElement,
  HeadingElement,
  ImageElement,
  PageBreakElement,
} from "../src/model/index.js";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const WHITE = { r: 255, g: 255, b: 255, a: 1, hex: "FFFFFF" };
const CARD_BG = { r: 248, g: 250, b: 252, a: 1, hex: "F8FAFC" };
const ACCENT = { r: 14, g: 165, b: 233, a: 1, hex: "0EA5E9" };
const BORDER_COLOR = { r: 226, g: 232, b: 240, a: 1, hex: "E2E8F0" };

function p(text: string): ParagraphElement {
  return { type: "paragraph", alignment: "left", runs: [{ type: "run", text }] };
}

function h(text: string, level: 1 | 2 | 3 = 1): HeadingElement {
  return { type: "heading", level, alignment: "left", runs: [{ type: "run", text }] };
}

function img(width = 120, height = 80): ImageElement {
  return { type: "image", source: PNG_DATA_URL, width, height, alignment: "left" };
}

function pageBreak(): PageBreakElement {
  return { type: "page_break" };
}

function documentOf(elements: DocElement[]): InternalDocument {
  return {
    version: "1.0.0",
    metadata: {
      title: "Step 3B Flattening Verification",
      convertedAt: "2026-10-11T00:00:00.000Z",
      conversionMode: "balanced",
    },
    pageConfig: {
      size: "A4",
      widthMm: 210,
      heightMm: 297,
      orientation: "portrait",
      marginsMm: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    },
    sections: [{ id: "sec-1", elements }],
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

function countTables(xml: string): number {
  return (xml.match(/<w:tbl[\s>]/g) ?? []).length;
}

describe("Step 3B: Safe Single-Child Wrapper Flattening Verification", () => {
  it("Case 1: transparent zero-padding single-child wrapper is flattened to 1 table", async () => {
    // Outer wrapper has white background, no border, zero padding
    // Inner child has white background, 16px padding, and text
    const innerCard: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: WHITE,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
      children: [p("내부 카드 텍스트")],
    };

    const outerWrapper: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: WHITE,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      children: [innerCard],
    };

    const xml = await xmlOf([outerWrapper]);
    expect(xml).toContain("내부 카드 텍스트");
    // Outer redundant table MUST be flattened: exactly 1 table in XML (the inner card itself)
    expect(countTables(xml)).toBe(1);
  });

  it("Case 2: safe single-child wrapper around 3-column horizontal row is flattened while preserving 3 columns", async () => {
    // 3-column row
    const horizontalRow: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      gap: 16,
      columnWidths: [33, 33, 34],
      children: [
        {
          type: "container",
          layoutDirection: "vertical",
          children: [img(40, 40), h("열 1", 3), p("설명 1")],
        },
        {
          type: "container",
          layoutDirection: "vertical",
          children: [img(40, 40), h("열 2", 3), p("설명 2")],
        },
        {
          type: "container",
          layoutDirection: "vertical",
          children: [img(40, 40), h("열 3", 3), p("설명 3")],
        },
      ],
    };

    // Outer wrapper around the horizontal row (e.g. section container in Figma)
    const outerSectionWrapper: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: WHITE,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      children: [horizontalRow],
    };

    const xml = await xmlOf([outerSectionWrapper]);
    expect(xml).toContain("열 1");
    expect(xml).toContain("열 2");
    expect(xml).toContain("열 3");
    // The outer wrapper must be flattened: exactly 1 table (the 3-column horizontal table)
    expect(countTables(xml)).toBe(1);
    const tcMatches = xml.match(/<w:tc[\s>]/g) || [];
    expect(tcMatches.length).toBe(3);
  });

  it("Case 3: safe outer wrapper around image-containing child is flattened preserving image properties", async () => {
    const cardWithImage: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 8,
      background: WHITE,
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
      children: [
        h("이미지 카드 제목", 2),
        img(180, 90),
        p("이미지 상세 설명"),
      ],
    };

    const outerWrapper: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: WHITE,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      children: [cardWithImage],
    };

    const xml = await xmlOf([outerWrapper]);
    expect(xml).toContain("이미지 카드 제목");
    expect(xml).toContain("이미지 상세 설명");
    expect(xml).toContain("<a:blip");
    // Outer wrapper must be flattened: exactly 1 table
    expect(countTables(xml)).toBe(1);

    // Verify ordering: Heading -> Image -> Paragraph
    const hPos = xml.indexOf("이미지 카드 제목");
    const imgPos = xml.indexOf("<a:blip");
    const pPos = xml.indexOf("이미지 상세 설명");
    expect(hPos).toBeLessThan(imgPos);
    expect(imgPos).toBeLessThan(pPos);
  });

  it("Case 4: wrapper with non-zero padding is preserved (not flattened)", async () => {
    const innerCard: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: WHITE,
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
      children: [p("패딩 테스트")],
    };

    // Outer wrapper has non-zero padding (top: 24, bottom: 24)
    const outerWithPadding: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 0,
      background: WHITE,
      padding: { top: 24, right: 0, bottom: 24, left: 0 },
      children: [innerCard],
    };

    const xml = await xmlOf([outerWithPadding]);
    expect(xml).toContain("패딩 테스트");
    // Must preserve outer wrapper table because it carries intentional non-zero padding
    expect(countTables(xml)).toBe(2);
  });

  it("Case 5: independent card with distinct background and border is preserved", async () => {
    const styledCard: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 8,
      background: CARD_BG,
      border: { width: 1, style: "solid", color: BORDER_COLOR },
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
      children: [h("독립 카드", 2), p("독립 스타일 보존")],
    };

    const xml = await xmlOf([styledCard]);
    expect(xml).toContain("독립 카드");
    expect(xml).toContain("독립 스타일 보존");
    expect(xml).toContain('w:fill="F8FAFC"');
    expect(xml).toContain('w:color="E2E8F0"');
    expect(countTables(xml)).toBe(1);
  });

  it("Case 6: independent screen and page break boundary is preserved", async () => {
    const screen1: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      children: [h("화면 1", 1), p("화면 1 본문")],
    };

    const screen2: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      children: [h("화면 2", 1), p("화면 2 본문")],
    };

    const xml = await xmlOf([screen1, pageBreak(), screen2]);
    expect(xml).toContain("화면 1");
    expect(xml).toContain("화면 2");
    expect(xml).toContain('<w:br w:type="page"/>');
  });

  it("Case 7: verifies complete visual fidelity for nested heading, image, paragraph, and CTA button", async () => {
    const ctaButton: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      background: ACCENT,
      padding: { top: 16, right: 24, bottom: 16, left: 24 },
      children: [p("지금 신청하기")],
    };

    const complexCard: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      gap: 12,
      background: WHITE,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
      children: [
        h("복합 카드 제목", 2),
        img(140, 70),
        p("상세 설명 텍스트"),
        ctaButton,
      ],
    };

    // Redundant outer wrapper
    const outerWrapper: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      background: WHITE,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      children: [complexCard],
    };

    const xml = await xmlOf([outerWrapper]);
    expect(xml).toContain("복합 카드 제목");
    expect(xml).toContain("상세 설명 텍스트");
    expect(xml).toContain("지금 신청하기");
    expect(xml).toContain('<a:blip');
    // CTA button visual fill and padding must be intact
    expect(xml).toContain('w:fill="0EA5E9"');
    expect(xml).toContain('w:left w:type="dxa" w:w="360"');
    expect(xml).toContain('w:right w:type="dxa" w:w="360"');

    // Outer redundant table flattened: card table + CTA table = 2 tables total (previously 3 tables)
    expect(countTables(xml)).toBe(2);
  });
});
