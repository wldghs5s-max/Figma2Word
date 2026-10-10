import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/index.js";
import { FigmaNode } from "../src/parser/types.js";
import { PageBreakElement } from "../src/model/elements.js";

describe("Step 2-D.1: Desktop Multi-Page Separation & Regression Verification", () => {
  const parser = new FigmaParser();

  // Scenario A: 서로 다른 데스크톱 페이지 2개가 캔버스에 좌우 배치됨
  describe("Scenario A: Two Distinct Desktop Pages Side-by-Side on Canvas", () => {
    it("recognizes two top-level desktop pages (1440x2500 each) as independent screens and inserts 1 PageBreak", () => {
      const twoDesktopPagesCanvas: FigmaNode = {
        id: "canvas-two-desktop",
        name: "Two Desktop Pages Canvas",
        type: "CANVAS",
        children: [
          {
            id: "desktop-page-1",
            name: "Main Landing Page",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 2500 },
            children: [
              {
                id: "p1-hero",
                name: "Hero Section",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 700 },
                children: [
                  { id: "t1", name: "Title", type: "TEXT", characters: "메인 페이지 히어로", style: { fontSize: 32 } },
                ],
              },
              {
                id: "p1-features",
                name: "Features Section",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 700, width: 1440, height: 900 },
                children: [
                  { id: "t2", name: "Desc", type: "TEXT", characters: "메인 페이지 기능 안내", style: { fontSize: 16 } },
                ],
              },
            ],
          },
          {
            id: "desktop-page-2",
            name: "Admin Dashboard Page",
            type: "FRAME",
            absoluteBoundingBox: { x: 1600, y: 0, width: 1440, height: 2500 },
            children: [
              {
                id: "p2-header",
                name: "Admin Header",
                type: "FRAME",
                absoluteBoundingBox: { x: 1600, y: 0, width: 1440, height: 700 },
                children: [
                  { id: "t3", name: "Admin Title", type: "TEXT", characters: "관리자 대시보드", style: { fontSize: 32 } },
                ],
              },
              {
                id: "p2-analytics",
                name: "Analytics Section",
                type: "FRAME",
                absoluteBoundingBox: { x: 1600, y: 700, width: 1440, height: 900 },
                children: [
                  { id: "t4", name: "Stats", type: "TEXT", characters: "통계 및 분석 지표", style: { fontSize: 16 } },
                ],
              },
            ],
          },
        ],
      };

      const result = parser.parse(twoDesktopPagesCanvas);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      // Verified:
      // 1. Exactly 2 independent desktop screens recognized
      // 2. Exactly 1 PageBreak separating page 1 and page 2
      // 3. Elements structure: [Page 1 Container, PageBreak, Page 2 Container]
      expect(pageBreaks.length).toBe(1);
      expect((pageBreaks[0] as PageBreakElement).id).toBe("pb-desktop-page-2");
      expect(elements.length).toBe(3);
      expect(elements[0].type).toBe("container");
      expect(elements[1].type).toBe("page_break");
      expect(elements[2].type).toBe("container");
    });
  });

  // Scenario B: SECTION 내부에 서로 다른 데스크톱 페이지 2개가 배치됨
  describe("Scenario B: Two Distinct Desktop Pages inside a SECTION", () => {
    it("correctly unwraps Figma SECTION holding two 1440x2500 desktop pages and separates them with 1 PageBreak", () => {
      const desktopSectionCanvas: FigmaNode = {
        id: "canvas-section-desktop",
        name: "Desktop Flow Section Canvas",
        type: "CANVAS",
        children: [
          {
            id: "desktop-flow-section",
            name: "Desktop Web Flow Group",
            type: "SECTION",
            absoluteBoundingBox: { x: 0, y: 0, width: 3200, height: 2600 },
            children: [
              {
                id: "sec-page-landing",
                name: "Landing Page",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 50, width: 1440, height: 2500 },
                children: [
                  {
                    id: "sec-p1-hero",
                    name: "Hero Section",
                    type: "FRAME",
                    absoluteBoundingBox: { x: 0, y: 50, width: 1440, height: 700 },
                    children: [
                      { id: "st1", name: "T", type: "TEXT", characters: "소개 페이지", style: { fontSize: 28 } },
                    ],
                  },
                ],
              },
              {
                id: "sec-page-pricing",
                name: "Full Pricing Page",
                type: "FRAME",
                absoluteBoundingBox: { x: 1600, y: 50, width: 1440, height: 2500 },
                children: [
                  {
                    id: "sec-p2-hero",
                    name: "Pricing Hero",
                    type: "FRAME",
                    absoluteBoundingBox: { x: 1600, y: 50, width: 1440, height: 700 },
                    children: [
                      { id: "st2", name: "T", type: "TEXT", characters: "요금제 상세 페이지", style: { fontSize: 28 } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = parser.parse(desktopSectionCanvas);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      // Verified:
      // SECTION is properly unwrapped because it holds two full-sized desktop screens (1440x2500 each)
      // and separates them with 1 PageBreak
      expect(pageBreaks.length).toBe(1);
      expect((pageBreaks[0] as PageBreakElement).id).toBe("pb-sec-page-pricing");
      expect(elements.length).toBe(3);
    });
  });

  // Scenario C: 기존 오탐 방지 테스트 재검증
  describe("Scenario C: False-Positive Prevention Re-verification", () => {
    it("keeps single desktop landing page sections continuous (0 PageBreak)", () => {
      const singleLandingPage: FigmaNode = {
        id: "canvas-single-desktop",
        name: "Single Landing Page",
        type: "CANVAS",
        children: [
          {
            id: "frame-landing",
            name: "Landing Page",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 2400 },
            children: [
              {
                id: "sec-1",
                name: "Hero",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 700 },
                children: [{ id: "t-1", name: "T", type: "TEXT", characters: "Hero" }],
              },
              {
                id: "sec-2",
                name: "Features",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 700, width: 1440, height: 800 },
                children: [{ id: "t-2", name: "T", type: "TEXT", characters: "Features" }],
              },
              {
                id: "sec-3",
                name: "Pricing",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 1500, width: 1440, height: 900 },
                children: [{ id: "t-3", name: "T", type: "TEXT", characters: "Pricing" }],
              },
            ],
          },
        ],
      };

      const result = parser.parse(singleLandingPage);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      expect(pageBreaks.length).toBe(0);
      expect(elements.length).toBe(1);
    });

    it("keeps horizontal 3-column 360x400 comparison cards continuous (0 PageBreak)", () => {
      const comparisonCanvas: FigmaNode = {
        id: "canvas-comparison",
        name: "Comparison Canvas",
        type: "CANVAS",
        children: [
          {
            id: "sec-comparison",
            name: "Pricing Comparison Section",
            type: "FRAME",
            layoutMode: "HORIZONTAL",
            absoluteBoundingBox: { x: 0, y: 0, width: 1200, height: 500 },
            children: [
              {
                id: "card-1",
                name: "Basic",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 50, width: 360, height: 400 },
                children: [{ id: "ct1", name: "T", type: "TEXT", characters: "기본 플랜" }],
              },
              {
                id: "card-2",
                name: "Pro",
                type: "FRAME",
                absoluteBoundingBox: { x: 400, y: 50, width: 360, height: 400 },
                children: [{ id: "ct2", name: "T", type: "TEXT", characters: "프로 플랜" }],
              },
              {
                id: "card-3",
                name: "Enterprise",
                type: "FRAME",
                absoluteBoundingBox: { x: 800, y: 50, width: 360, height: 400 },
                children: [{ id: "ct3", name: "T", type: "TEXT", characters: "기업 플랜" }],
              },
            ],
          },
        ],
      };

      const result = parser.parse(comparisonCanvas);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      expect(pageBreaks.length).toBe(0);
      expect(elements.length).toBe(1);
    });
  });

  // Scenario D: 모바일 화면 및 Screen 36 정상 분리 유지 재확인
  describe("Scenario D: Mobile & Screen 36 Isolation Preservation", () => {
    it("preserves page break between two canvas-level mobile screens (375x812)", () => {
      const mobileCanvas: FigmaNode = {
        id: "canvas-mobile",
        name: "Mobile Screens",
        type: "CANVAS",
        children: [
          {
            id: "m-screen-1",
            name: "Mobile 1",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
            children: [{ id: "mt1", name: "T", type: "TEXT", characters: "모바일 화면 1" }],
          },
          {
            id: "m-screen-2",
            name: "Mobile 2",
            type: "FRAME",
            absoluteBoundingBox: { x: 450, y: 0, width: 375, height: 812 },
            children: [{ id: "mt2", name: "T", type: "TEXT", characters: "모바일 화면 2" }],
          },
        ],
      };

      const result = parser.parse(mobileCanvas);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      expect(pageBreaks.length).toBe(1);
      expect((pageBreaks[0] as PageBreakElement).id).toBe("pb-m-screen-2");
      expect(elements.length).toBe(3);
    });

    it("preserves unwrap and page break for two mobile screens inside a SECTION", () => {
      const mobileSectionCanvas: FigmaNode = {
        id: "canvas-mobile-sec",
        name: "Mobile Section Canvas",
        type: "CANVAS",
        children: [
          {
            id: "mobile-section",
            name: "Mobile Flow Group",
            type: "SECTION",
            absoluteBoundingBox: { x: 0, y: 0, width: 900, height: 900 },
            children: [
              {
                id: "sec-m1",
                name: "Step 1",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
                children: [{ id: "smt1", name: "T", type: "TEXT", characters: "단계 1" }],
              },
              {
                id: "sec-m2",
                name: "Step 2",
                type: "FRAME",
                absoluteBoundingBox: { x: 450, y: 0, width: 375, height: 812 },
                children: [{ id: "smt2", name: "T", type: "TEXT", characters: "단계 2" }],
              },
            ],
          },
        ],
      };

      const result = parser.parse(mobileSectionCanvas);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      expect(pageBreaks.length).toBe(1);
      expect((pageBreaks[0] as PageBreakElement).id).toBe("pb-sec-m2");
      expect(elements.length).toBe(3);
    });
  });
});

