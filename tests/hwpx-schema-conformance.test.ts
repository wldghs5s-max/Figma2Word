import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 20: HWPX OWPML / KS X 6101 Schema Conformance & Recovery Suite", () => {
  it("strictly wraps hp:secPr inside hp:run charPrIDRef=0 and follows exact secPr child sequence", async () => {
    const doc: CanvasDocument = {
      title: "SecPr Structure Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "t1",
              type: "text",
              bounds: { x: 50, y: 50, width: 200, height: 30 },
              zIndex: 1,
              style: {},
              textRuns: [{ text: "섹션 구조 검증", fontSizePt: 12 }],
            },
          ],
        },
      ],
      resources: {},
      diagnostics: { notices: [], warnings: [] },
    };

    const renderer = new HwpxCanvasRenderer();
    const buf = await renderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const secXml = await zip.file("Contents/section0.xml")!.async("string");

    // 1. hp:secPr MUST be inside hp:run inside the first hp:p
    expect(secXml).toMatch(/<hp:p\b[^>]*>\s*<hp:run charPrIDRef="0">\s*<hp:secPr\b/);

    // 2. hp:ctrl with hp:colPr must follow hp:secPr inside the same run
    expect(secXml).toMatch(/<\/hp:secPr>\s*<hp:ctrl>\s*<hp:colPr\b/);

    // 3. Child sequence inside hp:secPr:
    // grid -> startNum -> visibility -> lineNumberShape -> pagePr -> footNotePr -> endNotePr -> pageBorderFill
    const gridIdx = secXml.indexOf("<hp:grid");
    const startNumIdx = secXml.indexOf("<hp:startNum");
    const visIdx = secXml.indexOf("<hp:visibility");
    const lineNumIdx = secXml.indexOf("<hp:lineNumberShape");
    const pagePrIdx = secXml.indexOf("<hp:pagePr");
    const footIdx = secXml.indexOf("<hp:footNotePr");
    const endIdx = secXml.indexOf("<hp:endNotePr");
    const borderFillIdx = secXml.indexOf("<hp:pageBorderFill");

    expect(gridIdx).toBeGreaterThan(0);
    expect(startNumIdx).toBeGreaterThan(gridIdx);
    expect(visIdx).toBeGreaterThan(startNumIdx);
    expect(lineNumIdx).toBeGreaterThan(visIdx);
    expect(pagePrIdx).toBeGreaterThan(lineNumIdx);
    expect(footIdx).toBeGreaterThan(pagePrIdx);
    expect(endIdx).toBeGreaterThan(footIdx);
    expect(borderFillIdx).toBeGreaterThan(endIdx);
  });

  it("strictly enforces child element order and unsignedInt ID for shapes", async () => {
    const doc: CanvasDocument = {
      title: "Shape Order Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "rect1",
              type: "card",
              bounds: { x: 20, y: 20, width: 200, height: 100 },
              zIndex: 1,
              style: { fillColor: "#EEEEEE", strokeColor: "#333333", strokeWidth: 1, cornerRadius: 8 },
              textRuns: [{ text: "도형 순서 검증", fontSizePt: 10 }],
            },
          ],
        },
      ],
      resources: {},
      diagnostics: { notices: [], warnings: [] },
    };

    const renderer = new HwpxCanvasRenderer();
    const buf = await renderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const secXml = await zip.file("Contents/section0.xml")!.async("string");

    // Shape ID and instid must be pure integers, NOT string paths like "1_1"
    const idMatch = secXml.match(/<hp:rect id="(\d+)"[^>]*instid="(\d+)"/);
    expect(idMatch).toBeDefined();
    expect(idMatch![1]).toBe(idMatch![2]);

    // Sequence inside hp:rect:
    // offset -> orgSz -> curSz -> flip -> rotationInfo -> renderingInfo -> lineShape -> fillBrush -> drawText -> shadow -> geometry (hc:pt0..3) -> sz -> pos -> outMargin
    const offsetIdx = secXml.indexOf("<hp:offset");
    const orgSzIdx = secXml.indexOf("<hp:orgSz");
    const curSzIdx = secXml.indexOf("<hp:curSz");
    const flipIdx = secXml.indexOf("<hp:flip");
    const rotIdx = secXml.indexOf("<hp:rotationInfo");
    const rendIdx = secXml.indexOf("<hp:renderingInfo");
    const lineShapeIdx = secXml.indexOf("<hp:lineShape");
    const fillBrushIdx = secXml.indexOf("<hc:fillBrush");
    const drawTextIdx = secXml.indexOf("<hp:drawText");
    const shadowIdx = secXml.indexOf("<hp:shadow");
    const pt0Idx = secXml.indexOf("<hc:pt0");
    const pt3Idx = secXml.indexOf("<hc:pt3");
    const szIdx = secXml.indexOf("<hp:sz");
    const posIdx = secXml.indexOf("<hp:pos");
    const outMarginIdx = secXml.indexOf("<hp:outMargin");

    expect(offsetIdx).toBeGreaterThan(0);
    expect(orgSzIdx).toBeGreaterThan(offsetIdx);
    expect(curSzIdx).toBeGreaterThan(orgSzIdx);
    expect(flipIdx).toBeGreaterThan(curSzIdx);
    expect(rotIdx).toBeGreaterThan(flipIdx);
    expect(rendIdx).toBeGreaterThan(rotIdx);
    expect(lineShapeIdx).toBeGreaterThan(rendIdx);
    expect(fillBrushIdx).toBeGreaterThan(lineShapeIdx);
    expect(drawTextIdx).toBeGreaterThan(fillBrushIdx);
    expect(shadowIdx).toBeGreaterThan(drawTextIdx);
    expect(pt0Idx).toBeGreaterThan(shadowIdx);
    expect(pt3Idx).toBeGreaterThan(pt0Idx);
    expect(szIdx).toBeGreaterThan(pt3Idx);
    expect(posIdx).toBeGreaterThan(szIdx);
    expect(outMarginIdx).toBeGreaterThan(posIdx);
  });

  it("renders dedicated geometry for hp:ellipse conforming to KS X 6101 ellipse specification", async () => {
    const doc: CanvasDocument = {
      title: "Oval Geometry Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "oval1",
              type: "oval",
              bounds: { x: 50, y: 50, width: 100, height: 80 },
              zIndex: 1,
              style: { fillColor: "#00AAEE", strokeColor: "#003366", strokeWidth: 2 },
            },
          ],
        },
      ],
      resources: {},
      diagnostics: { notices: [], warnings: [] },
    };

    const renderer = new HwpxCanvasRenderer();
    const buf = await renderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const secXml = await zip.file("Contents/section0.xml")!.async("string");

    // hp:ellipse tag and attributes (conforming to KS X 6101 and authentic Hancom corpus)
    expect(secXml).toContain("<hp:ellipse");
    expect(secXml).toContain('intervalDirty="0"');
    expect(secXml).toContain('hasArcPr="0"');
    expect(secXml).toContain('arcType="NORMAL"');

    // Dedicated oval geometry tags
    // W = 10000 HWPU, H = 8000 HWPU
    // center: (5000, 4000)
    // ax1: (10000, 4000)
    // ax2: (5000, 8000)
    // start1..end2: (10000, 4000)
    expect(secXml).toContain('<hc:center x="5000" y="4000"/>');
    expect(secXml).toContain('<hc:ax1 x="10000" y="4000"/>');
    expect(secXml).toContain('<hc:ax2 x="5000" y="8000"/>');
    expect(secXml).toContain('<hc:start1 x="10000" y="4000"/>');
    expect(secXml).toContain('<hc:end1 x="10000" y="4000"/>');
    expect(secXml).toContain('<hc:start2 x="10000" y="4000"/>');
    expect(secXml).toContain('<hc:end2 x="10000" y="4000"/>');

    // Must also contain shadow, sz, pos, outMargin in proper sequence
    const centerIdx = secXml.indexOf("<hc:center");
    const szIdx = secXml.indexOf("<hp:sz", centerIdx);
    const posIdx = secXml.indexOf("<hp:pos", szIdx);
    const outMarginIdx = secXml.indexOf("<hp:outMargin", posIdx);

    expect(centerIdx).toBeGreaterThan(0);
    expect(szIdx).toBeGreaterThan(centerIdx);
    expect(posIdx).toBeGreaterThan(szIdx);
    expect(outMarginIdx).toBeGreaterThan(posIdx);
  });

  it("renders hp:pic with nested imgRect points, imgClip, inMargin, and single binaryItemIDRef", async () => {
    const pngHeader = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x01, 0x00, // width: 256
      0x00, 0x00, 0x00, 0x80, // height: 128
      0x08, 0x02, 0x00, 0x00, 0x00,
    ]);

    const doc: CanvasDocument = {
      title: "Image Structure Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "img1",
              type: "image",
              bounds: { x: 10, y: 10, width: 200, height: 100 },
              zIndex: 1,
              style: {},
              imageRef: "res_photo",
            },
          ],
        },
      ],
      resources: {
        res_photo: {
          mimeType: "image/png",
          data: pngHeader,
        },
      },
      diagnostics: { notices: [], warnings: [] },
    };

    const renderer = new HwpxCanvasRenderer();
    const buf = await renderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const secXml = await zip.file("Contents/section0.xml")!.async("string");

    // 1. Tag attributes
    expect(secXml).toMatch(/<hp:pic id="\d+" zOrder="1" numberingType="PICTURE" [^>]*reverse="0">/);

    // 2. imgRect with nested hc:pt0..3
    expect(secXml).toContain("<hp:imgRect>");
    expect(secXml).toMatch(/<hp:imgRect>\s*<hc:pt0 x="0" y="0"\/>\s*<hc:pt1\b/);

    // 3. Spurious inImgDim and binRef must NOT exist
    expect(secXml).not.toContain("<hp:inImgDim");
    expect(secXml).not.toContain('binRef=');

    // 4. Proper tags: imgClip, inMargin, imgDim, hc:img, effects, shadow, sz, pos, outMargin
    expect(secXml).toContain("<hp:imgClip");
    expect(secXml).toContain('<hp:inMargin left="0" right="0" top="0" bottom="0"/>');
    expect(secXml).toContain("<hp:imgDim");
    expect(secXml).toContain('<hc:img binaryItemIDRef="BIN0001" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>');
    expect(secXml).toContain("<hp:effects/>");
    expect(secXml).toContain("<hp:shadow");
    expect(secXml).toContain("<hp:sz");
    expect(secXml).toContain("<hp:pos");
    expect(secXml).toContain("<hp:outMargin");
  });

  it("renders uppercase fontface lang codes in Contents/header.xml", async () => {
    const doc: CanvasDocument = {
      title: "Header Lang Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [],
        },
      ],
      resources: {},
      diagnostics: { notices: [], warnings: [] },
    };

    const renderer = new HwpxCanvasRenderer();
    const buf = await renderer.renderToBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const headerXml = await zip.file("Contents/header.xml")!.async("string");

    expect(headerXml).toContain('lang="HANGUL"');
    expect(headerXml).toContain('lang="LATIN"');
    expect(headerXml).toContain('lang="HANJA"');
    expect(headerXml).toContain('lang="JAPANESE"');
    expect(headerXml).toContain('lang="OTHER"');
    expect(headerXml).toContain('lang="SYMBOL"');
    expect(headerXml).toContain('lang="USER"');

    // Ensure lowercase was completely eliminated
    expect(headerXml).not.toContain('lang="hangul"');
    expect(headerXml).not.toContain('lang="latin"');
  });
});

