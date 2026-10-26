import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  FigmaClient,
  FigmaApiError,
  getFigmaNetworkMode,
  assertOnlineAllowed,
  isOfflineMode,
  maskToken,
  planOneShotCapture,
  executeOneShotCapture,
} from "../src/api/index.js";
import {
  createEmptyManifest,
  registerCacheEntry,
  verifyCacheEntry,
  getFigmaReference,
  CacheEntry,
} from "../src/cache/cacheManifest.js";
import { isPathInsideDirectory } from "../tools/visual-regression/safe_word_automation.js";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";

describe("Phase 33: Offline-First Fidelity Engine & One-Shot Capture Suite", () => {
  const originalFetch = globalThis.fetch;
  const originalEnvMode = process.env.FIGMA_NETWORK_MODE;

  beforeEach(() => {
    delete process.env.FIGMA_NETWORK_MODE; // Default strictly offline
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnvMode !== undefined) {
      process.env.FIGMA_NETWORK_MODE = originalEnvMode;
    } else {
      delete process.env.FIGMA_NETWORK_MODE;
    }
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Pillar 1: Offline-First Network Blocking Policy (Zero Calls by Default)
  // --------------------------------------------------------------------------
  describe("Pillar 1: Offline Network Blocking Policy", () => {
    it("1.1 defaults to offline mode when FIGMA_NETWORK_MODE is unset", () => {
      delete process.env.FIGMA_NETWORK_MODE;
      expect(getFigmaNetworkMode()).toBe("offline");
      expect(isOfflineMode()).toBe(true);
    });

    it("1.2 throws structured REFERENCE_NOT_CACHED error on assertOnlineAllowed in offline mode", () => {
      delete process.env.FIGMA_NETWORK_MODE;
      expect(() => assertOnlineAllowed("GET /v1/files/abc")).toThrow(FigmaApiError);
      try {
        assertOnlineAllowed("GET /v1/files/abc");
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.details).toEqual(
          expect.objectContaining({ code: "REFERENCE_NOT_CACHED" })
        );
      }
    });

    it("1.3 blocks FigmaClient network fetchFile even when accessToken is provided in offline mode", async () => {
      delete process.env.FIGMA_NETWORK_MODE;
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      const client = new FigmaClient({ accessToken: "figd_secret_token_12345" });
      expect(client.getNetworkMode()).toBe("offline");

      await expect(client.fetchFile("someFileKey")).rejects.toThrow(
        /Blocked Figma network call/
      );
      // Absolute guarantee: 0 network calls initiated
      expect(mockFetch).toHaveBeenCalledTimes(0);
    });

    it("1.4 blocks remote image downloads in offline mode with zero fetch calls", async () => {
      delete process.env.FIGMA_NETWORK_MODE;
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      const client = new FigmaClient({ accessToken: "token" });
      await expect(
        client.downloadImageAsBase64("https://s3.amazonaws.com/figma/img.png")
      ).rejects.toThrow(/Blocked Figma network call/);

      expect(mockFetch).toHaveBeenCalledTimes(0);
    });

    it("1.5 resolveImages in offline mode returns only cached images and makes 0 API requests", async () => {
      delete process.env.FIGMA_NETWORK_MODE;
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      const client = new FigmaClient({ accessToken: "token" });
      client.preloadImageCache({
        cachedRef1: "data:image/png;base64,CACHED_DATA",
      });

      const mockTree: any = {
        id: "root",
        children: [
          { id: "1", type: "RECTANGLE", fills: [{ type: "IMAGE", imageRef: "cachedRef1" }] },
          { id: "2", type: "RECTANGLE", fills: [{ type: "IMAGE", imageRef: "uncachedRef2" }] },
        ],
      };

      const resolved = await client.resolveImages("fileKey", mockTree);

      expect(resolved["cachedRef1"]).toBe("data:image/png;base64,CACHED_DATA");
      expect(resolved["uncachedRef2"]).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(0);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 2: Cache Manifest & Integrity Verification
  // --------------------------------------------------------------------------
  describe("Pillar 2: Cache Manifest & Integrity Verification", () => {
    it("2.1 correctly registers entries and computes SHA-256 integrity", () => {
      const manifest = createEmptyManifest();
      const tmpFile = path.join(os.tmpdir(), `f2w_test_cache_${Date.now()}.png`);
      fs.writeFileSync(tmpFile, "test-png-binary-content-1234");

      try {
        const entry: CacheEntry = {
          sourceType: "FIGMA_REFERENCE",
          fileKey: "testFile",
          nodeId: "10:20",
          frameName: "Hero Frame",
          width: 800,
          height: 600,
          imagePath: tmpFile,
          fileSizeBytes: fs.statSync(tmpFile).size,
          sha256Hash: "invalid_hash_to_trigger_integrity_failure",
          capturedAt: new Date().toISOString(),
          captureMethod: "unit_test",
          verificationStatus: "NOT_VERIFIED",
          versionMatch: "UNVERIFIED",
        };

        registerCacheEntry(manifest, entry);

        // Integrity verification fails on hash mismatch
        const verifyFail = verifyCacheEntry(entry);
        expect(verifyFail.valid).toBe(false);
        expect(verifyFail.reason).toContain("SHA-256 hash mismatch");

        // Now update with correct hash
        const crypto = require("crypto");
        entry.sha256Hash = crypto.createHash("sha256").update(fs.readFileSync(tmpFile)).digest("hex");
        const verifySuccess = verifyCacheEntry(entry);
        expect(verifySuccess.valid).toBe(true);
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    });

    it("2.2 strictly rejects WORD_RENDERED images when querying for FIGMA_REFERENCE", () => {
      const manifest = createEmptyManifest();
      const wordRenderedEntry: CacheEntry = {
        sourceType: "WORD_RENDERED",
        fileKey: "myDesign",
        nodeId: "1:2",
        frameName: "Page 1",
        width: 1440,
        height: 900,
        imagePath: "debug/pages/page-001.png",
        capturedAt: new Date().toISOString(),
        captureMethod: "word_pdf_coregraphics",
        verificationStatus: "VERIFIED",
        versionMatch: "UNVERIFIED",
      };

      registerCacheEntry(manifest, wordRenderedEntry);

      // getFigmaReference must return null for WORD_RENDERED
      const found = getFigmaReference(manifest, "myDesign", "1:2");
      expect(found).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 3: One-Shot Reference Capture & Fail-Fast Rate Limiting
  // --------------------------------------------------------------------------
  describe("Pillar 3: One-Shot Reference Capture & Fail-Fast Safety", () => {
    it("3.1 safely masks access tokens for diagnostic logs", () => {
      expect(maskToken("figd_abcdef1234567890")).toBe("***MASKED_SECRET***");
      expect(maskToken("short")).toBe("***MASKED_SECRET***");
      expect(maskToken(undefined)).toBe("<none>");
    });

    it("3.2 calculates batched request counts and produces dry-run plan with 0 HTTP calls", async () => {
      const mockFetch = vi.fn();

      const manifest = createEmptyManifest();
      const plan = planOneShotCapture(
        {
          fileKeyOrUrl: "https://www.figma.com/design/testKey/Doc",
          targetNodes: [
            { nodeId: "1:1", frameName: "F1" },
            { nodeId: "1:2", frameName: "F2" },
            { nodeId: "1:3", frameName: "F3" },
            { nodeId: "1:4", frameName: "F4" },
            { nodeId: "1:5", frameName: "F5" },
          ],
          batchSize: 2, // 5 frames / 2 per batch -> 3 Figma API requests
          dryRun: true,
        },
        manifest
      );

      expect(plan.fileKey).toBe("testKey");
      expect(plan.totalTargetFrames).toBe(5);
      expect(plan.cachedFramesCount).toBe(0);
      expect(plan.expectedFigmaApiRequests).toBe(3);
      expect(plan.expectedImageDownloads).toBe(5);
      expect(plan.totalHttpRequests).toBe(8);
      expect(plan.dryRunOnly).toBe(true);

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        targetNodes: [{ nodeId: "1:1" }],
        dryRun: true,
        fetchFn: mockFetch,
      });

      expect(result.dryRun).toBe(true);
      expect(result.actualFigmaApiCalls).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(0);
    });

    it("3.3 immediately aborts with Fail-Fast upon encountering HTTP 429 without retry loops", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/images/")) {
          return {
            ok: false,
            status: 429,
            statusText: "Too Many Requests",
            json: async () => ({ err: "Rate limit reached" }),
          } as Response;
        }
        return { ok: true } as Response;
      });

      const tmpManifest = path.join(os.tmpdir(), `manifest_${Date.now()}.json`);

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        accessToken: "figd_test_token",
        targetNodes: [{ nodeId: "1:1" }, { nodeId: "1:2" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true, // User explicit consent flag
        fetchFn: mockFetch,
        manifestPath: tmpManifest,
      });

      expect(result.abortedDueToRateLimit).toBe(true);
      expect(result.errors.some((e) => e.includes("429"))).toBe(true);
      // Strictly halted after the first 429 response without infinite retry loops
      expect(result.actualFigmaApiCalls).toBe(1);

      if (fs.existsSync(tmpManifest)) fs.unlinkSync(tmpManifest);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 4: Directory Boundary Defense (Phase 32 Residual Hardening)
  // --------------------------------------------------------------------------
  describe("Pillar 4: Directory Boundary Defense", () => {
    it("4.1 accurately distinguishes strict subdirectories from prefix collisions", () => {
      const parentDir = "/tmp/f2w_word_isolation/vr_123";

      // Same directory
      expect(isPathInsideDirectory("/tmp/f2w_word_isolation/vr_123", parentDir)).toBe(true);

      // Genuine child file
      expect(isPathInsideDirectory("/tmp/f2w_word_isolation/vr_123/document.docx", parentDir)).toBe(true);
      expect(isPathInsideDirectory("/tmp/f2w_word_isolation/vr_123/sub/nested.pdf", parentDir)).toBe(true);

      // False positive prefix collision: vr_1234 MUST NOT match vr_123
      expect(isPathInsideDirectory("/tmp/f2w_word_isolation/vr_1234/document.docx", parentDir)).toBe(false);
      expect(isPathInsideDirectory("/tmp/f2w_word_isolation/vr_123_backup", parentDir)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 5: Cascading Opacity & Structural Fidelity
  // --------------------------------------------------------------------------
  describe("Pillar 5: Cascading Opacity & Structural Fidelity", () => {
    it("5.1 propagates parent group/frame opacity down to nested child elements in Canvas IR", () => {
      const parser = new FigmaCanvasParser({ scalePolicy: "none" });

      const mockSnapshot: any = {
        id: "frame1",
        name: "Page 1",
        type: "FRAME",
        absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
        children: [
          {
            id: "group1",
            name: "SemiTransparentGroup",
            type: "GROUP",
            opacity: 0.5, // 50% opacity on group
            absoluteBoundingBox: { x: 10, y: 10, width: 200, height: 100 },
            children: [
              {
                id: "card1",
                name: "ChildCard",
                type: "RECTANGLE",
                opacity: 0.8, // 80% opacity on child -> cascading = 0.5 * 0.8 = 0.4
                absoluteBoundingBox: { x: 10, y: 10, width: 200, height: 100 },
                fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
              },
            ],
          },
        ],
      };

      const doc = parser.parse(mockSnapshot);
      const card = doc.pages[0].elements.find((e) => e.id === "card1");
      expect(card).toBeDefined();
      expect(card?.opacity).toBeCloseTo(0.4, 2);
    });

    it("5.2 renders VML fill opacity and HWPX alpha when element opacity is < 1.0", async () => {
      const docxRenderer = new DocxCanvasRenderer();
      const hwpxRenderer = new HwpxCanvasRenderer();

      const sampleDoc: any = {
        metadata: { title: "Test Doc", created: new Date().toISOString() },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
            elements: [
              {
                id: "translucent_card",
                type: "card",
                bounds: { x: 50, y: 50, width: 100, height: 100 },
                zIndex: 1,
                opacity: 0.5,
                style: {
                  fillColor: "#FF0000",
                  strokeColor: "#0000FF",
                  strokeWidth: 1,
                },
              },
            ],
          },
        ],
      };

      const docxBuf = await docxRenderer.renderToBuffer(sampleDoc);
      const hwpxBuf = await hwpxRenderer.renderToBuffer(sampleDoc);

      expect(docxBuf.length).toBeGreaterThan(1000);
      expect(hwpxBuf.length).toBeGreaterThan(1000);

      // Unzip docx to inspect document.xml
      const JSZip = (await import("jszip")).default;
      const docxZip = await JSZip.loadAsync(docxBuf);
      const docXml = await docxZip.file("word/document.xml")!.async("string");

      // Verifies VML rendered fill opacity = 0.50 and stroke opacity = 0.50
      expect(docXml).toContain('<v:fill opacity="0.50"/>');
      expect(docXml).toContain('<v:stroke opacity="0.50"/>');

      // Unzip hwpx to inspect section0.xml
      const hwpxZip = await JSZip.loadAsync(hwpxBuf);
      const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

      // Verifies HWPX alpha = round((1 - 0.5) * 255) = 128
      expect(secXml).toContain('alpha="128"');
    });
  });
});
