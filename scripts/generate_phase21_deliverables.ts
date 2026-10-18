import fs from "fs";
import path from "path";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument } from "../src/canvas/types.js";

async function main() {
  const outDir = path.resolve(process.cwd(), "debug/hwpx-phase21");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const renderer = new HwpxCanvasRenderer();

  console.log("Generating Phase 21 HWPX Deliverables & Diagnostics in debug/hwpx-phase21/...");

  // =========================================================================
  // 1. Diagnostics Decomposition Suite
  // =========================================================================
  const baseDiagDoc: CanvasDocument = {
    title: "Diagnostic Base",
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

  // Diag A: Rect / Cards Only (Verifies clean lineColorHex, lineWidth, lineStyle, ratio)
  const diagRectDoc: CanvasDocument = JSON.parse(JSON.stringify(baseDiagDoc));
  diagRectDoc.title = "Diag — Rect & Card Only";
  diagRectDoc.pages[0].elements = [
    {
      id: "d_card1",
      type: "card",
      bounds: { x: 50, y: 50, width: 220, height: 100 },
      zIndex: 1,
      style: { fillColor: "#EFF6FF", strokeColor: "#3B82F6", strokeWidth: 1, cornerRadius: 8 },
      textRuns: [{ text: "카드 (테두리 1pt, 라운드 8pt)", fontSizePt: 11, color: "#1E40AF" }]
    },
    {
      id: "d_pill",
      type: "card",
      bounds: { x: 300, y: 50, width: 120, height: 32 },
      zIndex: 2,
      style: { fillColor: "#DCFCE7", strokeColor: "#16A34A", strokeWidth: 1, cornerRadius: 16 },
      textRuns: [{ text: "뱃지 (필 형태)", fontSizePt: 10, color: "#15803D" }]
    }
  ];
  fs.writeFileSync(path.join(outDir, "diag-rect-only.hwpx"), await renderer.renderToBuffer(diagRectDoc));
  console.log("  [DIAG] diag-rect-only.hwpx written");

  // Diag B: Line Only (Verifies clean hp:line without invalid isReverseHV)
  const diagLineDoc: CanvasDocument = JSON.parse(JSON.stringify(baseDiagDoc));
  diagLineDoc.title = "Diag — Line Only";
  diagLineDoc.pages[0].elements = [
    {
      id: "d_l1",
      type: "line",
      bounds: { x: 50, y: 80, width: 450, height: 2 },
      zIndex: 1,
      style: { strokeColor: "#3B82F6", strokeWidth: 2 }
    },
    {
      id: "d_l2",
      type: "line",
      bounds: { x: 50, y: 120, width: 450, height: 2 },
      zIndex: 2,
      style: { strokeColor: "#EF4444", strokeWidth: 1.5, strokeDashed: true }
    }
  ];
  fs.writeFileSync(path.join(outDir, "diag-line-only.hwpx"), await renderer.renderToBuffer(diagLineDoc));
  console.log("  [DIAG] diag-line-only.hwpx written");

  // Diag C: Ellipse Only (Verifies authentic hp:ellipse conforming to KS X 6101)
  const diagEllipseDoc: CanvasDocument = JSON.parse(JSON.stringify(baseDiagDoc));
  diagEllipseDoc.title = "Diag — Ellipse Only";
  diagEllipseDoc.pages[0].elements = [
    {
      id: "d_e1",
      type: "oval",
      bounds: { x: 50, y: 50, width: 100, height: 100 },
      zIndex: 1,
      style: { fillColor: "#3B82F6", strokeColor: "#1D4ED8", strokeWidth: 2 }
    },
    {
      id: "d_e2",
      type: "oval",
      bounds: { x: 200, y: 50, width: 150, height: 80 },
      zIndex: 2,
      style: { fillColor: "#EC4899", strokeColor: "#BE185D", strokeWidth: 1.5 }
    }
  ];
  fs.writeFileSync(path.join(outDir, "diag-ellipse-only.hwpx"), await renderer.renderToBuffer(diagEllipseDoc));
  console.log("  [DIAG] diag-ellipse-only.hwpx written");

  // Diag D: Polygon Only (Verifies closed vector polygon)
  const diagPolyDoc: CanvasDocument = JSON.parse(JSON.stringify(baseDiagDoc));
  diagPolyDoc.title = "Diag — Polygon Only";
  diagPolyDoc.pages[0].elements = [
    {
      id: "d_p1",
      name: "다각형",
      type: "vector",
      bounds: { x: 50, y: 50, width: 120, height: 120 },
      zIndex: 1,
      style: { fillColor: "#10B981", strokeColor: "#047857", strokeWidth: 2 },
      rawSvgPath: "M 60 10 L 110 90 L 10 90 Z"
    }
  ];
  fs.writeFileSync(path.join(outDir, "diag-polygon-only.hwpx"), await renderer.renderToBuffer(diagPolyDoc));
  console.log("  [DIAG] diag-polygon-only.hwpx written");

  // =========================================================================
  // 2. Full Stage 1 to 7 Recovery Artifacts
  // =========================================================================

  // Stage 1: Minimal Korean Text
  const stage1Doc: CanvasDocument = {
    title: "Stage 1 — Minimal Korean Text",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [
      {
        pageNumber: 1,
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: "#FFFFFF",
        elements: [
          {
            id: "s1_heading",
            name: "문서 제목",
            type: "text",
            bounds: { x: 50, y: 60, width: 495, height: 40 },
            zIndex: 1,
            style: {},
            textRuns: [
              {
                text: "한글 문서 복구 1단계: 기본 한국어 텍스트",
                fontFamily: "맑은 고딕",
                fontSizePt: 20,
                fontWeight: 700,
                color: "#111827",
              },
            ],
          },
          {
            id: "s1_body",
            name: "본문 문단",
            type: "text",
            bounds: { x: 50, y: 120, width: 495, height: 100 },
            zIndex: 2,
            style: {},
            textRuns: [
              {
                text: "이 문서는 KS X 6101 개방형 워드프로세서 마크업 언어(OWPML) 규격에 따라 생성되었습니다.\n<hp:secPr>이 올바르게 <hp:run charPrIDRef=\"0\"> 내부에 위치하며, 단일 문단 내에서 정확한 한글 텍스트 런이 직렬화됩니다.\n맑은 고딕 글꼴과 160% 표준 줄간격이 적용되어 있습니다.",
                fontFamily: "맑은 고딕",
                fontSizePt: 11,
                lineHeightPt: 17.6,
                color: "#374151",
              },
            ],
          },
        ],
      },
    ],
    resources: {},
    diagnostics: { notices: [], warnings: [] },
  };
  const s1Buf = await renderer.renderToBuffer(stage1Doc);
  fs.writeFileSync(path.join(outDir, "stage1-korean-text.hwpx"), s1Buf);
  console.log(`[PASS] stage1-korean-text.hwpx (${s1Buf.length} bytes)`);

  // Stage 2: Typography & Styling
  const stage2Doc: CanvasDocument = {
    title: "Stage 2 — Typography & Styling",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [
      {
        pageNumber: 1,
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: "#F8FAFC",
        elements: [
          {
            id: "s2_title",
            type: "text",
            bounds: { x: 50, y: 50, width: 495, height: 35 },
            zIndex: 1,
            style: {},
            textRuns: [
              {
                text: "타이포그래피 및 서식 검증 (Stage 2)",
                fontFamily: "Pretendard",
                fontSizePt: 18,
                fontWeight: 700,
                color: "#0F172A",
              },
            ],
          },
          {
            id: "s2_styles",
            type: "text",
            bounds: { x: 50, y: 100, width: 495, height: 200 },
            zIndex: 2,
            style: {},
            textRuns: [
              {
                text: "굵은 글씨 (Bold 700)\n",
                fontFamily: "Pretendard",
                fontSizePt: 13,
                fontWeight: 700,
                color: "#1E293B",
              },
              {
                text: "기울임꼴 텍스트 (Italic)\n",
                fontFamily: "맑은 고딕",
                fontSizePt: 12,
                italic: true,
                color: "#2563EB",
              },
              {
                text: "밑줄 강조 텍스트 (Underline)\n",
                fontFamily: "맑은 고딕",
                fontSizePt: 12,
                underline: true,
                color: "#059669",
              },
              {
                text: "취소선 텍스트 (Strikeout)\n",
                fontFamily: "맑은 고딕",
                fontSizePt: 12,
                strike: true,
                color: "#DC2626",
              },
              {
                text: "자간 확장 텍스트 (Letter Spacing +2pt)\n",
                fontFamily: "Pretendard",
                fontSizePt: 12,
                letterSpacingPt: 2,
                color: "#7C3AED",
              },
              {
                text: "색상 혼합: 빨강, 초록, 파랑, 보라",
                fontFamily: "Pretendard",
                fontSizePt: 11,
                color: "#D97706",
              },
            ],
          },
        ],
      },
    ],
    resources: {},
    diagnostics: { notices: [], warnings: [] },
  };
  const s2Buf = await renderer.renderToBuffer(stage2Doc);
  fs.writeFileSync(path.join(outDir, "stage2-typography.hwpx"), s2Buf);
  console.log(`[PASS] stage2-typography.hwpx (${s2Buf.length} bytes)`);

  // Stage 3: Rectangles, Cards & Lines
  const stage3Doc: CanvasDocument = {
    title: "Stage 3 — Rectangles & Lines",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [
      {
        pageNumber: 1,
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: "#FFFFFF",
        elements: [
          {
            id: "s3_title",
            type: "text",
            bounds: { x: 50, y: 40, width: 495, height: 30 },
            zIndex: 1,
            style: {},
            textRuns: [{ text: "도형 및 직선 검증 (Stage 3)", fontSizePt: 16, fontWeight: 700 }],
          },
          // Horizontal divider line
          {
            id: "s3_line1",
            type: "line",
            bounds: { x: 50, y: 80, width: 495, height: 2 },
            zIndex: 2,
            style: { strokeColor: "#CBD5E1", strokeWidth: 1 },
          },
          // Dashed line
          {
            id: "s3_line2",
            type: "line",
            bounds: { x: 50, y: 100, width: 495, height: 2 },
            zIndex: 3,
            style: { strokeColor: "#3B82F6", strokeWidth: 2, strokeDashed: true },
          },
          // Solid card
          {
            id: "s3_card1",
            type: "card",
            bounds: { x: 50, y: 130, width: 230, height: 120 },
            zIndex: 4,
            style: { fillColor: "#EFF6FF", strokeColor: "#3B82F6", strokeWidth: 1, cornerRadius: 8 },
            textRuns: [
              { text: "정보 카드\n", fontSizePt: 12, fontWeight: 700, color: "#1E40AF" },
              { text: "둥근 모서리 반경: 8pt\n배경색: #EFF6FF\n테두리: 1pt 솔리드", fontSizePt: 10, color: "#1E3A8A" },
            ],
          },
          // Pill badge (ratio capped at 50)
          {
            id: "s3_pill",
            type: "card",
            bounds: { x: 310, y: 130, width: 120, height: 32 },
            zIndex: 5,
            style: { fillColor: "#DCFCE7", strokeColor: "#16A34A", strokeWidth: 1, cornerRadius: 16 },
            textRuns: [{ text: "승인 완료", fontSizePt: 10, fontWeight: 600, color: "#15803D" }],
          },
          // Bordered box with dark fill
          {
            id: "s3_card2",
            type: "card",
            bounds: { x: 310, y: 180, width: 235, height: 70 },
            zIndex: 6,
            style: { fillColor: "#1E293B", cornerRadius: 6 },
            textRuns: [{ text: "다크 테마 패널\n배경 #1E293B", fontSizePt: 10, color: "#F8FAFC" }],
          },
        ],
      },
    ],
    resources: {},
    diagnostics: { notices: [], warnings: [] },
  };
  const s3Buf = await renderer.renderToBuffer(stage3Doc);
  fs.writeFileSync(path.join(outDir, "stage3-rect-line.hwpx"), s3Buf);
  console.log(`[PASS] stage3-rect-line.hwpx (${s3Buf.length} bytes)`);

  // Stage 4: Textbox, Oval & Vector
  const stage4Doc: CanvasDocument = {
    title: "Stage 4 — Textbox, Oval & Vector",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [
      {
        pageNumber: 1,
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: "#FFFFFF",
        elements: [
          {
            id: "s4_title",
            type: "text",
            bounds: { x: 50, y: 40, width: 495, height: 30 },
            zIndex: 1,
            style: {},
            textRuns: [{ text: "텍스트박스, 타원 및 벡터 도형 (Stage 4)", fontSizePt: 16, fontWeight: 700 }],
          },
          // Textbox with explicit inner padding
          {
            id: "s4_textbox",
            type: "card",
            bounds: { x: 50, y: 90, width: 220, height: 100 },
            zIndex: 2,
            style: { fillColor: "#FEF3C7", strokeColor: "#D97706", strokeWidth: 1, cornerRadius: 4 },
            innerPaddingPt: { top: 10, right: 15, bottom: 10, left: 15 },
            verticalAlign: "center",
            textRuns: [
              { text: "패딩이 적용된 텍스트박스\n상하 10pt / 좌우 15pt", fontSizePt: 11, color: "#92400E" },
            ],
          },
          // Native Oval (Circle)
          {
            id: "s4_circle",
            type: "oval",
            bounds: { x: 300, y: 90, width: 90, height: 90 },
            zIndex: 3,
            style: { fillColor: "#3B82F6", strokeColor: "#1D4ED8", strokeWidth: 2 },
          },
          // Native Oval (Ellipse)
          {
            id: "s4_ellipse",
            type: "oval",
            bounds: { x: 410, y: 105, width: 135, height: 75 },
            zIndex: 4,
            style: { fillColor: "#EC4899", strokeColor: "#BE185D", strokeWidth: 2 },
          },
          // Vector: Checkmark (Open Subpath)
          {
            id: "s4_check",
            name: "체크마크",
            type: "vector",
            bounds: { x: 50, y: 220, width: 80, height: 80 },
            zIndex: 5,
            style: { strokeColor: "#10B981", strokeWidth: 3 },
            rawSvgPath: "M 10 40 L 30 65 L 70 15",
          },
          // Vector: Triangle (Closed Polygon)
          {
            id: "s4_triangle",
            name: "삼각형",
            type: "vector",
            bounds: { x: 160, y: 220, width: 100, height: 80 },
            zIndex: 6,
            style: { fillColor: "#6366F1", strokeColor: "#4338CA", strokeWidth: 1.5 },
            rawSvgPath: "M 50 10 L 90 70 L 10 70 Z",
          },
          // Vector: Star / Hexagon
          {
            id: "s4_poly",
            name: "다각형",
            type: "vector",
            bounds: { x: 290, y: 220, width: 90, height: 90 },
            zIndex: 7,
            style: { fillColor: "#F59E0B", strokeColor: "#B45309", strokeWidth: 1 },
            rawSvgPath: "M 45 5 L 85 25 L 85 65 L 45 85 L 5 65 L 5 25 Z",
          },
        ],
      },
    ],
    resources: {},
    diagnostics: { notices: [], warnings: [] },
  };
  const s4Buf = await renderer.renderToBuffer(stage4Doc);
  fs.writeFileSync(path.join(outDir, "stage4-textbox-oval-vector.hwpx"), s4Buf);
  console.log(`[PASS] stage4-textbox-oval-vector.hwpx (${s4Buf.length} bytes)`);

  // Stage 5: Images
  const samplePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const chartPng = samplePng;

  const stage5Doc: CanvasDocument = {
    title: "Stage 5 — Images & Cropping",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [
      {
        pageNumber: 1,
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: "#FFFFFF",
        elements: [
          {
            id: "s5_title",
            type: "text",
            bounds: { x: 50, y: 40, width: 495, height: 30 },
            zIndex: 1,
            style: {},
            textRuns: [{ text: "이미지 리소스 및 크롭 검증 (Stage 5)", fontSizePt: 16, fontWeight: 700 }],
          },
          {
            id: "s5_img1",
            type: "image",
            bounds: { x: 50, y: 90, width: 150, height: 100 },
            zIndex: 2,
            style: {},
            imageRef: "res_img1",
          },
          {
            id: "s5_img2",
            type: "image",
            bounds: { x: 230, y: 90, width: 150, height: 100 },
            zIndex: 3,
            style: {},
            imageRef: "res_img2",
            imageScaleMode: "FIT",
          },
          {
            id: "s5_img3",
            type: "image",
            bounds: { x: 410, y: 90, width: 135, height: 100 },
            zIndex: 4,
            style: {},
            imageRef: "res_img1",
            imageCrop: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
          },
        ],
      },
    ],
    resources: {
      res_img1: { mimeType: "image/png", data: samplePng },
      res_img2: { mimeType: "image/png", data: chartPng },
    },
    diagnostics: { notices: [], warnings: [] },
  };
  const s5Buf = await renderer.renderToBuffer(stage5Doc);
  fs.writeFileSync(path.join(outDir, "stage5-images.hwpx"), s5Buf);
  console.log(`[PASS] stage5-images.hwpx (${s5Buf.length} bytes)`);

  // Stage 6: Representative Multi-Page Report (Proposal Doc)
  const proposalPath = path.resolve(process.cwd(), "samples/real-world/sample-a-proposal-doc.json");
  if (fs.existsSync(proposalPath)) {
    const rawProposal = JSON.parse(fs.readFileSync(proposalPath, "utf-8"));
    const parser = new FigmaCanvasParser({ titleOverride: "Stage 6 — Representative Report" });
    const s6Doc = parser.parse(rawProposal);
    const s6Buf = await renderer.renderToBuffer(s6Doc);
    fs.writeFileSync(path.join(outDir, "stage6-representative-report.hwpx"), s6Buf);
    console.log(`[PASS] stage6-representative-report.hwpx (${s6Buf.length} bytes, ${s6Doc.pages.length} pages)`);
  }

  // Stage 7: Full Customer Report
  const customerReportPath = path.resolve(process.cwd(), "debug/customer/Report1-Live-Snapshot.json");
  if (fs.existsSync(customerReportPath)) {
    const rawCustomer = JSON.parse(fs.readFileSync(customerReportPath, "utf-8"));
    const parser = new FigmaCanvasParser({ titleOverride: "Stage 7 — Customer Full Report" });
    const s7Doc = parser.parse(rawCustomer);
    const s7Buf = await renderer.renderToBuffer(s7Doc);
    fs.writeFileSync(path.join(outDir, "stage7-full-report.hwpx"), s7Buf);
    console.log(`[PASS] stage7-full-report.hwpx (${s7Buf.length} bytes, ${s7Doc.pages.length} pages)`);
  }

  // Also update debug/hwpx-recovery with latest builds
  const recoveryDir = path.resolve(process.cwd(), "debug/hwpx-recovery");
  if (fs.existsSync(recoveryDir)) {
    for (const f of fs.readdirSync(outDir)) {
      if (f.endsWith(".hwpx")) {
        fs.copyFileSync(path.join(outDir, f), path.join(recoveryDir, f));
      }
    }
    console.log("Updated debug/hwpx-recovery/ with hardened Phase 21 builds.");
  }

  console.log("Phase 21 deliverables successfully generated in debug/hwpx-phase21/!");
}

main().catch((err) => {
  console.error("Error generating Phase 21 deliverables:", err);
  process.exit(1);
});

