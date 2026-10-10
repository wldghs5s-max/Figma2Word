import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import {
  ContainerElement,
  DocElement,
  InternalDocument,
  ParagraphElement,
} from "../src/model/index.js";

function paragraph(text: string, fontSize?: number, bold?: boolean): ParagraphElement {
  return {
    type: "paragraph",
    alignment: "left",
    runs: [{ text, style: fontSize ? { fontSize } : undefined, bold }],
  };
}

function centerParagraph(text: string, fontSize?: number, bold?: boolean): ParagraphElement {
  return {
    type: "paragraph",
    alignment: "center",
    runs: [{ text, style: fontSize ? { fontSize } : undefined, bold }],
  };
}

function documentOf(elements: DocElement[]): InternalDocument {
  return {
    version: "1.0.0",
    metadata: {
      title: "Compact Chip Boundary Test",
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

describe("Compact Chip Boundary Verification (Step 2-B)", () => {
  // Case A: 작은 칩·배지: 기존 인라인 변환과 가로 정렬이 유지된다.
  it("Case A: small chip/badge flattens cleanly into paragraph or table cell without nested tables", async () => {
    // Standalone chip
    const standaloneBadge: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      background: { r: 240, g: 244, b: 248, a: 1, hex: "F0F4F8" },
      border: { width: 1, style: "solid", color: { r: 200, g: 210, b: 220, a: 1, hex: "C8D2DC" } },
      padding: { top: 4, right: 8, bottom: 4, left: 8 },
      children: [centerParagraph("신규 배지", 11)],
    };

    const xmlStandalone = await xmlOf([standaloneBadge]);
    expect(xmlStandalone).toContain("신규 배지");
    expect(xmlStandalone).toContain('w:fill="F0F4F8"');
    // Standalone compact badge flattens to Paragraph with shading (0 tables)
    expect(tableCount(xmlStandalone)).toBe(0);

    // Horizontal row of chips
    const chipRow: ContainerElement = {
      type: "container",
      layoutDirection: "horizontal",
      gap: 8,
      children: [
        {
          type: "container",
          layoutDirection: "horizontal",
          background: { r: 229, g: 243, b: 255, a: 1, hex: "E5F3FF" },
          padding: { top: 4, right: 8, bottom: 4, left: 8 },
          children: [centerParagraph("태그 1", 11)],
        },
        {
          type: "container",
          layoutDirection: "horizontal",
          background: { r: 235, g: 248, b: 235, a: 1, hex: "EBF8EB" },
          padding: { top: 4, right: 8, bottom: 4, left: 8 },
          children: [centerParagraph("태그 2", 11)],
        },
      ],
    };

    const xmlRow = await xmlOf([chipRow]);
    expect(xmlRow).toContain("태그 1");
    expect(xmlRow).toContain("태그 2");
    // Outer 1-row table, no nested tables
    expect(tableCount(xmlRow)).toBe(1);
  });

  // Case B: 카드 안의 일반 버튼: 버튼의 배경·테두리·패딩이 유지되며 부적절하게 문단으로 평탄화되지 않는다.
  it("Case B: regular button inside a card preserves background, border, and padding in a dedicated 1x1 table", async () => {
    // 12px = 9pt = 180 dxa; 16px = 12pt = 240 dxa
    const cardWithButton: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      background: { r: 255, g: 255, b: 255, a: 1, hex: "FFFFFF" },
      border: { width: 1, style: "solid", color: { r: 225, g: 232, b: 240, a: 1, hex: "E1E8F0" } },
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
      children: [
        { type: "heading", level: 3, runs: [{ text: "보장분석 카드" }] },
        paragraph("상세 내역을 확인하고 설계를 변경하세요."),
        // 일반 버튼 (padding 12px / 16px, font 13px)
        {
          type: "container",
          layoutDirection: "horizontal",
          background: { r: 56, g: 135, b: 245, a: 1, hex: "3887F5" },
          border: { width: 1, style: "solid", color: { r: 40, g: 100, b: 200, a: 1, hex: "2864C8" } },
          padding: { top: 12, right: 16, bottom: 12, left: 16 },
          children: [centerParagraph("설계 변경 신청", 13, true)],
        },
      ],
    };

    const xml = await xmlOf([cardWithButton]);
    expect(xml).toContain("보장분석 카드");
    expect(xml).toContain("설계 변경 신청");
    expect(xml).toContain('w:fill="3887F5"');

    // Button is not flattened to a plain paragraph; it maintains a structured 1x1 table with its padding
    // Card (1 table) + nested button (1 table) = 2 tables
    expect(tableCount(xml)).toBe(2);

    // Padding 12px = 180 dxa (top/bottom), 16px = 240 dxa (left/right) is preserved on the button table cell
    expect(xml).toContain('w:top w:type="dxa" w:w="180"');
    expect(xml).toContain('w:bottom w:type="dxa" w:w="180"');
    expect(xml).toContain('w:left w:type="dxa" w:w="240"');
    expect(xml).toContain('w:right w:type="dxa" w:w="240"');
  });

  // Case C: 모달 안의 CTA 버튼: 원본 패딩과 콘텐츠 구조가 유지된다.
  it("Case C: CTA buttons inside a modal preserve original padding and horizontal structure", async () => {
    // 14px = 10.5pt = 210 dxa; 20px = 15pt = 300 dxa
    const modal: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      background: { r: 255, g: 255, b: 255, a: 1, hex: "FFFFFF" },
      border: { width: 1, style: "solid", color: { r: 200, g: 200, b: 200, a: 1, hex: "C8C8C8" } },
      padding: { top: 24, right: 20, bottom: 24, left: 20 },
      children: [
        { type: "heading", level: 2, runs: [{ text: "본인 인증" }] },
        paragraph("지문 또는 Face ID로 인증을 진행합니다."),
        // 가로 2열 CTA 버튼 행 ([취소] [인증하기])
        {
          type: "container",
          layoutDirection: "horizontal",
          gap: 12,
          children: [
            {
              type: "container",
              layoutDirection: "horizontal",
              background: { r: 240, g: 244, b: 248, a: 1, hex: "F0F4F8" },
              padding: { top: 14, right: 20, bottom: 14, left: 20 },
              children: [centerParagraph("취소", 14)],
            },
            {
              type: "container",
              layoutDirection: "horizontal",
              background: { r: 56, g: 135, b: 245, a: 1, hex: "3887F5" },
              padding: { top: 14, right: 20, bottom: 14, left: 20 },
              children: [centerParagraph("인증하기", 14, true)],
            },
          ],
        },
      ],
    };

    const xml = await xmlOf([modal]);
    expect(xml).toContain("본인 인증");
    expect(xml).toContain("취소");
    expect(xml).toContain("인증하기");

    // Modal table (1) + horizontal CTA row (1 table inside cell, flat row) = 2 tables
    expect(tableCount(xml)).toBe(2);

    // Padding 14px = 210 dxa (top/bottom), 20px = 300 dxa (left/right) is preserved, NOT clamped to 80/60
    expect(xml).toContain('w:top w:type="dxa" w:w="210"');
    expect(xml).toContain('w:bottom w:type="dxa" w:w="210"');
    expect(xml).toContain('w:left w:type="dxa" w:w="300"');
    expect(xml).toContain('w:right w:type="dxa" w:w="300"');
  });

  // Case D: 18px 이상의 강조 텍스트 버튼: 컴팩트 칩으로 잘못 분류되지 않는다.
  it("Case D: button with 18px text is never classified as compact chip even with moderate padding", async () => {
    const largeTextButton: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      background: { r: 255, g: 90, b: 95, a: 1, hex: "FF5A5F" },
      padding: { top: 8, right: 12, bottom: 8, left: 12 }, // Moderate padding, but 18px text!
      children: [centerParagraph("특별 혜택 신청하기", 18, true)],
    };

    const xml = await xmlOf([largeTextButton]);
    expect(xml).toContain("특별 혜택 신청하기");
    // Must NOT be flattened to a paragraph; stays 1x1 table because 18px >= 16px
    expect(tableCount(xml)).toBe(1);
    // 8px = 6pt = 120 dxa, 12px = 9pt = 180 dxa preserved
    expect(xml).toContain('w:top w:type="dxa" w:w="120"');
    expect(xml).toContain('w:left w:type="dxa" w:w="180"');
  });

  // Case E: 일반 컨테이너: 자식이 하나라는 이유만으로 자동으로 칩 취급되지 않는다.
  it("Case E: general single-child container with card padding is not treated as a chip", async () => {
    const singleChildCard: ContainerElement = {
      type: "container",
      layoutDirection: "vertical",
      background: { r: 250, g: 250, b: 250, a: 1, hex: "FAFAFA" },
      border: { width: 1, style: "solid", color: { r: 210, g: 215, b: 220, a: 1, hex: "D2D7DC" } },
      padding: { top: 20, right: 20, bottom: 20, left: 20 },
      children: [
        paragraph("중요 안내: 서비스 점검으로 인해 일부 기능이 제한됩니다.", 11),
      ],
    };

    const xml = await xmlOf([singleChildCard]);
    expect(xml).toContain("중요 안내");
    // Must remain a 1x1 table preserving the full card box and 20px padding (300 dxa)
    expect(tableCount(xml)).toBe(1);
    expect(xml).toContain('w:top w:type="dxa" w:w="300"');
    expect(xml).toContain('w:left w:type="dxa" w:w="300"');
  });
});

