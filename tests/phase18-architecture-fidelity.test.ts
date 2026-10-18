import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { DocxCanvasParser } from "../src/canvas/parser/docxCanvasParser.js";
import { SvgPath } from "../src/canvas/geometry/svgPathParser.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 18: Architecture Hardening & Real-World Fidelity Suite", () => {
  // =========================================================================
  // B-1: Multi-Page Mixed Orientation Background Geometry & DOCX->HWPX Roundtrip
  // =========================================================================
  describe("Mission B-1: Mixed Orientation Background Geometry & Roundtrip", () => {
    it("should size background rects per-page for mixed portrait/landscape documents and roundtrip DOCX -> HWPX", async () => {
      const mixedDoc: CanvasDocument = {
        title: "Mixed Orientation Roundtrip",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            backgroundColor: "#FFFFFF",
            elements: [
              {
                id: "p1_card",
                name: "Portrait Card",
                type: "card",
                bounds: { x: 40, y: 40, width: 200, height: 100 },
                zIndex: 1,
                style: { fillColor: "#EFF6FF", strokeColor: "#3B82F6", strokeWidth: 1, strokeDashed: true },
              },
            ],
          },
          {
            pageNumber: 2,
            bounds: { x: 0, y: 0, width: 841.89, height: 595.28 },
            backgroundColor: "#1E293B",
            elements: [
              {
                id: "p2_card",
                name: "Landscape Card",
                type: "card",
                bounds: { x: 60, y: 60, width: 600, height: 300 },
                zIndex: 1,
                style: { fillColor: "#334155", cornerRadius: 12 },
              },
            ],
          },
        ],
        resources: {},
        diagnostics: { notices: [], warnings: [] },
      };

      const docxRenderer = new DocxCanvasRenderer();
      const docxBuf = await docxRenderer.renderToBuffer(mixedDoc);
      const docxZip = await JSZip.loadAsync(docxBuf);
      const docXml = await docxZip.file("word/document.xml")!.async("string");

      // Page 1 background rect must match Portrait (595.280pt x 841.890pt)
      expect(docXml).toContain('id="bg_0"');
      expect(docXml).toContain('width:595.280pt;height:841.890pt');
      // Page 2 background rect must match Landscape (841.890pt x 595.280pt)
      expect(docXml).toContain('id="bg_1"');
      expect(docXml).toContain('width:841.890pt;height:595.280pt');

      // Direct HWPX check: Page 2 background rect has width="84189" height="59528" and matching id/instid
      const hwpxRenderer = new HwpxCanvasRenderer();
      const directHwpxBuf = await hwpxRenderer.renderToBuffer(mixedDoc);
      const directHwpxZip = await JSZip.loadAsync(directHwpxBuf);
      const directSecXml = await directHwpxZip.file("Contents/section0.xml")!.async("string");
      expect(directSecXml).toContain('<hp:orgSz width="84189" height="59528"/>');
      expect(directSecXml).toContain('faceColor="#1E293B"');

      // DOCX -> DocxCanvasParser -> HwpxCanvasRenderer Roundtrip
      const docxParser = new DocxCanvasParser();
      const parsedFromDocx = await docxParser.parse(docxBuf);
      expect(parsedFromDocx.pages.length).toBe(2);
      expect(parsedFromDocx.pages[0].bounds.width).toBeCloseTo(595.28, 1);
      expect(parsedFromDocx.pages[0].bounds.height).toBeCloseTo(841.89, 1);
      expect(parsedFromDocx.pages[0].backgroundColor).toBe("#FFFFFF");
      expect(parsedFromDocx.pages[0].elements[0].style.strokeDashed).toBe(true);

      expect(parsedFromDocx.pages[1].bounds.width).toBeCloseTo(841.89, 1);
      expect(parsedFromDocx.pages[1].bounds.height).toBeCloseTo(595.28, 1);
      expect(parsedFromDocx.pages[1].backgroundColor).toBe("#1E293B");
      expect(parsedFromDocx.pages[1].elements[0].style.cornerRadius).toBeCloseTo(12, 0);

      const roundtripHwpxBuf = await hwpxRenderer.renderToBuffer(parsedFromDocx);
      const rtZip = await JSZip.loadAsync(roundtripHwpxBuf);
      const rtSecXml = await rtZip.file("Contents/section0.xml")!.async("string");
      expect(rtSecXml).toContain('landscape="WIDELY" width="59530" height="84190"');
      expect(rtSecXml).toContain('landscape="NARROWLY" width="59530" height="84190"');
    });
  });

  // =========================================================================
  // B-2: Typography, Line Height, Letter Spacing, Underline/Strike & Padding
  // =========================================================================
  describe("Mission B-2: Typography & Textbox Fidelity", () => {
    it("should preserve explicit lineHeightPx, letterSpacing, underline, strikethrough, and padding while ignoring INTRINSIC_% auto line-height", async () => {
      const figmaParser = new FigmaCanvasParser();
      const doc = figmaParser.parse({
        id: "0:0",
        name: "Typography Test",
        type: "DOCUMENT",
        children: [
          {
            id: "1:1",
            name: "Page 1",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 595.28, height: 841.89 },
            children: [
              {
                id: "1:2",
                name: "Explicit Typography Block",
                type: "TEXT",
                characters: "Body text with explicit spacing",
                absoluteBoundingBox: { x: 40, y: 40, width: 300, height: 80 },
                paddingLeft: 12,
                paddingTop: 8,
                paddingRight: 12,
                paddingBottom: 8,
                style: {
                  fontFamily: "Pretendard",
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeightPx: 18,
                  lineHeightUnit: "FONT_SIZE_%",
                  letterSpacing: -0.6,
                  textDecoration: "UNDERLINE",
                  textAlignHorizontal: "JUSTIFIED",
                  textAlignVertical: "CENTER",
                },
              },
              {
                id: "1:3",
                name: "Intrinsic Auto LineHeight Label",
                type: "TEXT",
                characters: "Single Line Label",
                absoluteBoundingBox: { x: 40, y: 140, width: 200, height: 24 },
                style: {
                  fontFamily: "Pretendard",
                  fontSize: 16,
                  fontWeight: 700,
                  lineHeightPx: 19.2,
                  lineHeightUnit: "INTRINSIC_%",
                  textDecoration: "STRIKETHROUGH",
                },
              },
            ],
          },
        ],
      } as any);

      const elemExplicit = doc.pages[0].elements[0];
      const elemIntrinsic = doc.pages[0].elements[1];

      expect(elemExplicit.innerPaddingPt).toEqual({ top: 8, right: 12, bottom: 8, left: 12 });
      expect(elemExplicit.textRuns![0].lineHeightPt).toBe(18);
      expect(elemExplicit.textRuns![0].letterSpacingPt).toBe(-0.6);
      expect(elemExplicit.textRuns![0].underline).toBe(true);

      // INTRINSIC_% should not force exact lineHeightPt
      expect(elemIntrinsic.textRuns![0].lineHeightPt).toBeUndefined();
      expect(elemIntrinsic.textRuns![0].strike).toBe(true);

      // Check DOCX XML output
      const docxRenderer = new DocxCanvasRenderer();
      const docxBuf = await docxRenderer.renderToBuffer(doc);
      const docxZip = await JSZip.loadAsync(docxBuf);
      const docXml = await docxZip.file("word/document.xml")!.async("string");

      // 18pt = 360 twips; -0.6pt = -12 twips
      expect(docXml).toContain('<w:spacing w:before="0" w:after="0" w:line="360" w:lineRule="exact"/>');
      expect(docXml).toContain('<w:spacing w:val="-12"/>');
      expect(docXml).toContain('<w:u w:val="single"/>');
      expect(docXml).toContain('<w:strike/>');
      expect(docXml).toContain('<w:contextualSpacing w:val="0"/>');
      expect(docXml).toContain('<w:autoSpaceDE w:val="0"/>');
      expect(docXml).toContain('<w:autoSpaceDN w:val="0"/>');
      expect(docXml).toContain('inset="12.00pt,8.00pt,12.00pt,8.00pt"');

      // Check HWPX XML output
      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
      const hwpxZip = await JSZip.loadAsync(hwpxBuf);
      const headerXml = await hwpxZip.file("Contents/header.xml")!.async("string");
      const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

      // HWPX custom paraPr with FIXED 1800 HWPUNIT lineSpacing
      expect(headerXml).toContain('<hh:lineSpacing type="FIXED" value="1800" unit="HWPUNIT"/>');
      // HWPX charPr with underline, strikeout, and -5% letter spacing (-0.6 / 12 = -5%)
      expect(headerXml).toContain('<hh:underline type="BOTTOM" shape="SOLID"');
      expect(headerXml).toContain('<hh:strikeout shape="CONTINUOUS"');
      expect(headerXml).toContain('hangul="-5" latin="-5"');
      // HWPX textMargin
      expect(secXml).toContain('<hp:textMargin left="1200" right="1200" top="800" bottom="800"/>');

      // Verify DOCX -> DocxCanvasParser roundtrip recovers typography
      const docxParser = new DocxCanvasParser();
      const rtDoc = await docxParser.parse(docxBuf);
      const rtElem = rtDoc.pages[0].elements[0];
      expect(rtElem.verticalAlign).toBe("center");
      expect(rtElem.innerPaddingPt).toEqual({ top: 8, right: 12, bottom: 8, left: 12 });
      expect(rtElem.textRuns![0].lineHeightPt).toBe(18);
      expect(rtElem.textRuns![0].letterSpacingPt).toBe(-0.6);
      expect(rtElem.textRuns![0].underline).toBe(true);
    });
  });

  // =========================================================================
  // B-3: Image Scale Modes (FILL, FIT, CROP with imageTransform)
  // =========================================================================
  describe("Mission B-3: Image Scale Modes (FILL, FIT, CROP)", () => {
    // 200x100 wide PNG header
    const widePngBase64 =
      "data:image/png;base64," +
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0xc8, // width = 200
        0x00, 0x00, 0x00, 0x64, // height = 100
        0x08, 0x02, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ]).toString("base64");

    it("should extract imageTransform CROP matrix and FIT scaleMode and render accurately in DOCX and HWPX", async () => {
      const figmaParser = new FigmaCanvasParser({
        imageMap: { img_wide: widePngBase64 },
      });

      const doc = figmaParser.parse({
        id: "0:0",
        name: "Image Modes Test",
        type: "DOCUMENT",
        children: [
          {
            id: "1:1",
            name: "Page 1",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 595.28, height: 841.89 },
            children: [
              {
                id: "1:2",
                name: "Cropped Image",
                type: "RECTANGLE",
                absoluteBoundingBox: { x: 50, y: 50, width: 100, height: 100 },
                fills: [
                  {
                    type: "IMAGE",
                    scaleMode: "CROP",
                    imageRef: "img_wide",
                    imageTransform: [
                      [0.5, 0, 0.25],
                      [0, 0.5, 0.1],
                    ],
                  },
                ],
              },
              {
                id: "1:3",
                name: "Fitted Image",
                type: "RECTANGLE",
                absoluteBoundingBox: { x: 200, y: 50, width: 100, height: 100 },
                fills: [
                  {
                    type: "IMAGE",
                    scaleMode: "FIT",
                    imageRef: "img_wide",
                  },
                ],
              },
            ],
          },
        ],
      } as any);

      const cropElem = doc.pages[0].elements[0];
      const fitElem = doc.pages[0].elements[1];

      expect(cropElem.imageScaleMode).toBe("CROP");
      expect(cropElem.imageCrop).toEqual({
        left: 0.25,
        right: 0.25,
        top: 0.1,
        bottom: 0.4,
      });
      expect(fitElem.imageScaleMode).toBe("FIT");

      // Render DOCX
      const docxRenderer = new DocxCanvasRenderer();
      const docxBuf = await docxRenderer.renderToBuffer(doc);
      const docxZip = await JSZip.loadAsync(docxBuf);
      const docXml = await docxZip.file("word/document.xml")!.async("string");

      // CROP in DOCX: left=0.25*65536=16384f, right=16384f, top=0.1*65536=6554f, bottom=0.4*65536=26214f
      expect(docXml).toContain('croptop="6554f" cropbottom="26214f" cropleft="16384f" cropright="16384f"');
      // FIT in DOCX: 200x100 image inside 100x100 box -> letterboxed to width:100.000pt;height:50.000pt at margin-top:75.000pt
      expect(docXml).toContain("margin-left:200.000pt;margin-top:75.000pt;width:100.000pt;height:50.000pt");

      // Render HWPX
      const hwpxRenderer = new HwpxCanvasRenderer();
      const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
      const hwpxZip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

      // dimW = 200 * 75 = 15000, dimH = 100 * 75 = 7500
      // CROP in HWPX: left = 15000 * 0.25 = 3750, right = 15000 * 0.75 = 11250, top = 7500 * 0.1 = 750, bottom = 7500 * 0.6 = 4500
      expect(secXml).toContain('<hp:imgClip left="3750" right="11250" top="750" bottom="4500"/>');
      // FIT in HWPX: unclipped (0..15000, 0..7500) with orgSz width="10000" height="5000" and vertOffset="7500"
      expect(secXml).toContain('<hp:imgClip left="0" right="15000" top="0" bottom="7500"/>');
      expect(secXml).toContain('<hp:orgSz width="10000" height="5000"/>');

      // DOCX -> DocxCanvasParser roundtrip recovers imageCrop
      const docxParser = new DocxCanvasParser();
      const rtDoc = await docxParser.parse(docxBuf);
      const rtCropElem = rtDoc.pages[0].elements[0];
      expect(rtCropElem.imageScaleMode).toBe("CROP");
      expect(rtCropElem.imageCrop?.left).toBeCloseTo(0.25, 2);
      expect(rtCropElem.imageCrop?.bottom).toBeCloseTo(0.4, 2);
    });
  });

  // =========================================================================
  // B-4: Donut Chart ELLIPSE arcData, Multi-Subpath VML & Rotated LINE
  // =========================================================================
  describe("Mission B-4: Donut Chart ELLIPSE arcData & Vector Geometry", () => {
    it("should convert Figma ELLIPSE with arcData into exact cubic Bezier donut sector vectors", async () => {
      const figmaParser = new FigmaCanvasParser();
      const doc = figmaParser.parse({
        id: "0:0",
        name: "Donut Chart Test",
        type: "DOCUMENT",
        children: [
          {
            id: "1:1",
            name: "Page 1",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 595.28, height: 841.89 },
            children: [
              {
                id: "7:275",
                name: "Donut Segment 1 (36%)",
                type: "ELLIPSE",
                absoluteBoundingBox: { x: 76.5, y: 423, width: 140, height: 140 },
                fills: [{ type: "SOLID", color: { r: 0.23, g: 0.51, b: 0.96 } }],
                arcData: {
                  startingAngle: -1.5707963705062866,
                  endingAngle: 0.691150426864624,
                  innerRadius: 0.6499999761581421,
                },
              },
              {
                id: "7:279",
                name: "Normal Full Circle",
                type: "ELLIPSE",
                absoluteBoundingBox: { x: 300, y: 423, width: 50, height: 50 },
                fills: [{ type: "SOLID", color: { r: 0.1, g: 0.8, b: 0.4 } }],
                arcData: {
                  startingAngle: 0,
                  endingAngle: 6.2831854820251465,
                  innerRadius: 0,
                },
              },
              {
                id: "7:280",
                name: "Rotated Vertical Divider",
                type: "LINE",
                absoluteBoundingBox: { x: 250, y: 100, width: 80, height: 0 },
                rotation: 90,
                strokes: [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }],
                strokeWeight: 1.5,
                strokeDashes: [4, 4],
              },
            ],
          },
        ],
      } as any);

      const donutSeg = doc.pages[0].elements[0];
      const fullOval = doc.pages[0].elements[1];
      const vertLine = doc.pages[0].elements[2];

      // Donut segment MUST be a vector with Bezier curve path, NOT an oval!
      expect(donutSeg.type).toBe("vector");
      expect(donutSeg.rawSvgPath).toContain("C");
      expect(donutSeg.rawSvgPath).toContain("Z");
      expect(donutSeg.vectorPath).toContain("m 500,0 c 694,0,870,112,952,287");

      // Full circle with innerRadius=0 and sweep=2*PI remains native oval
      expect(fullOval.type).toBe("oval");

      // Rotated 90-deg line becomes vertical (width=0, height=80) with dashed stroke
      expect(vertLine.type).toBe("line");
      expect(vertLine.bounds.width).toBe(0);
      expect(vertLine.bounds.height).toBeCloseTo(80, 1);
      expect(vertLine.style.strokeDashed).toBe(true);

      // Render DOCX & verify VML
      const docxRenderer = new DocxCanvasRenderer();
      const docxBuf = await docxRenderer.renderToBuffer(doc);
      const docxZip = await JSZip.loadAsync(docxBuf);
      const docXml = await docxZip.file("word/document.xml")!.async("string");

      expect(docXml).toContain('alt="7:275"');
      expect(docXml).toContain("m 500,0 c 694,0,870,112,952,287");
      expect(docXml).toContain('<v:stroke dashstyle="dash"/>');
      expect(docXml).toContain('from="250.000pt,100.000pt"');
      expect(docXml).toContain('to="250.000pt,180.000pt"');
    });

    it("should not emit premature 'e' path termination in multi-subpath VML vectors", () => {
      const parsed = SvgPath.parse("M 0 0 L 40 0 L 40 40 L 0 40 Z M 60 60 L 100 60 L 100 100 L 60 100 Z");
      const vml = parsed.toVmlPath(1000, 1000);

      // 'e' must appear ONLY once at the very end of the VML path string
      const eMatches = vml.match(/\be\b/g);
      expect(eMatches).toBeDefined();
      expect(eMatches!.length).toBe(1);
      expect(vml.endsWith("x e")).toBe(true);
      expect(vml).not.toContain("x e m");
    });

    it("should convert all 4 KPI Donut Chart segments in Customer Report1-Live-Snapshot.json Page 4 into vectors", () => {
      const report1Path = path.resolve(process.cwd(), "debug/customer/Report1-Live-Snapshot.json");
      if (!fs.existsSync(report1Path)) return;

      const raw = JSON.parse(fs.readFileSync(report1Path, "utf-8"));
      const parser = new FigmaCanvasParser();
      const doc = parser.parse(raw);

      expect(doc.pages.length).toBe(9);
      const page4 = doc.pages[3];
      const donutIds = ["7:275", "7:276", "7:277", "7:278"];
      for (const id of donutIds) {
        const seg = page4.elements.find((e) => e.id === id);
        expect(seg).toBeDefined();
        expect(seg!.type).toBe("vector");
        expect(seg!.vectorPath).toContain("c ");
      }
    });
  });

  // =========================================================================
  // Mission E-1 & E-3: Corrupt Input Error Handling & Mutation Sensitivity
  // =========================================================================
  describe("Mission E-1 & E-3: Corrupt Input Handling & Mutation Verification Sensitivity", () => {
    it("should throw clear descriptive errors for invalid/corrupt Figma JSON and DOCX inputs", async () => {
      const figmaParser = new FigmaCanvasParser();
      expect(() => figmaParser.parse(null as any)).toThrow(/Invalid Figma JSON input/);
      expect(() => figmaParser.parse({ foo: "bar" } as any)).toThrow(/Invalid Figma JSON structure/);

      const docxParser = new DocxCanvasParser();
      const emptyZip = new JSZip();
      emptyZip.file("hello.txt", "not a docx");
      const badBuf = await emptyZip.generateAsync({ type: "nodebuffer" });
      await expect(docxParser.parse(badBuf)).rejects.toThrow(/word\/document\.xml missing/);
    });

    it("should detect broken VML multi-subpath termination, closed-polygon open paths, and uncropped images", () => {
      // Validator functions used across our audit suite
      const isValidMultiSubpathVml = (vml: string) => {
        const eCount = (vml.match(/\be\b/g) || []).length;
        const mCount = (vml.match(/\bm\b/g) || []).length;
        return mCount >= 2 && eCount === 1 && !vml.includes("x e m");
      };

      const isValidOpenPathHwpx = (secXml: string) => {
        return secXml.includes("<hp:line") && !secXml.includes("<hp:polygon");
      };

      const isValidDonutArcElement = (elem: { type: string; vectorPath?: string }) => {
        return elem.type === "vector" && !!elem.vectorPath && elem.vectorPath.includes("c ");
      };

      // 1. Prove valid outputs pass
      const goodVml = SvgPath.parse("M 0 0 L 10 0 L 10 10 Z M 20 20 L 30 20 L 30 30 Z").toVmlPath(1000, 1000);
      expect(isValidMultiSubpathVml(goodVml)).toBe(true);

      // 2. Prove mutated/broken outputs ("x e m", <hp:polygon> on open path, <v:oval> on donut) FAIL
      const mutatedBrokenVml = goodVml.replace("x m", "x e m");
      expect(isValidMultiSubpathVml(mutatedBrokenVml)).toBe(false);

      const mutatedBrokenOpenPathHwpx = `<hs:sec><hp:p><hp:run><hp:polygon id="1_1"><hp:pt x="0" y="0"/></hp:polygon></hp:run></hp:p></hs:sec>`;
      expect(isValidOpenPathHwpx(mutatedBrokenOpenPathHwpx)).toBe(false);

      const mutatedBrokenDonutElem = { type: "oval" };
      expect(isValidDonutArcElement(mutatedBrokenDonutElem)).toBe(false);
    });

    it("should synthesize missing absoluteBoundingBox for Auto-Layout children and keep stacked section CANVAS frames on a single page", () => {
      const parser = new FigmaCanvasParser();

      // 1. Nested Auto-Layout without child absoluteBoundingBox
      const nestedAutoPath = path.resolve(process.cwd(), "samples/real-world/sample-b-nested-autolayout.json");
      const nestedDoc = parser.parse(JSON.parse(fs.readFileSync(nestedAutoPath, "utf-8")));
      expect(nestedDoc.pages.length).toBe(1);
      const nestedTexts = nestedDoc.pages[0].elements
        .filter((e) => e.type === "text")
        .map((e) => e.textRuns?.map((r) => r.text).join("") || "");
      expect(nestedTexts).toContain("주요 서비스 모듈 현황 (Nested Auto Layout)");
      expect(nestedTexts).toContain("보안 등급 1등급");
      expect(nestedTexts).toContain("데이터 격리 및 로컬 암호화");

      // 2. Stacked section CANVAS with top-level TEXT/LINE and Auto-Layout cards
      const cardGridPath = path.resolve(process.cwd(), "samples/real-world/sample-e2e-card-grid.json");
      const cardGridDoc = parser.parse(JSON.parse(fs.readFileSync(cardGridPath, "utf-8")));
      expect(cardGridDoc.pages.length).toBe(1);
      expect(cardGridDoc.pages[0].elements.length).toBeGreaterThanOrEqual(11);
      const cardTexts = cardGridDoc.pages[0].elements
        .filter((e) => e.type === "text")
        .map((e) => e.textRuns?.map((r) => r.text).join("") || "");
      expect(cardTexts).toContain("주요 서비스 및 제품 포트폴리오");
      expect(cardTexts).toContain("스타터 (Starter)");
    });
  });
});
