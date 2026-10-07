import { describe, it, expect } from "vitest";
import { ConversionPipeline } from "../src/pipeline/index.js";
import { simpleDocumentFixture } from "../src/fixtures/samples.js";
import * as path from "path";
import * as fs from "fs";

describe("ConversionPipeline", () => {
  it("converts Figma fixture to DOCX buffer and saves to file end-to-end", async () => {
    const pipeline = new ConversionPipeline();
    const outputPath = path.resolve(process.cwd(), "samples/output/pipeline-test.docx");

    const result = await pipeline.convert(simpleDocumentFixture, { outputPath });

    expect(result.docxBuffer).toBeInstanceOf(Buffer);
    expect(result.docxBuffer.length).toBeGreaterThan(1000);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.stats.totalNodes).toBe(4);
    expect(result.stats.supportedNodes).toBe(4);
  });

  it("converts from JSON file directly", async () => {
    const pipeline = new ConversionPipeline();
    const jsonPath = path.resolve(process.cwd(), "samples/figma/simple-document.json");
    const outputPath = path.resolve(process.cwd(), "samples/output/pipeline-file-test.docx");

    const result = await pipeline.convertFile(jsonPath, outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(1000);
    expect(result.internalDocument.sections.length).toBe(1);
  });
});
