import fs from "fs";
import path from "path";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument } from "../src/canvas/types.js";

async function main() {
  const outDir = path.resolve(process.cwd(), "debug/hwpx-phase22");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const renderer = new HwpxCanvasRenderer();

  console.log("Generating Phase 22 HWPX Deliverables & Isolated Suites in debug/hwpx-phase22/...");

  // Sample PNG 1x1 base64
  const samplePng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  const baseDoc: CanvasDocument = {
    title: "Phase 22 Base",
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

  // =========================================================================
  // 1. Baseline Suite (Known Working Components)
  // =========================================================================

  // baseline-text.hwpx
  const baseText: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  baseText.title = "Baseline — Text";
  baseText.pages[0].elements = [
    {
      id: "b_t1",
      type: "text",
      bounds: { x: 50, y: 50, width: 495, height: 40 },
      zIndex: 1,
      style: {},
      textRuns: [{ text: "기준 텍스트 검증 (Baseline Text)", fontSizePt: 16, fontWeight: 700, color: "#111827" }]
    }
  ];
  fs.writeFileSync(path.join(outDir, "baseline-text.hwpx"), await renderer.renderToBuffer(baseText));

  // baseline-image.hwpx
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
  fs.writeFileSync(path.join(outDir, "baseline-image.hwpx"), await renderer.renderToBuffer(baseImage));

  // baseline-rounded-rect.hwpx
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
  fs.writeFileSync(path.join(outDir, "baseline-rounded-rect.hwpx"), await renderer.renderToBuffer(baseRect));

  // =========================================================================
  // 2. Line Comparison Suite
  // =========================================================================

  // iso-horizontal-divider.hwpx (Canonical thin filled rect)
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
  fs.writeFileSync(path.join(outDir, "iso-horizontal-divider.hwpx"), await renderer.renderToBuffer(isoHDiv));

  // iso-vertical-divider.hwpx (Canonical thin filled rect)
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
  fs.writeFileSync(path.join(outDir, "iso-vertical-divider.hwpx"), await renderer.renderToBuffer(isoVDiv));

  // iso-line-as-rect.hwpx (Direct thin card)
  const isoLineAsRect: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  isoLineAsRect.title = "ISO — Line as Rect";
  isoLineAsRect.pages[0].elements = [
    {
      id: "l_r1",
      type: "card",
      bounds: { x: 50, y: 100, width: 495, height: 1.5 },
      zIndex: 1,
      style: { fillColor: "#2563EB" }
    }
  ];
  fs.writeFileSync(path.join(outDir, "iso-line-as-rect.hwpx"), await renderer.renderToBuffer(isoLineAsRect));

  // iso-line-native.hwpx (Native hp:line dashed)
  const isoLineNative: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  isoLineNative.title = "ISO — Line Native";
  isoLineNative.pages[0].elements = [
    {
      id: "l_nat1",
      type: "line",
      bounds: { x: 50, y: 100, width: 495, height: 2 },
      zIndex: 1,
      style: { strokeColor: "#EF4444", strokeWidth: 2, strokeDashed: true }
    }
  ];
  fs.writeFileSync(path.join(outDir, "iso-line-native.hwpx"), await renderer.renderToBuffer(isoLineNative));

  // iso-diagonal-line.hwpx (Native hp:line diagonal)
  const isoDiagLine: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  isoDiagLine.title = "ISO — Diagonal Line";
  isoDiagLine.pages[0].elements = [
    {
      id: "l_diag",
      type: "vector",
      bounds: { x: 50, y: 50, width: 200, height: 200 },
      zIndex: 1,
      style: { strokeColor: "#10B981", strokeWidth: 2 },
      rawSvgPath: "M 0 0 L 200 200"
    }
  ];
  fs.writeFileSync(path.join(outDir, "iso-diagonal-line.hwpx"), await renderer.renderToBuffer(isoDiagLine));

  // =========================================================================
  // 3. Shape Comparison Suite
  // =========================================================================

  // iso-ellipse.hwpx
  const isoEllipse: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  isoEllipse.title = "ISO — Ellipse";
  isoEllipse.pages[0].elements = [
    {
      id: "s_el1",
      type: "oval",
      bounds: { x: 50, y: 50, width: 120, height: 80 },
      zIndex: 1,
      style: { fillColor: "#FDF2F8", strokeColor: "#DB2777", strokeWidth: 1.5 }
    }
  ];
  fs.writeFileSync(path.join(outDir, "iso-ellipse.hwpx"), await renderer.renderToBuffer(isoEllipse));

  // iso-polygon-closed.hwpx
  const isoPolyClosed: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  isoPolyClosed.title = "ISO — Polygon Closed";
  isoPolyClosed.pages[0].elements = [
    {
      id: "s_poly1",
      type: "vector",
      bounds: { x: 50, y: 50, width: 150, height: 150 },
      zIndex: 1,
      style: { fillColor: "#FEF3C7", strokeColor: "#D97706", strokeWidth: 2 },
      rawSvgPath: "M 75 0 L 150 150 L 0 150 Z"
    }
  ];
  fs.writeFileSync(path.join(outDir, "iso-polygon-closed.hwpx"), await renderer.renderToBuffer(isoPolyClosed));

  // iso-vector-open.hwpx
  const isoVectorOpen: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  isoVectorOpen.title = "ISO — Vector Open";
  isoVectorOpen.pages[0].elements = [
    {
      id: "s_vopen",
      type: "vector",
      bounds: { x: 50, y: 50, width: 200, height: 100 },
      zIndex: 1,
      style: { strokeColor: "#6366F1", strokeWidth: 2 },
      rawSvgPath: "M 0 50 L 100 0 L 200 100"
    }
  ];
  fs.writeFileSync(path.join(outDir, "iso-vector-open.hwpx"), await renderer.renderToBuffer(isoVectorOpen));

  // iso-textbox.hwpx
  const isoTextbox: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  isoTextbox.title = "ISO — Textbox with Margins";
  isoTextbox.pages[0].elements = [
    {
      id: "s_tb",
      type: "card",
      bounds: { x: 50, y: 50, width: 250, height: 120 },
      zIndex: 1,
      style: { fillColor: "#F1F5F9", strokeColor: "#64748B", strokeWidth: 1, cornerRadius: 4 },
      innerPaddingPt: { top: 12, right: 16, bottom: 12, left: 16 },
      verticalAlign: "center",
      textRuns: [
        { text: "패딩 및 수직 중앙 정렬\n", fontSizePt: 12, fontWeight: 700, color: "#0F172A" },
        { text: "상하 12pt, 좌우 16pt 여백", fontSizePt: 10, color: "#475569" }
      ]
    }
  ];
  fs.writeFileSync(path.join(outDir, "iso-textbox.hwpx"), await renderer.renderToBuffer(isoTextbox));

  // iso-rounded-rect-with-text.hwpx (Pill badge and card)
  const isoRoundedWithText: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  isoRoundedWithText.title = "ISO — Rounded Rect & Pill";
  isoRoundedWithText.pages[0].elements = [
    {
      id: "s_card",
      type: "card",
      bounds: { x: 50, y: 50, width: 220, height: 100 },
      zIndex: 1,
      style: { fillColor: "#EFF6FF", strokeColor: "#3B82F6", strokeWidth: 1, cornerRadius: 8 },
      textRuns: [{ text: "카드 (코너 반경 8pt, 자동 여백)", fontSizePt: 11, color: "#1E40AF" }]
    },
    {
      id: "s_pill",
      type: "card",
      bounds: { x: 300, y: 50, width: 120, height: 32 },
      zIndex: 2,
      style: { fillColor: "#DCFCE7", strokeColor: "#16A34A", strokeWidth: 1, cornerRadius: 16 },
      textRuns: [{ text: "승인 완료", fontSizePt: 10, fontWeight: 600, color: "#15803D" }]
    }
  ];
  fs.writeFileSync(path.join(outDir, "iso-rounded-rect-with-text.hwpx"), await renderer.renderToBuffer(isoRoundedWithText));

  // =========================================================================
  // 4. Multi-Page Comparison Suite
  // =========================================================================

  // iso-two-pages-one-section.hwpx
  const isoTwoPages: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  isoTwoPages.title = "ISO — 2 Pages 1 Section";
  isoTwoPages.pages = [
    {
      pageNumber: 1,
      bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
      backgroundColor: "#FFFFFF",
      elements: [{ id: "p1_t", type: "text", bounds: { x: 50, y: 50, width: 400, height: 30 }, zIndex: 1, style: {}, textRuns: [{ text: "1페이지 본문", fontSizePt: 14 }] }]
    },
    {
      pageNumber: 2,
      bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
      backgroundColor: "#F8FAFC",
      elements: [{ id: "p2_t", type: "text", bounds: { x: 50, y: 50, width: 400, height: 30 }, zIndex: 1, style: {}, textRuns: [{ text: "2페이지 본문", fontSizePt: 14 }] }]
    }
  ];
  fs.writeFileSync(path.join(outDir, "iso-two-pages-one-section.hwpx"), await renderer.renderToBuffer(isoTwoPages));

  // iso-nine-pages-one-section.hwpx
  const isoNinePages: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  isoNinePages.title = "ISO — 9 Pages 1 Section";
  isoNinePages.pages = [];
  for (let p = 1; p <= 9; p++) {
    isoNinePages.pages.push({
      pageNumber: p,
      bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
      backgroundColor: p % 2 === 0 ? "#F8FAFC" : "#FFFFFF",
      elements: [
        {
          id: `p${p}_t`,
          type: "text",
          bounds: { x: 50, y: 50, width: 400, height: 30 },
          zIndex: 1,
          style: {},
          textRuns: [{ text: `${p}페이지 — 다중 페이지 단일 섹션 검증`, fontSizePt: 14, fontWeight: 700 }]
        }
      ]
    });
  }
  fs.writeFileSync(path.join(outDir, "iso-nine-pages-one-section.hwpx"), await renderer.renderToBuffer(isoNinePages));

  // =========================================================================
  // 5. Stage 1~7 Full Regeneration
  // =========================================================================

  // Stage 1: Basic Korean Text
  const stage1Doc: CanvasDocument = {
    title: "Stage 1 — Korean Text",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [{
      pageNumber: 1,
      bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
      backgroundColor: "#FFFFFF",
      elements: [
        { id: "s1_h1", type: "text", bounds: { x: 50, y: 50, width: 495, height: 40 }, zIndex: 1, style: {}, textRuns: [{ text: "한글 문서 표준 OWPML 렌더링 검증", fontSizePt: 20, fontWeight: 700, color: "#111827" }] },
        { id: "s1_p1", type: "text", bounds: { x: 50, y: 110, width: 495, height: 60 }, zIndex: 2, style: {}, textRuns: [{ text: "본 문서는 Figma2Word Phase 22 엔진에 의해 생성된 정규 HWPX 파일입니다. 한컴오피스 2024 뷰어와의 완벽한 애플리케이션 호환성을 검증합니다.", fontSizePt: 11, color: "#374151" }] }
      ]
    }],
    resources: {},
    diagnostics: { notices: [], warnings: [] }
  };
  fs.writeFileSync(path.join(outDir, "stage1-korean-text.hwpx"), await renderer.renderToBuffer(stage1Doc));

  // Stage 2: Typography
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
  fs.writeFileSync(path.join(outDir, "stage2-typography.hwpx"), await renderer.renderToBuffer(stage2Doc));

  // Stage 3: Rectangles & Lines
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
        // Divider 1 (Horizontal solid: rendered as thin filled rect!)
        { id: "s3_line1", type: "line", bounds: { x: 50, y: 80, width: 495, height: 2 }, zIndex: 2, style: { strokeColor: "#CBD5E1", strokeWidth: 1 } },
        // Divider 2 (Horizontal dashed: native hp:line)
        { id: "s3_line2", type: "line", bounds: { x: 50, y: 100, width: 495, height: 2 }, zIndex: 3, style: { strokeColor: "#3B82F6", strokeWidth: 2, strokeDashed: true } },
        // Card
        { id: "s3_card1", type: "card", bounds: { x: 50, y: 130, width: 230, height: 120 }, zIndex: 4, style: { fillColor: "#EFF6FF", strokeColor: "#3B82F6", strokeWidth: 1, cornerRadius: 8 }, textRuns: [{ text: "정보 카드\n둥근 모서리 반경: 8pt\n배경색: #EFF6FF\n테두리: 1pt 솔리드", fontSizePt: 10, color: "#1E3A8A" }] },
        // Pill
        { id: "s3_pill", type: "card", bounds: { x: 310, y: 130, width: 120, height: 32 }, zIndex: 5, style: { fillColor: "#DCFCE7", strokeColor: "#16A34A", strokeWidth: 1, cornerRadius: 16 }, textRuns: [{ text: "승인 완료", fontSizePt: 10, fontWeight: 600, color: "#15803D" }] }
      ]
    }],
    resources: {},
    diagnostics: { notices: [], warnings: [] }
  };
  fs.writeFileSync(path.join(outDir, "stage3-rect-line.hwpx"), await renderer.renderToBuffer(stage3Doc));

  // Stage 4: Textbox, Oval & Vector
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
  fs.writeFileSync(path.join(outDir, "stage4-textbox-oval-vector.hwpx"), await renderer.renderToBuffer(stage4Doc));

  // Stage 5: Images
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
  fs.writeFileSync(path.join(outDir, "stage5-images.hwpx"), await renderer.renderToBuffer(stage5Doc));

  // Stage 6: Representative Proposal Report
  const proposalPath = path.resolve(process.cwd(), "samples/real-world/sample-a-proposal-doc.json");
  if (fs.existsSync(proposalPath)) {
    const rawProposal = JSON.parse(fs.readFileSync(proposalPath, "utf-8"));
    const parser = new FigmaCanvasParser({ titleOverride: "Stage 6 — Representative Report" });
    const s6Doc = parser.parse(rawProposal);
    fs.writeFileSync(path.join(outDir, "stage6-representative-report.hwpx"), await renderer.renderToBuffer(s6Doc));
  }

  // Stage 7: Full Customer Report (9 pages)
  const customerReportPath = path.resolve(process.cwd(), "debug/customer/Report1-Live-Snapshot.json");
  if (fs.existsSync(customerReportPath)) {
    const rawCustomer = JSON.parse(fs.readFileSync(customerReportPath, "utf-8"));
    const parser = new FigmaCanvasParser({ titleOverride: "Stage 7 — Customer Full Report" });
    const s7Doc = parser.parse(rawCustomer);
    fs.writeFileSync(path.join(outDir, "stage7-full-report.hwpx"), await renderer.renderToBuffer(s7Doc));
  }

  // Also update debug/hwpx-recovery with latest builds
  const recoveryDir = path.resolve(process.cwd(), "debug/hwpx-recovery");
  if (fs.existsSync(recoveryDir)) {
    for (const f of ["stage1-korean-text.hwpx", "stage2-typography.hwpx", "stage3-rect-line.hwpx", "stage4-textbox-oval-vector.hwpx", "stage5-images.hwpx", "stage6-representative-report.hwpx", "stage7-full-report.hwpx"]) {
      const src = path.join(outDir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(recoveryDir, f));
      }
    }
    console.log("Updated debug/hwpx-recovery/ with canonical Phase 22 builds.");
  }

  console.log("Phase 22 deliverables successfully generated in debug/hwpx-phase22/!");
}

main().catch((err) => {
  console.error("Error generating Phase 22 deliverables:", err);
  process.exit(1);
});

