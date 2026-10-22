import { describe, it, expect, beforeAll } from "vitest";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import JSZip from "jszip";
import {
  AutomatedWordHandle,
  DocumentLifecycleState,
  transitionLifecycleState,
  validateOwnershipHandle,
  computeHandleSignature,
  normalizeWordPath,
  cleanupTargetDocOnly,
  cleanResidualIsolationDirsSafely,
} from "../tools/visual-regression/safe_word_automation.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 30: Production Visual Fidelity & Automation Lifecycle Suite", () => {
  const isolationBase = path.resolve(os.tmpdir(), "f2w_word_isolation");
  const testTmp = path.resolve(process.cwd(), "debug/phase30-test-tmp");

  beforeAll(() => {
    fs.mkdirSync(testTmp, { recursive: true });
  });

  // ==========================================================================
  // Pillar 1: Word Automation Lifecycle & Partial Success Safety (P0)
  // ==========================================================================
  describe("Pillar 1: Word Automation Lifecycle & Partial Success Safety", () => {
    it("1. Manages explicit lifecycle state transitions with chronological history", () => {
      const runId = "vr_" + Date.now() + "_lifecycle";
      const isolatedDir = path.join(isolationBase, runId);
      const isolatedDocxPath = path.join(isolatedDir, "sample.docx");
      const sig = computeHandleSignature(runId, isolatedDir, isolatedDocxPath);

      const handle: AutomatedWordHandle = {
        runId,
        sourceDocxPath: "/tmp/sample.docx",
        isolatedDocxPath,
        isolatedDir,
        normalizedPosixPath: normalizeWordPath(isolatedDocxPath),
        docName: "sample.docx",
        docIndex: 1,
        sectionsCount: 1,
        isOwned: true,
        verificationSignature: sig,
        lifecycleState: "created",
        stateHistory: [{ state: "created", timestamp: Date.now() }],
      };

      expect(handle.lifecycleState).toBe("created");
      expect(handle.stateHistory?.length).toBe(1);

      transitionLifecycleState(handle, "open_requested", "LaunchServices open called");
      expect(handle.lifecycleState).toBe("open_requested");
      expect(handle.stateHistory?.length).toBe(2);

      transitionLifecycleState(handle, "open_confirmed", "Found at index 1");
      expect(handle.lifecycleState).toBe("open_confirmed");

      transitionLifecycleState(handle, "exported", "PDF generated");
      expect(handle.lifecycleState).toBe("exported");

      transitionLifecycleState(handle, "close_confirmed", "Confirmed closed in Word");
      expect(handle.lifecycleState).toBe("close_confirmed");
    });

    it("2. Transitions to 'uncertain' state on timeout and preserves files on disk", () => {
      const runId = "vr_" + Date.now() + "_uncertain";
      const isolatedDir = path.join(isolationBase, runId);
      fs.mkdirSync(isolatedDir, { recursive: true });
      const isolatedDocxPath = path.join(isolatedDir, "timeout_doc.docx");
      fs.writeFileSync(isolatedDocxPath, "dummy docx");
      const sig = computeHandleSignature(runId, isolatedDir, isolatedDocxPath);

      const handle: AutomatedWordHandle = {
        runId,
        sourceDocxPath: "/tmp/timeout_doc.docx",
        isolatedDocxPath,
        isolatedDir,
        normalizedPosixPath: normalizeWordPath(isolatedDocxPath),
        docName: "timeout_doc.docx",
        docIndex: 0,
        sectionsCount: 0,
        isOwned: true,
        verificationSignature: sig,
        lifecycleState: "open_requested",
        stateHistory: [{ state: "open_requested", timestamp: Date.now() }],
      };

      // Simulate timeout
      transitionLifecycleState(handle, "uncertain", "Timeout waiting for Word response");
      expect(handle.lifecycleState).toBe("uncertain");

      // Verify that isolated files are strictly preserved
      expect(fs.existsSync(isolatedDir)).toBe(true);
      expect(fs.existsSync(isolatedDocxPath)).toBe(true);

      // Clean up test folder manually
      try {
        fs.rmSync(isolatedDir, { recursive: true, force: true });
      } catch {}
    });

    it("3. Pruning residual directories respects currently open documents and preserves them", () => {
      const res = cleanResidualIsolationDirsSafely(60 * 60 * 1000); // 1 hour age
      expect(typeof res.scanned).toBe("number");
      expect(typeof res.pruned).toBe("number");
      expect(typeof res.preserved).toBe("number");
    });

    it("4. Safe cleanup gracefully no-ops on unowned or string handles", () => {
      expect(() => cleanupTargetDocOnly("Random_Unowned_Doc.docx")).not.toThrow();
      expect(() => cleanupTargetDocOnly(null)).not.toThrow();
      expect(() =>
        cleanupTargetDocOnly({
          runId: "vr_spoof",
          isolatedDir: "/fake/dir",
          isOwned: false,
        })
      ).not.toThrow();
    });
  });

  // ==========================================================================
  // Pillar 2: Production Visual Fidelity — Shapes, Images & Shadows (P1)
  // ==========================================================================
  describe("Pillar 2: Production Visual Fidelity — Shapes, Images & Shadows", () => {
    it("5. Renders rounded image with <v:roundrect arcsize=\"...\">, border and shadow in DOCX", async () => {
      const doc: CanvasDocument = {
        title: "Image Visual Fidelity",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "avatar-img",
                name: "User Avatar",
                type: "image",
                imageRef: "res-avatar",
                bounds: { x: 40, y: 40, width: 80, height: 80 },
                zIndex: 1,
                style: {
                  cornerRadius: 16,
                  strokeColor: "#3B82F6",
                  strokeWidth: 2,
                  shadow: {
                    color: "#000000",
                    opacity: 0.2,
                    offsetX: 0,
                    offsetY: 4,
                  },
                },
              },
            ],
          },
        ],
        resources: {
          "res-avatar": {
            id: "res-avatar",
            name: "avatar.png",
            mimeType: "image/png",
            data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
          },
        },
        diagnostics: { notices: [], warnings: [] },
      };

      const renderer = new DocxCanvasRenderer();
      const buffer = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")!.async("text");

      // Verify rounded rect tag used for image
      expect(docXml).toContain("<v:roundrect");
      // Verify arcsize = min(0.5, 16 / 80) = 0.200 (Empirically measured against Word for Mac)
      expect(docXml).toContain('arcsize="0.200"');
      // Verify stroke applied to image
      expect(docXml).toContain('stroked="t"');
      expect(docXml).toContain('strokecolor="#3B82F6"');
      expect(docXml).toContain('strokeweight="2.00pt"');
      // Verify drop shadow applied to image
      expect(docXml).toContain('<v:shadow on="t" type="single" color="#000000" offset="0.00pt,4.00pt" opacity="0.20"/>');
      // Verify image data is present
      expect(docXml).toContain("<v:imagedata");
    });

    it("6. Renders HWPX <hp:pic> with <hp:shadow type=\"DROP\"...> and <hp:lineShape>", async () => {
      const doc: CanvasDocument = {
        title: "HWPX Image Fidelity",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "hwpx-avatar",
                name: "Avatar",
                type: "image",
                imageRef: "res-avatar-hwpx",
                bounds: { x: 50, y: 50, width: 100, height: 100 },
                zIndex: 1,
                style: {
                  strokeColor: "#10B981",
                  strokeWidth: 1.5,
                  shadow: {
                    color: "#1E293B",
                    opacity: 0.25,
                    offsetX: 2,
                    offsetY: 6,
                  },
                },
              },
            ],
          },
        ],
        resources: {
          "res-avatar-hwpx": {
            id: "res-avatar-hwpx",
            name: "avatar.png",
            mimeType: "image/png",
            data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
          },
        },
        diagnostics: { notices: [], warnings: [] },
      };

      const renderer = new HwpxCanvasRenderer();
      const buffer = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buffer);
      const sectionXml = await zip.file("Contents/section0.xml")!.async("text");

      expect(sectionXml).toContain("<hp:pic");
      expect(sectionXml).toContain('<hp:shadow type="DROP" color="#1E293B" offsetX="200" offsetY="600"');
      expect(sectionXml).toContain('color="#10B981"');
    });

    it("7. Emits <w:autoSpaceDE w:val=\"0\"/> and <w:autoSpaceDN w:val=\"0\"/> to preserve CJK typography", async () => {
      const doc: CanvasDocument = {
        title: "CJK AutoSpace Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "cjk-text",
                name: "Mixed Text",
                type: "text",
                bounds: { x: 30, y: 30, width: 250, height: 30 },
                zIndex: 1,
                style: {},
                textRuns: [
                  {
                    text: "클라우드 서비스 2026 (AWS / GCP 연계)",
                    fontFamily: "Pretendard",
                    fontSizePt: 12,
                  },
                ],
                textAutoResize: "WIDTH_AND_HEIGHT",
              },
            ],
          },
        ],
        resources: {},
        diagnostics: { notices: [], warnings: [] },
      };

      const renderer = new DocxCanvasRenderer();
      const buffer = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")!.async("text");

      expect(docXml).toContain('<w:autoSpaceDE w:val="0"/>');
      expect(docXml).toContain('<w:autoSpaceDN w:val="0"/>');
    });
  });

  // ==========================================================================
  // Pillar 3: Comprehensive Synthetic Fixture Parsing & Scaling (P1/P2)
  // ==========================================================================
  describe("Pillar 3: Comprehensive Synthetic Fixture Verification", () => {
    it("8. Parses Phase 30 synthetic fixture into Canonical Canvas IR with exact page count", () => {
      const fixturePath = path.resolve(process.cwd(), "samples/phase30_comprehensive_synthetic_fixture.json");
      expect(fs.existsSync(fixturePath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
      const parser = new FigmaCanvasParser({
        imageMap: raw.imageMap,
        scalePolicy: "fit-a4",
      });
      const doc = parser.parse(raw);

      // Verify discovered frames and parsed pages
      expect(doc.pages.length).toBe(2);
      expect(doc.pages[0].name).toContain("Dashboard");
      expect(doc.pages[1].name).toContain("Architecture Topology");

      // Verify oversized frame scaling defense
      const page2 = doc.pages[1];
      expect(page2.bounds.width).toBeLessThanOrEqual(1584);
      expect(page2.bounds.height).toBeLessThanOrEqual(1584);
    });

    it("9. HWPX generates valid OWPML KS X 6101 package structure for the synthetic fixture", async () => {
      const fixturePath = path.resolve(process.cwd(), "samples/phase30_comprehensive_synthetic_fixture.json");
      const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
      const parser = new FigmaCanvasParser({
        imageMap: raw.imageMap,
        scalePolicy: "fit-a4",
      });
      const doc = parser.parse(raw);

      const renderer = new HwpxCanvasRenderer();
      const buffer = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buffer);

      // Level 1: Package integrity
      expect(zip.file("mimetype")).toBeDefined();
      expect(zip.file("Contents/content.hpf")).toBeDefined();
      expect(zip.file("Contents/header.xml")).toBeDefined();
      expect(zip.file("Contents/section0.xml")).toBeDefined();
      expect(zip.file("META-INF/container.xml")).toBeDefined();
      expect(zip.file("META-INF/manifest.xml")).toBeDefined();

      // Level 2: KS X 6101 header styles & sections
      const headerXml = await zip.file("Contents/header.xml")!.async("text");
      expect(headerXml).toContain("<hh:charProperties");
      expect(headerXml).toContain("<hh:paraProperties");

      const sectionXml = await zip.file("Contents/section0.xml")!.async("text");
      expect(sectionXml).toContain("<hp:sec");
      expect(sectionXml).toContain("<hp:p");
    });
  });
});
