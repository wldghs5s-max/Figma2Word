import * as fs from "fs";
import * as path from "path";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { CanvasDocument, CanvasPage, CanvasElement } from "../src/canvas/types.js";

/**
 * SYNTHETIC FIXTURE GENERATOR ONLY
 * 
 * STRICT PROHIBITION: Per Phase 35.1 Part A Forbidden Rule #1, this generator
 * MUST NEVER be used as a production or authentic document benchmark.
 * It synthesizes archetype layout elements for unit/integration testing only.
 */
export const IS_SYNTHETIC_FIXTURE = true;

export function createPhase35CanvasDocument(mode: "synthetic" = "synthetic"): CanvasDocument {
  if (mode !== "synthetic") {
    throw new Error(
      "[FORBIDDEN] createPhase35CanvasDocument called in non-synthetic mode! Per Phase 35.1 Part A Rule #1, synthetic fixtures cannot represent real Figma documents."
    );
  }
  const framesJson = JSON.parse(
    fs.readFileSync(
      path.resolve(process.cwd(), "research/rea-document-engine/phase26-visual-fidelity/exact-17-frames.json"),
      "utf8"
    )
  );

  const pages: CanvasPage[] = [];

  for (const f of framesJson) {
    const pageNum: number = f.pageNumber;
    const w: number = f.canvasBounds.width;
    const h: number = f.canvasBounds.height;
    const frameId: string = f.frameId;
    const frameName: string = f.frameName;

    const elements: CanvasElement[] = [];

    // Background card for canvas
    elements.push({
      id: `${frameId}-bg`,
      name: `${frameName} Background`,
      type: "card",
      bounds: { x: 0, y: 0, width: w, height: h },
      zIndex: 0,
      style: {
        fillColor: pageNum === 9 || pageNum === 11 || pageNum === 13 ? "#F9FAFB" : "#FFFFFF",
      },
    });

    if (pageNum === 1) {
      // 디자인 시스템 1: Color palette chips, typography, badges
      // Header
      elements.push({
        id: "p1-title",
        name: "Page Title",
        type: "text",
        bounds: { x: 40, y: 40, width: 400, height: 36 },
        zIndex: 1,
        style: {},
        textAutoResize: "WIDTH_AND_HEIGHT",
        textRuns: [{ text: "디자인 시스템 — 색상 및 타이포그래피", fontSizePt: 20, fontWeight: 700, color: "#111827", fontFamily: "Pretendard" }],
      });

      // Palette cards
      const colors = [
        { name: "Primary Blue", hex: "#0066FF" },
        { name: "Primary Light", hex: "#E0ECFF" },
        { name: "Neutral Dark", hex: "#1F2937" },
        { name: "Neutral Gray", hex: "#6B7280" },
        { name: "Neutral Light", hex: "#F3F4F6" },
        { name: "Success Green", hex: "#10B981" },
        { name: "Warning Orange", hex: "#F59E0B" },
        { name: "Danger Red", hex: "#EF4444" },
      ];

      for (let i = 0; i < colors.length; i++) {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const cx = 40 + col * 320;
        const cy = 110 + row * 160;

        elements.push({
          id: `p1-chip-${i}`,
          name: `Color Chip ${i}`,
          type: "card",
          bounds: { x: cx, y: cy, width: 280, height: 90 },
          zIndex: 1,
          style: { fillColor: colors[i].hex, cornerRadius: 8 },
        });

        elements.push({
          id: `p1-chip-lbl-${i}`,
          name: `Chip Label ${i}`,
          type: "text",
          bounds: { x: cx, y: cy + 100, width: 280, height: 24 },
          zIndex: 2,
          style: {},
          textAutoResize: "WIDTH_AND_HEIGHT",
          textRuns: [
            { text: `${colors[i].name} (${colors[i].hex})`, fontSizePt: 12, fontWeight: 600, color: "#374151", fontFamily: "Pretendard" },
          ],
        });
      }

      // Badges
      const badges = ["진행중", "완료", "대기", "보류"];
      for (let b = 0; b < badges.length; b++) {
        const bx = 40 + b * 120;
        const by = 480;
        elements.push({
          id: `p1-badge-${b}`,
          name: `Status Badge ${b}`,
          type: "card",
          bounds: { x: bx, y: by, width: 90, height: 32 },
          zIndex: 1,
          style: { fillColor: b === 0 ? "#E0ECFF" : b === 1 ? "#D1FAE5" : b === 2 ? "#FEF3C7" : "#FEE2E2", cornerRadius: 16 },
        });
        elements.push({
          id: `p1-badge-txt-${b}`,
          name: `Badge Text ${b}`,
          type: "text",
          bounds: { x: bx, y: by, width: 90, height: 32 },
          zIndex: 2,
          style: {},
          paragraphAlign: "center",
          verticalAlign: "center",
          textAutoResize: "NONE",
          textRuns: [{ text: badges[b], fontSizePt: 11, fontWeight: 600, color: b === 0 ? "#0066FF" : b === 1 ? "#065F46" : b === 2 ? "#92400E" : "#991B1B", fontFamily: "Pretendard" }],
        });
      }
    } else if (pageNum === 2) {
      // 디자인 시스템 2: Buttons, inputs, tabs
      elements.push({
        id: "p2-title",
        name: "Page Title",
        type: "text",
        bounds: { x: 40, y: 40, width: 400, height: 36 },
        zIndex: 1,
        style: {},
        textAutoResize: "WIDTH_AND_HEIGHT",
        textRuns: [{ text: "디자인 시스템 — 컴포넌트 라이브러리", fontSizePt: 20, fontWeight: 700, color: "#111827", fontFamily: "Pretendard" }],
      });

      // Buttons
      const btnStyles = [
        { name: "Primary", fill: "#0066FF", stroke: "#0066FF", text: "#FFFFFF", radius: 8 },
        { name: "Secondary", fill: "#F3F4F6", stroke: "#D1D5DB", text: "#1F2937", radius: 8 },
        { name: "Outline", fill: "#FFFFFF", stroke: "#0066FF", text: "#0066FF", radius: 8 },
        { name: "Rounded Pill", fill: "#0066FF", stroke: "#0066FF", text: "#FFFFFF", radius: 20 },
      ];

      for (let i = 0; i < btnStyles.length; i++) {
        const bx = 40 + i * 220;
        const by = 120;
        elements.push({
          id: `p2-btn-${i}`,
          name: `Button ${i}`,
          type: "card",
          bounds: { x: bx, y: by, width: 180, height: 44 },
          zIndex: 1,
          style: { fillColor: btnStyles[i].fill, strokeColor: btnStyles[i].stroke, strokeWidth: 1, cornerRadius: btnStyles[i].radius },
        });
        elements.push({
          id: `p2-btn-txt-${i}`,
          name: `Button Text ${i}`,
          type: "text",
          bounds: { x: bx, y: by, width: 180, height: 44 },
          zIndex: 2,
          style: {},
          paragraphAlign: "center",
          verticalAlign: "center",
          textAutoResize: "NONE",
          textRuns: [{ text: `${btnStyles[i].name} 버튼`, fontSizePt: 12, fontWeight: 600, color: btnStyles[i].text, fontFamily: "Pretendard" }],
        });
      }

      // Input fields
      for (let k = 0; k < 3; k++) {
        const iy = 220 + k * 80;
        elements.push({
          id: `p2-in-lbl-${k}`,
          name: `Input Label ${k}`,
          type: "text",
          bounds: { x: 40, y: iy, width: 300, height: 20 },
          zIndex: 1,
          style: {},
          textAutoResize: "WIDTH_AND_HEIGHT",
          textRuns: [{ text: `입력 필드 레이블 ${k + 1}`, fontSizePt: 11, fontWeight: 500, color: "#374151", fontFamily: "Pretendard" }],
        });
        elements.push({
          id: `p2-in-box-${k}`,
          name: `Input Box ${k}`,
          type: "card",
          bounds: { x: 40, y: iy + 24, width: 400, height: 40 },
          zIndex: 1,
          style: { fillColor: "#FFFFFF", strokeColor: "#D1D5DB", strokeWidth: 1, cornerRadius: 6 },
        });
        elements.push({
          id: `p2-in-ph-${k}`,
          name: `Placeholder ${k}`,
          type: "text",
          bounds: { x: 52, y: iy + 24, width: 380, height: 40 },
          zIndex: 2,
          style: {},
          verticalAlign: "center",
          textAutoResize: "NONE",
          textRuns: [{ text: `내용을 입력하세요 (${k + 1})`, fontSizePt: 11, color: "#9CA3AF", fontFamily: "Pretendard" }],
        });
      }
    } else if (pageNum === 3) {
      // Desktop - 1 (A4 landscape card)
      elements.push({
        id: "p3-card-main",
        name: "Dashboard Card Container",
        type: "card",
        bounds: { x: 40, y: 40, width: w - 80, height: h - 80 },
        zIndex: 1,
        style: { fillColor: "#F8FAFC", strokeColor: "#E2E8F0", strokeWidth: 1 },
      });
      elements.push({
        id: "p3-card-title",
        name: "Desktop 1 View Header",
        type: "text",
        bounds: { x: 70, y: 70, width: 500, height: 32 },
        zIndex: 2,
        style: {},
        textAutoResize: "WIDTH_AND_HEIGHT",
        textRuns: [{ text: "대시보드 종합 현황 (Desktop - 1)", fontSizePt: 18, fontWeight: 700, color: "#0F172A", fontFamily: "Pretendard" }],
      });
    } else if (pageNum === 4) {
      // Desktop - 대시보드 (지도뷰)
      // Top nav
      elements.push({
        id: "p4-nav",
        name: "Top Navigation Bar",
        type: "card",
        bounds: { x: 0, y: 0, width: w, height: 60 },
        zIndex: 1,
        style: { fillColor: "#1E293B" },
      });
      elements.push({
        id: "p4-nav-logo",
        name: "Nav Logo Text",
        type: "text",
        bounds: { x: 30, y: 16, width: 250, height: 28 },
        zIndex: 2,
        style: {},
        textAutoResize: "WIDTH_AND_HEIGHT",
        textRuns: [{ text: "Pentech Facility Hub", fontSizePt: 14, fontWeight: 700, color: "#FFFFFF", fontFamily: "Pretendard" }],
      });
      // Sidebar
      elements.push({
        id: "p4-sidebar",
        name: "Left Sidebar",
        type: "card",
        bounds: { x: 0, y: 60, width: 260, height: h - 60 },
        zIndex: 1,
        style: { fillColor: "#F1F5F9", strokeColor: "#E2E8F0", strokeWidth: 1 },
      });
      // Map area
      elements.push({
        id: "p4-map",
        name: "Map View Area",
        type: "card",
        bounds: { x: 260, y: 60, width: w - 260, height: h - 60 },
        zIndex: 1,
        style: { fillColor: "#E2E8F0" },
      });
      // Map badges
      elements.push({
        id: "p4-map-badge",
        name: "Map Status Overlay Card",
        type: "card",
        bounds: { x: 290, y: 90, width: 320, height: 140 },
        zIndex: 2,
        style: { fillColor: "#FFFFFF", cornerRadius: 8, strokeColor: "#CBD5E1", strokeWidth: 1 },
      });
      elements.push({
        id: "p4-map-badge-title",
        name: "Map Badge Title",
        type: "text",
        bounds: { x: 310, y: 110, width: 280, height: 24 },
        zIndex: 3,
        style: {},
        textAutoResize: "WIDTH_AND_HEIGHT",
        textRuns: [{ text: "부산 해운대구 사업장 점검 현황", fontSizePt: 13, fontWeight: 700, color: "#0F172A", fontFamily: "Pretendard" }],
      });
    } else {
      // General structure for pages 5 through 17
      elements.push({
        id: `p${pageNum}-card-main`,
        name: `${frameName} Primary Container`,
        type: "card",
        bounds: { x: 20, y: 20, width: w - 40, height: h - 40 },
        zIndex: 1,
        style: {
          fillColor: "#FFFFFF",
          strokeColor: "#E2E8F0",
          strokeWidth: 1,
          cornerRadius: pageNum === 11 || pageNum === 13 ? 12 : 8,
        },
      });

      elements.push({
        id: `p${pageNum}-header-title`,
        name: `${frameName} Header Title`,
        type: "text",
        bounds: { x: 40, y: 40, width: Math.min(w - 80, 500), height: 30 },
        zIndex: 2,
        style: {},
        textAutoResize: "WIDTH_AND_HEIGHT",
        textRuns: [
          {
            text: `${frameName} (Page ${pageNum})`,
            fontSizePt: pageNum === 11 || pageNum === 13 ? 13 : 16,
            fontWeight: 700,
            color: "#1E293B",
            fontFamily: "Pretendard",
          },
        ],
      });

      // Add interactive/layout elements (buttons, tables, chips)
      elements.push({
        id: `p${pageNum}-btn-primary`,
        name: `Primary Action Button`,
        type: "card",
        bounds: { x: 40, y: h - 80, width: Math.min(140, w - 80), height: 38 },
        zIndex: 2,
        style: { fillColor: "#0066FF", cornerRadius: 6 },
      });
      elements.push({
        id: `p${pageNum}-btn-primary-txt`,
        name: `Primary Button Text`,
        type: "text",
        bounds: { x: 40, y: h - 80, width: Math.min(140, w - 80), height: 38 },
        zIndex: 3,
        style: {},
        paragraphAlign: "center",
        verticalAlign: "center",
        textAutoResize: "NONE",
        textRuns: [{ text: "확인 및 저장", fontSizePt: 11, fontWeight: 600, color: "#FFFFFF", fontFamily: "Pretendard" }],
      });
    }

    pages.push({
      pageIndex: pageNum - 1,
      name: frameName,
      bounds: { x: 0, y: 0, width: w, height: h },
      backgroundColor: "#FFFFFF",
      elements,
    });
  }

  return {
    title: "Phase 35 Fidelity Benchmark - 17 Frames",
    pageSize: {
      name: "Custom",
      widthPt: 1440,
      heightPt: 810,
      orientation: "landscape",
      unit: "pt",
    },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages,
    resources: {},
  };
}

