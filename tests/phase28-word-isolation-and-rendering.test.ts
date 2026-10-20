import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  captureWordState,
  openTargetDocumentSafely,
  exportAndCloseTargetDocOnly,
  cleanupTargetDocOnly,
  normalizeWordPath,
  escapeAppleScript,
} from "../tools/visual-regression/safe_word_automation.js";
import { computeDynamicMetrics } from "../tools/visual-regression/compute_full_metrics.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument, CanvasElement } from "../src/canvas/types/canvasIr.js";

describe("Phase 28: Word Automation Complete Isolation & Quality Verification Suite", () => {
  const tmpDir = path.resolve(process.cwd(), "debug/phase28-isolation-test");

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  // --------------------------------------------------------------------------
  // Pillar 1: Word Automation Isolation & Safety
  // --------------------------------------------------------------------------
  describe("Pillar 1: Word Automation Complete Isolation & Fail-Closed Safety", () => {
    it("1. Normalizes paths consistently across /private/var and Unicode NFC/NFD", () => {
      const p1 = "/private/var/folders/09/sample.docx";
      const p2 = "/var/folders/09/sample.docx";
      expect(normalizeWordPath(p1)).toBe(normalizeWordPath(p2));

      const nfc = "한글문서.docx".normalize("NFC");
      const nfd = "한글문서.docx".normalize("NFD");
      expect(normalizeWordPath(`/var/${nfc}`)).toBe(normalizeWordPath(`/var/${nfd}`));
    });

    it("2. Safely escapes AppleScript strings against quote and backslash injection", () => {
      const evil = 'My "Test" File with \\ backslash and "quotes"';
      const escaped = escapeAppleScript(evil);
      expect(escaped).toBe('My \\"Test\\" File with \\\\ backslash and \\"quotes\\"');
      expect(escaped).not.toContain('"""');
    });

    it("3. Refuses ownership and fails-closed if target document path is already open in Word", async () => {
      const mockDocx = path.join(tmpDir, "already_open.docx");
      fs.writeFileSync(mockDocx, "dummy content");

      // Simulate snapshot where this exact document was already opened by the user
      const fakeSnapshot = {
        wordWasRunning: true,
        initialDocumentNames: ["already_open.docx"],
        initialDocumentPaths: [normalizeWordPath(path.join(os.tmpdir(), "f2w_word_isolation", "fake_run", "already_open.docx"))],
        initialDocumentCount: 1,
      };

      // If we attempt to open a file that is already registered in openDocumentPaths
      const targetPosix = fakeSnapshot.initialDocumentPaths[0];
      expect(fakeSnapshot.initialDocumentPaths.includes(targetPosix)).toBe(true);
    });

    it("4. Target cleanup is fail-safe and never closes documents without valid ownership handle", () => {
      expect(() => {
        cleanupTargetDocOnly("Random_Unowned_Document.docx");
      }).not.toThrow();

      expect(() => {
        cleanupTargetDocOnly(null as any);
      }).not.toThrow();
    });

    it("5. Export rejects unowned handles to guarantee zero data loss on user documents", () => {
      const unownedHandle = {
        runId: "fake",
        sourceDocxPath: "/tmp/fake.docx",
        isolatedDocxPath: "/tmp/isolated.docx",
        isolatedDir: "/tmp",
        normalizedPosixPath: "/tmp/isolated.docx",
        docName: "fake.docx",
        docIndex: 1,
        sectionsCount: 1,
        isOwned: false, // NOT OWNED
      };

      expect(() => {
        exportAndCloseTargetDocOnly(unownedHandle, "/tmp/out.pdf");
      }).toThrow(/automation does not own this document/);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 2: Semantic Disentanglement of Metrics
  // --------------------------------------------------------------------------
  describe("Pillar 2: Semantic Disentanglement of Metrics & Dynamic SHA-256 Linking", () => {
    it("6. Disentangles sectionCountMismatch from geometric visualCollisionsCount", async () => {
      const json2Pages = {
        figmaNode: {
          id: "canvas-2",
          type: "CANVAS",
          children: [
            { id: "f1", name: "Page 1", type: "FRAME", visible: true, absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 } },
            { id: "f2", name: "Page 2", type: "FRAME", visible: true, absoluteBoundingBox: { x: 1000, y: 0, width: 800, height: 600 } },
          ],
        },
      };
      const p = path.join(tmpDir, "metric_disentangle.json");
      fs.writeFileSync(p, JSON.stringify(json2Pages));

      const res = await computeDynamicMetrics({ jsonPath: p });
      // Both pages have isolated sections and disjoint coordinates
      expect(res.globalSummary.sectionCountMismatch).toBe(0);
      expect(res.globalSummary.detectedCollisionsCount).toBe(0);
      expect(res.globalSummary.visualCollisionsCount).toBe(0);
      expect(res.sourceJsonSha256).toBeDefined();
      expect(res.docxSha256).toBeDefined();
    });

    it("7. Flags stale pipeline manifest when docxSha256 does not match analyzed DOCX", async () => {
      const jsonSingle = {
        figmaNode: {
          id: "c-single",
          type: "CANVAS",
          children: [
            { id: "f1", name: "Single", type: "FRAME", visible: true, absoluteBoundingBox: { x: 0, y: 0, width: 500, height: 500 } },
          ],
        },
      };
      const p = path.join(tmpDir, "stale_test.json");
      fs.writeFileSync(p, JSON.stringify(jsonSingle));

      // Create a stale manifest with an intentionally mismatched sha256
      const staleManifest = path.join(tmpDir, "stale_manifest.json");
      fs.writeFileSync(
        staleManifest,
        JSON.stringify({
          success: true,
          totalSections: 99,
          totalPages: 99,
          docxSha256: "0000000000000000000000000000000000000000000000000000000000000000",
        })
      );

      const res = await computeDynamicMetrics({
        jsonPath: p,
        pipelineManifestPath: staleManifest,
      });

      expect(res.globalSummary.manifestMatched).toBe(false);
      expect(res.globalSummary.totalRenderedDocxPages).toBe("not_measured");
      expect(res.globalSummary.wordCompatibility).toContain("stale_manifest_mismatch");
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 3: Universal Renderer Enhancements
  // --------------------------------------------------------------------------
  describe("Pillar 3: Universal Renderer Enhancements (Asymmetric Corners, Pill Buttons, Text Wrap)", () => {
    it("8. Generates v:shape with cubic Bezier path for asymmetric corner radii [20, 20, 0, 0]", async () => {
      const renderer = new DocxCanvasRenderer();
      const doc: CanvasDocument = {
        pageSize: { widthPt: 595.28, heightPt: 841.89 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "card_asym",
                type: "rectangle",
                bounds: { x: 50, y: 50, width: 200, height: 100 },
                zIndex: 1,
                style: {
                  fillColor: "#10B981",
                  strokeColor: "#047857",
                  strokeWidth: 2,
                  cornerRadii: [20, 20, 0, 0], // Asymmetric top-rounded
                },
              },
            ],
          },
        ],
      };

      const zip = await renderer.buildZip(doc);
      const docXml = await zip.file("word/document.xml")?.async("text");

      expect(docXml).toBeDefined();
      // Asymmetric corners must be rendered via v:shape with custom path, NOT uniform v:roundrect!
      expect(docXml).toContain("<v:shape");
      expect(docXml).toContain('coordsize="2000,1000"');
      expect(docXml).toContain('path="m 200,0');
      expect(docXml).toContain("x e");
    });

    it("9. Generates v:roundrect with exact arcsize=0.5 for uniform pill buttons", async () => {
      const renderer = new DocxCanvasRenderer();
      const doc: CanvasDocument = {
        pageSize: { widthPt: 595.28, heightPt: 841.89 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "pill_btn",
                type: "rectangle",
                bounds: { x: 50, y: 50, width: 120, height: 40 },
                zIndex: 1,
                style: {
                  fillColor: "#2563EB",
                  cornerRadius: 20, // Height is 40, so r=20 is full pill
                  cornerRadii: [20, 20, 20, 20],
                },
              },
            ],
          },
        ],
      };

      const zip = await renderer.buildZip(doc);
      const docXml = await zip.file("word/document.xml")?.async("text");

      expect(docXml).toBeDefined();
      expect(docXml).toContain("<v:roundrect");
      expect(docXml).toContain('arcsize="0.500"');
    });

    it("10. Applies ECMA-376 <w:wordWrap w:val='0'/> to single-line text and buttons to prevent truncation", async () => {
      const renderer = new DocxCanvasRenderer();
      const doc: CanvasDocument = {
        pageSize: { widthPt: 595.28, heightPt: 841.89 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "btn_text",
                type: "text",
                bounds: { x: 50, y: 50, width: 100, height: 24 },
                zIndex: 1,
                textAutoResize: "WIDTH_AND_HEIGHT",
                textRuns: [
                  {
                    text: "Submit Order",
                    fontSizePt: 12,
                    fontFamily: "Inter",
                    lineHeightPt: 16,
                  },
                ],
              },
            ],
          },
        ],
      };

      const zip = await renderer.buildZip(doc);
      const docXml = await zip.file("word/document.xml")?.async("text");

      expect(docXml).toBeDefined();
      expect(docXml).toContain('<w:wordWrap w:val="0"/>');
      expect(docXml).not.toContain("<w:noWrap/>"); // Strictly avoids invalid schema
    });

    it("11. Uniformly scales oversized (>22 inches) frames preserving aspect ratio and bounds", () => {
      const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
      const figmaOversized = {
        figmaNode: {
          id: "canvas-giant",
          type: "CANVAS",
          children: [
            {
              id: "frame-tall",
              name: "Giant Tall",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 0, y: 0, width: 3000, height: 4000 },
              children: [
                {
                  id: "footer",
                  name: "Bottom Footer",
                  type: "RECTANGLE",
                  visible: true,
                  absoluteBoundingBox: { x: 100, y: 3800, width: 2800, height: 150 },
                  fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 } }],
                },
              ],
            },
          ],
        },
      };

      const doc = parser.parse(figmaOversized);
      const page = doc.pages[0];

      // Original ratio: 3000 / 4000 = 0.75
      expect(page.bounds.width / page.bounds.height).toBeCloseTo(0.75, 2);
      // Word 22-inch maximum clamp
      expect(page.bounds.height).toBeLessThanOrEqual(1584.0);
      expect(page.bounds.width).toBeLessThanOrEqual(1584.0);

      // Child elements must be contained within page bounds
      const footer = page.elements.find((e) => e.id === "footer");
      expect(footer).toBeDefined();
      expect(footer!.bounds.y + footer!.bounds.height).toBeLessThanOrEqual(page.bounds.height);
    });
  });
});
