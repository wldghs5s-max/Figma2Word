import fs from "fs";
import path from "path";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { CanvasDocument, CanvasPage, CanvasElement } from "../src/canvas/types.js";

const OUT_DIR = "debug/hwpx-phase23-1";
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const hwpxRenderer = new HwpxCanvasRenderer();
const docxRenderer = new DocxCanvasRenderer();

// Helper to save HWPX and DOCX
async function saveDoc(doc: CanvasDocument, baseName: string) {
  const hwpxBuf = await hwpxRenderer.renderToBuffer(doc);
  fs.writeFileSync(path.join(OUT_DIR, `${baseName}.hwpx`), hwpxBuf);

  const docxBuf = await docxRenderer.renderToBuffer(doc);
  fs.writeFileSync(path.join(OUT_DIR, `${baseName}.docx`), docxBuf);

  console.log(`[Generated] ${baseName}.hwpx (${hwpxBuf.length} bytes) and ${baseName}.docx (${docxBuf.length} bytes)`);
}

async function run() {
  console.log("=== Generating Phase 23.1 Deliverables ===");

  // 1. Stage 6: Representative Report
  console.log("\n1. Rendering Stage 6 (Proposal)...");
  const s6Raw = JSON.parse(fs.readFileSync("samples/real-world/sample-a-proposal-doc.json", "utf-8"));
  const parser6 = new FigmaCanvasParser();
  const doc6 = parser6.parse(s6Raw);
  await saveDoc(doc6, "stage6-representative-report");

  // 2. Stage 7: Full Report (9 pages)
  console.log("\n2. Rendering Stage 7 (Customer Report)...");
  const s7Raw = JSON.parse(fs.readFileSync("debug/customer/Report1-Live-Snapshot.json", "utf-8"));
  const parser7 = new FigmaCanvasParser();
  const doc7 = parser7.parse(s7Raw);
  await saveDoc(doc7, "stage7-full-report");

  // 3. Diagnostic 1: diag-narrow-textbox
  // Tests single-line vs wrapped Korean sentence in varying widths with snapToGrid=0 and BREAK_WORD
  console.log("\n3. Generating diag-narrow-textbox...");
  const docNarrow: CanvasDocument = {
    title: "Diagnostic: Narrow Textbox",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [{
      pageNumber: 1,
      name: "Page 1",
      bounds: { x: 0, y: 0, width: 595.28, heightPt: 841.89 as any, height: 841.89 },
      elements: [
        {
          id: "t_header",
          name: "Diag Header",
          type: "text",
          bounds: { x: 50, y: 50, width: 500, height: 30 },
          zIndex: 1,
          style: {},
          textRuns: [{ text: "진단 1: 좁은 텍스트박스 한글 줄바꿈 및 전체 너비 활용 검증", fontSizePt: 16, bold: true, fontFamily: "맑은 고딕" }],
        },
        {
          id: "c_box1",
          name: "Narrow Container 200pt",
          type: "card",
          bounds: { x: 50, y: 100, width: 200, height: 100 },
          zIndex: 2,
          style: { strokeColor: "3b82f6", strokeWidth: 1, fillColor: "f0f9ff" },
        },
        {
          id: "t_box1",
          name: "Text inside 200pt container",
          type: "text",
          bounds: { x: 50, y: 100, width: 200, height: 100 },
          zIndex: 3,
          style: {},
          textRuns: [{
            text: "본 문장은 200pt 폭의 좁은 텍스트박스에서 글자 단위 줄바꿈(BREAK_WORD)과 격자 비스냅(snapToGrid=0)으로 우측 여백 낭비 없이 렌더링되어야 합니다.",
            fontSizePt: 10,
            lineHeightPt: 16,
            fontFamily: "맑은 고딕",
          }],
        },
        {
          id: "c_box2",
          name: "Normal Container 400pt",
          type: "card",
          bounds: { x: 50, y: 220, width: 400, height: 60 },
          zIndex: 4,
          style: { strokeColor: "10b981", strokeWidth: 1, fillColor: "ecfdf5" },
        },
        {
          id: "t_box2",
          name: "Text inside 400pt container",
          type: "text",
          bounds: { x: 50, y: 220, width: 400, height: 60 },
          zIndex: 5,
          style: {},
          textRuns: [{
            text: "동일한 문장이 400pt 폭에서는 2줄로 자연스럽게 배치되며, 한영/숫자 혼용 시에도 비정상적인 간격 벌어짐이 발생하지 않습니다. (Figma2Word AI 2026)",
            fontSizePt: 10,
            lineHeightPt: 16,
            fontFamily: "맑은 고딕",
          }],
        },
      ],
    }],
    diagnostics: { notices: [], warnings: [] },
  };
  await saveDoc(docNarrow, "diag-narrow-textbox");

  // 4. Diagnostic 2: diag-multiline-text
  console.log("\n4. Generating diag-multiline-text...");
  const docMultiline: CanvasDocument = {
    title: "Diagnostic: Multiline Text",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [{
      pageNumber: 1,
      name: "Page 1",
      bounds: { x: 0, y: 0, width: 595.28, heightPt: 841.89 as any, height: 841.89 },
      elements: [
        {
          id: "t_header",
          name: "Diag Header",
          type: "text",
          bounds: { x: 50, y: 50, width: 500, height: 30 },
          zIndex: 1,
          style: {},
          textRuns: [{ text: "진단 2: 여러 문단 및 복합 줄바꿈 일관성 검증", fontSizePt: 16, bold: true, fontFamily: "맑은 고딕" }],
        },
        {
          id: "t_multi1",
          name: "Multiline Lead",
          type: "text",
          bounds: { x: 50, y: 100, width: 495, height: 80 },
          zIndex: 2,
          style: {},
          paragraphAlign: "justify",
          textRuns: [{
            text: "제1문단: 본 제안서는 사내 디자인 및 기획 자산의 신속한 문서화를 위해, Figma 디자인을 표준 Microsoft Word(.docx) 및 HWPX 형식으로 무손실 변환하는 자체 자동화 시스템 도입 방안을 제시합니다.\n\n제2문단: 디자이너와 기획자 간의 수작업 포맷 재구성 비용을 80% 이상 절감하는 것을 목표로 하며, 절대 좌표 체계와 Canonical JSON IR을 엄격히 준수합니다.",
            fontSizePt: 10.5,
            lineHeightPt: 18,
            fontFamily: "맑은 고딕",
          }],
        },
      ],
    }],
    diagnostics: { notices: [], warnings: [] },
  };
  await saveDoc(docMultiline, "diag-multiline-text");

  // 5. Diagnostic 3: diag-textbox-margin
  console.log("\n5. Generating diag-textbox-margin...");
  const docMargin: CanvasDocument = {
    title: "Diagnostic: Textbox Margin",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [{
      pageNumber: 1,
      name: "Page 1",
      bounds: { x: 0, y: 0, width: 595.28, heightPt: 841.89 as any, height: 841.89 },
      elements: [
        {
          id: "t_header",
          name: "Diag Header",
          type: "text",
          bounds: { x: 50, y: 50, width: 500, height: 30 },
          zIndex: 1,
          style: {},
          textRuns: [{ text: "진단 3: 텍스트박스 내부 여백(textMargin) 정확도 검증", fontSizePt: 16, bold: true, fontFamily: "맑은 고딕" }],
        },
        {
          id: "c_zero_margin",
          name: "Zero Margin Card",
          type: "card",
          bounds: { x: 50, y: 100, width: 400, height: 50 },
          zIndex: 2,
          style: { strokeColor: "ef4444", strokeWidth: 1, fillColor: "fef2f2" },
        },
        {
          id: "t_zero_margin",
          name: "Zero Margin Text",
          type: "text",
          bounds: { x: 50, y: 100, width: 400, height: 50 },
          zIndex: 3,
          style: {},
          textRuns: [{
            text: "[Zero Margin (L=0, R=0, T=0, B=0)] 텍스트가 도형의 좌측 경계부터 정확히 시작하며 상하좌우 인위적 축소가 없습니다.",
            fontSizePt: 10,
            lineHeightPt: 16,
            fontFamily: "맑은 고딕",
          }],
        },
        {
          id: "c_padded",
          name: "Explicit Padded Card",
          type: "card",
          bounds: { x: 50, y: 180, width: 400, height: 60 },
          zIndex: 4,
          style: { strokeColor: "6366f1", strokeWidth: 1, fillColor: "eef2ff", cornerRadius: 8 },
        },
        {
          id: "t_padded",
          name: "Explicit Padded Text",
          type: "text",
          bounds: { x: 50, y: 180, width: 400, height: 60 },
          innerPaddingPt: { top: 10, bottom: 10, left: 15, right: 15 },
          zIndex: 5,
          style: {},
          textRuns: [{
            text: "[Explicit Padding (L=15pt, R=15pt, T=10pt, B=10pt)] 명시적 내부 패딩이 주어졌을 때만 정확히 해당 수치만큼 inset되어 렌더링됩니다.",
            fontSizePt: 10,
            lineHeightPt: 16,
            fontFamily: "맑은 고딕",
          }],
        },
      ],
    }],
    diagnostics: { notices: [], warnings: [] },
  };
  await saveDoc(docMargin, "diag-textbox-margin");

  // 6. Diagnostic 4: diag-adjacent-text
  console.log("\n6. Generating diag-adjacent-text...");
  const docAdjacent: CanvasDocument = {
    title: "Diagnostic: Adjacent Text",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [{
      pageNumber: 1,
      name: "Page 1",
      bounds: { x: 0, y: 0, width: 595.28, heightPt: 841.89 as any, height: 841.89 },
      elements: [
        {
          id: "t_header",
          name: "Diag Header",
          type: "text",
          bounds: { x: 50, y: 50, width: 500, height: 30 },
          zIndex: 1,
          style: {},
          textRuns: [{ text: "진단 4: 인접 텍스트 요소 간 줄바꿈 침범 방지 검증", fontSizePt: 16, bold: true, fontFamily: "맑은 고딕" }],
        },
        {
          id: "c_bound1",
          name: "Bound Box 1",
          type: "card",
          bounds: { x: 50, y: 100, width: 495, height: 54 },
          zIndex: 2,
          style: { strokeColor: "94a3b8", strokeWidth: 1, strokeDashed: true },
        },
        {
          id: "t_upper",
          name: "Upper Paragraph",
          type: "text",
          bounds: { x: 50, y: 100, width: 495, height: 54 },
          zIndex: 3,
          style: {},
          textRuns: [{
            text: "상단 문단 (높이 54pt, 3줄 정격): 본 문단은 3줄에 정확히 맞춰 개행되며, 줄바꿈 정책(BREAK)과 breakNonLatinWord(BREAK_WORD)로 인해 4줄로 불필요하게 넘치지 않습니다.",
            fontSizePt: 10.5,
            lineHeightPt: 18,
            fontFamily: "맑은 고딕",
          }],
        },
        {
          id: "c_bound2",
          name: "Bound Box 2",
          type: "card",
          bounds: { x: 50, y: 165, width: 495, height: 30 },
          zIndex: 4,
          style: { strokeColor: "94a3b8", strokeWidth: 1, strokeDashed: true },
        },
        {
          id: "t_lower",
          name: "Lower Heading",
          type: "text",
          bounds: { x: 50, y: 165, width: 495, height: 30 },
          zIndex: 5,
          style: {},
          textRuns: [{
            text: "하단 소제목 (y=165pt): 상단 문단이 정확한 3줄 높이를 유지하므로 하단 소제목과의 사이에 11pt의 명확한 간격이 확보되어 글자 충돌이 발생하지 않습니다.",
            fontSizePt: 12,
            bold: true,
            color: "1e3a8a",
            fontFamily: "맑은 고딕",
          }],
        },
      ],
    }],
    diagnostics: { notices: [], warnings: [] },
  };
  await saveDoc(docAdjacent, "diag-adjacent-text");

  // 7. Write README.md
  console.log("\n7. Writing README.md...");
  const readmeContent = `# Phase 23.1 HWPX Real Viewer Verification Guide

## 1. 개요
본 디렉터리는 Phase 23.1(Canonical Text Geometry & Overflow Recovery)에서 복구된 HWPX 문서 및 진단 산출물을 포함합니다.
모든 문서는 Canonical JSON(Canvas IR) 단일 원본에서 정밀 생성되었습니다.

## 2. 생성된 산출물 목록

| 파일명 | 형식 | 주요 검증 목적 |
|---|---|---|
| \`stage6-representative-report.hwpx\` | HWPX | 실무 제안서 보고서: Executive Summary 문단 줄바꿈 및 소제목 충돌 해소 검증 |
| \`stage6-representative-report.docx\` | DOCX | Stage 6 크로스포맷 대조군 |
| \`stage7-full-report.hwpx\` | HWPX | 9페이지 고객 실무 진단 보고서: 지표안내 문단(P8) 및 전 페이지 텍스트박스 너비 복구 검증 |
| \`stage7-full-report.docx\` | DOCX | Stage 7 크로스포맷 대조군 |
| \`diag-narrow-textbox.hwpx\` | HWPX | 200pt 좁은 폭 텍스트박스에서 우측 여백 낭비 없는 \`BREAK_WORD\` 줄바꿈 검증 |
| \`diag-multiline-text.hwpx\` | HWPX | 다중 문단 복합 개행 및 \`lineWrap="BREAK"\` 정책 보존 검증 |
| \`diag-textbox-margin.hwpx\` | HWPX | 텍스트박스 내부 여백(\`textMargin\`) 기본 0 설정 및 명시적 인셋 대조 검증 |
| \`diag-adjacent-text.hwpx\` | HWPX | 상하 인접 텍스트박스 간 정격 높이 유지 및 다운스트림 객체 충돌 방지 검증 |

## 3. 한컴오피스 2024 뷰어 사용자 검증 절차

1. **\`diag-narrow-textbox.hwpx\` 열람**:
   - 200pt 박스 내부 텍스트가 오른쪽 테두리 직전까지 꽉 채워져 줄바꿈되는지 확인합니다 (불필요한 우측 공백 해소 확인).
2. **\`diag-textbox-margin.hwpx\` 열람**:
   - Zero Margin 박스에서 텍스트가 좌측 테두리부터 자연스럽게 시작되는지 확인합니다.
3. **\`diag-adjacent-text.hwpx\` 열람**:
   - 상단 문단과 하단 소제목 사이에 점선 박스 경계가 겹치지 않고 분리되어 있는지 확인합니다.
4. **\`stage6-representative-report.hwpx\` 열람**:
   - \`Executive Summary Lead Paragraph\` 문단이 3줄로 안정적으로 배치되어 하단 소제목(\`1. 핵심 기대 효과 및 도입 타당성\`)과 충돌하지 않는지 확인합니다.
5. **\`stage7-full-report.hwpx\` 열람**:
   - 8페이지/9페이지 지표안내 카드의 본문 문장들이 충분한 좌우 너비를 활용하여 자연스럽게 개행되는지 확인합니다.
`;
  fs.writeFileSync(path.join(OUT_DIR, "README.md"), readmeContent, "utf-8");
  console.log("README.md written successfully.");
}

run().catch(console.error);
