import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/figmaParser.js";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import { simpleDocumentFixture } from "../src/fixtures/samples.js";
import { inflateRawSync } from "node:zlib";
import * as fs from "fs";
import * as path from "path";

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
    let dataStart = offset + 30 + nameLength + extraLength;

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

describe("Determinism Verification (결정론성 검증)", () => {
  it("produces identical InternalDocument IR across multiple consecutive runs", () => {
    const parser = new FigmaParser();

    const run1 = parser.parse(simpleDocumentFixture);
    const run2 = parser.parse(simpleDocumentFixture);
    const run3 = parser.parse(simpleDocumentFixture);

    // Section contents must be 100% identical
    expect(run1.document.sections).toEqual(run2.document.sections);
    expect(run2.document.sections).toEqual(run3.document.sections);

    // Notices and stats must be 100% identical
    expect(run1.notices).toEqual(run2.notices);
    expect(run1.stats).toEqual(run2.stats);
  });

  it("produces structurally deterministic document XML content across multiple runs", async () => {
    const parser = new FigmaParser();
    const renderer = new DocxRenderer();

    const parseResult = parser.parse(simpleDocumentFixture);
    parseResult.document.metadata.convertedAt = "2026-10-07T12:00:00.000Z";

    const buffer1 = await renderer.renderToBuffer(parseResult.document);
    const buffer2 = await renderer.renderToBuffer(parseResult.document);

    // Save temporary docx files to inspect internal document.xml determinism
    const tmpDir = path.join(process.cwd(), "samples/output");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const tmp1 = path.join(tmpDir, "det-1.docx");
    const tmp2 = path.join(tmpDir, "det-2.docx");
    fs.writeFileSync(tmp1, buffer1);
    fs.writeFileSync(tmp2, buffer2);

    const normalize = (xml: string) => xml.replace(/docPr id=[^ ]+/g, "");
    const xml1 = normalize(readZipEntry(buffer1, "word/document.xml"));
    const xml2 = normalize(readZipEntry(buffer2, "word/document.xml"));
    expect(xml1).toBe(xml2);
    expect(fs.existsSync(tmp1)).toBe(true);
    expect(fs.existsSync(tmp2)).toBe(true);
  });
});

