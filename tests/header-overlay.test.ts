import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/index.js";
import { ConversionPipeline } from "../src/pipeline/index.js";
import * as path from "path";
import * as fs from "fs";

describe("Phase 4.1-C: Containment Folding Direction Inference & Header Horizontal Flow", () => {
  const parser = new FigmaParser();
  const pipeline = new ConversionPipeline();

  it("infers horizontal layout for navbar bar overlay containing side-by-side elements", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "samples/real-world/real-header-overlay.json"
    );
    const outputPath = path.join(
      process.cwd(),
      "samples/output/real-header-overlay.docx"
    );

    const result = await pipeline.convertFile(fixturePath, outputPath);

    expect(result.docxBuffer).toBeInstanceOf(Buffer);
    expect(result.docxBuffer.length).toBeGreaterThan(3000);
    expect(fs.existsSync(outputPath)).toBe(true);

    const rootElement = result.internalDocument.sections[0].elements[0] as any;
    expect(rootElement).toBeDefined();

    // The header container should be inferred as horizontal
    const headerContainer = rootElement.children.find(
      (c: any) => c.id === "40:1" && c.type === "container"
    );

    expect(headerContainer).toBeDefined();
    expect(headerContainer.layoutDirection).toBe("horizontal");
    expect(headerContainer.children.length).toBe(3);
    // Elements should be sorted left-to-right (Logo -> Nav -> Button)
    expect(headerContainer.children[0].id).toBe("40:2");
    expect(headerContainer.children[1].id).toBe("40:3");
    expect(headerContainer.children[2].id).toBe("40:4");
  });
});
