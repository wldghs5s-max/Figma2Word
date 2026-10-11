import { describe, it, expect } from "vitest";
import { inflateRawSync } from "zlib";
import { spacingToCellMargin, ptToDxa, pxToPt } from "../src/renderer/utils.js";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import { InternalDocument, ContainerElement, DocElement } from "../src/model/index.js";

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
  const doc: InternalDocument = {
    version: "1.0.0",
    metadata: { title: "Padding Test", convertedAt: new Date().toISOString(), conversionMode: "balanced" },
    pageConfig: {
      size: "A4",
      widthMm: 210,
      heightMm: 297,
      orientation: "portrait",
      marginsMm: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    },
    sections: [{ id: "sec-1", elements }],
  };
  const buffer = await new DocxRenderer().renderToBuffer(doc);
  return readZipEntry(buffer, "word/document.xml");
}

describe("Step 2: Desktop Padding to DOCX Cell Margin Clamping (ISSUE-2)", () => {
  it("Case 1: preserves normal small component paddings without alteration", () => {
    // 1-A: Compact Chip padding (4px / 8px)
    const chipMargin = spacingToCellMargin({ top: 4, right: 8, bottom: 4, left: 8 });
    expect(chipMargin).toEqual({
      top: ptToDxa(3),     // 60 dxa
      right: ptToDxa(6),   // 120 dxa
      bottom: ptToDxa(3),  // 60 dxa
      left: ptToDxa(6),    // 120 dxa
    });

    // 1-B: CTA Button padding (16px / 24px)
    const buttonMargin = spacingToCellMargin({ top: 16, right: 24, bottom: 16, left: 24 });
    expect(buttonMargin).toEqual({
      top: ptToDxa(12),    // 240 dxa
      right: ptToDxa(18),  // 360 dxa
      bottom: ptToDxa(12), // 240 dxa
      left: ptToDxa(18),   // 360 dxa
    });

    // 1-C: Standard Card padding (24px / 32px)
    const cardMargin = spacingToCellMargin({ top: 24, right: 32, bottom: 24, left: 32 });
    expect(cardMargin).toEqual({
      top: ptToDxa(18),    // 360 dxa
      right: ptToDxa(24),  // 480 dxa
      bottom: ptToDxa(18), // 360 dxa
      left: ptToDxa(24),   // 480 dxa
    });
  });

  it("Case 2: clamps large desktop centering padding (256px) so content width is not cannibalized", () => {
    // 256px in Figma = 192 pt = 3840 dxa
    const desktopMargin = spacingToCellMargin({ top: 120, right: 256, bottom: 120, left: 256 });
    expect(desktopMargin).toBeDefined();

    // Horizontal margin must be capped to safe container padding (at most 36pt = 720 dxa)
    expect(desktopMargin!.left).toBeLessThanOrEqual(ptToDxa(36));
    expect(desktopMargin!.right).toBeLessThanOrEqual(ptToDxa(36));
    // Vertical margin must be capped to safe container padding (at most 48pt = 960 dxa)
    expect(desktopMargin!.top).toBeLessThanOrEqual(ptToDxa(48));
    expect(desktopMargin!.bottom).toBeLessThanOrEqual(ptToDxa(48));
  });

  it("Case 3: preserves directional asymmetry for non-excessive paddings", () => {
    const asymmetric = spacingToCellMargin({ top: 8, right: 16, bottom: 24, left: 32 });
    expect(asymmetric).toEqual({
      top: ptToDxa(6),     // 120 dxa
      right: ptToDxa(12),  // 240 dxa
      bottom: ptToDxa(18), // 360 dxa
      left: ptToDxa(24),   // 480 dxa
    });
  });

  it("Case 4: DOCX renderer does not generate excessive 3840 dxa margins for 256px desktop containers", async () => {
    const sectionContainer: ContainerElement = {
      id: "desktop-section",
      type: "container",
      layoutDirection: "vertical",
      background: { r: 1, g: 1, b: 1 },
      padding: { top: 60, right: 256, bottom: 60, left: 256 },
      children: [
        {
          id: "content-box",
          type: "container",
          layoutDirection: "vertical",
          children: [{ id: "t1", type: "paragraph", runs: [{ type: "run", text: "Centered Content" }] }],
        },
      ],
    };

    const xml = await xmlOf([sectionContainer]);
    // Before fix: XML contained w:w="3840"
    expect(xml).not.toContain('w:left w:type="dxa" w:w="3840"');
    expect(xml).not.toContain('w:right w:type="dxa" w:w="3840"');
  });

  it("Case 5: does not propagate parent row left margin to subsequent columns in a horizontal row", async () => {
    const rowContainer: ContainerElement = {
      id: "row-1",
      type: "container",
      layoutDirection: "horizontal",
      gap: 16,
      padding: { top: 12, right: 32, bottom: 12, left: 32 }, // 32px = 480 dxa
      columnWidths: [50, 50],
      children: [
        {
          id: "col-1",
          type: "container",
          layoutDirection: "vertical",
          gap: 8,
          children: [{ id: "t1", type: "paragraph", runs: [{ type: "run", text: "Col 1" }] }],
        },
        {
          id: "col-2",
          type: "container",
          layoutDirection: "vertical",
          gap: 8,
          children: [{ id: "t2", type: "paragraph", runs: [{ type: "run", text: "Col 2" }] }],
        },
      ],
    };

    const xml = await xmlOf([rowContainer]);

    // Col 2 must not have left margin equal to row's padding (480 dxa)
    // Find all tcMar elements
    const tcMarMatches = xml.match(/<w:tcMar>([\s\S]*?)<\/w:tcMar>/g) || [];
    expect(tcMarMatches.length).toBeGreaterThanOrEqual(2);

    // First cell has left margin (<= 480 + halfGap), second cell has only halfGap (not row's left padding!)
    const cell1Mar = tcMarMatches[0];
    const cell2Mar = tcMarMatches[1];

    expect(cell1Mar).toContain('w:left w:type="dxa" w:w="480"');
    // Cell 2 should have halfGap (16px / 2 = 8px = 6pt = 120 dxa), NOT 480 + 120 = 600 dxa!
    expect(cell2Mar).toContain('w:left w:type="dxa" w:w="120"');
  });
});
