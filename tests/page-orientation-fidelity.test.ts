import { describe, it, expect } from "vitest";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";
import * as zipfile from "jszip";
import * as fs from "fs";

describe("Phase 23.1: HWPX & DOCX Page Orientation Fidelity Guard", () => {
  const hwpxRenderer = new HwpxCanvasRenderer();
  const docxRenderer = new DocxCanvasRenderer();

  it("1. Renders A4 Portrait document with OWPML landscape='WIDELY' and OpenXML w:orient='portrait'", async () => {
    const doc: CanvasDocument = {
      title: "A4 Portrait Guard",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [{
        pageNumber: 1,
        name: "P1",
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        elements: [{
          id: "t1",
          name: "Portrait Text",
          type: "text",
          bounds: { x: 50, y: 50, width: 400, height: 50 },
          zIndex: 1,
          style: {},
          textRuns: [{ text: "세로 문서 테스트", fontSizePt: 10, fontFamily: "맑은 고딕" }],
        }],
      }],
    };

    // HWPX Verification
    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    const hwpxZip = await zipfile.default.loadAsync(hwpxBuf);
    const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

    expect(secXml).toContain('landscape="WIDELY"');
    expect(secXml).not.toContain('landscape="NARROWLY"');
    expect(secXml).toContain('width="59528" height="84189"');

    // DOCX Verification
    const docxBuf = await docxRenderer.renderToBuffer(doc);
    const docxZip = await zipfile.default.loadAsync(docxBuf);
    const docXml = await docxZip.file("word/document.xml")!.async("string");

    expect(docXml).toContain('w:orient="portrait"');
    expect(docXml).not.toContain('w:orient="landscape"');
    expect(docXml).toContain('w:w="11906" w:h="16838"');
  });

  it("2. Renders A4 Landscape document with OWPML landscape='NARROWLY' and OpenXML w:orient='landscape'", async () => {
    const doc: CanvasDocument = {
      title: "A4 Landscape Guard",
      pageSize: { name: "A4", widthPt: 841.89, heightPt: 595.28, orientation: "landscape", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [{
        pageNumber: 1,
        name: "P1",
        bounds: { x: 0, y: 0, width: 841.89, height: 595.28 },
        elements: [{
          id: "t1",
          name: "Landscape Text",
          type: "text",
          bounds: { x: 50, y: 50, width: 700, height: 50 },
          zIndex: 1,
          style: {},
          textRuns: [{ text: "가로 문서 테스트", fontSizePt: 10, fontFamily: "맑은 고딕" }],
        }],
      }],
    };

    // HWPX Verification
    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    const hwpxZip = await zipfile.default.loadAsync(hwpxBuf);
    const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

    expect(secXml).toContain('landscape="NARROWLY"');
    expect(secXml).not.toContain('landscape="WIDELY"');
    // OWPML paper dimensions must remain portrait-base (width <= height)
    expect(secXml).toContain('width="59528" height="84189"');

    // DOCX Verification
    const docxBuf = await docxRenderer.renderToBuffer(doc);
    const docxZip = await zipfile.default.loadAsync(docxBuf);
    const docXml = await docxZip.file("word/document.xml")!.async("string");

    expect(docXml).toContain('w:orient="landscape"');
    expect(docXml).toContain('w:w="16838" w:h="11906"');
  });

  it("3. Correctly switches orientation dynamically in multi-page documents", async () => {
    const doc: CanvasDocument = {
      title: "Mixed Orientation Document",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          name: "Page 1 - Portrait",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [],
        },
        {
          pageNumber: 2,
          name: "Page 2 - Landscape",
          bounds: { x: 0, y: 0, width: 841.89, height: 595.28 },
          elements: [],
        },
      ],
    };

    // HWPX Verification
    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    const hwpxZip = await zipfile.default.loadAsync(hwpxBuf);
    const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

    // Both orientations should be present in section0.xml
    expect(secXml).toContain('landscape="WIDELY"');
    expect(secXml).toContain('landscape="NARROWLY"');

    // DOCX Verification
    const docxBuf = await docxRenderer.renderToBuffer(doc);
    const docxZip = await zipfile.default.loadAsync(docxBuf);
    const docXml = await docxZip.file("word/document.xml")!.async("string");

    expect(docXml).toContain('w:orient="portrait"');
    expect(docXml).toContain('w:orient="landscape"');
  });

  it("4. Verifies Stage 6 Proposal renders strictly as Portrait in HWPX and DOCX", async () => {
    const raw = JSON.parse(fs.readFileSync("samples/real-world/sample-a-proposal-doc.json", "utf-8"));
    const parser = new FigmaCanvasParser();
    const doc = parser.parse(raw);

    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    const hwpxZip = await zipfile.default.loadAsync(hwpxBuf);
    const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

    expect(secXml).toContain('landscape="WIDELY"');
    expect(secXml).not.toContain('landscape="NARROWLY"');

    const docxBuf = await docxRenderer.renderToBuffer(doc);
    const docxZip = await zipfile.default.loadAsync(docxBuf);
    const docXml = await docxZip.file("word/document.xml")!.async("string");

    expect(docXml).toContain('w:orient="portrait"');
    expect(docXml).not.toContain('w:orient="landscape"');
  });

  it("5. Verifies Stage 7 Customer Report (9 pages) renders strictly as Portrait in HWPX and DOCX", async () => {
    const raw = JSON.parse(fs.readFileSync("debug/customer/Report1-Live-Snapshot.json", "utf-8"));
    const parser = new FigmaCanvasParser();
    const doc = parser.parse(raw);

    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    const hwpxZip = await zipfile.default.loadAsync(hwpxBuf);
    const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

    expect(secXml).toContain('landscape="WIDELY"');
    expect(secXml).not.toContain('landscape="NARROWLY"');

    const docxBuf = await docxRenderer.renderToBuffer(doc);
    const docxZip = await zipfile.default.loadAsync(docxBuf);
    const docXml = await docxZip.file("word/document.xml")!.async("string");

    expect(docXml).toContain('w:orient="portrait"');
    expect(docXml).not.toContain('w:orient="landscape"');
  }, 30000);

  it("6. Non-regression: Phase 23~23.1 typography & shape features remain active", async () => {
    const raw = JSON.parse(fs.readFileSync("samples/real-world/sample-a-proposal-doc.json", "utf-8"));
    const parser = new FigmaCanvasParser();
    const doc = parser.parse(raw);

    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    const hwpxZip = await zipfile.default.loadAsync(hwpxBuf);
    const headerXml = await hwpxZip.file("Contents/header.xml")!.async("string");
    const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

    // Phase 23 / 23.1 typography settings preserved
    expect(headerXml).toContain('lineWrap="BREAK"');
    expect(headerXml).toContain('breakNonLatinWord="BREAK_WORD"');
    expect(headerXml).toContain('snapToGrid="0"');
    expect(headerXml).toContain('<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>');

    // Transparent cards preserve empty fillBrush
    expect(secXml).toContain("<hc:fillBrush/>");
  });
});
