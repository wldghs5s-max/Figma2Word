import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 41 Track B: HWPX Vertical Slice Engine", () => {
  const hwpxRenderer = new HwpxCanvasRenderer();
  const outDir = path.resolve(process.cwd(), "debug/hwpx-phase41");

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Authentic 1x1 PNG bytes
  const samplePngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  it("Step 1 & 2: Generates valid HWPX package from synthetic fixture and validates full OWPML package", async () => {
    const syntheticDoc: CanvasDocument = {
      version: "1.0",
      title: "Phase 41 Synthetic HWPX Fixture",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 36, right: 36, bottom: 36, left: 36 },
      pages: [
        {
          pageNumber: 1,
          id: "p1",
          name: "Page 1",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            // 1. Korean Title
            {
              id: "elem_title",
              name: "Document Title",
              type: "text",
              bounds: { x: 50, y: 50, width: 495, height: 40 },
              zIndex: 1,
              style: {},
              paragraphAlign: "center",
              textRuns: [
                {
                  text: "Figma2Word Phase 41 HWPX 합성 검증 문서",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 20,
                  fontWeight: 700,
                  color: "#1A365D",
                },
              ],
            },
            // 2. Korean Body Paragraph 1
            {
              id: "elem_body1",
              name: "Body Paragraph 1",
              type: "text",
              bounds: { x: 50, y: 110, width: 495, height: 50 },
              zIndex: 2,
              style: {},
              textRuns: [
                {
                  text: "본 문서는 Canvas IR에서 HWPX(OWPML) 문서로 변환된 첫 번째 실제 생성 결과물입니다. 글자 크기, 색상, 글꼴, 단락 정렬을 모두 지원합니다.",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 11,
                  fontWeight: 400,
                  color: "#2D3748",
                },
              ],
            },
            // 3. Korean Body Paragraph 2
            {
              id: "elem_body2",
              name: "Body Paragraph 2",
              type: "text",
              bounds: { x: 50, y: 170, width: 495, height: 50 },
              zIndex: 3,
              style: {},
              textRuns: [
                {
                  text: "두 번째 본문 단락입니다. 편집 가능한 텍스트 런으로 유지되며 한컴오피스 한글 뷰어 및 편집기에서 온전히 표시되고 수정될 수 있습니다.",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 11,
                  fontWeight: 400,
                  color: "#4A5568",
                },
              ],
            },
            // 4. Rectangle with corner radius and fill
            {
              id: "elem_rect",
              name: "Feature Box",
              type: "card",
              bounds: { x: 50, y: 240, width: 200, height: 100 },
              zIndex: 4,
              style: {
                fillColor: "#EBF8FF",
                strokeColor: "#3182CE",
                strokeWidth: 2,
                cornerRadius: 8,
              },
              textRuns: [
                {
                  text: "사각 카드 컴포넌트",
                  fontSizePt: 12,
                  fontWeight: 600,
                  color: "#2B6CB0",
                },
              ],
            },
            // 5. Line divider
            {
              id: "elem_line",
              name: "Divider Line",
              type: "line",
              bounds: { x: 50, y: 360, width: 495, height: 2 },
              zIndex: 5,
              style: {
                strokeColor: "#CBD5E0",
                strokeWidth: 1.5,
              },
            },
            // 6. Ellipse / Oval
            {
              id: "elem_ellipse",
              name: "Status Oval",
              type: "oval",
              bounds: { x: 300, y: 240, width: 100, height: 100 },
              zIndex: 6,
              style: {
                fillColor: "#FEFCBF",
                strokeColor: "#D69E2E",
                strokeWidth: 2,
              },
              textRuns: [
                {
                  text: "타원 도형",
                  fontSizePt: 11,
                  fontWeight: 600,
                  color: "#744210",
                },
              ],
            },
            // 7. Image
            {
              id: "elem_image",
              name: "Sample Image",
              type: "image",
              bounds: { x: 50, y: 380, width: 160, height: 120 },
              zIndex: 7,
              imageRef: "res_sample_png",
              style: {
                strokeColor: "#E2E8F0",
                strokeWidth: 1,
              },
            },
          ],
        },
      ],
      resources: {
        res_sample_png: {
          id: "res_sample_png",
          mimeType: "image/png",
          data: samplePngBytes,
        },
      },
    };

    const hwpxBuf = await hwpxRenderer.renderToBuffer(syntheticDoc);
    const hwpxPath = path.join(outDir, "phase41-synthetic-vertical-slice.hwpx");
    fs.writeFileSync(hwpxPath, hwpxBuf);

    expect(fs.existsSync(hwpxPath)).toBe(true);
    expect(hwpxBuf.length).toBeGreaterThan(1000);

    // Package Validation via JSZip
    const zip = await JSZip.loadAsync(hwpxBuf);

    // 1. mimetype must be the first entry, STORED uncompressed, exactly 19 bytes
    const files = Object.keys(zip.files);
    expect(files[0]).toBe("mimetype");
    const mimeContent = await zip.file("mimetype")!.async("string");
    expect(mimeContent).toBe("application/hwp+zip");

    // 2. Required XML files must exist
    const requiredFiles = [
      "version.xml",
      "settings.xml",
      "META-INF/container.xml",
      "META-INF/manifest.xml",
      "Contents/content.hpf",
      "Contents/header.xml",
      "Contents/section0.xml",
    ];
    for (const req of requiredFiles) {
      expect(zip.file(req)).toBeDefined();
    }

    // 3. Image file must be packaged in BinData/
    const binFile = zip.file("BinData/BIN0001.png");
    expect(binFile).toBeDefined();
    const binBytes = await binFile!.async("uint8array");
    expect(binBytes.length).toBe(samplePngBytes.length);

    // 4. Korean text preservation in Contents/section0.xml
    const secXml = await zip.file("Contents/section0.xml")!.async("string");
    expect(secXml).toContain("Figma2Word Phase 41 HWPX 합성 검증 문서");
    expect(secXml).toContain("본 문서는 Canvas IR에서 HWPX(OWPML) 문서로 변환된 첫 번째 실제 생성 결과물입니다.");
    expect(secXml).toContain("두 번째 본문 단락입니다.");
    expect(secXml).toContain("사각 카드 컴포넌트");
    expect(secXml).toContain("타원 도형");

    // 5. Native shape XML elements
    expect(secXml).toContain("<hp:rect");
    expect(secXml).toContain("<hp:ellipse");
    expect(secXml).toContain("<hp:pic");
    expect(secXml).toContain("BIN0001");

    // 6. Header XML contains fontface and registered char/para properties
    const headerXml = await zip.file("Contents/header.xml")!.async("string");
    expect(headerXml).toContain("맑은 고딕");
    expect(headerXml).toContain("<hh:charPr");
    expect(headerXml).toContain("<hh:paraPr");
  });

  it("Step 4: Converts a real Figma Canvas Frame into an authentic HWPX document", async () => {
    // Select sample Figma design document
    const figmaDocPath = "samples/synthetic-figma/single-page-brief.json";
    expect(fs.existsSync(figmaDocPath)).toBe(true);

    const rawJson = JSON.parse(fs.readFileSync(figmaDocPath, "utf-8"));
    const parser = new FigmaCanvasParser({ titleOverride: "Phase 41 Real Figma Frame" });
    const canvasDoc = parser.parse(rawJson);

    expect(canvasDoc.pages.length).toBeGreaterThanOrEqual(1);
    const firstPage = canvasDoc.pages[0];
    expect(firstPage.elements.length).toBeGreaterThan(0);

    const hwpxBuf = await hwpxRenderer.renderToBuffer(canvasDoc);
    const realHwpxPath = path.join(outDir, "phase41-real-figma-frame.hwpx");
    fs.writeFileSync(realHwpxPath, hwpxBuf);

    expect(fs.existsSync(realHwpxPath)).toBe(true);
    expect(hwpxBuf.length).toBeGreaterThan(1000);

    // Verify generated HWPX package integrity
    const zip = await JSZip.loadAsync(hwpxBuf);
    expect(zip.file("mimetype")).toBeDefined();
    expect(zip.file("Contents/section0.xml")).toBeDefined();
    expect(zip.file("Contents/header.xml")).toBeDefined();

    const secXml = await zip.file("Contents/section0.xml")!.async("string");
    expect(secXml).toContain("<hp:p");
    expect(secXml).toContain("<hp:run");
  });
});
