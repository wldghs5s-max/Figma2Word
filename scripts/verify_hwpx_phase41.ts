import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";
import JSZip from "jszip";

async function main() {
  console.log("============================================================");
  console.log("Phase 41: HWPX Engine Vertical Slice & Validation Runner");
  console.log("============================================================");

  const outDir = path.resolve(process.cwd(), "debug/hwpx-phase41");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const hwpxRenderer = new HwpxCanvasRenderer();

  // 1. Synthetic Vertical Slice
  console.log("\n[1/4] Building Synthetic Vertical Slice HWPX...");
  const samplePngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  const syntheticDoc: CanvasDocument = {
    version: "1.0",
    title: "Phase 41 Synthetic HWPX Vertical Slice",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 36, right: 36, bottom: 36, left: 36 },
    pages: [
      {
        pageNumber: 1,
        id: "p1",
        name: "Page 1",
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        elements: [
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

  const synBuf = await hwpxRenderer.renderToBuffer(syntheticDoc);
  const synPath = path.join(outDir, "phase41-synthetic-vertical-slice.hwpx");
  fs.writeFileSync(synPath, synBuf);
  console.log(`  -> Generated: ${synPath} (${synBuf.length} bytes)`);

  // 2. Real Customer Frame (759:844)
  console.log("\n[2/4] Parsing Customer Figma Frame (759:844, 로그인 화면)...");
  const jsonPath = path.resolve(process.cwd(), "펜테크 3차 디자인.json");
  let customerFramePath = "";
  if (fs.existsSync(jsonPath)) {
    const rawCustomer = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const singleFrameParser = new FigmaCanvasParser({
      selectedFrameIds: new Set(["759:844"]),
      imageMap: rawCustomer.imageMap,
      scalePolicy: "fit-a4",
      titleOverride: "Page 1 - Login Screen",
    });
    const customerFrameDoc = singleFrameParser.parse(rawCustomer);
    console.log(`  -> Canvas IR: ${customerFrameDoc.pages.length} page, ${customerFrameDoc.pages[0]?.elements.length} elements`);

    const custBuf = await hwpxRenderer.renderToBuffer(customerFrameDoc);
    customerFramePath = path.join(outDir, "phase41-customer-frame-759-844.hwpx");
    fs.writeFileSync(customerFramePath, custBuf);
    console.log(`  -> Generated: ${customerFramePath} (${custBuf.length} bytes)`);
  }

  // 3. Package Validation
  console.log("\n[3/4] Validating HWPX ZIP Packages & OWPML XML...");
  for (const filePath of [synPath, customerFramePath].filter(Boolean)) {
    const buf = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buf);
    const files = Object.keys(zip.files);

    const hasMime = files[0] === "mimetype";
    const hasSec = zip.file("Contents/section0.xml") !== null;
    const hasHead = zip.file("Contents/header.xml") !== null;
    const hasMan = zip.file("META-INF/manifest.xml") !== null;
    const hasCont = zip.file("META-INF/container.xml") !== null;

    console.log(`  -> [${path.basename(filePath)}] mimetypeFirst=${hasMime}, section0=${hasSec}, header=${hasHead}, manifest=${hasMan}, container=${hasCont}`);
  }

  // 4. Native HwpViewer.exe Execution
  console.log("\n[4/4] Testing in Hancom Office 2024 Viewer (HwpViewer.exe)...");
  try {
    const pyCmd = `python -c "import sys; sys.path.append('scripts'); from test_viewer_suite import test_hwpx_file; print('SYNTHETIC:', test_hwpx_file(r'${synPath}')); print('CUSTOMER:', test_hwpx_file(r'${customerFramePath}'))"`;
    const out = execSync(pyCmd, { encoding: "utf-8", timeout: 30000 });
    console.log(out.trim());
  } catch (err: any) {
    console.warn("  Viewer check notice:", err.message);
  }

  console.log("\n============================================================");
  console.log("Phase 41 Track B Vertical Slice Complete!");
  console.log("============================================================");
}

main().catch(console.error);
