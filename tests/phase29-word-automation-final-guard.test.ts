import { describe, it, expect } from "vitest";
import * as path from "path";
import * as os from "os";
import {
  validateOwnershipHandle,
  computeHandleSignature,
  AutomatedWordHandle,
  normalizeWordPath,
  cleanupTargetDocOnly,
  exportAndCloseTargetDocOnly,
} from "../tools/visual-regression/safe_word_automation.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";
import JSZip from "jszip";

describe("Phase 29: Word Automation Final Hardening, Ownership Integrity & Quality Verification", () => {
  const isolationBase = path.resolve(os.tmpdir(), "f2w_word_isolation");

  // --------------------------------------------------------------------------
  // Pillar 1: Anti-Spoofing & Cryptographic Ownership Validation
  // --------------------------------------------------------------------------
  describe("Pillar 1: Handle Spoofing Defense & Ownership Verification", () => {
    it("1. Generates authentic cryptographic signatures and validates legitimate handles", () => {
      const runId = "vr_" + Date.now() + "_test1234";
      const isolatedDir = path.join(isolationBase, runId);
      const isolatedDocxPath = path.join(isolatedDir, "test.docx");
      const signature = computeHandleSignature(runId, isolatedDir, isolatedDocxPath);

      const validHandle: AutomatedWordHandle = {
        runId,
        sourceDocxPath: "/projects/test.docx",
        isolatedDocxPath,
        isolatedDir,
        normalizedPosixPath: normalizeWordPath(isolatedDocxPath),
        docName: "test.docx",
        docIndex: 1,
        sectionsCount: 1,
        isOwned: true,
        verificationSignature: signature,
      };

      expect(() => validateOwnershipHandle(validHandle)).not.toThrow();
    });

    it("2. Rejects forged handle with path traversal attempting to target user files", () => {
      const runId = "vr_" + Date.now() + "_evil";
      const userDoc = "/Users/victim/Documents/Confidential.docx";

      const forgedHandle: AutomatedWordHandle = {
        runId,
        sourceDocxPath: userDoc,
        isolatedDocxPath: userDoc,
        isolatedDir: "/Users/victim/Documents",
        normalizedPosixPath: normalizeWordPath(userDoc),
        docName: "Confidential.docx",
        docIndex: 1,
        sectionsCount: 1,
        isOwned: true,
        verificationSignature: "fake_signature",
      };

      expect(() => validateOwnershipHandle(forgedHandle)).toThrow(
        /Security violation: isolatedDir.*is outside safe isolation base/
      );
    });

    it("3. Rejects tampered HMAC signature (counterfeit handle defense)", () => {
      const runId = "vr_" + Date.now() + "_tampered";
      const isolatedDir = path.join(isolationBase, runId);
      const isolatedDocxPath = path.join(isolatedDir, "test.docx");

      const tamperedHandle: AutomatedWordHandle = {
        runId,
        sourceDocxPath: "/projects/test.docx",
        isolatedDocxPath,
        isolatedDir,
        normalizedPosixPath: normalizeWordPath(isolatedDocxPath),
        docName: "test.docx",
        docIndex: 1,
        sectionsCount: 1,
        isOwned: true,
        verificationSignature: "0123456789abcdef0123456789abcdef", // FORGED
      };

      expect(() => validateOwnershipHandle(tamperedHandle)).toThrow(
        /invalid or forged cryptographic verification signature/
      );
    });

    it("4. Rejects handle with mismatched runId and directory basename", () => {
      const runId = "vr_" + Date.now() + "_validRun";
      const isolatedDir = path.join(isolationBase, "vr_different_directory");
      const isolatedDocxPath = path.join(isolatedDir, "test.docx");
      const sig = computeHandleSignature(runId, isolatedDir, isolatedDocxPath);

      const mismatchedHandle: AutomatedWordHandle = {
        runId,
        sourceDocxPath: "/projects/test.docx",
        isolatedDocxPath,
        isolatedDir,
        normalizedPosixPath: normalizeWordPath(isolatedDocxPath),
        docName: "test.docx",
        docIndex: 1,
        sectionsCount: 1,
        isOwned: true,
        verificationSignature: sig,
      };

      expect(() => validateOwnershipHandle(mismatchedHandle)).toThrow(
        /isolatedDir basename.*does not match runId/
      );
    });

    it("5. Rejects raw string handles and non-object inputs", () => {
      expect(() => validateOwnershipHandle("MyDocument.docx")).toThrow(
        /handle must be a validated AutomatedWordHandle object/
      );
      expect(() => validateOwnershipHandle(null)).toThrow(
        /handle must be a validated AutomatedWordHandle object/
      );
    });

    it("6. Safe cleanup gracefully no-ops on unverified or spoofed handles without closing anything", () => {
      // Must not throw, and must not execute closing commands on user documents
      expect(() => cleanupTargetDocOnly("Random_Unowned_Doc.docx")).not.toThrow();
      expect(() =>
        cleanupTargetDocOnly({
          runId: "vr_spoof",
          isolatedDir: "/invalid/dir",
          isOwned: true,
        })
      ).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 2: Conversion Quality & Drop Shadow Support (DOCX & HWPX)
  // --------------------------------------------------------------------------
  describe("Pillar 2: Conversion Quality & Drop Shadow Support (DOCX & HWPX)", () => {
    it("7. Parses Figma DROP_SHADOW effect into CanvasStyle.shadow", () => {
      const parser = new FigmaCanvasParser();
      const rawFigma = {
        id: "rect-shadow-1",
        name: "Card with Drop Shadow",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 100, y: 100, width: 200, height: 100 },
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
        effects: [
          {
            type: "DROP_SHADOW",
            visible: true,
            color: { r: 0.1, g: 0.2, b: 0.3, a: 0.25 },
            offset: { x: 4, y: 8 },
            radius: 12,
            spread: 0,
          },
        ],
      };

      const style = (parser as any).extractStyle(rawFigma, 0.75);
      expect(style.shadow).toBeDefined();
      expect(style.shadow.color).toBe("#1A334D");
      expect(style.shadow.opacity).toBe(0.25);
      expect(style.shadow.offsetX).toBe(4 * 0.75);
      expect(style.shadow.offsetY).toBe(8 * 0.75);
      expect(style.shadow.blur).toBe(12 * 0.75);
    });

    it("8. Renders VML <v:shadow> child element in DOCX output", async () => {
      const doc: CanvasDocument = {
        title: "Drop Shadow DOCX Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "card-shadow",
                name: "Card with Shadow",
                type: "card",
                bounds: { x: 50, y: 50, width: 200, height: 100 },
                zIndex: 1,
                style: {
                  fillColor: "#FFFFFF",
                  cornerRadius: 8,
                  shadow: {
                    color: "#000000",
                    opacity: 0.15,
                    offsetX: 2,
                    offsetY: 4,
                  },
                },
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

      expect(docXml).toContain('<v:shadow on="t" type="single" color="#000000" offset="2.00pt,4.00pt" opacity="0.15"/>');
    });

    it("9. Renders KS X 6101 <hp:shadow type=\"DROP\"...> element in HWPX output", async () => {
      const doc: CanvasDocument = {
        title: "Drop Shadow HWPX Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "hwpx-card-shadow",
                name: "HWPX Shadow Card",
                type: "card",
                bounds: { x: 50, y: 50, width: 200, height: 100 },
                zIndex: 1,
                style: {
                  fillColor: "#F5F5F5",
                  cornerRadius: 6,
                  shadow: {
                    color: "#333333",
                    opacity: 0.3,
                    offsetX: 3,
                    offsetY: 5,
                  },
                },
              },
            ],
          },
        ],
        resources: {},
        diagnostics: { notices: [], warnings: [] },
      };

      const renderer = new HwpxCanvasRenderer();
      const buffer = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buffer);
      const sectionXml = await zip.file("Contents/section0.xml")!.async("text");

      expect(sectionXml).toContain('<hp:shadow type="DROP" color="#333333"');
      expect(sectionXml).toContain('offsetX="300"'); // 3 pt * 100 hwpu = 300
      expect(sectionXml).toContain('offsetY="500"'); // 5 pt * 100 hwpu = 500
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 3: Typography & Single-Line Word Wrap Defense
  // --------------------------------------------------------------------------
  describe("Pillar 3: Typography & Single-Line Word Wrap Defense", () => {
    it("10. Uses w:lineRule=\"atLeast\" for tight line heights preventing Korean ascender/descender clipping", async () => {
      const doc: CanvasDocument = {
        title: "Typography Tight Line Test",
        pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "korean-badge",
                name: "Korean Badge",
                type: "text",
                bounds: { x: 20, y: 20, width: 80, height: 20 },
                zIndex: 1,
                style: {},
                textRuns: [
                  {
                    text: "진행중",
                    fontFamily: "Pretendard",
                    fontSizePt: 14,
                    lineHeightPt: 16, // tight line height (< 14 * 1.25 = 17.5)
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

      // Verify lineRule="atLeast" is emitted for tight line height
      expect(docXml).toContain('w:lineRule="atLeast"');
      // Verify word wrap is disabled
      expect(docXml).toContain('<w:wordWrap w:val="0"/>');
    });
  });
});
