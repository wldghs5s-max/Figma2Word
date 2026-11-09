import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";
import * as fs from "fs";
import * as path from "path";

describe("Phase 46 Final Fixes: Table Cell z-index Isolation & Gradient Fill Support", () => {
  it("isolates table cell z-index to table logical layer z and prevents overlay collisions", async () => {
    const doc: CanvasDocument = {
      version: "1.0",
      title: "Table z-index Isolation Test",
      pageSize: { widthPt: 595, heightPt: 842 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595, height: 842 },
          elements: [
            {
              id: "tbl_1",
              name: "DataTable",
              type: "table",
              bounds: { x: 50, y: 100, width: 400, height: 120 },
              zIndex: 10,
              style: {
                fillColor: "#FFFFFF",
                strokeColor: "#D0D5DD",
                strokeWidth: 1,
              },
              tableData: {
                rowCount: 2,
                colCount: 3,
                colWidthsPt: [120, 140, 140],
                rowHeightsPt: [60, 60],
                cells: [
                  [
                    { row: 0, col: 0, widthPt: 120, heightPt: 60, textRuns: [{ text: "H1" }] },
                    { row: 0, col: 1, widthPt: 140, heightPt: 60, textRuns: [{ text: "H2" }] },
                    { row: 0, col: 2, widthPt: 140, heightPt: 60, textRuns: [{ text: "H3" }] },
                  ],
                  [
                    { row: 1, col: 0, widthPt: 120, heightPt: 60, textRuns: [{ text: "D1" }] },
                    { row: 1, col: 1, widthPt: 140, heightPt: 60, textRuns: [{ text: "D2" }] },
                    { row: 1, col: 2, widthPt: 140, heightPt: 60, textRuns: [{ text: "D3" }] },
                  ],
                ],
              },
            },
            {
              id: "overlay_card_1",
              name: "PopupOverlay",
              type: "card",
              bounds: { x: 100, y: 120, width: 250, height: 150 },
              zIndex: 11,
              style: {
                fillColor: "#FFFFFF",
                strokeColor: "#2563EB",
                strokeWidth: 2,
              },
              textRuns: [{ text: "Popup Content" }],
            },
            {
              id: "overlay_btn_1",
              name: "CloseButton",
              type: "card",
              bounds: { x: 300, y: 130, width: 40, height: 25 },
              zIndex: 12,
              style: {
                fillColor: "#EF4444",
              },
              textRuns: [{ text: "X" }],
            },
          ],
        },
      ],
    };

    const renderer = new DocxCanvasRenderer();
    const docxBuf = await renderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(docxBuf);
    const xml = await zip.file("word/document.xml")!.async("string");

    // Extract all shapes with their z-index
    const zMatches = [...xml.matchAll(/id="([^"]+)"[^>]*z-index:(-?\d+)/g)];
    expect(zMatches.length).toBeGreaterThanOrEqual(8); // 6 table cells + 2 overlay shapes

    const cellShapes = zMatches.filter((m) => m[1].startsWith("s_0_"));
    const overlayCard = zMatches.find((m) => xml.includes(`alt="overlay_card_1"`) && m[0].includes(`z-index:11`));
    const overlayBtn = zMatches.find((m) => xml.includes(`alt="overlay_btn_1"`) && m[0].includes(`z-index:12`));

    expect(overlayCard).toBeDefined();
    expect(overlayBtn).toBeDefined();

    // Verify all table cells stay at z-index 10
    const cellZIndices = cellShapes.map((m) => parseInt(m[2], 10));
    expect(cellZIndices.every((z) => z === 10 || z === 11 || z === 12)).toBe(true);

    // Verify specifically that NO table cell was elevated above or equal to overlay elements
    const tableCellsXml = [...xml.matchAll(/alt="tbl_1_c_\d+_\d+"[^>]*style="[^"]*z-index:(\d+)/g)];
    expect(tableCellsXml.length).toBe(6);
    for (const match of tableCellsXml) {
      expect(parseInt(match[1], 10)).toBe(10);
    }
  });

  it("extracts and preserves GRADIENT_LINEAR in Canvas IR", () => {
    const rawFigmaTree = {
      id: "root_frame",
      name: "PageFrame",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
      children: [
        {
          id: "gradient_box_1",
          name: "HeroBanner",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 50, y: 50, width: 600, height: 200 },
          fills: [
            {
              type: "GRADIENT_LINEAR",
              visible: true,
              gradientHandlePositions: [
                { x: 0, y: 0.5 },
                { x: 1, y: 0.5 },
                { x: 0, y: 1 },
              ],
              gradientStops: [
                { color: { r: 0.05, g: 0.65, b: 0.91, a: 1 }, position: 0 },
                { color: { r: 0.08, g: 0.72, b: 0.65, a: 1 }, position: 0.55 },
                { color: { r: 0.96, g: 0.98, b: 1, a: 1 }, position: 1 },
              ],
            },
          ],
        },
      ],
    };

    const parser = new FigmaCanvasParser({ scalePolicy: "1:1" });
    const doc = parser.parse(rawFigmaTree as any);

    expect(doc.pages[0].elements.length).toBe(1);
    const elem = doc.pages[0].elements[0];
    expect(elem.style.gradient).toBeDefined();
    expect(elem.style.gradient!.type).toBe("linear");
    expect(elem.style.gradient!.angle).toBe(270);
    expect(elem.style.gradient!.stops.length).toBe(3);
    expect(elem.style.gradient!.stops[0].color).toBe("#0DA6E8");
    expect(elem.style.gradient!.stops[1].color).toBe("#14B8A6");
    expect(elem.style.gradient!.stops[2].color).toBe("#F5FAFF");

    // Fallback solid fill is populated
    expect(elem.style.fillColor).toBe("#0DA6E8");
    expect(elem.style.fillOpacity).toBe(1);
  });

  it("renders gradient fills in DOCX VML with <v:fill type='gradient'>", async () => {
    const doc: CanvasDocument = {
      version: "1.0",
      title: "Gradient DOCX Test",
      pageSize: { widthPt: 600, heightPt: 300 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 600, height: 300 },
          elements: [
            {
              id: "grad_rect",
              name: "GradRect",
              type: "card",
              bounds: { x: 50, y: 50, width: 500, height: 150 },
              zIndex: 1,
              style: {
                gradient: {
                  type: "linear",
                  angle: 270,
                  stops: [
                    { color: "#0EA5E9", opacity: 1, position: 0 },
                    { color: "#14B8A6", opacity: 1, position: 0.55 },
                    { color: "#F4FAFF", opacity: 1, position: 1 },
                  ],
                },
                fillColor: "#0EA5E9",
                fillOpacity: 1,
                cornerRadius: 12,
              },
            },
          ],
        },
      ],
    };

    const renderer = new DocxCanvasRenderer();
    const docxBuf = await renderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(docxBuf);
    const xml = await zip.file("word/document.xml")!.async("string");

    expect(xml).toContain('<v:fill type="gradient" angle="270" color="#0EA5E9" color2="#F4FAFF"');
    expect(xml).toContain('colors="0% #0EA5E9; 55% #14B8A6; 100% #F4FAFF"');
    expect(xml).toContain('filled="t"');
  });

  it("renders gradient elements in HWPX using solid fallback brush", async () => {
    const doc: CanvasDocument = {
      version: "1.0",
      title: "Gradient HWPX Fallback Test",
      pageSize: { widthPt: 600, heightPt: 300 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 600, height: 300 },
          elements: [
            {
              id: "grad_rect",
              name: "GradRect",
              type: "card",
              bounds: { x: 50, y: 50, width: 500, height: 150 },
              zIndex: 1,
              style: {
                gradient: {
                  type: "linear",
                  angle: 270,
                  stops: [
                    { color: "#0EA5E9", opacity: 1, position: 0 },
                    { color: "#F4FAFF", opacity: 1, position: 1 },
                  ],
                },
                fillColor: "#0EA5E9",
              },
            },
          ],
        },
      ],
    };

    const renderer = new HwpxCanvasRenderer();
    const hwpxBuf = await renderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(hwpxBuf);
    const sectionXml = await zip.file("Contents/section0.xml")!.async("string");

    expect(sectionXml).toContain('<hc:fillBrush><hc:winBrush faceColor="#0EA5E9"');
  });

  it("verifies live Home frame node 1154:7735 preserves gradient in Canvas IR and renders in DOCX", async () => {
    const framePath = path.resolve("debug/phase46_3/frames/frame_1154_7666.json");
    if (!fs.existsSync(framePath)) return;

    const raw = JSON.parse(fs.readFileSync(framePath, "utf8"));
    const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
    const doc = parser.parse(raw);

    const bannerElem = doc.pages[0].elements.find(
      (e) => e.sourceNodeId === "1154:7735" || e.id === "1154:7735"
    );
    expect(bannerElem).toBeDefined();
    expect(bannerElem!.style.gradient).toBeDefined();
    expect(bannerElem!.style.gradient!.stops.length).toBe(3);

    const renderer = new DocxCanvasRenderer();
    const docxBuf = await renderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(docxBuf);
    const xml = await zip.file("word/document.xml")!.async("string");

    expect(xml).toContain('<v:fill type="gradient" angle="270" color="#0EA5E9" color2="#F4FBFF"');
  });

  it("verifies live Contract Management frame 1154:4490 has zero collisions between table cells and subsequent pagination", async () => {
    const framePath = path.resolve("debug/phase46_3/frames/frame_1154_4490.json");
    if (!fs.existsSync(framePath)) return;

    const raw = JSON.parse(fs.readFileSync(framePath, "utf8"));
    const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
    const doc = parser.parse(raw);

    const renderer = new DocxCanvasRenderer();
    const docxBuf = await renderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(docxBuf);
    const xml = await zip.file("word/document.xml")!.async("string");

    // Extract table cells and following elements
    const tableCells = [...xml.matchAll(/alt="1154:4530_c_\d+_\d+"[^>]*style="[^"]*z-index:(\d+)/g)];
    expect(tableCells.length).toBeGreaterThan(0);
    const tableCellZ = parseInt(tableCells[0][1], 10);

    // All table cells have the exact table z-index
    for (const cell of tableCells) {
      expect(parseInt(cell[1], 10)).toBe(tableCellZ);
    }

    // Following elements (pagination buttons) must have z-index > tableCellZ
    const paginationMatches = [...xml.matchAll(/alt="1154:469\d[^"]*"[^>]*style="[^"]*z-index:(\d+)/g)];
    expect(paginationMatches.length).toBeGreaterThan(0);
    for (const pm of paginationMatches) {
      expect(parseInt(pm[1], 10)).toBeGreaterThan(tableCellZ);
    }
  });
});
