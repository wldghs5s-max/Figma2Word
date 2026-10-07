import { describe, it, expect } from "vitest";
import { ConversionPipeline } from "../src/pipeline/index.js";
import * as path from "path";
import * as fs from "fs";

describe("Real-world & Stress Test Fixtures", () => {
  const pipeline = new ConversionPipeline();
  const baseDir = path.resolve(process.cwd(), "samples/real-world");

  it("converts Sample A (Proposal Document) with complete hierarchy", async () => {
    const jsonPath = path.join(baseDir, "sample-a-proposal-doc.json");
    const outPath = path.resolve(process.cwd(), "samples/output/stress-test-sample-a.docx");

    const result = await pipeline.convertFile(jsonPath, outPath);

    expect(result.stats.totalNodes).toBeGreaterThan(5);
    expect(result.stats.unsupportedNodes).toBe(0);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.statSync(outPath).size).toBeGreaterThan(1000);
  });

  it("converts Sample B (Nested Auto Layout) preserving nested card elements", async () => {
    const jsonPath = path.join(baseDir, "sample-b-nested-autolayout.json");
    const outPath = path.resolve(process.cwd(), "samples/output/stress-test-sample-b.docx");

    const result = await pipeline.convertFile(jsonPath, outPath);

    expect(result.stats.supportedNodes).toBe(12);
    expect(result.internalDocument.sections[0].elements.length).toBeGreaterThan(0);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it("converts Sample C (Non-Auto Layout Stress) and records partial support notices", async () => {
    const jsonPath = path.join(baseDir, "sample-c-stress-absolute.json");
    const outPath = path.resolve(process.cwd(), "samples/output/stress-test-sample-c.docx");

    const result = await pipeline.convertFile(jsonPath, outPath);

    // Freeform non-auto layout frames should be marked as Partially Supported
    expect(result.stats.partiallySupportedNodes).toBeGreaterThan(0);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it("converts Sample D (Edge Cases) handling hidden, empty, and unsupported nodes safely", async () => {
    const jsonPath = path.join(baseDir, "sample-d-edge-cases.json");
    const outPath = path.resolve(process.cwd(), "samples/output/stress-test-sample-d.docx");

    const result = await pipeline.convertFile(jsonPath, outPath);

    // Unsupported and Fallback nodes must be transparently tracked
    expect(result.stats.unsupportedNodes).toBe(2); // BOOLEAN_OPERATION, SLICE
    expect(result.stats.fallbackNodes).toBe(2); // VECTOR, STAR
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
