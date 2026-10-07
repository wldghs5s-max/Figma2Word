import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/figmaParser.js";
import { ConversionPipeline } from "../src/pipeline/index.js";
import { ContainerElement } from "../src/model/index.js";
import * as path from "path";
import * as fs from "fs";

describe("Phase 3 Layout Strategy: P1 Solutions Verification", () => {
  const parser = new FigmaParser();
  const pipeline = new ConversionPipeline();
  const layoutDir = path.resolve(process.cwd(), "samples/layout");

  // ==========================================
  // P1-1: Non-Auto Layout Horizontal Clustering
  // ==========================================

  it("P1-1 Case A: clusters 2 parallel columns into a horizontal container", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(layoutDir, "layout-p1-horizontal-2.json"), "utf8"));
    const res = parser.parse(raw);
    const elements = res.document.sections[0].elements;

    expect(elements.length).toBe(1);
    const container = elements[0] as ContainerElement;
    expect(container.type).toBe("container");
    expect(container.layoutDirection).toBe("horizontal");
    expect(container.children.length).toBe(2);
  });

  it("P1-1 Case C: clusters 3 parallel columns into a 3-column horizontal container", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(layoutDir, "layout-p1-horizontal-3.json"), "utf8"));
    const res = parser.parse(raw);
    const elements = res.document.sections[0].elements;

    expect(elements.length).toBe(1);
    const container = elements[0] as ContainerElement;
    expect(container.type).toBe("container");
    expect(container.layoutDirection).toBe("horizontal");
    expect(container.children.length).toBe(3);
  });

  it("P1-1 Case E: clusters columns with differing heights side-by-side", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(layoutDir, "layout-p1-different-height.json"), "utf8"));
    const res = parser.parse(raw);
    const elements = res.document.sections[0].elements;

    expect(elements.length).toBe(1);
    const container = elements[0] as ContainerElement;
    expect(container.type).toBe("container");
    expect(container.layoutDirection).toBe("horizontal");
    expect(container.children.length).toBe(2);
  });

  it("P1-1 Case D: clusters columns with slight vertical offset (Y-proximity threshold)", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(layoutDir, "layout-p1-offset-columns.json"), "utf8"));
    const res = parser.parse(raw);
    const elements = res.document.sections[0].elements;

    expect(elements.length).toBe(1);
    const container = elements[0] as ContainerElement;
    expect(container.type).toBe("container");
    expect(container.layoutDirection).toBe("horizontal");
    expect(container.children.length).toBe(2);
  });

  it("P1-1 Case F: preserves mixed flow (heading -> 2-col row -> full body paragraph)", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(layoutDir, "layout-p1-mixed-flow.json"), "utf8"));
    const res = parser.parse(raw);
    const elements = res.document.sections[0].elements;

    // Heading, Horizontal Container (2 cols), Full Width Body Paragraph
    expect(elements.length).toBe(3);
    expect(elements[0].type).toBe("heading");
    expect(elements[1].type).toBe("container");
    expect((elements[1] as ContainerElement).layoutDirection).toBe("horizontal");
    expect((elements[1] as ContainerElement).children.length).toBe(2);
    expect(elements[2].type).toBe("paragraph");
  });

  // ==========================================
  // P1-2: Containment & Z-index Overlay Folding
  // ==========================================

  it("P1-2: folds overlay text elements into the background card container", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(layoutDir, "layout-p1-overlay.json"), "utf8"));
    const res = parser.parse(raw);
    const elements = res.document.sections[0].elements;

    // Instead of 3 disjoint sibling blocks (rect + title + desc),
    // it must be folded into 1 container with 2 children inside!
    expect(elements.length).toBe(1);
    const card = elements[0] as ContainerElement;
    expect(card.type).toBe("container");
    expect(card.children.length).toBe(2);
    expect(card.children[0].type).toBe("heading");
    expect(card.children[1].type).toBe("paragraph");
  });

  // ==========================================
  // P1-3: Auto Layout Fixed vs Fill Sizing Ratios
  // ==========================================

  it("P1-3: computes non-equal columnWidths based on child bounding box widths", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(layoutDir, "layout-p1-fixed-fill.json"), "utf8"));
    const res = parser.parse(raw);
    const elements = res.document.sections[0].elements;

    expect(elements.length).toBe(1);
    const flexBar = elements[0] as ContainerElement;
    expect(flexBar.type).toBe("container");
    expect(flexBar.layoutDirection).toBe("horizontal");
    expect(flexBar.columnWidths).toBeDefined();

    // 60px vs 390px (total 450px) -> ~13% vs ~87%, sum = 100%
    const widths = flexBar.columnWidths!;
    expect(widths.length).toBe(2);
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[0] + widths[1]).toBe(100);
    expect(widths[0]).toBeGreaterThanOrEqual(10);
    expect(widths[1]).toBeGreaterThanOrEqual(70);
  });

  // ==========================================
  // Full DOCX Generation & Integrity
  // ==========================================

  it("converts all 7 layout fixtures to valid DOCX files", async () => {
    const fixtures = [
      "layout-p1-horizontal-2.json",
      "layout-p1-horizontal-3.json",
      "layout-p1-different-height.json",
      "layout-p1-offset-columns.json",
      "layout-p1-mixed-flow.json",
      "layout-p1-overlay.json",
      "layout-p1-fixed-fill.json",
    ];

    for (const f of fixtures) {
      const inPath = path.join(layoutDir, f);
      const outPath = path.resolve(process.cwd(), "samples/output", f.replace(".json", ".docx"));
      const res = await pipeline.convertFile(inPath, outPath);

      expect(fs.existsSync(outPath)).toBe(true);
      expect(fs.statSync(outPath).size).toBeGreaterThan(1000);
      expect(res.stats.unsupportedNodes).toBe(0);
    }
  });
});
