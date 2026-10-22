import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument } from "../src/canvas/types.js";
import { FigmaNode } from "../src/parser/types.js";

describe("Phase 32: Real Figma Fidelity Benchmark & Conversion Quality Suite", () => {
  const renderer = new DocxCanvasRenderer();

  describe("Pillar 1: Optical Center & Alignment Invariance for Auto-Width Text", () => {
    it("1. Center-aligned single-line text maintains exact optical center under buffer expansion", async () => {
      const origX = 100;
      const origW = 60;
      const expectedCenter = origX + origW / 2; // 130.0

      const doc: CanvasDocument = {
        title: "Center Align Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "btn-txt-center",
                name: "Centered Button Text",
                type: "text",
                bounds: { x: origX, y: 50, width: origW, height: 20 },
                zIndex: 1,
                style: {},
                paragraphAlign: "center",
                verticalAlign: "center",
                textAutoResize: "WIDTH_AND_HEIGHT",
                textRuns: [{ text: "확인 버튼", fontSizePt: 12, fontWeight: 600, color: "#1A3A5C" }],
              },
            ],
          },
        ],
      };

      const buffer = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")!.async("text");

      const match = docXml.match(/margin-left:([0-9.]+)pt;margin-top:50\.000pt;width:([0-9.]+)pt;/);
      expect(match).not.toBeNull();
      const renderedX = parseFloat(match![1]);
      const renderedW = parseFloat(match![2]);

      // Optical center = renderedX + renderedW / 2
      const renderedCenter = renderedX + renderedW / 2;
      expect(renderedCenter).toBeCloseTo(expectedCenter, 3);
      expect(renderedW).toBeGreaterThan(origW); // Buffer was applied
      expect(renderedX).toBeLessThan(origX); // Shifted left by buffer / 2 to preserve center
    });

    it("2. Right-aligned single-line text maintains exact right anchor edge under buffer expansion", async () => {
      const origX = 200;
      const origW = 80;
      const expectedRight = origX + origW; // 280.0

      const doc: CanvasDocument = {
        title: "Right Align Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "lbl-txt-right",
                name: "Right Aligned Label",
                type: "text",
                bounds: { x: origX, y: 100, width: origW, height: 20 },
                zIndex: 1,
                style: {},
                paragraphAlign: "right",
                textAutoResize: "WIDTH_AND_HEIGHT",
                textRuns: [{ text: "123,456 원", fontSizePt: 11, color: "#333333" }],
              },
            ],
          },
        ],
      };

      const buffer = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")!.async("text");

      const match = docXml.match(/margin-left:([0-9.]+)pt;margin-top:100\.000pt;width:([0-9.]+)pt;/);
      expect(match).not.toBeNull();
      const renderedX = parseFloat(match![1]);
      const renderedW = parseFloat(match![2]);

      const renderedRight = renderedX + renderedW;
      expect(renderedRight).toBeCloseTo(expectedRight, 3);
      expect(renderedX).toBeLessThan(origX);
    });
  });

  describe("Pillar 2: Stroke Alignment & Inset Compensation for VML Shapes", () => {
    it("3. Insets VML card bounding box by strokeWidth / 2 for INSIDE stroke alignment", async () => {
      const origX = 50;
      const origY = 50;
      const origW = 200;
      const origH = 60;
      const strokeWidth = 2.0;

      const doc: CanvasDocument = {
        title: "Stroke Inset Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "card-bordered",
                name: "Bordered Card",
                type: "card",
                bounds: { x: origX, y: origY, width: origW, height: origH },
                zIndex: 1,
                style: {
                  fillColor: "#FFFFFF",
                  strokeColor: "#D1D5DB",
                  strokeWidth: strokeWidth,
                  strokeAlign: "INSIDE",
                  cornerRadius: 8,
                },
              },
            ],
          },
        ],
      };

      const buffer = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")!.async("text");

      const match = docXml.match(/margin-left:([0-9.]+)pt;margin-top:([0-9.]+)pt;width:([0-9.]+)pt;height:([0-9.]+)pt;/);
      expect(match).not.toBeNull();
      const shapeX = parseFloat(match![1]);
      const shapeY = parseFloat(match![2]);
      const shapeW = parseFloat(match![3]);
      const shapeH = parseFloat(match![4]);

      // Inset by half stroke
      expect(shapeX).toBeCloseTo(origX + strokeWidth / 2, 3);
      expect(shapeY).toBeCloseTo(origY + strokeWidth / 2, 3);
      expect(shapeW).toBeCloseTo(origW - strokeWidth, 3);
      expect(shapeH).toBeCloseTo(origH - strokeWidth, 3);

      // Outer stroke edge matches original outer boundary
      expect(shapeX - strokeWidth / 2).toBeCloseTo(origX, 3);
      expect(shapeX + shapeW + strokeWidth / 2).toBeCloseTo(origX + origW, 3);
    });

    it("4. Parser faithfully extracts strokeAlign property from Figma nodes", () => {
      const rawNode: FigmaNode = {
        id: "rect-1",
        name: "Inside Border Box",
        type: "RECTANGLE",
        strokeWeight: 1.5,
        strokeAlign: "INSIDE",
        strokes: [{ type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }],
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      };

      const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
      const doc = parser.parse({
        document: {
          id: "doc-1",
          name: "Doc",
          type: "DOCUMENT",
          children: [
            {
              id: "canv-1",
              name: "Canvas",
              type: "CANVAS",
              children: [
                {
                  id: "frame-1",
                  name: "Page Frame",
                  type: "FRAME",
                  absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 1000 },
                  children: [rawNode],
                },
              ],
            },
          ],
        },
      } as any);

      const parsedElem = doc.pages[0].elements.find((e) => e.name === "Inside Border Box");
      expect(parsedElem).toBeDefined();
      expect(parsedElem!.style.strokeAlign).toBe("INSIDE");
      expect(parsedElem!.style.strokeColor).toBe("#1A334D");
    });
  });

  describe("Pillar 3: Baseline Clipping Prevention on Vertically Centered Text", () => {
    it("5. Emits w:lineRule='atLeast' for vertically centered single-line elements to prevent Word glyph clipping", async () => {
      const doc: CanvasDocument = {
        title: "Vertical Center Line Rule Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "btn-txt-vcenter",
                name: "VCenter Button",
                type: "text",
                bounds: { x: 100, y: 100, width: 80, height: 28 },
                zIndex: 1,
                style: {},
                verticalAlign: "center",
                textAutoResize: "WIDTH_AND_HEIGHT",
                textRuns: [{ text: "캘린더 보기", fontSizePt: 10.5, lineHeightPt: 16 }],
              },
            ],
          },
        ],
      };

      const buffer = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")!.async("text");

      // w:lineRule="atLeast" allows natural glyph rendering inside v-text-anchor:middle
      expect(docXml).toContain('<w:spacing w:before="0" w:after="0" w:line="320" w:lineRule="atLeast"/>');
      expect(docXml).toContain("v-text-anchor:middle");
    });

    it("6. Retains w:lineRule='exact' for multi-line paragraphs to enforce strict vertical rhythm", async () => {
      const doc: CanvasDocument = {
        title: "Multi-line Paragraph Line Rule Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "para-multiline",
                name: "Paragraph Block",
                type: "text",
                bounds: { x: 100, y: 200, width: 300, height: 120 },
                zIndex: 1,
                style: {},
                verticalAlign: "center",
                textRuns: [
                  {
                    text: "이 텍스트는 여러 줄에 걸쳐 엄격한 행간을 유지해야 하는 본문 블록입니다.\n두 번째 줄도 정확한 줄간격을 유지해야 합니다.",
                    fontSizePt: 12,
                    lineHeightPt: 20,
                  },
                ],
              },
            ],
          },
        ],
      };

      const buffer = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")!.async("text");

      expect(docXml).toContain('<w:spacing w:before="0" w:after="0" w:line="400" w:lineRule="exact"/>');
    });
  });
});
