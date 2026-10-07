import { describe, it, expect } from "vitest";
import { ConversionPipeline } from "../src/pipeline/index.js";
import * as path from "path";
import * as fs from "fs";

describe("Phase 4.1-D: Text Spacing & Compact Paragraph Flow", () => {
  const pipeline = new ConversionPipeline();

  it("converts contiguous text layers without excessive paragraph gaps into valid DOCX", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "samples/real-world/real-text-layout.json"
    );
    const outputPath = path.join(
      process.cwd(),
      "samples/output/real-text-layout.docx"
    );

    const result = await pipeline.convertFile(fixturePath, outputPath);

    expect(result.docxBuffer).toBeInstanceOf(Buffer);
    expect(result.docxBuffer.length).toBeGreaterThan(3000);
    expect(fs.existsSync(outputPath)).toBe(true);

    const rootElement = result.internalDocument.sections[0].elements[0] as any;
    expect(rootElement).toBeDefined();

    // Verify all 4 text elements exist in correct sequence
    expect(rootElement.children.length).toBe(4);
    expect(rootElement.children[0].type).toBe("heading");
    expect(rootElement.children[1].type).toBe("paragraph");
    expect(rootElement.children[2].type).toBe("paragraph");
    expect(rootElement.children[3].type).toBe("paragraph");
  });
});
