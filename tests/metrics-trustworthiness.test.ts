import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { computeDynamicMetrics } from "../tools/visual-regression/compute_full_metrics.js";

describe("Phase 27: Metrics Trustworthiness & Dynamic Calculation Suite", () => {
  const tmpDir = path.resolve(process.cwd(), "debug/phase27-metrics-test");

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  it("Case 1: 1-frame synthetic input calculates exactly 1 frame and 1 section", async () => {
    const json1 = {
      figmaNode: {
        id: "canvas-1",
        name: "Canvas 1",
        type: "CANVAS",
        children: [
          {
            id: "frame-1",
            name: "Single Frame",
            type: "FRAME",
            visible: true,
            absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
            children: [],
          },
        ],
      },
    };
    const p1 = path.join(tmpDir, "case1.json");
    fs.writeFileSync(p1, JSON.stringify(json1));

    const res = await computeDynamicMetrics({ jsonPath: p1 });
    expect(res.globalSummary.totalCandidateFrames).toBe(1);
    expect(res.globalSummary.totalCanvasPages).toBe(1);
    expect(res.globalSummary.totalRenderedDocxSections).toBe(1);
    expect(res.globalSummary.frameCoveragePercent).toBe(100.0);
  });

  it("Case 2: 3-frame synthetic input calculates exactly 3 frames and 3 sections", async () => {
    const json3 = {
      figmaNode: {
        id: "canvas-3",
        name: "Canvas 3",
        type: "CANVAS",
        children: [
          { id: "f1", name: "F1", type: "FRAME", visible: true, absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 } },
          { id: "f2", name: "F2", type: "FRAME", visible: true, absoluteBoundingBox: { x: 1000, y: 0, width: 800, height: 600 } },
          { id: "f3", name: "F3", type: "FRAME", visible: true, absoluteBoundingBox: { x: 2000, y: 0, width: 800, height: 600 } },
        ],
      },
    };
    const p3 = path.join(tmpDir, "case2.json");
    fs.writeFileSync(p3, JSON.stringify(json3));

    const res = await computeDynamicMetrics({ jsonPath: p3 });
    expect(res.globalSummary.totalCandidateFrames).toBe(3);
    expect(res.globalSummary.totalCanvasPages).toBe(3);
    expect(res.globalSummary.totalRenderedDocxSections).toBe(3);
    expect(res.globalSummary.frameCoveragePercent).toBe(100.0);
  });

  it("Case 3: Real 17-frame input measures actual dynamic counts", async () => {
    const realJson = path.resolve(process.cwd(), "debug/phase25-web-ui-fidelity/pentech_v3_original.json");
    if (!fs.existsSync(realJson)) return;

    const res = await computeDynamicMetrics({ jsonPath: realJson });
    expect(res.globalSummary.totalCandidateFrames).toBe(17);
    expect(res.globalSummary.totalCanvasPages).toBe(17);
    expect(res.globalSummary.totalRenderedDocxSections).toBe(17);
    expect(res.globalSummary.totalElements).toBeGreaterThan(1000);
  });

  it("Case 4: Consecutive identical dimensions generate isolated sections without collisions", async () => {
    const jsonIdentical = {
      figmaNode: {
        id: "canvas-id",
        type: "CANVAS",
        children: [
          { id: "id1", name: "Page 1", type: "FRAME", visible: true, absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 1080 } },
          { id: "id2", name: "Page 2", type: "FRAME", visible: true, absoluteBoundingBox: { x: 0, y: 1500, width: 1920, height: 1080 } },
        ],
      },
    };
    const pId = path.join(tmpDir, "case4.json");
    fs.writeFileSync(pId, JSON.stringify(jsonIdentical));

    const res = await computeDynamicMetrics({ jsonPath: pId });
    expect(res.globalSummary.totalRenderedDocxSections).toBe(2);
    expect(res.globalSummary.detectedCollisionsCount).toBe(0);
  });

  it("Case 5: Oversized 22-inch exceeding frame detects oversizedPagesCount dynamically", async () => {
    // 3000px * 0.75 = 2250pt > 1584pt limit
    const jsonOver = {
      figmaNode: {
        id: "canvas-over",
        type: "CANVAS",
        children: [
          { id: "over-1", name: "Giant Page", type: "FRAME", visible: true, absoluteBoundingBox: { x: 0, y: 0, width: 3000, height: 4000 } },
        ],
      },
    };
    const pOver = path.join(tmpDir, "case5.json");
    fs.writeFileSync(pOver, JSON.stringify(jsonOver));

    const res = await computeDynamicMetrics({ jsonPath: pOver });
    expect(res.globalSummary.oversizedPagesCount).toBe(1);
    expect(res.pages[0].structuralDefects).toContain("OVERSIZED_PAGE_CLAMPED");
  });

  it("Case 6: Empty frame calculates 0 elements and 0 textboxes dynamically", async () => {
    const jsonEmpty = {
      figmaNode: {
        id: "canvas-empty",
        type: "CANVAS",
        children: [
          { id: "empty-1", name: "Blank Frame", type: "FRAME", visible: true, absoluteBoundingBox: { x: 0, y: 0, width: 500, height: 500 }, children: [] },
        ],
      },
    };
    const pEmpty = path.join(tmpDir, "case6.json");
    fs.writeFileSync(pEmpty, JSON.stringify(jsonEmpty));

    const res = await computeDynamicMetrics({ jsonPath: pEmpty });
    expect(res.globalSummary.totalElements).toBe(0);
    expect(res.globalSummary.totalTextboxes).toBe(0);
    expect(res.globalSummary.totalSingleLineTextboxes).toBe(0);
  });

  it("Case 7: Missing pipeline manifest correctly reports not_measured instead of false success", async () => {
    const jsonSimple = {
      figmaNode: {
        id: "c7",
        type: "CANVAS",
        children: [
          { id: "f7", name: "Simple", type: "FRAME", visible: true, absoluteBoundingBox: { x: 0, y: 0, width: 500, height: 500 } },
        ],
      },
    };
    const pSimple = path.join(tmpDir, "case7.json");
    fs.writeFileSync(pSimple, JSON.stringify(jsonSimple));

    const res = await computeDynamicMetrics({ jsonPath: pSimple });
    expect(res.globalSummary.totalRenderedDocxPages).toBe("not_measured");
    expect(res.globalSummary.wordCompatibility).toBe("not_measured");
  });

  it("Case 8: Failed pipeline execution dynamically reflects failure message", async () => {
    const jsonFail = {
      figmaNode: {
        id: "c8",
        type: "CANVAS",
        children: [
          { id: "f8", name: "Fail", type: "FRAME", visible: true, absoluteBoundingBox: { x: 0, y: 0, width: 500, height: 500 } },
        ],
      },
    };
    const pFail = path.join(tmpDir, "case8.json");
    fs.writeFileSync(pFail, JSON.stringify(jsonFail));

    const manifestFail = path.join(tmpDir, "fail-manifest.json");
    fs.writeFileSync(
      manifestFail,
      JSON.stringify({
        success: false,
        error: "Word crashed during export",
      })
    );

    const res = await computeDynamicMetrics({
      jsonPath: pFail,
      pipelineManifestPath: manifestFail,
    });
    expect(res.globalSummary.wordCompatibility).toContain("Failed: Word crashed during export");
  });
});
