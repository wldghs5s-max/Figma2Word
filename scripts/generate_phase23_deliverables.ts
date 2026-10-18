import fs from "fs";
import path from "path";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument } from "../src/canvas/types.js";

async function main() {
  const hwpxOutDir = path.resolve(process.cwd(), "debug/hwpx-phase23");
  const crossOutDir = path.resolve(process.cwd(), "debug/cross-format-phase23");
  const recoveryDir = path.resolve(process.cwd(), "debug/hwpx-recovery");

  for (const d of [hwpxOutDir, crossOutDir, recoveryDir]) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  }

  const hwpxRenderer = new HwpxCanvasRenderer();
  const docxRenderer = new DocxCanvasRenderer();

  console.log("Generating Phase 23 HWPX Deliverables in debug/hwpx-phase23/...");

  const samplePng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  const baseDoc: CanvasDocument = {
    title: "Phase 23 Base",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [{
      pageNumber: 1,
      bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
      backgroundColor: "#FFFFFF",
      elements: []
    }],
    resources: {},
    diagnostics: { notices: [], warnings: [] }
  };

  // Helper to save both HWPX and DOCX for cross-format validation
  const saveDeliverable = async (name: string, doc: CanvasDocument) => {
    const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
    fs.writeFileSync(path.join(hwpxOutDir, `${name}.hwpx`), hwpxBuf);

    try {
      const docxBuf = await docxRenderer.renderToBuffer(doc);
      fs.writeFileSync(path.join(crossOutDir, `${name}.docx`), docxBuf);
    } catch (e) {
      console.warn(`DOCX render notice for ${name}:`, e);
    }
  };

  // 1. Baseline Suite
  const baseText: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  baseText.title = "Baseline — Text";
  baseText.pages[0].elements = [
    {
      id: "b_t1",
      type: "text",
      bounds: { x: 50, y: 50, width: 495, height: 40 },
      zIndex: 1,
      style: {},
      textRuns: [{ text: "기준 텍스트 검증 (Phase 23 Baseline Text)", fontSizePt: 16, fontWeight: 700, color: "#111827" }]
    }
  ];
  await saveDeliverable("baseline-text", baseText);

  const baseImage: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  baseImage.title = "Baseline — Image";
  baseImage.resources = { res1: { mimeType: "image/png", data: samplePng } };
  baseImage.pages[0].elements = [
    {
      id: "b_img1",
      type: "image",
      bounds: { x: 50, y: 50, width: 100, height: 100 },
      zIndex: 1,
      style: {},
      imageRef: "res1"
    }
  ];
  await saveDeliverable("baseline-image", baseImage);

  const baseRect: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  baseRect.title = "Baseline — Rounded Rect";
  baseRect.pages[0].elements = [
    {
      id: "b_r1",
      type: "card",
      bounds: { x: 50, y: 50, width: 200, height: 100 },
      zIndex: 1,
      style: { fillColor: "#EFF6FF", strokeColor: "#3B82F6", strokeWidth: 1, cornerRadius: 8 },
      textRuns: [{ text: "기준 라운드 사각형", fontSizePt: 12, color: "#1E40AF" }]
    }
  ];
  await saveDeliverable("baseline-rounded-rect", baseRect);

  // 2. Line Comparison Suite
  const isoHDiv: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  isoHDiv.title = "ISO — Horizontal Divider";
  isoHDiv.pages[0].elements = [
    {
      id: "l_h1",
      type: "line",
      bounds: { x: 50, y: 100, width: 495, height: 1 },
      zIndex: 1,
      style: { strokeColor: "#336699", strokeWidth: 1.5 }
    }
  ];
  await saveDeliverable("iso-horizontal-divider", isoHDiv);

  const isoVDiv: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  isoVDiv.title = "ISO — Vertical Divider";
  isoVDiv.pages[0].elements = [
    {
      id: "l_v1",
      type: "line",
      bounds: { x: 100, y: 50, width: 1, height: 300 },
      zIndex: 1,
      style: { strokeColor: "#336699", strokeWidth: 1.5 }
    }
  ];
  await saveDeliverable("iso-vertical-divider", isoVDiv);

  // 3. Stage 1~7 Deliverables
  // Stage 1
  const stage1Doc: CanvasDocument = {
    title: "Stage 1 — Korean Text",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [{
      pageNumber: 1,
      bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
      backgroundColor: "#FFFFFF",
      elements: [
        { id: "s1_h1", type: "text", bounds: { x: 50, y: 50, width: 495, height: 40 }, zIndex: 1, style: {}, textRuns: [{ text: "한글 문서 표준 OWPML 렌더링 검증 (Phase 23)", fontSizePt: 20, fontWeight: 700, color: "#111827" }] },
        { id: "s1_p1", type: "text", bounds: { x: 50, y: 110, width: 495, height: 60 }, zIndex: 2, style: {}, textRuns: [{ text: "본 문서는 Figma2Word Phase 23 엔진에 의해 생성된 정규 HWPX 파일입니다. 투명 텍스트 박스의 테두리 잔상 제거 및 텍스트 겹침 방지 처리가 적용되었습니다.", fontSizePt: 11, color: "#374151" }] }
      ]
    }],
    resources: {},
    diagnostics: { notices: [], warnings: [] }
  };
  await saveDeliverable("stage1-korean-text", stage1Doc);

  // Stage 2
  const stage2Doc: CanvasDocument = {
    title: "Stage 2 — Typography",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [{
      pageNumber: 1,
      bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
      backgroundColor: "#FFFFFF",
      elements: [
        { id: "s2_t1", type: "text", bounds: { x: 50, y: 50, width: 495, height: 35 }, zIndex: 1, style: {}, textRuns: [{ text: "타이포그래피 및 서식 검증", fontSizePt: 18, fontWeight: 800, color: "#1E3A8A" }] },
        { id: "s2_t2", type: "text", bounds: { x: 50, y: 100, width: 495, height: 80 }, zIndex: 2, style: {}, textRuns: [
          { text: "굵은 글씨 (Bold)\n", fontSizePt: 11, fontWeight: 700, color: "#111827" },
          { text: "기울임 (Italic)\n", fontSizePt: 11, italic: true, color: "#3B82F6" },
          { text: "밑줄 (Underline)\n", fontSizePt: 11, underline: true, color: "#10B981" },
          { text: "자간 조정 (+10%)\n", fontSizePt: 11, letterSpacingPt: 1.1, color: "#6366F1" }
        ]}
      ]
    }],
    resources: {},
    diagnostics: { notices: [], warnings: [] }
  };
  await saveDeliverable("stage2-typography", stage2Doc);

  // Stage 3
  const stage3Doc: CanvasDocument = {
    title: "Stage 3 — Rectangles & Lines",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [{
      pageNumber: 1,
      bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
      backgroundColor: "#FFFFFF",
      elements: [
        { id: "s3_title", type: "text", bounds: { x: 50, y: 40, width: 495, height: 30 }, zIndex: 1, style: {}, textRuns: [{ text: "도형 및 구분선 검증 (Stage 3)", fontSizePt: 16, fontWeight: 700 }] },
        { id: "s3_line1", type: "line", bounds: { x: 50, y: 80, width: 495, height: 2 }, zIndex: 2, style: { strokeColor: "#CBD5E1", strokeWidth: 1 } },
        { id: "s3_line2", type: "line", bounds: { x: 50, y: 100, width: 495, height: 2 }, zIndex: 3, style: { strokeColor: "#3B82F6", strokeWidth: 2, strokeDashed: true } },
        { id: "s3_card1", type: "card", bounds: { x: 50, y: 130, width: 230, height: 120 }, zIndex: 4, style: { fillColor: "#EFF6FF", strokeColor: "#3B82F6", strokeWidth: 1, cornerRadius: 8 }, textRuns: [{ text: "정보 카드\n둥근 모서리 반경: 8pt\n배경색: #EFF6FF\n테두리: 1pt 솔리드", fontSizePt: 10, color: "#1E3A8A" }] },
        { id: "s3_pill", type: "card", bounds: { x: 310, y: 130, width: 120, height: 32 }, zIndex: 5, style: { fillColor: "#DCFCE7", strokeColor: "#16A34A", strokeWidth: 1, cornerRadius: 16 }, textRuns: [{ text: "승인 완료", fontSizePt: 10, fontWeight: 600, color: "#15803D" }] }
      ]
    }],
    resources: {},
    diagnostics: { notices: [], warnings: [] }
  };
  await saveDeliverable("stage3-rect-line", stage3Doc);

  // Stage 4
  const stage4Doc: CanvasDocument = {
    title: "Stage 4 — Textbox, Oval & Vector",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [{
      pageNumber: 1,
      bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
      backgroundColor: "#FFFFFF",
      elements: [
        { id: "s4_title", type: "text", bounds: { x: 50, y: 40, width: 495, height: 30 }, zIndex: 1, style: {}, textRuns: [{ text: "텍스트박스, 타원 및 벡터 도형 (Stage 4)", fontSizePt: 16, fontWeight: 700 }] },
        { id: "s4_tb", type: "card", bounds: { x: 50, y: 90, width: 220, height: 100 }, zIndex: 2, style: { fillColor: "#FEF3C7", strokeColor: "#D97706", strokeWidth: 1, cornerRadius: 4 }, innerPaddingPt: { top: 10, right: 15, bottom: 10, left: 15 }, textRuns: [{ text: "패딩이 적용된 텍스트박스\n상하 10pt / 좌우 15pt", fontSizePt: 11, color: "#92400E" }] },
        { id: "s4_oval", type: "oval", bounds: { x: 300, y: 90, width: 100, height: 100 }, zIndex: 3, style: { fillColor: "#3B82F6", strokeColor: "#1D4ED8", strokeWidth: 2 } },
        { id: "s4_poly", type: "vector", bounds: { x: 50, y: 220, width: 120, height: 100 }, zIndex: 4, style: { fillColor: "#EC4899", strokeColor: "#BE185D", strokeWidth: 2 }, rawSvgPath: "M 60 0 L 120 100 L 0 100 Z" }
      ]
    }],
    resources: {},
    diagnostics: { notices: [], warnings: [] }
  };
  await saveDeliverable("stage4-textbox-oval-vector", stage4Doc);

  // Stage 5
  const stage5Doc: CanvasDocument = {
    title: "Stage 5 — Images",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [{
      pageNumber: 1,
      bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
      backgroundColor: "#FFFFFF",
      elements: [
        { id: "s5_title", type: "text", bounds: { x: 50, y: 40, width: 495, height: 30 }, zIndex: 1, style: {}, textRuns: [{ text: "이미지 리소스 검증 (Stage 5)", fontSizePt: 16, fontWeight: 700 }] },
        { id: "s5_img", type: "image", bounds: { x: 50, y: 90, width: 150, height: 100 }, zIndex: 2, style: {}, imageRef: "res1" }
      ]
    }],
    resources: { res1: { mimeType: "image/png", data: samplePng } },
    diagnostics: { notices: [], warnings: [] }
  };
  await saveDeliverable("stage5-images", stage5Doc);

  // Stage 6: Representative Proposal Report
  const proposalPath = path.resolve(process.cwd(), "samples/real-world/sample-a-proposal-doc.json");
  if (fs.existsSync(proposalPath)) {
    const rawProposal = JSON.parse(fs.readFileSync(proposalPath, "utf-8"));
    const parser = new FigmaCanvasParser({ titleOverride: "Stage 6 — Representative Report" });
    const s6Doc = parser.parse(rawProposal);
    await saveDeliverable("stage6-representative-report", s6Doc);
  }

  // Stage 7: Full Customer Report (9 pages)
  const customerReportPath = path.resolve(process.cwd(), "debug/customer/Report1-Live-Snapshot.json");
  if (fs.existsSync(customerReportPath)) {
    const rawCustomer = JSON.parse(fs.readFileSync(customerReportPath, "utf-8"));
    const parser = new FigmaCanvasParser({ titleOverride: "Stage 7 — Customer Full Report" });
    const s7Doc = parser.parse(rawCustomer);
    await saveDeliverable("stage7-full-report", s7Doc);
  }

  // Update debug/hwpx-recovery with Phase 23 builds
  for (const f of [
    "stage1-korean-text.hwpx",
    "stage2-typography.hwpx",
    "stage3-rect-line.hwpx",
    "stage4-textbox-oval-vector.hwpx",
    "stage5-images.hwpx",
    "stage6-representative-report.hwpx",
    "stage7-full-report.hwpx",
  ]) {
    const src = path.join(hwpxOutDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(recoveryDir, f));
    }
  }

  console.log("Phase 23 deliverables and Cross-Format outputs successfully generated!");
}

main().catch((err) => {
  console.error("Error generating Phase 23 deliverables:", err);
  process.exit(1);
});
