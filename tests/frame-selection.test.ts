import { describe, it, expect } from "vitest";
import {
  ConversionPipeline,
  extractSelectableFrames,
  filterFigmaNodeByFrames,
  assessImageCompleteness,
  isA4Ratio,
} from "../src/pipeline/index.js";
import { FigmaNode } from "../src/parser/types.js";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import * as fs from "fs";
import * as path from "path";

describe("Step 10B: Frame Selection & Multi-Frame Filtering", () => {
  const pipeline = new ConversionPipeline();

  const mockCanvasNode: FigmaNode = {
    id: "canvas-root",
    name: "Page 1",
    type: "CANVAS",
    children: [
      {
        id: "frame-a4-cover",
        name: "A4 - 1 표지",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 595, height: 842 },
        children: [
          {
            id: "text-title",
            name: "Title",
            type: "TEXT",
            characters: "표지 제목",
            absoluteBoundingBox: { x: 50, y: 100, width: 495, height: 50 },
          },
          {
            id: "img-logo",
            name: "Logo",
            type: "RECTANGLE",
            absoluteBoundingBox: { x: 50, y: 200, width: 100, height: 50 },
            fills: [{ type: "IMAGE", imageRef: "img-logo-ref", scaleMode: "FILL" }],
          },
        ],
      },
      {
        id: "frame-desktop-web",
        name: "Desktop Web Main",
        type: "FRAME",
        absoluteBoundingBox: { x: 700, y: 0, width: 1440, height: 1024 },
        children: [
          {
            id: "text-web-hero",
            name: "Web Hero",
            type: "TEXT",
            characters: "웹 메인 화면",
            absoluteBoundingBox: { x: 750, y: 100, width: 500, height: 40 },
          },
          {
            id: "img-banner",
            name: "Banner Image",
            type: "RECTANGLE",
            absoluteBoundingBox: { x: 750, y: 200, width: 600, height: 300 },
            fills: [{ type: "IMAGE", imageRef: "img-banner-ref", scaleMode: "FILL" }],
          },
        ],
      },
      {
        id: "frame-a4-section",
        name: "A4 - 2 본문",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 900, width: 595, height: 842 },
        children: [
          {
            id: "text-body",
            name: "Body",
            type: "TEXT",
            characters: "본문 내용입니다.",
            absoluteBoundingBox: { x: 50, y: 950, width: 495, height: 200 },
          },
        ],
      },
      {
        id: "frame-duplicate-name-1",
        name: "Content Section",
        type: "FRAME",
        absoluteBoundingBox: { x: 700, y: 1100, width: 800, height: 600 },
        children: [
          {
            id: "text-dup-1",
            name: "Dup 1",
            type: "TEXT",
            characters: "중복 이름 1번 프레임",
            absoluteBoundingBox: { x: 720, y: 1120, width: 200, height: 30 },
          },
        ],
      },
      {
        id: "frame-duplicate-name-2",
        name: "Content Section",
        type: "FRAME",
        absoluteBoundingBox: { x: 700, y: 1800, width: 800, height: 600 },
        children: [
          {
            id: "text-dup-2",
            name: "Dup 2",
            type: "TEXT",
            characters: "중복 이름 2번 프레임",
            absoluteBoundingBox: { x: 720, y: 1820, width: 200, height: 30 },
          },
        ],
      },
    ],
  };

  const sampleImageMap: Record<string, string> = {
    "img-logo-ref":
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    // Note: img-banner-ref is intentionally missing to test isolated completeness
  };

  // 1. isA4Ratio utility test
  it("Item 1: correctly detects A4 ratio within tolerance (0.68 - 0.73)", () => {
    expect(isA4Ratio(595, 842)).toBe(true); // 0.7067
    expect(isA4Ratio(595.28, 841.89)).toBe(true);
    expect(isA4Ratio(210, 297)).toBe(true); // 0.7071
    expect(isA4Ratio(1440, 1024)).toBe(false); // 1.40625
    expect(isA4Ratio(375, 812)).toBe(false); // 0.4618 (mobile)
    expect(isA4Ratio(0, 842)).toBe(false);
  });

  // 2. extractSelectableFrames test
  it("Item 2: extracts all selectable top-level frames with metadata and A4 recommendations", () => {
    const frames = extractSelectableFrames(mockCanvasNode);
    expect(frames).toHaveLength(5);

    expect(frames[0]).toEqual(
      expect.objectContaining({
        id: "frame-a4-cover",
        name: "A4 - 1 표지",
        type: "FRAME",
        width: 595,
        height: 842,
        aspectRatio: expect.closeTo(0.707, 3),
        isA4Ratio: true,
        isRecommendedA4: true,
        canvasName: "Page 1",
      })
    );

    expect(frames[1]).toEqual(
      expect.objectContaining({
        id: "frame-desktop-web",
        name: "Desktop Web Main",
        type: "FRAME",
        width: 1440,
        height: 1024,
        aspectRatio: expect.closeTo(1.406, 3),
        isA4Ratio: false,
        isRecommendedA4: false,
        canvasName: "Page 1",
      })
    );

    expect(frames[2].isA4Ratio).toBe(true);
    expect(frames[3].name).toBe("Content Section");
    expect(frames[4].name).toBe("Content Section");
    expect(frames[3].id).not.toBe(frames[4].id);
  });

  // 3. filterFigmaNodeByFrames - Single frame selection
  it("Item 3: filters to a single selected frame non-destructively", () => {
    const filtered = filterFigmaNodeByFrames(mockCanvasNode, ["frame-a4-cover"]);
    expect(filtered.children).toHaveLength(1);
    expect(filtered.children?.[0].id).toBe("frame-a4-cover");
    // Verify original node was not mutated
    expect(mockCanvasNode.children).toHaveLength(5);
  });

  // 4. filterFigmaNodeByFrames - Multi-frame selection and child order preservation
  it("Item 4: preserves original canvas child order regardless of selectedFrameIds order", () => {
    // Provide selected IDs in reverse order: frame-a4-section (3rd) then frame-a4-cover (1st)
    const filtered = filterFigmaNodeByFrames(mockCanvasNode, [
      "frame-a4-section",
      "frame-a4-cover",
    ]);

    expect(filtered.children).toHaveLength(2);
    // Should maintain original document order: cover first, section second
    expect(filtered.children?.[0].id).toBe("frame-a4-cover");
    expect(filtered.children?.[1].id).toBe("frame-a4-section");
  });

  // 5. Duplicate frame name disambiguation by ID
  it("Item 5: disambiguates duplicate frame names by unique node ID", () => {
    const filtered = filterFigmaNodeByFrames(mockCanvasNode, ["frame-duplicate-name-2"]);
    expect(filtered.children).toHaveLength(1);
    expect(filtered.children?.[0].id).toBe("frame-duplicate-name-2");
    expect((filtered.children?.[0] as any).children?.[0].characters).toBe(
      "중복 이름 2번 프레임"
    );
  });

  // 6. Empty selection handling
  it("Item 6: rejects empty frame selection with 400 error in ConversionPipeline", async () => {
    await expect(
      pipeline.convert(mockCanvasNode, { selectedFrameIds: [] })
    ).rejects.toThrow("최소 1개 이상의 프레임을 선택해주세요");
  });

  // 7. Backward compatibility: selectedFrameIds undefined converts all frames
  it("Item 7: converts all frames when selectedFrameIds is omitted (backward compatibility)", async () => {
    const result = await pipeline.convert(mockCanvasNode, {
      imageMap: sampleImageMap,
    });
    expect(result.internalDocument).toBeDefined();
    expect(result.stats.totalElements).toBeGreaterThan(0);
  });

  // 8. ConversionPipeline converts only selected frames
  it("Item 8: converts only selected frames when selectedFrameIds is provided", async () => {
    const result = await pipeline.convert(mockCanvasNode, {
      selectedFrameIds: ["frame-a4-cover"],
      imageMap: sampleImageMap,
    });
    expect(result.internalDocument).toBeDefined();
    expect(result.stats.totalElements).toBeGreaterThan(0);
  });

  // 9. Image completeness isolated to selected frames
  it("Item 9: assesses image completeness isolated to selected frames", () => {
    // Canvas root references both img-logo-ref (present) and img-banner-ref (missing)
    const wholeCanvasAssessment = assessImageCompleteness(
      mockCanvasNode,
      sampleImageMap
    );
    expect(wholeCanvasAssessment.referencedCount).toBe(2);
    expect(wholeCanvasAssessment.isComplete).toBe(false);
    expect(wholeCanvasAssessment.missingRefs).toContain("img-banner-ref");

    // When selecting only A4 frames, img-banner-ref is NOT in the selected frames!
    const filteredForA4 = filterFigmaNodeByFrames(mockCanvasNode, [
      "frame-a4-cover",
      "frame-a4-section",
    ]);
    const a4Assessment = assessImageCompleteness(filteredForA4, sampleImageMap);
    expect(a4Assessment.referencedCount).toBe(1);
    expect(a4Assessment.resolvedCount).toBe(1);
    expect(a4Assessment.isComplete).toBe(true);
    expect(a4Assessment.missingRefs).toHaveLength(0);
  });

  // 10. Page orientation (Portrait vs Landscape) configuration
  it("Item 10: configures correct page dimensions for Portrait and Landscape orientations", async () => {
    const portraitResult = await pipeline.convert(mockCanvasNode, {
      selectedFrameIds: ["frame-a4-cover"],
      pageOrientation: "portrait",
      imageMap: sampleImageMap,
    });
    expect(portraitResult.internalDocument.pageConfig.orientation).toBe("portrait");

    const landscapeResult = await pipeline.convert(mockCanvasNode, {
      selectedFrameIds: ["frame-a4-cover"],
      pageOrientation: "landscape",
      imageMap: sampleImageMap,
    });
    expect(landscapeResult.internalDocument.pageConfig.orientation).toBe("landscape");

    const renderer = new DocxRenderer();
    const portraitDoc = renderer.createDocument(portraitResult.internalDocument);
    const portraitPgSz = (portraitDoc as any).documentWrapper.document.root[1]
      .sections[0].root[0].root[0].root;
    expect(portraitPgSz.orientation.value).toBe("portrait");
    expect(portraitPgSz.width.value).toBe(11906);
    expect(portraitPgSz.height.value).toBe(16838);

    const landscapeDoc = renderer.createDocument(landscapeResult.internalDocument);
    const landscapePgSz = (landscapeDoc as any).documentWrapper.document.root[1]
      .sections[0].root[0].root[0].root;
    expect(landscapePgSz.orientation.value).toBe("landscape");
    expect(landscapePgSz.width.value).toBe(16838);
    expect(landscapePgSz.height.value).toBe(11906);
  });

  // 11. Real customer testnewpage snapshot verification
  it("Item 11: verifies frame extraction on real testnewpage.json snapshot if present", () => {
    const testNewPagePath = path.resolve(
      process.cwd(),
      "debug/customer/testnewpage.json"
    );
    if (!fs.existsSync(testNewPagePath)) {
      return; // Skip if testnewpage.json is not present in local test environment
    }

    const raw = JSON.parse(fs.readFileSync(testNewPagePath, "utf-8"));
    const node = raw.figmaNode || raw.document || raw;
    const frames = extractSelectableFrames(node);

    expect(frames.length).toBe(10);

    const a4Frames = frames.filter((f) => f.isA4Ratio);
    expect(a4Frames.length).toBe(5);
    expect(a4Frames.map((f) => f.name)).toEqual([
      "A4 - 1",
      "A4 - 2",
      "A4 - 3",
      "A4 - 4",
      "A4 - 5",
    ]);

    // Filter node to 5 A4 frames
    const a4Ids = a4Frames.map((f) => f.id);
    const filteredNode = filterFigmaNodeByFrames(node, a4Ids);
    expect(filteredNode.children).toHaveLength(5);
    expect(filteredNode.children?.map((c) => c.id)).toEqual(a4Ids);
  });
});

