import { describe, it, expect } from "vitest";
import { LayoutEngine } from "../src/layout/layoutEngine.js";
import { FigmaParser } from "../src/parser/figmaParser.js";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import { FigmaNode } from "../src/parser/types.js";
import { ContainerElement } from "../src/model/index.js";

describe("Step 6B: Parent-Context Row Cluster & Desktop Multi-Column Restoration", () => {
  const engine = new LayoutEngine();
  const parser = new FigmaParser();

  // Scenario 1: 동일 Y좌표의 좌우 카드
  it("Scenario 1: clusters standard side-by-side cards with same Y", () => {
    const card1: FigmaNode = {
      id: "card-1",
      name: "Card 1",
      type: "FRAME",
      absoluteBoundingBox: { x: 80, y: 100, width: 400, height: 300 },
      children: [{ id: "t1", name: "T1", type: "TEXT", characters: "Card 1 Content" }],
    };
    const card2: FigmaNode = {
      id: "card-2",
      name: "Card 2",
      type: "FRAME",
      absoluteBoundingBox: { x: 520, y: 100, width: 400, height: 300 },
      children: [{ id: "t2", name: "T2", type: "TEXT", characters: "Card 2 Content" }],
    };

    const clustered = engine.clusterHorizontalRows([card1, card2]);
    expect(clustered.length).toBe(1);
    expect((clustered[0] as any)._isRowCluster).toBe(true);
    expect(clustered[0].children?.length).toBe(2);
  });

  // Scenario 2: Y좌표가 30~50px 다른 비대칭 카드
  it("Scenario 2: clusters horizontally adjacent cards with vertical offset (diff = 40px)", () => {
    const card1: FigmaNode = {
      id: "card-offset-1",
      name: "Card 1",
      type: "FRAME",
      absoluteBoundingBox: { x: 80, y: 100, width: 400, height: 300 },
      children: [{ id: "t1", name: "T1", type: "TEXT", characters: "Card 1" }],
    };
    const card2: FigmaNode = {
      id: "card-offset-2",
      name: "Card 2",
      type: "FRAME",
      absoluteBoundingBox: { x: 520, y: 140, width: 400, height: 300 }, // Y offset 40px, overlap 260px
      children: [{ id: "t2", name: "T2", type: "TEXT", characters: "Card 2" }],
    };

    const clustered = engine.clusterHorizontalRows([card1, card2]);
    expect(clustered.length).toBe(1);
    expect((clustered[0] as any)._isRowCluster).toBe(true);
    expect(clustered[0].children?.length).toBe(2);
  });

  // Scenario 3: 높이가 다른 좌우 카드
  it("Scenario 3: clusters cards with different heights sharing a vertical band", () => {
    const cardTall: FigmaNode = {
      id: "card-tall",
      name: "Tall Card",
      type: "FRAME",
      absoluteBoundingBox: { x: 80, y: 100, width: 400, height: 450 },
      children: [{ id: "t1", name: "T1", type: "TEXT", characters: "Tall Content" }],
    };
    const cardShort: FigmaNode = {
      id: "card-short",
      name: "Short Card",
      type: "FRAME",
      absoluteBoundingBox: { x: 520, y: 100, width: 400, height: 220 },
      children: [{ id: "t2", name: "T2", type: "TEXT", characters: "Short Content" }],
    };

    const clustered = engine.clusterHorizontalRows([cardTall, cardShort]);
    expect(clustered.length).toBe(1);
    expect((clustered[0] as any)._isRowCluster).toBe(true);
    expect(clustered[0].children?.length).toBe(2);
  });

  // Scenario 4: 실제로 위아래에 있는 독립 카드 (수직 분리 유지)
  it("Scenario 4: preserves vertical sequential separation for truly stacked cards", () => {
    const cardTop: FigmaNode = {
      id: "card-top",
      name: "Top Card",
      type: "FRAME",
      absoluteBoundingBox: { x: 80, y: 100, width: 800, height: 250 },
      children: [{ id: "t1", name: "T1", type: "TEXT", characters: "Top Content" }],
    };
    const cardBottom: FigmaNode = {
      id: "card-bottom",
      name: "Bottom Card",
      type: "FRAME",
      absoluteBoundingBox: { x: 80, y: 380, width: 800, height: 250 }, // Clearly below cardTop
      children: [{ id: "t2", name: "T2", type: "TEXT", characters: "Bottom Content" }],
    };

    const clustered = engine.clusterHorizontalRows([cardTop, cardBottom]);
    expect(clustered.length).toBe(2);
    expect((clustered[0] as any)._isRowCluster).toBeUndefined();
    expect((clustered[1] as any)._isRowCluster).toBeUndefined();
  });

  // Scenario 5: 375x812 모바일 독립 전체화면 (격리 유지)
  it("Scenario 5: preserves strict isolation for 375x812px mobile fullscreen artboards at canvas level", () => {
    const mobileScreenA: FigmaNode = {
      id: "screen-a",
      name: "Mobile Screen A",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
      children: [{ id: "t1", name: "T1", type: "TEXT", characters: "Screen A" }],
    };
    const mobileScreenB: FigmaNode = {
      id: "screen-b",
      name: "Mobile Screen B",
      type: "FRAME",
      absoluteBoundingBox: { x: 450, y: 0, width: 375, height: 812 },
      children: [{ id: "t2", name: "T2", type: "TEXT", characters: "Screen B" }],
    };

    // Without a desktop parent, top-level mobile screens must NOT cluster
    const clustered = engine.clusterHorizontalRows([mobileScreenA, mobileScreenB]);
    expect(clustered.length).toBe(2);
    expect((clustered[0] as any)._isRowCluster).toBeUndefined();
    expect((clustered[1] as any)._isRowCluster).toBeUndefined();
  });

  // Scenario 6: 1440px 데스크톱 프레임 내부의 620x550px 본문과 280x600px 사이드바
  it("Scenario 6: clusters 280x600px sidebar and 620x550px body within 1440px desktop frame", () => {
    const desktopParent: FigmaNode = {
      id: "desktop-dashboard",
      name: "Dashboard Frame",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
      children: [],
    };

    const sidebar: FigmaNode = {
      id: "sidebar",
      name: "Nav Sidebar",
      type: "FRAME",
      absoluteBoundingBox: { x: 80, y: 100, width: 280, height: 600 },
      children: [{ id: "t-sb", name: "T", type: "TEXT", characters: "설정 메뉴 목록" }],
    };

    const bodyContent: FigmaNode = {
      id: "body-panel",
      name: "Main Body Panel",
      type: "FRAME",
      absoluteBoundingBox: { x: 380, y: 100, width: 620, height: 550 },
      children: [{ id: "t-body", name: "T", type: "TEXT", characters: "계정 상세 정보 및 프로필" }],
    };

    desktopParent.children = [sidebar, bodyContent];

    // Engine with parent context should cluster them
    const clustered = engine.clusterHorizontalRows([sidebar, bodyContent], desktopParent);
    expect(clustered.length).toBe(1);
    expect((clustered[0] as any)._isRowCluster).toBe(true);
    expect(clustered[0].children?.length).toBe(2);

    // Full parser test: Verify internal document model puts them in a horizontal container
    const parsed = parser.parse(desktopParent);
    const elements = parsed.document.sections[0].elements;
    expect(elements.length).toBe(1);

    const root = elements[0] as ContainerElement;
    expect(root.type).toBe("container");
    const rowCluster = root.children.find(
      (c: any) => c.type === "container" && c.layoutDirection === "horizontal"
    ) as ContainerElement;
    expect(rowCluster).toBeDefined();
    expect(rowCluster.children.length).toBe(2);
  });

  // Scenario 7: 기존 정상 3열 카드
  it("Scenario 7: preserves 3-column cards grid clustering (360x480 each)", () => {
    const c1: FigmaNode = { id: "c1", name: "C1", type: "FRAME", absoluteBoundingBox: { x: 0, y: 50, width: 360, height: 480 }, children: [{ id: "t1", name: "T", type: "TEXT", characters: "Plan 1" }] };
    const c2: FigmaNode = { id: "c2", name: "C2", type: "FRAME", absoluteBoundingBox: { x: 400, y: 50, width: 360, height: 480 }, children: [{ id: "t2", name: "T", type: "TEXT", characters: "Plan 2" }] };
    const c3: FigmaNode = { id: "c3", name: "C3", type: "FRAME", absoluteBoundingBox: { x: 800, y: 50, width: 360, height: 480 }, children: [{ id: "t3", name: "T", type: "TEXT", characters: "Plan 3" }] };

    const clustered = engine.clusterHorizontalRows([c1, c2, c3]);
    expect(clustered.length).toBe(1);
    expect((clustered[0] as any)._isRowCluster).toBe(true);
    expect(clustered[0].children?.length).toBe(3);
  });

  // Scenario 8: Spacer 및 고정 폭 아이콘 컬럼
  it("Scenario 8: clusters icon column (40x40) + text column (300x40) horizontally", () => {
    const icon: FigmaNode = {
      id: "icon-col",
      name: "Check Icon",
      type: "FRAME",
      absoluteBoundingBox: { x: 40, y: 50, width: 40, height: 40 },
      children: [],
    };
    const label: FigmaNode = {
      id: "label-col",
      name: "Label Text",
      type: "TEXT",
      characters: "인증 완료 상태입니다.",
      absoluteBoundingBox: { x: 90, y: 50, width: 300, height: 40 },
    };

    const clustered = engine.clusterHorizontalRows([icon, label]);
    expect(clustered.length).toBe(1);
    expect((clustered[0] as any)._isRowCluster).toBe(true);
    expect(clustered[0].children?.length).toBe(2);
  });

  // Scenario 9: 1440px 데스크톱 부모 안의 두 모바일 목업 (2-column layout in desktop feature section)
  it("Scenario 9: clusters two 375x812 mobile app mockups side-by-side inside a 1440px desktop section", () => {
    const desktopFeatureSection: FigmaNode = {
      id: "sec-mockups",
      name: "Mobile App Feature Section",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 950 },
      children: [],
    };

    const iosMockup: FigmaNode = {
      id: "mockup-ios",
      name: "iOS Preview",
      type: "FRAME",
      absoluteBoundingBox: { x: 250, y: 80, width: 375, height: 812 },
      children: [{ id: "t-ios", name: "T", type: "TEXT", characters: "iOS Preview" }],
    };

    const androidMockup: FigmaNode = {
      id: "mockup-android",
      name: "Android Preview",
      type: "FRAME",
      absoluteBoundingBox: { x: 750, y: 80, width: 375, height: 812 },
      children: [{ id: "t-and", name: "T", type: "TEXT", characters: "Android Preview" }],
    };

    desktopFeatureSection.children = [iosMockup, androidMockup];

    const clustered = engine.clusterHorizontalRows([iosMockup, androidMockup], desktopFeatureSection);
    expect(clustered.length).toBe(1);
    expect((clustered[0] as any)._isRowCluster).toBe(true);
    expect(clustered[0].children?.length).toBe(2);
  });

  // Scenario 10: 4개의 큐레이션 추천 카드 (280px 각 4개) -> 4열 Row Cluster 및 컬럼 비율 [25, 25, 25, 25]
  it("Scenario 10: clusters 4 curation recommendation cards into a 4-column row cluster and renders to DOCX", async () => {
    const parentSection: FigmaNode = {
      id: "curation-sec",
      name: "Curation Section",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 600 },
      children: [],
    };

    const cardNames = ["개발자를 위한 낙원", "몰입을 위한 은신처", "해변가", "도심의 활기"];
    const cards: FigmaNode[] = cardNames.map((name, i) => ({
      id: `card-${i + 1}`,
      name: `${name} 카드`,
      type: "FRAME",
      absoluteBoundingBox: { x: 80 + i * 300, y: 100, width: 280, height: 360 },
      children: [
        { id: `img-${i}`, name: "썸네일", type: "RECTANGLE", absoluteBoundingBox: { x: 80 + i * 300, y: 100, width: 280, height: 180 } },
        { id: `t-title-${i}`, name: "제목", type: "TEXT", characters: name, absoluteBoundingBox: { x: 96 + i * 300, y: 290, width: 248, height: 28 }, style: { fontSize: 16, fontWeight: 700 } },
      ],
    }));

    parentSection.children = cards;

    const parsed = parser.parse(parentSection);
    const elements = parsed.document.sections[0].elements;
    expect(elements.length).toBe(1);

    const root = elements[0] as ContainerElement;
    expect(root.type).toBe("container");

    const row = root.children.find(
      (c: any) => c.type === "container" && c.layoutDirection === "horizontal"
    ) as ContainerElement;
    expect(row).toBeDefined();
    expect(row.children.length).toBe(4);
    expect(row.columnWidths).toEqual([25, 25, 25, 25]);

    const renderer = new DocxRenderer();
    const docxBuf = await renderer.renderToBuffer(parsed.document);
    expect(docxBuf.length).toBeGreaterThan(1000);
  });

  // Scenario 11: 마이페이지 사이드바(280px) + 설정 폼(720px) -> 2열 Row Cluster 및 컬럼 비율 [28, 72]
  it("Scenario 11: clusters sidebar (280px) and setting form (720px) into a 2-column row cluster with [28, 72] ratio", async () => {
    const parentPage: FigmaNode = {
      id: "settings-page",
      name: "Account Settings Page",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 800 },
      children: [],
    };

    const sidebar: FigmaNode = {
      id: "sidebar",
      name: "Nav Sidebar",
      type: "FRAME",
      absoluteBoundingBox: { x: 80, y: 100, width: 280, height: 500 },
      children: [{ id: "t-sb", name: "T", type: "TEXT", characters: "내 프로필 관리" }],
    };

    const formPanel: FigmaNode = {
      id: "form-panel",
      name: "Settings Form",
      type: "FRAME",
      absoluteBoundingBox: { x: 380, y: 100, width: 720, height: 500 },
      children: [{ id: "t-form", name: "T", type: "TEXT", characters: "사용자 프로필 및 상세 정보" }],
    };

    parentPage.children = [sidebar, formPanel];

    const parsed = parser.parse(parentPage);
    const elements = parsed.document.sections[0].elements;
    expect(elements.length).toBe(1);

    const root = elements[0] as ContainerElement;
    const row = root.children.find(
      (c: any) => c.type === "container" && c.layoutDirection === "horizontal"
    ) as ContainerElement;
    expect(row).toBeDefined();
    expect(row.children.length).toBe(2);
    expect(row.columnWidths).toEqual([28, 72]);

    const renderer = new DocxRenderer();
    const docxBuf = await renderer.renderToBuffer(parsed.document);
    expect(docxBuf.length).toBeGreaterThan(1000);
  });

  // Scenario 12: Portrait 및 Landscape 양방향 페이지 렌더링 검증
  it("Scenario 12: renders both portrait and landscape orientation DOCX documents end-to-end", async () => {
    const rootNode: FigmaNode = {
      id: "desktop-root",
      name: "Desktop Screen",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
      children: [
        {
          id: "col-left",
          name: "Left Column",
          type: "FRAME",
          absoluteBoundingBox: { x: 100, y: 100, width: 600, height: 400 },
          children: [{ id: "t1", name: "T", type: "TEXT", characters: "Left content" }],
        },
        {
          id: "col-right",
          name: "Right Column",
          type: "FRAME",
          absoluteBoundingBox: { x: 740, y: 100, width: 600, height: 400 },
          children: [{ id: "t2", name: "T", type: "TEXT", characters: "Right content" }],
        },
      ],
    };

    const parser = new FigmaParser();
    const renderer = new DocxRenderer();

    // Portrait
    const parsedPortrait = parser.parse(rootNode);
    parsedPortrait.document.pageConfig.orientation = "portrait";
    const portraitBuf = await renderer.renderToBuffer(parsedPortrait.document);
    expect(portraitBuf.length).toBeGreaterThan(1000);

    // Landscape
    const parsedLandscape = parser.parse(rootNode);
    parsedLandscape.document.pageConfig.orientation = "landscape";
    const landscapeBuf = await renderer.renderToBuffer(parsedLandscape.document);
    expect(landscapeBuf.length).toBeGreaterThan(1000);
  });
});

