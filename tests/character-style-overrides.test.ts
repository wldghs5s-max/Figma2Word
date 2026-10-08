import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { FigmaParser } from "../src/parser/index.js";
import { FigmaNode } from "../src/parser/types.js";
import { DocxRenderer } from "../src/renderer/index.js";
import { ParagraphElement } from "../src/model/index.js";

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

describe("Phase 5-A: Character Style Overrides", () => {
  const parser = new FigmaParser();

  // Test 1: No override produces 1 single TextRun (backward compatibility)
  it("Test 1: keeps single TextRun when no characterStyleOverrides is present", () => {
    const node: FigmaNode = {
      id: "text-1",
      name: "Plain Text",
      type: "TEXT",
      characters: "Hello World",
      style: {
        fontFamily: "Calibri",
        fontSize: 14,
        fontWeight: "normal",
      },
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
    };

    const doc = parser.parse(node).document;
    const p = doc.sections[0].elements[0] as ParagraphElement;
    expect(p.type).toBe("paragraph");
    expect(p.runs).toHaveLength(1);
    expect(p.runs[0].text).toBe("Hello World");
    expect(p.runs[0].style?.fontWeight).toBe("normal");
  });

  // Test 2: Single Bold section
  it("Test 2: splits text into runs when one segment is bold", () => {
    // "Hello World" -> "World" is bold (indices 6..10)
    const node: FigmaNode = {
      id: "text-2",
      name: "Bold Keyword",
      type: "TEXT",
      characters: "Hello World",
      style: {
        fontFamily: "Calibri",
        fontSize: 14,
        fontWeight: "normal",
      },
      characterStyleOverrides: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
      styleOverrideTable: {
        "1": { fontWeight: "bold" },
      },
    };

    const doc = parser.parse(node).document;
    const p = doc.sections[0].elements[0] as ParagraphElement;
    expect(p.runs).toHaveLength(2);
    expect(p.runs[0].text).toBe("Hello ");
    expect(p.runs[0].style?.fontWeight).toBe("normal");
    expect(p.runs[1].text).toBe("World");
    expect(p.runs[1].style?.fontWeight).toBe("bold");
  });

  // Test 3: Single Color section
  it("Test 3: overrides color for a specific run segment", () => {
    // "경고: 확인하세요" -> "경고:" has red color (indices 0..2)
    const node: FigmaNode = {
      id: "text-3",
      name: "Warning Text",
      type: "TEXT",
      characters: "경고: 확인하세요",
      style: {
        fontSize: 14,
      },
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
      characterStyleOverrides: [1, 1, 1, 0, 0, 0, 0, 0, 0],
      styleOverrideTable: {
        "1": {
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }], // Red
        },
      },
    };

    const doc = parser.parse(node).document;
    const p = doc.sections[0].elements[0] as ParagraphElement;
    expect(p.runs).toHaveLength(2);
    expect(p.runs[0].text).toBe("경고:");
    expect(p.runs[0].style?.color?.hex).toBe("FF0000");
    expect(p.runs[1].text).toBe(" 확인하세요");
    expect(p.runs[1].style?.color?.hex).toBe("000000");
  });

  // Test 4: Single Font Size section
  it("Test 4: overrides font size for a specific run segment", () => {
    // "금액: 100만원" -> "100" has larger font size (indices 4..6)
    const node: FigmaNode = {
      id: "text-4",
      name: "Price Text",
      type: "TEXT",
      characters: "금액: 100만원",
      style: {
        fontSize: 16, // approx 12pt
      },
      characterStyleOverrides: [0, 0, 0, 0, 1, 1, 1, 0, 0],
      styleOverrideTable: {
        "1": {
          fontSize: 32, // approx 24pt
        },
      },
    };

    const doc = parser.parse(node).document;
    const p = doc.sections[0].elements[0] as ParagraphElement;
    expect(p.runs).toHaveLength(3);
    expect(p.runs[0].text).toBe("금액: ");
    expect(p.runs[0].style?.fontSize).toBe(12);
    expect(p.runs[1].text).toBe("100");
    expect(p.runs[1].style?.fontSize).toBe(24);
    expect(p.runs[2].text).toBe("만원");
    expect(p.runs[2].style?.fontSize).toBe(12);
  });

  // Test 5: Multiple overrides (Case C)
  it("Test 5: segments multiple distinct overrides correctly", () => {
    // "계약금 100만원 / 할인 20%"
    // "100만원": style 1 (green)
    // "20%": style 2 (red)
    const node: FigmaNode = {
      id: "text-5",
      name: "Complex Overrides",
      type: "TEXT",
      characters: "계약금 100만원 / 할인 20%",
      style: {
        fontSize: 14,
        fontWeight: "normal",
      },
      // 0..3: 계약금  (4 chars)
      // 4..8: 100만원 (5 chars)
      // 9..14:  / 할인  (6 chars)
      // 15..17: 20% (3 chars)
      characterStyleOverrides: [
        0, 0, 0, 0,
        1, 1, 1, 1, 1,
        0, 0, 0, 0, 0, 0,
        2, 2, 2,
      ],
      styleOverrideTable: {
        "1": { fontWeight: "bold", fills: [{ type: "SOLID", color: { r: 0, g: 0.8, b: 0 } }] },
        "2": { fontWeight: "bold", fills: [{ type: "SOLID", color: { r: 0.9, g: 0, b: 0 } }] },
      },
    };

    const doc = parser.parse(node).document;
    const p = doc.sections[0].elements[0] as ParagraphElement;
    expect(p.runs).toHaveLength(4);
    expect(p.runs[0].text).toBe("계약금 ");
    expect(p.runs[1].text).toBe("100만원");
    expect(p.runs[1].style?.fontWeight).toBe("bold");
    expect(p.runs[2].text).toBe(" / 할인 ");
    expect(p.runs[3].text).toBe("20%");
    expect(p.runs[3].style?.fontWeight).toBe("bold");
  });

  // Test 6: Korean Hangul text indexing
  it("Test 6: correctly handles Korean syllables UTF-16 code units", () => {
    // "안녕하세요 홍길동님" -> "홍길동" bold
    const node: FigmaNode = {
      id: "text-6",
      name: "Korean Greeting",
      type: "TEXT",
      characters: "안녕하세요 홍길동님",
      style: {
        fontSize: 14,
        fontWeight: "normal",
      },
      characterStyleOverrides: [0, 0, 0, 0, 0, 0, 1, 1, 1, 0],
      styleOverrideTable: {
        "1": { fontWeight: "bold" },
      },
    };

    const doc = parser.parse(node).document;
    const p = doc.sections[0].elements[0] as ParagraphElement;
    expect(p.runs).toHaveLength(3);
    expect(p.runs[0].text).toBe("안녕하세요 ");
    expect(p.runs[1].text).toBe("홍길동");
    expect(p.runs[1].style?.fontWeight).toBe("bold");
    expect(p.runs[2].text).toBe("님");
  });

  // Test 7: Mixed English, numbers, and Korean
  it("Test 7: handles mixed alphanumeric and Korean text", () => {
    // "Order #1234 완료" -> "#1234" styled
    const node: FigmaNode = {
      id: "text-7",
      name: "Mixed Alphanumeric",
      type: "TEXT",
      characters: "Order #1234 완료",
      style: {
        fontSize: 14,
      },
      // Order (6) + #1234 (5) + 완료 (3) = 14
      characterStyleOverrides: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
      styleOverrideTable: {
        "1": { italic: true },
      },
    };

    const doc = parser.parse(node).document;
    const p = doc.sections[0].elements[0] as ParagraphElement;
    expect(p.runs).toHaveLength(3);
    expect(p.runs[0].text).toBe("Order ");
    expect(p.runs[1].text).toBe("#1234");
    expect(p.runs[1].style?.italic).toBe(true);
    expect(p.runs[2].text).toBe(" 완료");
  });

  // Test 8: Emoji & Surrogate pairs safety
  it("Test 8: preserves surrogate pairs without corrupting emojis", () => {
    // "축하합니다 🚀 대박"
    // Note: "🚀" is a surrogate pair (length 2 in JS string)
    const text = "축하합니다 🚀 대박";
    // text.length is 6 + 1 + 2 + 1 + 2 = 12
    const overrides = new Array(text.length).fill(0);
    // Style the emoji with id 1
    const emojiStart = text.indexOf("🚀");
    overrides[emojiStart] = 1;
    overrides[emojiStart + 1] = 1;

    const node: FigmaNode = {
      id: "text-8",
      name: "Emoji Surrogate Test",
      type: "TEXT",
      characters: text,
      style: {
        fontSize: 14,
      },
      characterStyleOverrides: overrides,
      styleOverrideTable: {
        "1": { fontSize: 28 },
      },
    };

    const doc = parser.parse(node).document;
    const p = doc.sections[0].elements[0] as ParagraphElement;
    expect(p.runs).toHaveLength(3);
    expect(p.runs[0].text).toBe("축하합니다 ");
    expect(p.runs[1].text).toBe("🚀");
    expect(p.runs[1].style?.fontSize).toBe(21);
    expect(p.runs[2].text).toBe(" 대박");
    // Verify no replacement character ()
    expect(p.runs.map((r) => r.text).join("")).toBe(text);
  });

  // Test 9: Boundary conditions (override at start and end)
  it("Test 9: handles boundary overrides at exact start and end of string", () => {
    // "[VIP] 손님 [NEW]"
    const node: FigmaNode = {
      id: "text-9",
      name: "Boundary Test",
      type: "TEXT",
      characters: "[VIP] 손님 [NEW]",
      style: {
        fontSize: 14,
      },
      // [VIP] (5) +  손님  (4) + [NEW] (5) = 14
      characterStyleOverrides: [1, 1, 1, 1, 1, 0, 0, 0, 0, 2, 2, 2, 2, 2],
      styleOverrideTable: {
        "1": { fontWeight: "bold" },
        "2": { italic: true },
      },
    };

    const doc = parser.parse(node).document;
    const p = doc.sections[0].elements[0] as ParagraphElement;
    expect(p.runs).toHaveLength(3);
    expect(p.runs[0].text).toBe("[VIP]");
    expect(p.runs[0].style?.fontWeight).toBe("bold");
    expect(p.runs[1].text).toBe(" 손님 ");
    expect(p.runs[2].text).toBe("[NEW]");
    expect(p.runs[2].style?.italic).toBe(true);
  });

  // Test 10: Malformed overrides fallback safely
  it("Test 10: falls back gracefully on length mismatch or missing style IDs", () => {
    // characterStyleOverrides shorter than characters (trailing defaults)
    // and referencing missing style ID 999
    const node: FigmaNode = {
      id: "text-10",
      name: "Malformed Overrides",
      type: "TEXT",
      characters: "안전한 시스템 구축",
      style: {
        fontSize: 14,
      },
      characterStyleOverrides: [999, 999], // Shorter than 10 characters, unknown ID
      styleOverrideTable: {
        "1": { fontWeight: "bold" },
      },
    };

    const doc = parser.parse(node).document;
    const p = doc.sections[0].elements[0] as ParagraphElement;
    // Should NOT crash, should preserve all text
    expect(p.runs.map((r) => r.text).join("")).toBe("안전한 시스템 구축");
  });

  // Test 11: E2E DOCX OpenXML rendering verification
  it("Test 11: renders multiple w:r elements with bold, color, and size in Word OpenXML", async () => {
    const node: FigmaNode = {
      id: "text-11",
      name: "E2E Word Rich Text",
      type: "TEXT",
      characters: "일반 굵게 빨강",
      style: {
        fontFamily: "Calibri",
        fontSize: 14,
        fontWeight: "normal",
      },
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
      // "일반 " (3) + "굵게 " (3) + "빨강" (2) = 8
      characterStyleOverrides: [0, 0, 0, 1, 1, 1, 2, 2],
      styleOverrideTable: {
        "1": { fontWeight: "bold" },
        "2": { fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }] },
      },
    };

    const doc = parser.parse(node).document;
    const renderer = new DocxRenderer();
    const buffer = await renderer.renderToBuffer(doc);
    const xml = readZipEntry(buffer, "word/document.xml");

    expect(xml).toContain("일반 ");
    expect(xml).toContain("굵게 ");
    expect(xml).toContain("빨강");
    // Verify bold formatting tag <w:b/>
    expect(xml).toContain("<w:b/>");
    // Verify color formatting tag for red (FF0000)
    expect(xml).toContain('w:val="FF0000"');
    // Verify separate <w:r> runs exist
    const runMatches = xml.match(/<w:r[\s>]/g) || [];
    expect(runMatches.length).toBeGreaterThanOrEqual(3);
  });

  // Test 12: Determinism check
  it("Test 12: produces deterministic XML output across multiple runs with rich text", async () => {
    const node: FigmaNode = {
      id: "text-12",
      name: "Determinism Check",
      type: "TEXT",
      characters: "결정론적 Rich Text 검증",
      style: {
        fontSize: 16,
      },
      characterStyleOverrides: [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
      styleOverrideTable: {
        "1": { fontWeight: "bold" },
      },
    };

    const doc1 = parser.parse(node).document;
    const doc2 = parser.parse(node).document;

    const renderer = new DocxRenderer();
    const buf1 = await renderer.renderToBuffer(doc1);
    const buf2 = await renderer.renderToBuffer(doc2);

    const xml1 = readZipEntry(buf1, "word/document.xml");
    const xml2 = readZipEntry(buf2, "word/document.xml");

    expect(xml1).toBe(xml2);
  });
});
