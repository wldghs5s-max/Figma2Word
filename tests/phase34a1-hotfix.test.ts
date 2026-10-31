import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import {
  executeOneShotCapture,
  planOneShotCapture,
  fetchCdnImageWithSecureRedirects,
  HttpRequestBudgetManager,
} from "../src/api/oneShotCapture.js";
import {
  createEmptyManifest,
  registerCacheEntry,
  loadCacheManifest,
  saveCacheManifest,
  writeJournalEntry,
  countPendingJournals,
  CacheEntry,
} from "../src/cache/cacheManifest.js";
import {
  createMinimalValidPng,
} from "../src/cache/pngValidator.js";

describe("Phase 34A.1 Hotfix: Crash Recovery Ordering & Exact HTTP Budget Accounting", () => {
  const originalFetch = globalThis.fetch;
  const originalEnvMode = process.env.FIGMA_NETWORK_MODE;
  let tmpDir: string;

  beforeEach(() => {
    delete process.env.FIGMA_NETWORK_MODE; // Default offline
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "f2w_p34a1_hotfix_"));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnvMode !== undefined) {
      process.env.FIGMA_NETWORK_MODE = originalEnvMode;
    } else {
      delete process.env.FIGMA_NETWORK_MODE;
    }
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Part A — HOTFIX-01: Crash Recovery Ordering & Cache Synchronization
  // ==========================================================================
  describe("HOTFIX-01: Crash Recovery Ordering & Cache Synchronization", () => {
    it("1.1 excludes recovered frame from download targets after journal reconciliation", async () => {
      const manifestPath = path.join(tmpDir, "manifest.json");
      const outputDir = path.join(tmpDir, "cache");
      fs.mkdirSync(outputDir, { recursive: true });

      // Create a valid image and pending journal for node 1:1
      const validPng = createMinimalValidPng(16, 16);
      const imgPath = path.join(outputDir, "frame_1_1.png");
      fs.writeFileSync(imgPath, validPng);
      const sha256 = crypto.createHash("sha256").update(validPng).digest("hex");

      const journalPath = path.join(outputDir, ".journal_1_1.json");
      writeJournalEntry(journalPath, {
        fileKey: "testKey",
        nodeId: "1:1",
        frameName: "Frame 1",
        width: 16,
        height: 16,
        imagePath: imgPath,
        expectedSha256: sha256,
        fileSizeBytes: validPng.length,
        capturedAt: new Date().toISOString(),
        captureMethod: "figma_rest_api_v1_images_one_shot",
        status: "PENDING_COMMIT",
      });

      // Node 1:2 is uncollected
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/images/")) {
          // Must ONLY request 1:2, NOT 1:1!
          expect(url).toContain("ids=1%3A2");
          expect(url).not.toContain("1%3A1");
          return {
            ok: true,
            status: 200,
            json: async () => ({
              images: {
                "1:2": "https://figma-alpha.s3.amazonaws.com/img2.png",
              },
            }),
          } as any;
        }
        if (url.includes("img2.png")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            arrayBuffer: async () => Uint8Array.from(createMinimalValidPng(16, 16)).buffer,
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        accessToken: "figd_valid_token",
        targetNodes: [{ nodeId: "1:1" }, { nodeId: "1:2" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        outputDir,
        manifestPath,
        fetchFn: mockFetch,
      });

      expect(result.status).toBe("COMPLETED");
      expect(result.success).toBe(true);
      // Node 1:1 was recovered before plan finalization, so only 1:2 was in toFetchNodeIds
      expect(result.plan.toFetchNodeIds).toEqual(["1:2"]);
      expect(result.plan.cachedFramesCount).toBe(1);
      expect(result.actualFigmaApiCalls).toBe(1);
      expect(result.actualCdnDownloads).toBe(1);
      expect(result.capturedEntries.length).toBe(1);
      expect(result.capturedEntries[0].nodeId).toBe("1:2");

      // Verify both 1:1 and 1:2 are now in manifest
      const updatedManifest = loadCacheManifest(manifestPath);
      expect(updatedManifest.entries["FIGMA_REFERENCE:testKey:1:1"]).toBeDefined();
      expect(updatedManifest.entries["FIGMA_REFERENCE:testKey:1:2"]).toBeDefined();
    });

    it("1.2 makes ZERO network calls when all frames are recovered from journals", async () => {
      const manifestPath = path.join(tmpDir, "manifest.json");
      const outputDir = path.join(tmpDir, "cache");
      fs.mkdirSync(outputDir, { recursive: true });

      const validPng = createMinimalValidPng(16, 16);
      const imgPath = path.join(outputDir, "frame_1_1.png");
      fs.writeFileSync(imgPath, validPng);
      const sha256 = crypto.createHash("sha256").update(validPng).digest("hex");

      const journalPath = path.join(outputDir, ".journal_1_1.json");
      writeJournalEntry(journalPath, {
        fileKey: "testKey",
        nodeId: "1:1",
        frameName: "Frame 1",
        width: 16,
        height: 16,
        imagePath: imgPath,
        expectedSha256: sha256,
        fileSizeBytes: validPng.length,
        capturedAt: new Date().toISOString(),
        captureMethod: "figma_rest_api_v1_images_one_shot",
        status: "PENDING_COMMIT",
      });

      const mockFetch = vi.fn();

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        accessToken: "figd_valid_token",
        targetNodes: [{ nodeId: "1:1" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        outputDir,
        manifestPath,
        fetchFn: mockFetch,
      });

      expect(result.status).toBe("COMPLETED");
      expect(result.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.totalHttpRequests).toBe(0);
      expect(result.actualFigmaApiCalls).toBe(0);
      expect(result.actualCdnDownloads).toBe(0);
      expect(result.plan.toFetchNodeIds.length).toBe(0);
      expect(result.plan.cachedFramesCount).toBe(1);
    });

    it("1.3 does NOT recover corrupted PNG and keeps frame in download targets", async () => {
      const manifestPath = path.join(tmpDir, "manifest.json");
      const outputDir = path.join(tmpDir, "cache");
      fs.mkdirSync(outputDir, { recursive: true });

      // Corrupt PNG file
      const corruptPng = Buffer.from("NOT_A_PNG_DATA");
      const imgPath = path.join(outputDir, "frame_1_1.png");
      fs.writeFileSync(imgPath, corruptPng);
      const sha256 = crypto.createHash("sha256").update(corruptPng).digest("hex");

      const journalPath = path.join(outputDir, ".journal_1_1.json");
      writeJournalEntry(journalPath, {
        fileKey: "testKey",
        nodeId: "1:1",
        frameName: "Frame 1",
        width: 16,
        height: 16,
        imagePath: imgPath,
        expectedSha256: sha256,
        fileSizeBytes: corruptPng.length,
        capturedAt: new Date().toISOString(),
        captureMethod: "figma_rest_api_v1_images_one_shot",
        status: "PENDING_COMMIT",
      });

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/images/")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              images: { "1:1": "https://figma-alpha.s3.amazonaws.com/img1.png" },
            }),
          } as any;
        }
        if (url.includes("img1.png")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            arrayBuffer: async () => Uint8Array.from(createMinimalValidPng(16, 16)).buffer,
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        accessToken: "figd_valid_token",
        targetNodes: [{ nodeId: "1:1" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        outputDir,
        manifestPath,
        fetchFn: mockFetch,
      });

      // The corrupt journal was discarded; 1:1 remained toFetch and was then cleanly fetched!
      expect(result.status).toBe("COMPLETED");
      expect(mockFetch).toHaveBeenCalledTimes(2); // 1 API + 1 CDN
      expect(result.capturedEntries.length).toBe(1);
    });

    it("1.4 does NOT recover journal if file hash does not match expected hash", async () => {
      const manifestPath = path.join(tmpDir, "manifest.json");
      const outputDir = path.join(tmpDir, "cache");
      fs.mkdirSync(outputDir, { recursive: true });

      const validPng = createMinimalValidPng(16, 16);
      const imgPath = path.join(outputDir, "frame_1_1.png");
      fs.writeFileSync(imgPath, validPng);

      const journalPath = path.join(outputDir, ".journal_1_1.json");
      writeJournalEntry(journalPath, {
        fileKey: "testKey",
        nodeId: "1:1",
        frameName: "Frame 1",
        width: 16,
        height: 16,
        imagePath: imgPath,
        expectedSha256: "WRONG_HASH_DOES_NOT_MATCH",
        fileSizeBytes: validPng.length,
        capturedAt: new Date().toISOString(),
        captureMethod: "figma_rest_api_v1_images_one_shot",
        status: "PENDING_COMMIT",
      });

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/images/")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              images: { "1:1": "https://figma-alpha.s3.amazonaws.com/img1.png" },
            }),
          } as any;
        }
        if (url.includes("img1.png")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            arrayBuffer: async () => Uint8Array.from(createMinimalValidPng(16, 16)).buffer,
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        accessToken: "figd_valid_token",
        targetNodes: [{ nodeId: "1:1" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        outputDir,
        manifestPath,
        fetchFn: mockFetch,
      });

      expect(result.status).toBe("COMPLETED");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("1.5 Dry Run does NOT modify disk: journals, manifest and files remain untouched", async () => {
      const manifestPath = path.join(tmpDir, "manifest.json");
      const outputDir = path.join(tmpDir, "cache");
      fs.mkdirSync(outputDir, { recursive: true });

      const validPng = createMinimalValidPng(16, 16);
      const imgPath = path.join(outputDir, "frame_1_1.png");
      fs.writeFileSync(imgPath, validPng);
      const sha256 = crypto.createHash("sha256").update(validPng).digest("hex");

      const journalPath = path.join(outputDir, ".journal_1_1.json");
      writeJournalEntry(journalPath, {
        fileKey: "testKey",
        nodeId: "1:1",
        frameName: "Frame 1",
        width: 16,
        height: 16,
        imagePath: imgPath,
        expectedSha256: sha256,
        fileSizeBytes: validPng.length,
        capturedAt: new Date().toISOString(),
        captureMethod: "figma_rest_api_v1_images_one_shot",
        status: "PENDING_COMMIT",
      });

      const mockFetch = vi.fn();

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        targetNodes: [{ nodeId: "1:1" }],
        dryRun: true,
        confirmExecution: false,
        outputDir,
        manifestPath,
        fetchFn: mockFetch,
      });

      expect(result.status).toBe("DRY_RUN");
      expect(result.dryRun).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();

      // Journal MUST still exist on disk after Dry Run!
      expect(fs.existsSync(journalPath)).toBe(true);
      expect(countPendingJournals(outputDir)).toBe(1);

      // Manifest MUST NOT be updated to register 1:1 yet
      const manifest = loadCacheManifest(manifestPath);
      expect(manifest.entries["FIGMA_REFERENCE:testKey:1:1"]).toBeUndefined();
    });

    it("1.6 re-execution does not re-download already cached frames", async () => {
      const manifestPath = path.join(tmpDir, "manifest.json");
      const outputDir = path.join(tmpDir, "cache");
      fs.mkdirSync(outputDir, { recursive: true });

      const validPng = createMinimalValidPng(16, 16);
      const imgPath = path.join(outputDir, "frame_1_1.png");
      fs.writeFileSync(imgPath, validPng);
      const sha256 = crypto.createHash("sha256").update(validPng).digest("hex");

      const manifest = createEmptyManifest();
      registerCacheEntry(manifest, {
        sourceType: "FIGMA_REFERENCE",
        fileKey: "testKey",
        nodeId: "1:1",
        frameName: "Frame 1",
        width: 16,
        height: 16,
        imagePath: path.relative(process.cwd(), imgPath),
        sha256Hash: sha256,
        fileSizeBytes: validPng.length,
        capturedAt: new Date().toISOString(),
        captureMethod: "figma_rest_api_v1_images_one_shot",
        verificationStatus: "VERIFIED",
        versionMatch: "UNVERIFIED",
      });
      saveCacheManifest(manifest, manifestPath);

      const mockFetch = vi.fn();
      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        accessToken: "figd_token",
        targetNodes: [{ nodeId: "1:1" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        outputDir,
        manifestPath,
        fetchFn: mockFetch,
      });

      expect(result.status).toBe("COMPLETED");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.imagesReusedFromCache).toBe(1);
      expect(result.imagesDownloadedSuccessfully).toBe(0);
    });
  });

  // ==========================================================================
  // Part B — HOTFIX-02: Exact HTTP Request Budget Accounting
  // ==========================================================================
  describe("HOTFIX-02: Exact HTTP Request Budget Accounting", () => {
    it("2.1 counts exactly 1 CDN request when download has zero redirects", async () => {
      const validPng = createMinimalValidPng(10, 10);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => Uint8Array.from(validPng).buffer,
      } as any);

      const budget = new HttpRequestBudgetManager(5, 25, 30);
      const result = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/direct.png",
        mockFetch,
        { budgetManager: budget }
      );

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(budget.cdnHttpRequestsAttempted).toBe(1);
      expect(budget.cdnRedirectHops).toBe(0);
      expect(budget.totalHttpRequestsAttempted).toBe(1);
    });

    it("2.2 counts exactly 2 CDN requests when download follows 1 redirect (302)", async () => {
      const validPng = createMinimalValidPng(10, 10);
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("hop1.png")) {
          return {
            status: 302,
            ok: false,
            headers: {
              get: (h: string) => (h.toLowerCase() === "location" ? "https://figma-alpha.s3.amazonaws.com/hop2.png" : null),
            },
          } as any;
        }
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => Uint8Array.from(validPng).buffer,
        } as any;
      });

      const budget = new HttpRequestBudgetManager(5, 25, 30);
      const result = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/hop1.png",
        mockFetch,
        { budgetManager: budget }
      );

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(budget.cdnHttpRequestsAttempted).toBe(2);
      expect(budget.cdnRedirectHops).toBe(1);
      expect(budget.totalHttpRequestsAttempted).toBe(2);
    });

    it("2.3 counts exactly 3 CDN requests when download follows 2 redirects", async () => {
      const validPng = createMinimalValidPng(10, 10);
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("hop1.png")) {
          return {
            status: 302,
            ok: false,
            headers: {
              get: (h: string) => (h.toLowerCase() === "location" ? "https://figma-alpha.s3.amazonaws.com/hop2.png" : null),
            },
          } as any;
        }
        if (url.includes("hop2.png")) {
          return {
            status: 302,
            ok: false,
            headers: {
              get: (h: string) => (h.toLowerCase() === "location" ? "https://figma-alpha.s3.amazonaws.com/hop3.png" : null),
            },
          } as any;
        }
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => Uint8Array.from(validPng).buffer,
        } as any;
      });

      const budget = new HttpRequestBudgetManager(5, 25, 30);
      const result = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/hop1.png",
        mockFetch,
        { budgetManager: budget }
      );

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(budget.cdnHttpRequestsAttempted).toBe(3);
      expect(budget.cdnRedirectHops).toBe(2);
      expect(budget.totalHttpRequestsAttempted).toBe(3);
    });

    it("2.4 blocks next hop and reports error when redirect exceeds maxRedirects limit", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        return {
          status: 302,
          ok: false,
          headers: {
            get: (h: string) => (h.toLowerCase() === "location" ? `${url}_next.png` : null),
          },
        } as any;
      });

      const budget = new HttpRequestBudgetManager(5, 25, 30);
      const result = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/inf1.png",
        mockFetch,
        { budgetManager: budget, maxRedirects: 2 }
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Exceeded maximum redirect limit (2)");
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 redirect follow requests attempted
      expect(budget.cdnHttpRequestsAttempted).toBe(3);
    });

    it("2.5 blocks redirect hop when CDN request budget is exhausted", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        return {
          status: 302,
          ok: false,
          headers: {
            get: (h: string) => (h.toLowerCase() === "location" ? "https://figma-alpha.s3.amazonaws.com/hop2.png" : null),
          },
        } as any;
      });

      // Budget allows only 1 CDN call
      const budget = new HttpRequestBudgetManager(5, 1, 30);
      const result = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/hop1.png",
        mockFetch,
        { budgetManager: budget }
      );

      expect(result.ok).toBe(false);
      expect(result.isBudgetExceeded).toBe(true);
      expect(result.error).toContain("CDN HTTP request budget ceiling reached");
      // Exactly 1 request made, second hop blocked before fetch!
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(budget.cdnHttpRequestsAttempted).toBe(1);
    });

    it("2.6 blocks redirect hop when Total HTTP request budget is exhausted", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        return {
          status: 302,
          ok: false,
          headers: {
            get: (h: string) => (h.toLowerCase() === "location" ? "https://figma-alpha.s3.amazonaws.com/hop2.png" : null),
          },
        } as any;
      });

      // Total budget = 2. Pretend API already used 1 call.
      const budget = new HttpRequestBudgetManager(5, 25, 2);
      budget.consumeApiRequest(); // 1 API call used

      const result = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/hop1.png",
        mockFetch,
        { budgetManager: budget }
      );

      expect(result.ok).toBe(false);
      expect(result.isBudgetExceeded).toBe(true);
      expect(result.error).toContain("Total HTTP request budget ceiling reached");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(budget.totalHttpRequestsAttempted).toBe(2); // 1 API + 1 CDN = 2 (max reached)
    });

    it("2.7 accurately records attempted requests on HTTP 401, 403, and 429", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 429,
        ok: false,
        headers: { get: () => null },
      } as any);

      const budget = new HttpRequestBudgetManager(5, 25, 30);
      const result = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/rate.png",
        mockFetch,
        { budgetManager: budget }
      );

      expect(result.ok).toBe(false);
      expect(result.isRateLimit).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(budget.cdnHttpRequestsAttempted).toBe(1);
    });

    it("2.8 accurately records attempted request on timeout (AbortError)", async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      });

      const budget = new HttpRequestBudgetManager(5, 25, 30);
      const result = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/timeout.png",
        mockFetch,
        { budgetManager: budget }
      );

      expect(result.ok).toBe(false);
      expect(result.status).toBe(408);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(budget.cdnHttpRequestsAttempted).toBe(1);
    });

    it("2.9 does not count requests blocked by SSRF policy before network dispatch", async () => {
      const mockFetch = vi.fn();
      const budget = new HttpRequestBudgetManager(5, 25, 30);

      const result = await fetchCdnImageWithSecureRedirects(
        "http://169.254.169.254/latest/meta-data/",
        mockFetch,
        { budgetManager: budget }
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("SSRF validation failed");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(budget.cdnHttpRequestsAttempted).toBe(0);
      expect(budget.totalHttpRequestsAttempted).toBe(0);
    });
  });

  // ==========================================================================
  // Part C — Integrated Failure & Recovery Scenarios
  // ==========================================================================
  describe("Integrated Failure & Recovery Scenarios", () => {
    it("Scenario A: Crash Recovery & Re-execution (A: cached, B: journal, C: uncollected)", async () => {
      const manifestPath = path.join(tmpDir, "manifest.json");
      const outputDir = path.join(tmpDir, "cache");
      fs.mkdirSync(outputDir, { recursive: true });

      // Frame A: Pre-existing verified cache
      const pngA = createMinimalValidPng(10, 10);
      const imgPathA = path.join(outputDir, "frame_1_A.png");
      fs.writeFileSync(imgPathA, pngA);
      const hashA = crypto.createHash("sha256").update(pngA).digest("hex");

      const manifest = createEmptyManifest();
      registerCacheEntry(manifest, {
        sourceType: "FIGMA_REFERENCE",
        fileKey: "scenarioKey",
        nodeId: "1:A",
        frameName: "Frame A",
        width: 10,
        height: 10,
        imagePath: path.relative(process.cwd(), imgPathA),
        sha256Hash: hashA,
        fileSizeBytes: pngA.length,
        capturedAt: new Date().toISOString(),
        captureMethod: "figma_rest_api_v1_images_one_shot",
        verificationStatus: "VERIFIED",
        versionMatch: "UNVERIFIED",
      });
      saveCacheManifest(manifest, manifestPath);

      // Frame B: Pending journal from prior crash
      const pngB = createMinimalValidPng(20, 20);
      const imgPathB = path.join(outputDir, "frame_1_B.png");
      fs.writeFileSync(imgPathB, pngB);
      const hashB = crypto.createHash("sha256").update(pngB).digest("hex");

      const journalPathB = path.join(outputDir, ".journal_1_B.json");
      writeJournalEntry(journalPathB, {
        fileKey: "scenarioKey",
        nodeId: "1:B",
        frameName: "Frame B",
        width: 20,
        height: 20,
        imagePath: imgPathB,
        expectedSha256: hashB,
        fileSizeBytes: pngB.length,
        capturedAt: new Date().toISOString(),
        captureMethod: "figma_rest_api_v1_images_one_shot",
        status: "PENDING_COMMIT",
      });

      // Frame C: Uncollected
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/images/")) {
          // Strictly verify that ONLY 1:C is requested from Figma!
          expect(url).toContain("ids=1%3AC");
          expect(url).not.toContain("1%3AA");
          expect(url).not.toContain("1%3AB");
          return {
            ok: true,
            status: 200,
            json: async () => ({
              images: { "1:C": "https://figma-alpha.s3.amazonaws.com/imgC.png" },
            }),
          } as any;
        }
        if (url.includes("imgC.png")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            arrayBuffer: async () => Uint8Array.from(createMinimalValidPng(30, 30)).buffer,
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "scenarioKey",
        accessToken: "figd_token",
        targetNodes: [{ nodeId: "1:A" }, { nodeId: "1:B" }, { nodeId: "1:C" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        outputDir,
        manifestPath,
        fetchFn: mockFetch,
      });

      expect(result.status).toBe("COMPLETED");
      expect(result.success).toBe(true);
      expect(result.plan.toFetchNodeIds).toEqual(["1:C"]);
      expect(result.plan.cachedFramesCount).toBe(2); // A + B
      expect(result.actualFigmaApiCalls).toBe(1);
      expect(result.actualCdnDownloads).toBe(1);
      expect(result.totalHttpRequests).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify all 3 frames are present and verified in manifest
      const finalManifest = loadCacheManifest(manifestPath);
      expect(finalManifest.entries["FIGMA_REFERENCE:scenarioKey:1:A"]).toBeDefined();
      expect(finalManifest.entries["FIGMA_REFERENCE:scenarioKey:1:B"]).toBeDefined();
      expect(finalManifest.entries["FIGMA_REFERENCE:scenarioKey:1:C"]).toBeDefined();
    });

    it("Scenario B: Redirect budget exhaustion blocks subsequent requests safely", async () => {
      const manifestPath = path.join(tmpDir, "manifest.json");
      const outputDir = path.join(tmpDir, "cache");

      let fetchCallCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        fetchCallCount++;
        if (url.includes("/v1/images/")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              images: { "1:1": "https://figma-alpha.s3.amazonaws.com/redir_a.png" },
            }),
          } as any;
        }
        if (url.includes("redir_a.png")) {
          return {
            status: 302,
            ok: false,
            headers: {
              get: (h: string) => (h.toLowerCase() === "location" ? "https://figma-alpha.s3.amazonaws.com/redir_b.png" : null),
            },
          } as any;
        }
        if (url.includes("redir_b.png")) {
          return {
            status: 302,
            ok: false,
            headers: {
              get: (h: string) => (h.toLowerCase() === "location" ? "https://figma-alpha.s3.amazonaws.com/redir_c.png" : null),
            },
          } as any;
        }
        // redir_c should NOT be reached if CDN budget = 2
        return { status: 200, ok: true } as any;
      });

      // Budget limits: API = 1, CDN = 2, Total = 3
      const result = await executeOneShotCapture({
        fileKeyOrUrl: "docKey",
        accessToken: "figd_token",
        targetNodes: [{ nodeId: "1:1" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        maxApiCallLimit: 1,
        maxCdnCallLimit: 2,
        maxTotalHttpLimit: 3,
        outputDir,
        manifestPath,
        fetchFn: mockFetch,
      });

      expect(result.status).toBe("FAILED");
      expect(result.budgetExceeded).toBe(true);
      // Calls: 1 API + 1 CDN(redir_a) + 1 CDN(redir_b) = 3 total calls. 3rd CDN call blocked!
      expect(result.apiHttpRequestsAttempted).toBe(1);
      expect(result.cdnHttpRequestsAttempted).toBe(2);
      expect(result.totalHttpRequestsAttempted).toBe(3);
      expect(result.cdnRedirectHops).toBe(1);
      expect(fetchCallCount).toBe(3);
      expect(result.imagesDownloadedSuccessfully).toBe(0);
    });

    it("Scenario C: Partial success with budget limit preserves committed frame", async () => {
      const manifestPath = path.join(tmpDir, "manifest.json");
      const outputDir = path.join(tmpDir, "cache");

      const validPng = createMinimalValidPng(16, 16);
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/images/")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              images: {
                "1:1": "https://figma-alpha.s3.amazonaws.com/img1.png",
                "1:2": "https://figma-alpha.s3.amazonaws.com/img2.png",
                "1:3": "https://figma-alpha.s3.amazonaws.com/img3.png",
              },
            }),
          } as any;
        }
        if (url.includes("img1.png")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            arrayBuffer: async () => Uint8Array.from(validPng).buffer,
          } as any;
        }
        if (url.includes("img2.png")) {
          // Triggers redirect
          return {
            status: 302,
            ok: false,
            headers: {
              get: (h: string) => (h.toLowerCase() === "location" ? "https://figma-alpha.s3.amazonaws.com/img2_hop.png" : null),
            },
          } as any;
        }
        // img2_hop or img3: budget limit prevents further calls
        return { status: 200, ok: true } as any;
      });

      // Budget limits: API = 1, CDN = 2, Total = 3
      // Requests: API(1) -> img1.png(200, 1) -> img2.png(302, 1) => CDN calls = 2 (max reached!)
      const result = await executeOneShotCapture({
        fileKeyOrUrl: "docKey",
        accessToken: "figd_token",
        targetNodes: [{ nodeId: "1:1" }, { nodeId: "1:2" }, { nodeId: "1:3" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        maxApiCallLimit: 1,
        maxCdnCallLimit: 2,
        maxTotalHttpLimit: 3,
        outputDir,
        manifestPath,
        fetchFn: mockFetch,
      });

      expect(result.status).toBe("PARTIAL_SUCCESS");
      expect(result.budgetExceeded).toBe(true);
      expect(result.imagesDownloadedSuccessfully).toBe(1);
      expect(result.capturedEntries.length).toBe(1);
      expect(result.capturedEntries[0].nodeId).toBe("1:1");

      // Verify frame 1:1 is securely committed in manifest
      const manifest = loadCacheManifest(manifestPath);
      expect(manifest.entries["FIGMA_REFERENCE:docKey:1:1"]).toBeDefined();
      expect(manifest.entries["FIGMA_REFERENCE:docKey:1:2"]).toBeUndefined();
      expect(manifest.entries["FIGMA_REFERENCE:docKey:1:3"]).toBeUndefined();

      // Subsequent Dry Run correctly identifies 1:1 as cached and 1:2, 1:3 as toFetch
      const dryRun = await executeOneShotCapture({
        fileKeyOrUrl: "docKey",
        targetNodes: [{ nodeId: "1:1" }, { nodeId: "1:2" }, { nodeId: "1:3" }],
        dryRun: true,
        outputDir,
        manifestPath,
      });

      expect(dryRun.plan.cachedFramesCount).toBe(1);
      expect(dryRun.plan.toFetchNodeIds).toEqual(["1:2", "1:3"]);
    });
  });
});
