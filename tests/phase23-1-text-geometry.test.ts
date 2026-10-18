import { describe, it, expect } from "vitest";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";
import { TextCollisionDetector } from "../scripts/detect_text_collision.js";
import * as zipfile from "jszip";
import * as fs from "fs";

describe("Phase 23.1: Canonical Text Geometry & Overflow Recovery", () => {
  const hwpxRenderer = new HwpxCanvasRenderer();
  const docxRenderer = new DocxCanvasRenderer();

  it("Requirement 1: Serializes hh:paraPr with authentic OWPML attributes (snapToGrid=0, breakSetting BREAK_WORD, autoSpacing 0)", async () => {
    const doc: CanvasDocument = {
      title: "Test ParaPr",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [{
        pageNumber: 1,
        name: "P1",
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        elements: [{
          id: "t1",
          name: "Test Text",
          type: "text",
          bounds: { x: 50, y: 50, width: 400, height: 50 },
          zIndex: 1,
          style: {},
          textRuns: [{ text: "테스트 한글 텍스트", fontSizePt: 10, lineHeightPt: 16, fontFamily: "맑은 고딕" }],
        }],
      }],
    };

    const buf = await hwpxRenderer.renderToBuffer(doc);
    const zip = await zipfile.default.loadAsync(buf);
    const headerXml = await zip.file("Contents/header.xml")!.async("string");

    // Must have snapToGrid="0"
    expect(headerXml).toContain('snapToGrid="0"');
    // Must NOT have snapToGrid="1"
    expect(headerXml).not.toContain('snapToGrid="1"');
    // Must contain authentic breakSetting
    expect(headerXml).toContain('breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD"');
    expect(headerXml).toContain('lineWrap="BREAK"');
    // Must contain autoSpacing eAsianEng="0" eAsianNum="0"
    expect(headerXml).toContain('<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>');
    // Must contain zero paragraph margin
    expect(headerXml).toContain('<hc:intent value="0" unit="HWPUNIT"/>');
    expect(headerXml).toContain('<hc:left value="0" unit="HWPUNIT"/>');
    expect(headerXml).toContain('<hc:right value="0" unit="HWPUNIT"/>');
  });

  it("Requirement 2: Sets textMargin left and right to 0 by default, avoiding artificial width curtailment", async () => {
    const doc: CanvasDocument = {
      title: "Test TextMargin",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [{
        pageNumber: 1,
        name: "P1",
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        elements: [{
          id: "t1",
          name: "Full Width Text",
          type: "text",
          bounds: { x: 40, y: 100, width: 500, height: 60 },
          zIndex: 1,
          style: { cornerRadius: 10 },
          textRuns: [{ text: "기본 마진 테스트", fontSizePt: 11, fontFamily: "맑은 고딕" }],
        }],
      }],
    };

    const buf = await hwpxRenderer.renderToBuffer(doc);
    const zip = await zipfile.default.loadAsync(buf);
    const secXml = await zip.file("Contents/section0.xml")!.async("string");

    // textMargin left and right must be 0
    expect(secXml).toContain('<hp:textMargin left="0" right="0"');
    // drawText lastWidth and subList textWidth must match shape width (500pt * 100 = 50000 HWPU)
    expect(secXml).toContain('lastWidth="50000"');
    expect(secXml).toContain('textWidth="50000"');
  });

  it("Requirement 3: Accurately sizes explicit innerPaddingPt when provided", async () => {
    const doc: CanvasDocument = {
      title: "Test Explicit Padding",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [{
        pageNumber: 1,
        name: "P1",
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        elements: [{
          id: "t1",
          name: "Padded Text",
          type: "text",
          bounds: { x: 40, y: 100, width: 400, height: 60 },
          innerPaddingPt: { top: 8, bottom: 8, left: 12, right: 12 },
          zIndex: 1,
          style: {},
          textRuns: [{ text: "패딩 테스트", fontSizePt: 10, fontFamily: "맑은 고딕" }],
        }],
      }],
    };

    const buf = await hwpxRenderer.renderToBuffer(doc);
    const zip = await zipfile.default.loadAsync(buf);
    const secXml = await zip.file("Contents/section0.xml")!.async("string");

    // 12pt * 100 = 1200 HWPU, 8pt * 100 = 800 HWPU
    expect(secXml).toContain('<hp:textMargin left="1200" right="1200" top="800" bottom="800"/>');
  });

  it("Requirement 4: Safely renders CanvasDocument with omitted or empty resources without throwing", async () => {
    const doc: CanvasDocument = {
      title: "Resource Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [{
        pageNumber: 1,
        name: "P1",
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        elements: [{
          id: "t1",
          name: "Text",
          type: "text",
          bounds: { x: 10, y: 10, width: 100, height: 20 },
          zIndex: 1,
          style: {},
          textRuns: [{ text: "OK", fontSizePt: 10 }],
        }],
      }],
      // resources explicitly omitted
    };

    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    expect(hwpxBuf).toBeInstanceOf(Buffer);
    expect(hwpxBuf.length).toBeGreaterThan(1000);

    const docxBuf = await docxRenderer.renderToBuffer(doc);
    expect(docxBuf).toBeInstanceOf(Buffer);
    expect(docxBuf.length).toBeGreaterThan(1000);
  });

  it("Requirement 5: Accurately detects text overflow and collision risk via TextCollisionDetector", () => {
    const doc: CanvasDocument = {
      title: "Collision Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [{
        pageNumber: 1,
        name: "P1",
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        elements: [
          {
            id: "t_lead",
            name: "Lead Text",
            type: "text",
            bounds: { x: 50, y: 100, width: 200, height: 20 }, // 20pt height is only enough for 1 line
            zIndex: 1,
            textAutoResize: "HEIGHT",
            style: {},
            textRuns: [{
              // Long text that requires 3 lines at 200pt width
              text: "이 문장은 200pt 폭에서 약 세 줄로 줄바꿈되어 최소 45pt의 높이를 필요로 하므로 할당된 20pt 높이를 초과합니다.",
              fontSizePt: 10,
              lineHeightPt: 15,
            }],
          },
          {
            id: "t_subtitle",
            name: "Downstream Subtitle",
            type: "text",
            bounds: { x: 50, y: 125, width: 200, height: 20 }, // Placed at y=125, colliding with line 2/3 of t_lead
            zIndex: 2,
            style: {},
            textRuns: [{ text: "소제목", fontSizePt: 12 }],
          },
        ],
      }],
    };

    const detector = new TextCollisionDetector();
    const records = detector.analyzeDocument(doc);

    expect(records.length).toBeGreaterThanOrEqual(1);
    const overflowRec = records.find(r => r.sourceElementId === "t_lead" && (r.category === "B_VERTICAL_OVERFLOW" || r.category === "E_SOURCE_GEOMETRY_CONFLICT"));
    expect(overflowRec).toBeDefined();

    const collisionRec = records.find(r => r.category === "C_INTER_ELEMENT_COLLISION" && r.targetElementId === "t_subtitle");
    expect(collisionRec).toBeDefined();
  });
});
