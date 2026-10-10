import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/index.js";
import { FigmaNode } from "../src/parser/types.js";
import { PageBreakElement } from "../src/model/elements.js";

describe("Step 2-C: Desktop Screen Separation False Positive Diagnostic", () => {
  const parser = new FigmaParser();

  // Scenario A: 일반적인 대형 데스크톱 Hero 섹션 (Typical large desktop Hero section)
  describe("Scenario A: Large Desktop Landing Page & Hero Section", () => {
    // A-1: A desktop landing page artboard (1440x3000) containing Hero, Features, Pricing sections
    it("Scenario A-1: observes whether a continuous desktop landing page is split into separate screens", () => {
      const desktopLandingPageCanvas: FigmaNode = {
        id: "canvas-desktop",
        name: "Desktop Landing Page Canvas",
        type: "CANVAS",
        children: [
          {
            id: "frame-landing-page",
            name: "Landing Page Container",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 2500 },
            children: [
              {
                id: "sec-hero",
                name: "Hero Section",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 700 }, // aspect 700/1440 = 0.486
                children: [
                  {
                    id: "text-hero-title",
                    name: "Hero Title",
                    type: "TEXT",
                    characters: "혁신적인 금융 솔루션을 만나보세요",
                    style: { fontSize: 36 },
                  },
                ],
              },
              {
                id: "sec-features",
                name: "Features Section",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 700, width: 1440, height: 800 }, // aspect 800/1440 = 0.555
                children: [
                  {
                    id: "text-feat-title",
                    name: "Features Title",
                    type: "TEXT",
                    characters: "주요 핵심 기능 안내",
                    style: { fontSize: 28 },
                  },
                ],
              },
              {
                id: "sec-pricing",
                name: "Pricing Section",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 1500, width: 1440, height: 900 }, // aspect 900/1440 = 0.625
                children: [
                  {
                    id: "text-pricing-title",
                    name: "Pricing Title",
                    type: "TEXT",
                    characters: "합리적인 요금제 플랜",
                    style: { fontSize: 28 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = parser.parse(desktopLandingPageCanvas);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      // Verified: Landing page container is preserved intact without being unwrapped into separate pages
      expect(pageBreaks.length).toBe(0);
      expect(elements.length).toBe(1);
    });

    // A-2: A single wide hero banner with height < 400 or aspect < 0.4
    it("Scenario A-2: wide shallow hero banner (aspect < 0.4) is not classified as a screen", () => {
      const shallowHeroCanvas: FigmaNode = {
        id: "canvas-shallow",
        name: "Shallow Hero Canvas",
        type: "CANVAS",
        children: [
          {
            id: "banner-hero",
            name: "Wide Hero Banner",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 350 }, // height < 400, aspect 0.243 < 0.4
            children: [
              {
                id: "banner-text",
                name: "Banner Text",
                type: "TEXT",
                characters: "봄맞이 특별 이벤트 배너",
                style: { fontSize: 24 },
              },
            ],
          },
          {
            id: "banner-content",
            name: "Body Content Frame",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 380, width: 1440, height: 500 },
            children: [
              {
                id: "body-text",
                name: "Body Text",
                type: "TEXT",
                characters: "이벤트 상세 내용",
                style: { fontSize: 16 },
              },
            ],
          },
        ],
      };

      const result = parser.parse(shallowHeroCanvas);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      // Banner height 350 < 400 -> isScreenCandidate is FALSE
      // Therefore screenCandidates has at most 1 element -> isMultiScreen is FALSE
      // No PageBreaks inserted! Continuous document flow!
      expect(pageBreaks.length).toBe(0);
    });
  });

  // Scenario B: 가격 비교 또는 기능 비교 섹션 (Comparison section)
  describe("Scenario B: Feature / Price Comparison Section", () => {
    it("Scenario B-1: desktop comparison section with 3 column cards (width 360, height 400)", () => {
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
                id: "card-basic",
                name: "Basic Plan Card",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 50, width: 360, height: 400 }, // aspect 400/360 = 1.11, width <= 500, height >= 320
                children: [
                  { id: "t-b1", name: "T", type: "TEXT", characters: "베이직 플랜: 월 9,900원", style: { fontSize: 16 } },
                ],
              },
              {
                id: "card-pro",
                name: "Pro Plan Card",
                type: "FRAME",
                absoluteBoundingBox: { x: 400, y: 50, width: 360, height: 400 },
                children: [
                  { id: "t-p1", name: "T", type: "TEXT", characters: "프로 플랜: 월 29,900원", style: { fontSize: 16 } },
                ],
              },
              {
                id: "card-enterprise",
                name: "Enterprise Plan Card",
                type: "FRAME",
                absoluteBoundingBox: { x: 800, y: 50, width: 360, height: 400 },
                children: [
                  { id: "t-e1", name: "T", type: "TEXT", characters: "엔터프라이즈: 문의", style: { fontSize: 16 } },
                ],
              },
            ],
          },
        ],
      };

      const result = parser.parse(comparisonCanvas);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      // Verified: Comparison section with 3 column cards stays intact as a single container
      expect(pageBreaks.length).toBe(0);
      expect(elements.length).toBe(1);
    });
  });

  // Scenario C: 카드 여러 개를 포함하는 일반 컨테이너 (General container with multiple cards)
  describe("Scenario C: General Container with Multiple Cards", () => {
    it("Scenario C-1: small cards (height < 320) do NOT trigger unwrapArtboardGroups", () => {
      const smallCardsCanvas: FigmaNode = {
        id: "canvas-small-cards",
        name: "Small Cards Canvas",
        type: "CANVAS",
        children: [
          {
            id: "card-grid",
            name: "Card Grid Frame",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 1000, height: 260 },
            children: [
              {
                id: "card-1",
                name: "Card 1",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 200 }, // height 200 < 240 -> not a screen
                children: [{ id: "t1", name: "T", type: "TEXT", characters: "카드 1 내용", style: { fontSize: 14 } }],
              },
              {
                id: "card-2",
                name: "Card 2",
                type: "FRAME",
                absoluteBoundingBox: { x: 340, y: 0, width: 300, height: 200 },
                children: [{ id: "t2", name: "T", type: "TEXT", characters: "카드 2 내용", style: { fontSize: 14 } }],
              },
            ],
          },
        ],
      };

      const result = parser.parse(smallCardsCanvas);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      // No unwrap, no page breaks
      expect(pageBreaks.length).toBe(0);
    });

    it("Scenario C-2: tall cards (height 360 >= 320, aspect 1.0) do NOT trigger false-positive screen unwrap", () => {
      const tallCardsCanvas: FigmaNode = {
        id: "canvas-tall-cards",
        name: "Tall Cards Canvas",
        type: "CANVAS",
        children: [
          {
            id: "card-container",
            name: "Card Container",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 1000, height: 450 },
            children: [
              {
                id: "tall-card-1",
                name: "Tall Card 1",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 350, height: 360 }, // width <= 500, height >= 320, aspect = 360/350 = 1.02 >= 0.7
                children: [{ id: "t1", name: "T", type: "TEXT", characters: "높은 카드 1", style: { fontSize: 14 } }],
              },
              {
                id: "tall-card-2",
                name: "Tall Card 2",
                type: "FRAME",
                absoluteBoundingBox: { x: 400, y: 0, width: 350, height: 360 },
                children: [{ id: "t2", name: "T", type: "TEXT", characters: "높은 카드 2", style: { fontSize: 14 } }],
              },
            ],
          },
        ],
      };

      const result = parser.parse(tallCardsCanvas);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      // Verified: Card container with tall cards is preserved intact without false-positive screen separation
      expect(pageBreaks.length).toBe(0);
      expect(elements.length).toBe(1);
    });
  });

  // Scenario D: 한 부모 아래에 실제 독립 화면 여러 개가 배치된 경우 (Multiple actual independent screens under one parent)
  describe("Scenario D: Legitimate Multi-Screen Flow under Single Parent", () => {
    it("Scenario D-1: correctly unwraps flow section and inserts page break between screens", () => {
      const flowSectionCanvas: FigmaNode = {
        id: "canvas-flow",
        name: "Onboarding Flow Canvas",
        type: "CANVAS",
        children: [
          {
            id: "flow-group",
            name: "Onboarding Flow Group",
            type: "SECTION",
            absoluteBoundingBox: { x: 0, y: 0, width: 900, height: 900 },
            children: [
              {
                id: "screen-step-1",
                name: "Step 1 Screen",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
                children: [{ id: "t-s1", name: "T", type: "TEXT", characters: "온보딩 1단계", style: { fontSize: 20 } }],
              },
              {
                id: "screen-step-2",
                name: "Step 2 Screen",
                type: "FRAME",
                absoluteBoundingBox: { x: 450, y: 0, width: 375, height: 812 },
                children: [{ id: "t-s2", name: "T", type: "TEXT", characters: "온보딩 2단계", style: { fontSize: 20 } }],
              },
            ],
          },
        ],
      };

      const result = parser.parse(flowSectionCanvas);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      // Correct behavior: 2 independent screens separated by 1 page break
      expect(pageBreaks.length).toBe(1);
      expect((pageBreaks[0] as PageBreakElement).id).toBe("pb-screen-step-2");
      expect(elements.length).toBe(3); // [Screen 1 Container, PageBreak, Screen 2 Container]
    });
  });

  // Scenario E: 기존 모바일 화면 분리 동작이 유지되는 경우 (Mobile multi-screen isolation preserved)
  describe("Scenario E: Existing Mobile Multi-Screen Isolation Preserved", () => {
    it("Scenario E-1: top-level side-by-side mobile screens preserve page break", () => {
      const mobileCanvas: FigmaNode = {
        id: "canvas-mobile",
        name: "Mobile Flow",
        type: "CANVAS",
        children: [
          {
            id: "screen-login",
            name: "Login Screen",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
            children: [{ id: "t-l", name: "T", type: "TEXT", characters: "로그인", style: { fontSize: 20 } }],
          },
          {
            id: "screen-home",
            name: "Home Screen",
            type: "FRAME",
            absoluteBoundingBox: { x: 450, y: 0, width: 375, height: 812 },
            children: [{ id: "t-h", name: "T", type: "TEXT", characters: "홈 대시보드", style: { fontSize: 20 } }],
          },
        ],
      };

      const result = parser.parse(mobileCanvas);
      const elements = result.document.sections[0].elements;
      const pageBreaks = elements.filter((e) => e.type === "page_break");

      expect(pageBreaks.length).toBe(1);
      expect((pageBreaks[0] as PageBreakElement).id).toBe("pb-screen-home");
      expect(elements.length).toBe(3);
    });
  });
});

