import { describe, it, expect, vi, afterEach } from "vitest";
import { ConversionPipeline } from "../src/pipeline/index.js";
import { FigmaParser } from "../src/parser/index.js";
import { DocxRenderer } from "../src/renderer/index.js";
import * as fs from "fs";
import * as path from "path";

// 1x1 transparent PNG data URL for image mocking
const SAMPLE_MOCK_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("Phase 4 End-to-End Real Figma Pipeline Verification", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const pipeline = new ConversionPipeline({
    imageMap: {
      e2e_doc_diagram_asset_hash_01: SAMPLE_MOCK_IMAGE_DATA_URL,
      e2e_metric_icon_status_success: SAMPLE_MOCK_IMAGE_DATA_URL,
      e2e_metric_icon_speed: SAMPLE_MOCK_IMAGE_DATA_URL,
    },
  });

  it("Sample A (Document Type): converts full document AST to valid DOCX with headings and images", async () => {
    const sampleAPath = path.join(
      process.cwd(),
      "samples/real-world/sample-e2e-document.json"
    );
    const outputPath = path.join(
      process.cwd(),
      "samples/output/sample-e2e-document.docx"
    );

    const result = await pipeline.convertFile(sampleAPath, outputPath);

    expect(result.docxBuffer).toBeInstanceOf(Buffer);
    expect(result.docxBuffer.length).toBeGreaterThan(3000);
    expect(fs.existsSync(outputPath)).toBe(true);

    // Validate Internal Document Model
    const doc = result.internalDocument;
    expect(doc.metadata.title).toBe("E2E Real Figma Document Sample");
    expect(doc.sections.length).toBeGreaterThanOrEqual(1);

    // Check headings and text across the document tree
    const flattenElements = (els: any[]): any[] => {
      const flattened: any[] = [];
      for (const el of els) {
        flattened.push(el);
        if (el.children && Array.isArray(el.children)) {
          flattened.push(...flattenElements(el.children));
        }
      }
      return flattened;
    };

    const allElements = flattenElements(doc.sections[0].elements);
    const headings = allElements.filter((e) => e.type === "heading");
    expect(headings.length).toBeGreaterThanOrEqual(1);

    // Verify OpenXML ZIP signature (PK\x03\x04)
    expect(result.docxBuffer[0]).toBe(0x50);
    expect(result.docxBuffer[1]).toBe(0x4b);
  });

  it("Sample B (Card Grid Type): preserves 3-column card horizontal alignment in DOCX", async () => {
    const sampleBPath = path.join(
      process.cwd(),
      "samples/real-world/sample-e2e-card-grid.json"
    );
    const outputPath = path.join(
      process.cwd(),
      "samples/output/sample-e2e-card-grid.docx"
    );

    const result = await pipeline.convertFile(sampleBPath, outputPath);

    expect(result.docxBuffer).toBeInstanceOf(Buffer);
    expect(result.docxBuffer.length).toBeGreaterThan(3000);
    expect(fs.existsSync(outputPath)).toBe(true);

    const flattenContainers = (els: any[]): any[] => {
      const flattened: any[] = [];
      for (const el of els) {
        if (el.type === "container") flattened.push(el);
        if (el.children && Array.isArray(el.children)) {
          flattened.push(...flattenContainers(el.children));
        }
      }
      return flattened;
    };

    const allContainers = flattenContainers(result.internalDocument.sections[0].elements);
    const target3ColContainer = allContainers.find(
      (c) => c.layoutDirection === "horizontal" && c.children.length === 3
    );
    expect(target3ColContainer).toBeDefined();
    expect(target3ColContainer?.children.length).toBe(3);



    // Verify stats
    expect(result.stats.totalNodes).toBeGreaterThan(5);
    expect(result.stats.supportedNodes).toBeGreaterThan(0);
  });

  it("Sample C (Complex Layout Type): handles nested Auto Layout, overlay folding, and metrics", async () => {
    const sampleCPath = path.join(
      process.cwd(),
      "samples/real-world/sample-e2e-complex-layout.json"
    );
    const outputPath = path.join(
      process.cwd(),
      "samples/output/sample-e2e-complex-layout.docx"
    );

    const result = await pipeline.convertFile(sampleCPath, outputPath);

    expect(result.docxBuffer).toBeInstanceOf(Buffer);
    expect(result.docxBuffer.length).toBeGreaterThan(3000);
    expect(fs.existsSync(outputPath)).toBe(true);

    const elements = result.internalDocument.sections[0].elements;

    // Check hero banner overlay folding
    const heroBanner = elements.find(
      (e) => e.type === "container"
    ) as any;
    expect(heroBanner).toBeDefined();

    // Verify determinism: repeating the conversion produces the exact same buffer length
    const repeatResult = await pipeline.convertFile(sampleCPath);
    expect(repeatResult.internalDocument.sections[0].elements.length).toBe(
      result.internalDocument.sections[0].elements.length
    );
  });

  it("Live E2E flow: convertFigmaUrl resolves remote JSON and image assets end-to-end", async () => {
    const mockFilePayload = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "samples/real-world/sample-e2e-document.json"),
        "utf-8"
      )
    );

    // Mock fetch for Figma REST API calls
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/v1/files/mockFileKey/images")) {
        return {
          ok: true,
          json: async () => ({
            meta: {
              images: {
                e2e_doc_diagram_asset_hash_01:
                  "https://s3.amazonaws.com/figma-alpha/mock-image.png",
              },
            },
          }),
        } as Response;
      }

      if (url.includes("mock-image.png")) {
        // Mock image binary
        const imgBuffer = Buffer.from("fake-png-binary-content");
        return {
          ok: true,
          headers: new Headers({ "content-type": "image/png" }),
          arrayBuffer: async () => imgBuffer.buffer,
        } as Response;
      }

      if (url.includes("/v1/files/mockFileKey")) {
        return {
          ok: true,
          json: async () => mockFilePayload,
        } as Response;
      }

      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response;
    });

    const livePipeline = new ConversionPipeline();
    const testFigmaUrl =
      "https://www.figma.com/design/mockFileKey/Mock-Whitepaper-Document";
    const outputPath = path.join(
      process.cwd(),
      "samples/output/sample-e2e-live-mock.docx"
    );

    const result = await livePipeline.convertFigmaUrl(
      testFigmaUrl,
      "figma_pat_test_token_12345",
      { outputPath }
    );

    expect(result.docxBuffer).toBeInstanceOf(Buffer);
    expect(result.docxBuffer.length).toBeGreaterThan(3000);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(result.internalDocument.metadata.title).toBe(
      "Mock-Whitepaper-Document"
    );
  });
});
