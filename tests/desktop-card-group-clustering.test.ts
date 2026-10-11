import { describe, it, expect } from "vitest";
import { LayoutEngine } from "../src/layout/layoutEngine.js";
import { FigmaParser } from "../src/parser/figmaParser.js";
import { FigmaNode } from "../src/parser/types.js";
import { ContainerElement } from "../src/model/index.js";

describe("Step 1: Desktop Card Group Horizontal Clustering vs Screen Isolation", () => {
  const layoutEngine = new LayoutEngine();
  const parser = new FigmaParser();

  it("Scenario 1: clusters 360x480px cards side-by-side in desktop frame into a horizontal row cluster", () => {
    const card1: FigmaNode = {
      id: "card-1",
      name: "Jeju Loft Card",
      type: "FRAME",
      absoluteBoundingBox: { x: 80, y: 100, width: 360, height: 480 },
      children: [
        { id: "c1-img", name: "Photo", type: "RECTANGLE", absoluteBoundingBox: { x: 80, y: 100, width: 360, height: 240 } },
        { id: "c1-title", name: "Title", type: "TEXT", characters: "제주 오션뷰 로프트", absoluteBoundingBox: { x: 100, y: 360, width: 320, height: 30 } },
      ],
    };

    const card2: FigmaNode = {
      id: "card-2",
      name: "Bali Hub Card",
      type: "FRAME",
      absoluteBoundingBox: { x: 480, y: 100, width: 360, height: 480 },
      children: [
        { id: "c2-img", name: "Photo", type: "RECTANGLE", absoluteBoundingBox: { x: 480, y: 100, width: 360, height: 240 } },
        { id: "c2-title", name: "Title", type: "TEXT", characters: "발리 디지털 노마드 허브", absoluteBoundingBox: { x: 500, y: 360, width: 320, height: 30 } },
      ],
    };

    const card3: FigmaNode = {
      id: "card-3",
      name: "Yangyang Card",
      type: "FRAME",
      absoluteBoundingBox: { x: 880, y: 100, width: 360, height: 480 },
      children: [
        { id: "c3-img", name: "Photo", type: "RECTANGLE", absoluteBoundingBox: { x: 880, y: 100, width: 360, height: 240 } },
        { id: "c3-title", name: "Title", type: "TEXT", characters: "양양 서퍼 작업 공간", absoluteBoundingBox: { x: 900, y: 360, width: 320, height: 30 } },
      ],
    };

    // Test direct LayoutEngine.clusterHorizontalRows
    const clustered = layoutEngine.clusterHorizontalRows([card1, card2, card3]);
    expect(clustered.length).toBe(1);
    expect((clustered[0] as any)._isRowCluster).toBe(true);
    expect(clustered[0].children?.length).toBe(3);
    expect((clustered[0] as any)._computedColumnWidths).toBeDefined();
    expect((clustered[0] as any)._computedColumnWidths).toHaveLength(3);

    // Test full parser on desktop frame containing these 3 cards
    const desktopFrame: FigmaNode = {
      id: "desktop-features",
      name: "Recommendation Section",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 700 },
      children: [card1, card2, card3],
    };

    const parsed = parser.parse(desktopFrame);
    const elements = parsed.document.sections[0].elements;
    expect(elements.length).toBe(1);

    const rootContainer = elements[0] as ContainerElement;
    expect(rootContainer.type).toBe("container");
    const rowCluster = rootContainer.children.find(
      (c: any) => c.type === "container" && c.layoutDirection === "horizontal"
    ) as ContainerElement;
    expect(rowCluster).toBeDefined();
    expect(rowCluster.children.length).toBe(3);
  });

  it("Scenario 2: preserves defensive guard preventing 375x812px mobile fullscreen screens from clustering into a row", () => {
    const mobileScreenA: FigmaNode = {
      id: "screen-a",
      name: "Mobile Screen A",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
      children: [{ id: "t-a", name: "T", type: "TEXT", characters: "Screen A" }],
    };

    const mobileScreenB: FigmaNode = {
      id: "screen-b",
      name: "Mobile Screen B",
      type: "FRAME",
      absoluteBoundingBox: { x: 450, y: 0, width: 375, height: 812 },
      children: [{ id: "t-b", name: "T", type: "TEXT", characters: "Screen B" }],
    };

    // LayoutEngine must NOT cluster full-sized mobile screens into a single row table
    const clustered = layoutEngine.clusterHorizontalRows([mobileScreenA, mobileScreenB]);
    expect(clustered.length).toBe(2);
    expect((clustered[0] as any)._isRowCluster).toBeUndefined();
    expect((clustered[1] as any)._isRowCluster).toBeUndefined();
  });

  it("Scenario 3: preserves clustering for standard comparison cards (340x260px)", () => {
    const cardA: FigmaNode = {
      id: "card-a",
      name: "Card A",
      type: "FRAME",
      absoluteBoundingBox: { x: 40, y: 50, width: 340, height: 260 },
      children: [{ id: "t-a", name: "T", type: "TEXT", characters: "Plan A" }],
    };

    const cardB: FigmaNode = {
      id: "card-b",
      name: "Card B",
      type: "FRAME",
      absoluteBoundingBox: { x: 420, y: 50, width: 340, height: 260 },
      children: [{ id: "t-b", name: "T", type: "TEXT", characters: "Plan B" }],
    };

    const clustered = layoutEngine.clusterHorizontalRows([cardA, cardB]);
    expect(clustered.length).toBe(1);
    expect((clustered[0] as any)._isRowCluster).toBe(true);
    expect(clustered[0].children?.length).toBe(2);
  });

  it("Scenario 4: clusters tall desktop cards (360x550px) into horizontal row", () => {
    const card1: FigmaNode = {
      id: "tall-card-1",
      name: "Tall Card 1",
      type: "FRAME",
      absoluteBoundingBox: { x: 80, y: 100, width: 360, height: 550 },
      children: [{ id: "t1", name: "T", type: "TEXT", characters: "Tall Card 1" }],
    };

    const card2: FigmaNode = {
      id: "tall-card-2",
      name: "Tall Card 2",
      type: "FRAME",
      absoluteBoundingBox: { x: 480, y: 100, width: 360, height: 550 },
      children: [{ id: "t2", name: "T", type: "TEXT", characters: "Tall Card 2" }],
    };

    const clustered = layoutEngine.clusterHorizontalRows([card1, card2]);
    expect(clustered.length).toBe(1);
    expect((clustered[0] as any)._isRowCluster).toBe(true);
    expect(clustered[0].children?.length).toBe(2);
  });
});
