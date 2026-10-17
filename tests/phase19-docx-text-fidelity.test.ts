import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import {
  DocxCanvasRenderer,
  FigmaCanvasParser,
  CanvasDocument,
  CanvasElement,
} from "../src/canvas/index.js";

describe("Phase 19: DOCX Text Fidelity Finalization Suite", () => {
  const docxRenderer = new DocxCanvasRenderer();

  it("Item 1: Fixed-width Korean text automatically wraps and sets mso-wrap-style:square", async () => {
    const doc: CanvasDocument = {
      title: "Fixed Width Korean Wrap",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      diagnostics: { notices: [], warnings: [] },
      resources: {},
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "txt_wrap_korean",
              name: "Korean Paragraph",
              type: "text",
              bounds: { x: 40, y: 40, width: 200, height: 60 },
              zIndex: 1,
              style: {},
              textRuns: [
                {
                  text: "주의: 본 균열 폭 측정 결과는 GSD 기준의 AI 영상 분석 추정치이며 물리적 정밀 측정을 요합니다.",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 10,
                  fontWeight: 400,
                  color: "#1F2937",
                  lineHeightPt: 14,
                },
              ],
            },
          ],
        },
      ],
    };

    const buf = await docxRenderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");

    // Must have mso-wrap-style:square to enforce WordWrap in Word COM
    expect(xml).toContain("mso-wrap-style:square");
    expect(xml).not.toContain('id="s_0_0"[^>]*mso-wrap-style:none');
    expect(xml).toContain("주의: 본 균열 폭 측정 결과는");
  });

  it("Item 2: Explicit line breaks are strictly preserved as <w:br/>", async () => {
    const doc: CanvasDocument = {
      title: "Explicit Breaks",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      diagnostics: { notices: [], warnings: [] },
      resources: {},
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "txt_breaks",
              name: "Explicit Breaks Text",
              type: "text",
              bounds: { x: 40, y: 40, width: 300, height: 80 },
              zIndex: 1,
              style: {},
              textRuns: [
                {
                  text: "첫 번째 줄\n두 번째 줄\n세 번째 줄",
                  fontFamily: "Pretendard",
                  fontSizePt: 12,
                  fontWeight: 600,
                  color: "#111827",
                  lineHeightPt: 18,
                },
              ],
            },
          ],
        },
      ],
    };

    const buf = await docxRenderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");

    expect(xml).toContain("첫 번째 줄</w:t><w:br/><w:t xml:space=\"preserve\">두 번째 줄</w:t><w:br/><w:t xml:space=\"preserve\">세 번째 줄");
  });

  it("Item 3: Auto-width text (WIDTH_AND_HEIGHT) preserves single-line rendering with mso-wrap-style:none to prevent unwanted wrapping and clipping", async () => {
    const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
    const figmaJson = {
      id: "root",
      name: "Auto Width Frame",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 794, height: 1123 },
      children: [
        {
          id: "txt_auto_wh",
          name: "Auto Width Text",
          type: "TEXT",
          characters: "단일 행 라벨 (Single Line)",
          absoluteBoundingBox: { x: 50, y: 50, width: 180, height: 24 },
          style: {
            fontFamily: "맑은 고딕",
            fontSize: 14,
            textAutoResize: "WIDTH_AND_HEIGHT",
          },
        },
      ],
    };

    const canvasDoc = parser.parse(figmaJson as any);
    const el = canvasDoc.pages[0].elements[0];
    expect(el.textAutoResize).toBe("WIDTH_AND_HEIGHT");

    const buf = await docxRenderer.renderToBuffer(canvasDoc);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");

    // Single-line auto-width text must NOT auto-wrap to prevent Word font variance clipping
    expect(xml).toContain("mso-wrap-style:none");
    expect(xml).toContain("mso-fit-shape-to-text:t");
  });

  it("Item 4: Long mixed English, Korean, numbers, units, and parentheses wrap without page overflow", async () => {
    const doc: CanvasDocument = {
      title: "Mixed Language Wrapping",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      diagnostics: { notices: [], warnings: [] },
      resources: {},
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "txt_mixed_long",
              name: "Mixed Tech Summary",
              type: "text",
              bounds: { x: 50, y: 100, width: 450, height: 60 },
              zIndex: 1,
              style: {},
              textRuns: [
                {
                  text: "해운대동신아파트(해동신) 1차 외벽 균열 진단 결과: 단지 전체 CDI는 0.031%로 양호하며 GSD(0.35mm/px) 기준 109동 5층 A면 수직 균열(폭 0.82cm, 길이 1.45m)은 주의 관찰이 요구됩니다.",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 10,
                  fontWeight: 400,
                  color: "#111827",
                  lineHeightPt: 15,
                },
              ],
            },
          ],
        },
      ],
    };

    const buf = await docxRenderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");

    expect(xml).toContain("width:450.000pt");
    expect(xml).toContain("mso-wrap-style:square");
    expect(xml).toContain("mso-fit-shape-to-text:t");
  });

  it("Item 5: Tight line-height triggers atLeast lineRule to prevent Korean/English descender clipping", async () => {
    const doc: CanvasDocument = {
      title: "Descender LineRule",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      diagnostics: { notices: [], warnings: [] },
      resources: {},
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "txt_tight_descender",
              name: "Tight Descender",
              type: "text",
              bounds: { x: 40, y: 40, width: 200, height: 12 },
              zIndex: 1,
              style: {},
              textRuns: [
                {
                  text: "한글 받침과 영문 gjpyq 흥 항 흗 끋",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 10,
                  fontWeight: 600,
                  color: "#DC2626",
                  lineHeightPt: 11, // 11 < 10 * 1.25 -> tight line!
                },
              ],
            },
          ],
        },
      ],
    };

    const buf = await docxRenderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");

    // Tight line spacing must emit w:lineRule="atLeast" to allow Word DirectWrite descender buffer
    expect(xml).toContain('w:line="220" w:lineRule="atLeast"');
    expect(xml).toContain("mso-fit-shape-to-text:t");
  });

  it("Item 6: Multi-line pure text expands height via mso-fit-shape-to-text:t avoiding text cutoff", async () => {
    const doc: CanvasDocument = {
      title: "Multi-line Height Expansion",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      diagnostics: { notices: [], warnings: [] },
      resources: {},
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "txt_multiline_expand",
              name: "Pure Text Expansion",
              type: "text",
              bounds: { x: 40, y: 40, width: 300, height: 20 },
              zIndex: 1,
              style: {},
              textAutoResize: "HEIGHT",
              textRuns: [
                {
                  text: "Line 1: High fidelity\nLine 2: Multi-line wrap\nLine 3: Auto expansion",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 11,
                  fontWeight: 400,
                  color: "#000000",
                  lineHeightPt: 16,
                },
              ],
            },
          ],
        },
      ],
    };

    const buf = await docxRenderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");

    expect(xml).toContain("mso-fit-shape-to-text:t");
  });

  it("Item 7: Container cards and buttons maintain mso-fit-shape-to-text:f to preserve exact background geometry", async () => {
    const doc: CanvasDocument = {
      title: "Container Card Geometry",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      diagnostics: { notices: [], warnings: [] },
      resources: {},
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "card_btn",
              name: "Action Button",
              type: "card",
              bounds: { x: 40, y: 40, width: 120, height: 36 },
              zIndex: 1,
              style: { fillColor: "#2563EB", cornerRadius: 6 },
              textRuns: [
                {
                  text: "확인 (Submit)",
                  fontFamily: "Pretendard",
                  fontSizePt: 11,
                  fontWeight: 600,
                  color: "#FFFFFF",
                },
              ],
            },
          ],
        },
      ],
    };

    const buf = await docxRenderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");

    // Cards with backgrounds must keep mso-fit-shape-to-text:f to avoid shrinking button height
    expect(xml).toContain("mso-fit-shape-to-text:f");
    expect(xml).toContain("mso-wrap-style:square");
  });

  it("Item 8: Headings with generous line-height preserve exact lineRule", async () => {
    const doc: CanvasDocument = {
      title: "Heading Exact LineRule",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      diagnostics: { notices: [], warnings: [] },
      resources: {},
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "txt_heading",
              name: "Section Title",
              type: "text",
              bounds: { x: 40, y: 40, width: 400, height: 50 },
              zIndex: 1,
              style: {},
              textRuns: [
                {
                  text: "1. 외벽 정밀 안전점검 종합 요약",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 16,
                  fontWeight: 700,
                  color: "#1E3A8A",
                  lineHeightPt: 24, // 24 >= 16 * 1.25 (20) -> generous line!
                },
              ],
            },
          ],
        },
      ],
    };

    const buf = await docxRenderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");

    // 24pt = 480 twips
    expect(xml).toContain('w:line="480" w:lineRule="exact"');
  });

  it("Item 9: Repeated component across multi-page document maintains identical wrapping and styling", async () => {
    const doc: CanvasDocument = {
      title: "Repeated Component",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      diagnostics: { notices: [], warnings: [] },
      resources: {},
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "p1_notice",
              name: "Common Notice",
              type: "text",
              bounds: { x: 50, y: 700, width: 400, height: 30 },
              zIndex: 1,
              style: {},
              textRuns: [{ text: "공통 법적 고지사항", fontFamily: "맑은 고딕", fontSizePt: 9, color: "#6B7280" }],
            },
          ],
        },
        {
          pageNumber: 2,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "p2_notice",
              name: "Common Notice",
              type: "text",
              bounds: { x: 50, y: 700, width: 400, height: 30 },
              zIndex: 1,
              style: {},
              textRuns: [{ text: "공통 법적 고지사항", fontFamily: "맑은 고딕", fontSizePt: 9, color: "#6B7280" }],
            },
          ],
        },
      ],
    };

    const buf = await docxRenderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");

    const matches = xml.match(/mso-wrap-style:square/g) || [];
    expect(matches.length).toBe(2);
  });

  it("Item 10: Non-text elements (backgrounds, lines, images) preserve mso-wrap-style:none", async () => {
    const doc: CanvasDocument = {
      title: "Non-Text Preservation",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      diagnostics: { notices: [], warnings: [] },
      resources: {
        "dot-img": {
          id: "dot-img",
          name: "dot.png",
          mimeType: "image/png",
          data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
        },
      },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "dec_line",
              name: "Divider Line",
              type: "line",
              bounds: { x: 40, y: 100, width: 500, height: 0 },
              zIndex: 1,
              style: { strokeColor: "#E5E7EB", strokeWidth: 1 },
            },
            {
              id: "dec_card",
              name: "Empty Card",
              type: "card",
              bounds: { x: 40, y: 120, width: 200, height: 100 },
              zIndex: 2,
              style: { fillColor: "#F9FAFB", strokeColor: "#E5E7EB", strokeWidth: 1 },
            },
            {
              id: "dec_img",
              name: "Photo",
              type: "image",
              bounds: { x: 260, y: 120, width: 100, height: 100 },
              zIndex: 3,
              style: {},
              imageRef: "dot-img",
            },
          ],
        },
      ],
    };

    const buf = await docxRenderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");

    // Empty card without text must have mso-wrap-style:none
    expect(xml).toContain('id="s_0_1"');
    expect(xml).toContain("mso-wrap-style:none");
    expect(xml).not.toContain('<v:textbox');
  });

  it("Item 11: Single-line labels with HEIGHT resize and estimatedLines < 1.4 preserve mso-wrap-style:none, while multi-line paragraphs wrap with mso-wrap-style:square", async () => {
    const doc: CanvasDocument = {
      title: "Precision Wrapping Separation",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      diagnostics: { notices: [], warnings: [] },
      resources: {},
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            // Single-line cell (HEIGHT resize from auto-layout, but 1-line tall)
            {
              id: "single_cell_height",
              name: "부산 해운대구 좌동 1407",
              type: "text",
              bounds: { x: 50, y: 50, width: 150, height: 11 },
              zIndex: 1,
              style: {},
              textAutoResize: "HEIGHT",
              textRuns: [
                {
                  text: "부산 해운대구 좌동 1407",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 8.5,
                  lineHeightPt: 10.6,
                },
              ],
            },
            // Multi-line paragraph (HEIGHT resize, 5 lines tall)
            {
              id: "multi_paragraph_height",
              name: "Exterior Wall Inspection Summary",
              type: "text",
              bounds: { x: 50, y: 100, width: 450, height: 75 },
              zIndex: 2,
              style: {},
              textAutoResize: "HEIGHT",
              textRuns: [
                {
                  text: "해운대동신아파트(해동신) 1차 외벽 균열 진단 결과, 단지 전체 CDI는 0.031%로 양호한 수준입니다. 다만 109동과 108동은 상대적으로 균열 밀도가 높아 조기 보수를 권장합니다. 특히 109동 5층 A면의 수직 균열(폭 0.82cm)은 구조적 영향 가능성이 있으므로 정밀 조사를 병행할 것을 제안합니다.",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 9.5,
                  lineHeightPt: 14,
                },
              ],
            },
          ],
        },
      ],
    };

    const buf = await docxRenderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");

    // Single-line cell must have mso-wrap-style:none to stay on 1 line
    expect(xml).toMatch(/alt="single_cell_height"[^>]*style="[^"]*mso-wrap-style:none/);

    // Multi-line paragraph must have mso-wrap-style:square to wrap inside 450pt
    expect(xml).toMatch(/alt="multi_paragraph_height"[^>]*style="[^"]*mso-wrap-style:square/);
  });
});
