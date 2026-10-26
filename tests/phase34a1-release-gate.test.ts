import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  executeOneShotCapture,
  planOneShotCapture,
  sanitizeSecret,
  maskToken,
  assertFigmaNetworkAllowed,
  validateSecureCdnUrl,
  fetchCdnImageWithSecureRedirects,
} from "../src/api/index.js";
import {
  createEmptyManifest,
  registerCacheEntry,
  getFigmaReferenceDetailed,
  getFigmaReference,
  saveCacheManifest,
  loadCacheManifest,
  writeJournalEntry,
  recoverPendingJournals,
  cleanupStaleTempFiles,
  CacheEntry,
} from "../src/cache/cacheManifest.js";
import {
  validatePngBuffer,
  createMinimalValidPng,
  computeCrc32,
} from "../src/cache/pngValidator.js";

describe("Phase 34A.1: One-Shot Capture Release Gate & Failure Recovery Suite", () => {
  const originalFetch = globalThis.fetch;
  const originalEnvMode = process.env.FIGMA_NETWORK_MODE;
  let tmpDir: string;

  beforeEach(() => {
    delete process.env.FIGMA_NETWORK_MODE; // Default offline
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "f2w_p34a1_gate_"));
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
  // GATE-01: PNG Binary Integrity & Full Decompression (Part B)
  // ==========================================================================
  describe("GATE-01: PNG Binary Integrity & Full Decompression", () => {
    it("1.1 decodes and verifies genuine RGBA and RGB PNG images", () => {
      // 1. RGBA (colorType 6)
      const rgbaPng = createMinimalValidPng(32, 24, { colorType: 6, bitDepth: 8 });
      const rgbaResult = validatePngBuffer(rgbaPng);
      expect(rgbaResult.valid).toBe(true);
      expect(rgbaResult.width).toBe(32);
      expect(rgbaResult.height).toBe(24);
      expect(rgbaResult.colorType).toBe(6);
      expect(rgbaResult.bitDepth).toBe(8);
      expect(rgbaResult.decompressedBytes).toBe(24 * (1 + 32 * 4));

      // 2. RGB (colorType 2)
      const rgbPng = createMinimalValidPng(16, 16, { colorType: 2, bitDepth: 8 });
      const rgbResult = validatePngBuffer(rgbPng);
      expect(rgbResult.valid).toBe(true);
      expect(rgbResult.width).toBe(16);
      expect(rgbResult.height).toBe(16);
      expect(rgbResult.colorType).toBe(2);
      expect(rgbResult.bitDepth).toBe(8);
      expect(rgbResult.decompressedBytes).toBe(16 * (1 + 16 * 3));
    });

    it("1.2 rejects PNG with corrupted CRC-32 in IHDR chunk", () => {
      const badCrcPng = createMinimalValidPng(10, 10, { corruptCrc: true });
      const result = validatePngBuffer(badCrcPng);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("CRC-32 mismatch in chunk 'IHDR'");
    });

    it("1.3 rejects PNG with corrupted IDAT compressed zlib data", () => {
      const corruptIdatPng = createMinimalValidPng(20, 20, { corruptIdat: true });
      const result = validatePngBuffer(corruptIdatPng);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Corrupted IDAT zlib stream");
    });

    it("1.4 rejects PNG missing IDAT chunk", () => {
      const noIdatPng = createMinimalValidPng(10, 10, { omitIdat: true });
      const result = validatePngBuffer(noIdatPng);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("IEND chunk appears before any IDAT chunk");
    });

    it("1.5 rejects PNG missing IEND trailer chunk", () => {
      const noIendPng = createMinimalValidPng(10, 10, { omitIend: true });
      const result = validatePngBuffer(noIendPng);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("missing mandatory IEND trailer chunk");
    });

    it("1.6 rejects invalid colorType and bitDepth combinations", () => {
      // Truecolor RGB (type 2) with 1-bit depth is strictly forbidden in PNG spec
      const badComboPng = createMinimalValidPng(10, 10);
      badComboPng.writeUInt8(2, 25); // colorType: 2 (RGB)
      badComboPng.writeUInt8(1, 24); // bitDepth: 1
      // Recompute IHDR CRC
      const ihdrDataSlice = badComboPng.subarray(12, 29);
      const newCrc = computeCrc32(ihdrDataSlice);
      badComboPng.writeUInt32BE(newCrc, 29);

      const result = validatePngBuffer(badComboPng);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Invalid bit depth 1 for PNG color type 2");
    });

    it("1.7 rejects trailing malicious data or payload after IEND chunk", () => {
      const trailingPng = createMinimalValidPng(8, 8, {
        trailingBytes: Buffer.from("MALICIOUS_PAYLOAD_AFTER_IEND"),
      });
      const result = validatePngBuffer(trailingPng);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Trailing data");
      expect(result.reason).toContain("detected after IEND chunk");
    });

    it("1.8 defends against decompression bomb with excessive uncompressed scanlines", () => {
      const validPng = createMinimalValidPng(1, 1);
      // Artificially change dimensions in IHDR to 20,000 x 20,000 RGBA (= ~1.6 GB uncompressed)
      validPng.writeUInt32BE(20000, 16);
      validPng.writeUInt32BE(20000, 20);
      const ihdrDataSlice = validPng.subarray(12, 29);
      const newCrc = computeCrc32(ihdrDataSlice);
      validPng.writeUInt32BE(newCrc, 29);

      const result = validatePngBuffer(validPng, { maxDecompressedBytes: 10 * 1024 * 1024 });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Decompression bomb defense");
    });
  });

  // ==========================================================================
  // GATE-02: CDN Redirect Control & SSRF Defense (Part C)
  // ==========================================================================
  describe("GATE-02: CDN Redirect Control & SSRF Defense", () => {
    it("2.1 intercept 302 redirect and safely download image from legitimate HTTPS CDN destination", async () => {
      const validPng = createMinimalValidPng(10, 10);
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(init?.redirect).toBe("manual"); // Enforces manual redirect tracking!
        if (url === "https://figma-alpha.s3.amazonaws.com/initial_req.png") {
          return {
            status: 302,
            ok: false,
            headers: {
              get: (h: string) => (h.toLowerCase() === "location" ? "https://d3j564wdfcw104.cloudfront.net/final_asset.png" : null),
            },
          } as any;
        }
        if (url === "https://d3j564wdfcw104.cloudfront.net/final_asset.png") {
          return {
            status: 200,
            ok: true,
            headers: { get: () => null },
            arrayBuffer: async () => Uint8Array.from(validPng).buffer,
          } as any;
        }
        return { status: 404, ok: false } as any;
      });

      const res = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/initial_req.png",
        mockFetch
      );

      expect(res.ok).toBe(true);
      expect(res.redirectCount).toBe(1);
      expect(res.redirectChain).toEqual(["https://figma-alpha.s3.amazonaws.com/initial_req.png"]);
      expect(res.finalUrl).toBe("https://d3j564wdfcw104.cloudfront.net/final_asset.png");
      expect(res.buffer).toBeDefined();
      expect(validatePngBuffer(res.buffer!).valid).toBe(true);
    });

    it("2.2 blocks redirect attempt to localhost or 127.0.0.1", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 302,
        ok: false,
        headers: {
          get: (h: string) => (h.toLowerCase() === "location" ? "https://127.0.0.1/internal.png" : null),
        },
      } as any);

      const res = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/image.png",
        mockFetch
      );

      expect(res.ok).toBe(false);
      expect(res.error).toContain("Insecure redirect destination blocked");
      expect(res.error).toContain("Loopback/local domain '127.0.0.1'");
    });

    it("2.3 blocks redirect attempt to cloud metadata IP (169.254.169.254)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 302,
        ok: false,
        headers: {
          get: (h: string) => (h.toLowerCase() === "location" ? "https://169.254.169.254/latest/meta-data/" : null),
        },
      } as any);

      const res = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/image.png",
        mockFetch
      );

      expect(res.ok).toBe(false);
      expect(res.error).toContain("Private or cloud metadata IP address '169.254.169.254'");
    });

    it("2.4 blocks redirect attempt to private network IP (10.0.0.1)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 302,
        ok: false,
        headers: {
          get: (h: string) => (h.toLowerCase() === "location" ? "https://10.0.0.1/secret.png" : null),
        },
      } as any);

      const res = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/image.png",
        mockFetch
      );

      expect(res.ok).toBe(false);
      expect(res.error).toContain("Private or cloud metadata IP address '10.0.0.1'");
    });

    it("2.5 blocks protocol downgrade from HTTPS to HTTP during redirect", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 302,
        ok: false,
        headers: {
          get: (h: string) => (h.toLowerCase() === "location" ? "http://figma-alpha.s3.amazonaws.com/plain.png" : null),
        },
      } as any);

      const res = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/image.png",
        mockFetch
      );

      expect(res.ok).toBe(false);
      expect(res.error).toContain("Insecure protocol downgrade forbidden");
    });

    it("2.6 aborts on redirect loop", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 302,
        ok: false,
        headers: {
          get: (h: string) => (h.toLowerCase() === "location" ? "https://figma-alpha.s3.amazonaws.com/loop.png" : null),
        },
      } as any);

      const res = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/loop.png",
        mockFetch
      );

      expect(res.ok).toBe(false);
      expect(res.error).toContain("Redirect loop detected");
    });

    it("2.7 aborts when exceeding max redirect count limit", async () => {
      let hop = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        hop++;
        return {
          status: 302,
          ok: false,
          headers: {
            get: () => `https://figma-alpha.s3.amazonaws.com/hop_${hop}.png`,
          },
        } as any;
      });

      const res = await fetchCdnImageWithSecureRedirects(
        "https://figma-alpha.s3.amazonaws.com/start.png",
        mockFetch,
        { maxRedirects: 2 }
      );

      expect(res.ok).toBe(false);
      expect(res.error).toContain("Exceeded maximum redirect limit (2)");
    });
  });

  // ==========================================================================
  // GATE-03: Cache Root Isolation Enforced (Part D)
  // ==========================================================================
  describe("GATE-03: Cache Root Isolation Enforced", () => {
    it("3.1 rejects cache lookup escaping default cache root even when allowedCacheDir is omitted", () => {
      const manifest = createEmptyManifest();
      // Entry points to sensitive path outside default cache directory
      const entry: CacheEntry = {
        sourceType: "FIGMA_REFERENCE",
        fileKey: "pentech_test",
        nodeId: "1:1",
        frameName: "EscapedEntry",
        width: 10,
        height: 10,
        imagePath: "/etc/passwd", // Absolute path escape
        capturedAt: new Date().toISOString(),
        captureMethod: "test",
        verificationStatus: "VERIFIED",
        versionMatch: "UNVERIFIED",
      };
      registerCacheEntry(manifest, entry);

      // Caller intentionally omits options (allowedCacheDir is omitted)
      const lookup = getFigmaReferenceDetailed(manifest, "pentech_test", "1:1");
      expect(lookup.status).toBe("PATH_TRAVERSAL");
      expect(lookup.reason).toContain("escapes allowed cache directory");
    });

    it("3.2 rejects path traversal sequences in fileKey", () => {
      const manifest = createEmptyManifest();
      const lookup = getFigmaReferenceDetailed(manifest, "../../../secret", "1:1");
      expect(lookup.status).toBe("PATH_TRAVERSAL");
      expect(lookup.reason).toContain("fileKey contains path traversal");
    });

    it("3.3 rejects symlinks whose target escapes cache root", () => {
      const cacheDir = path.join(tmpDir, "cache_dir");
      const outsideDir = path.join(tmpDir, "outside_dir");
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });

      const realOutsideFile = path.join(outsideDir, "secret.png");
      const validPng = createMinimalValidPng(10, 10);
      fs.writeFileSync(realOutsideFile, validPng);

      const symlinkFile = path.join(cacheDir, "symlink_escape.png");
      try {
        fs.symlinkSync(realOutsideFile, symlinkFile);
      } catch {
        return; // Skip if OS denies symlink creation
      }

      const manifest = createEmptyManifest();
      const entry: CacheEntry = {
        sourceType: "FIGMA_REFERENCE",
        fileKey: "docKey",
        nodeId: "2:2",
        frameName: "SymlinkTarget",
        width: 10,
        height: 10,
        imagePath: symlinkFile,
        capturedAt: new Date().toISOString(),
        captureMethod: "test",
        verificationStatus: "VERIFIED",
        versionMatch: "UNVERIFIED",
      };
      registerCacheEntry(manifest, entry);

      const lookup = getFigmaReferenceDetailed(manifest, "docKey", "2:2", {
        baseDir: tmpDir,
        allowedCacheDir: cacheDir,
      });

      expect(lookup.status).toBe("PATH_TRAVERSAL");
    });

    it("3.4 accepts valid genuine cache file residing inside cache root", () => {
      const cacheDir = path.join(tmpDir, "safe_cache");
      fs.mkdirSync(cacheDir, { recursive: true });

      const validPng = createMinimalValidPng(20, 20);
      const imgPath = path.join(cacheDir, "safe_frame.png");
      fs.writeFileSync(imgPath, validPng);

      const manifest = createEmptyManifest();
      const crypto = require("crypto");
      const sha256 = crypto.createHash("sha256").update(validPng).digest("hex");

      const entry: CacheEntry = {
        sourceType: "FIGMA_REFERENCE",
        fileKey: "docSafe",
        nodeId: "3:3",
        frameName: "SafeFrame",
        width: 20,
        height: 20,
        imagePath: imgPath,
        fileSizeBytes: validPng.length,
        sha256Hash: sha256,
        capturedAt: new Date().toISOString(),
        captureMethod: "test",
        verificationStatus: "VERIFIED",
        versionMatch: "UNVERIFIED",
      };
      registerCacheEntry(manifest, entry);

      const lookup = getFigmaReferenceDetailed(manifest, "docSafe", "3:3", {
        baseDir: tmpDir,
        allowedCacheDir: cacheDir,
      });

      expect(lookup.status).toBe("VALID");
      expect(lookup.entry).toBeDefined();
      expect(getFigmaReference(manifest, "docSafe", "3:3", tmpDir, cacheDir)).not.toBeNull();
    });
  });

  // ==========================================================================
  // GATE-04: Token Complete Redaction (Part E)
  // ==========================================================================
  describe("GATE-04: Token Complete Redaction", () => {
    it("4.1 maskToken and sanitizeSecret completely mask secrets without leaking prefixes or suffixes", () => {
      const testToken = "figd_SECRET_PERSONAL_ACCESS_TOKEN_ABC123XYZ";
      expect(maskToken(testToken)).toBe("***MASKED_SECRET***");
      expect(sanitizeSecret(testToken)).toBe("***MASKED_SECRET***");

      expect(maskToken("short")).toBe("***MASKED_SECRET***");
      expect(maskToken("")).toBe("<none>");
      expect(maskToken(undefined)).toBe("<none>");
      expect(sanitizeSecret(undefined)).toBe("<none>");
    });

    it("4.2 ensures serialized capture results and errors never leak access tokens", async () => {
      const sensitiveToken = "figd_HIGHLY_SENSITIVE_SECRET_TOKEN_DO_NOT_LEAK";
      const mockFetch = vi.fn().mockRejectedValue(new Error(`Failed with ${sensitiveToken}`));

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        accessToken: sensitiveToken,
        targetNodes: [{ nodeId: "1:1" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        fetchFn: mockFetch,
        outputDir: tmpDir,
      });

      const serialized = JSON.stringify(result);
      expect(serialized.includes(sensitiveToken)).toBe(false);
      expect(serialized).not.toContain("HIGHLY_SENSITIVE");
    });
  });

  // ==========================================================================
  // GATE-05: CDN Error Fail-Fast & Request Budget (Part F)
  // ==========================================================================
  describe("GATE-05: CDN Error Fail-Fast & Request Budget", () => {
    it("5.1 immediately halts entire capture when CDN returns HTTP 429 Rate Limit (Fail-Fast)", async () => {
      let cdnCallCount = 0;
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
          cdnCallCount++;
          // First image immediately hits CDN 429
          return {
            status: 429,
            ok: false,
            headers: { get: () => null },
          } as any;
        }
        // Should NOT be reached!
        cdnCallCount++;
        return { status: 200, ok: true } as any;
      });

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "docKey",
        accessToken: "figd_token",
        targetNodes: [{ nodeId: "1:1" }, { nodeId: "1:2" }, { nodeId: "1:3" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        fetchFn: mockFetch,
        outputDir: tmpDir,
      });

      expect(result.status).toBe("RATE_LIMITED");
      expect(result.abortedDueToRateLimit).toBe(true);
      expect(cdnCallCount).toBe(1); // Halts at first 429, zero subsequent calls made!
      expect(result.errors.some((e) => e.includes("CDN Rate Limit (429)"))).toBe(true);
    });

    it("5.2 immediately halts entire capture when CDN returns HTTP 403 Access Denied (Fail-Fast)", async () => {
      let cdnCallCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/images/")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              images: {
                "1:1": "https://figma-alpha.s3.amazonaws.com/img1.png",
                "1:2": "https://figma-alpha.s3.amazonaws.com/img2.png",
              },
            }),
          } as any;
        }
        if (url.includes("img1.png")) {
          cdnCallCount++;
          return {
            status: 403,
            ok: false,
            headers: { get: () => null },
          } as any;
        }
        cdnCallCount++;
        return { status: 200, ok: true } as any;
      });

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "docKey",
        accessToken: "figd_token",
        targetNodes: [{ nodeId: "1:1" }, { nodeId: "1:2" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        fetchFn: mockFetch,
        outputDir: tmpDir,
      });

      expect(result.status).toBe("FAILED");
      expect(cdnCallCount).toBe(1); // Never proceeds to img2.png!
      expect(result.errors.some((e) => e.includes("CDN access denied"))).toBe(true);
    });

    it("5.3 preserves earlier successful downloads when subsequent frame triggers CDN 429", async () => {
      const validPng = createMinimalValidPng(10, 10);
      let cdnCallCount = 0;

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
          cdnCallCount++;
          return {
            status: 200,
            ok: true,
            headers: { get: () => null },
            arrayBuffer: async () => Uint8Array.from(validPng).buffer,
          } as any;
        }
        if (url.includes("img2.png")) {
          cdnCallCount++;
          return {
            status: 429,
            ok: false,
            headers: { get: () => null },
          } as any;
        }
        cdnCallCount++;
        return { status: 200, ok: true } as any;
      });

      const manifestPath = path.join(tmpDir, "manifest.json");
      const result = await executeOneShotCapture({
        fileKeyOrUrl: "docKey",
        accessToken: "figd_token",
        targetNodes: [{ nodeId: "1:1" }, { nodeId: "1:2" }, { nodeId: "1:3" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        fetchFn: mockFetch,
        outputDir: tmpDir,
        manifestPath,
      });

      expect(result.status).toBe("RATE_LIMITED");
      expect(result.capturedEntries.length).toBe(1);
      expect(result.capturedEntries[0].nodeId).toBe("1:1");
      expect(cdnCallCount).toBe(2); // Attempted 1:1 (success) + 1:2 (429) -> stopped! 1:3 never attempted!

      // Verify that 1:1 is securely committed in manifest
      const savedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(savedManifest.entries["FIGMA_REFERENCE:docKey:1:1"]).toBeDefined();
    });
  });

  // ==========================================================================
  // GATE-06: Crash Recovery & Cache Consistency (Part G)
  // ==========================================================================
  describe("GATE-06: Crash Recovery & Cache Consistency", () => {
    it("6.1 automatically cleans up stale .tmp_ files on initialization", () => {
      const staleTmp1 = path.join(tmpDir, ".tmp_1_1_1234567.png");
      const staleTmp2 = path.join(tmpDir, ".tmp_1_2_7654321.png");
      const legitimateFile = path.join(tmpDir, "frame_1_1.png");

      fs.writeFileSync(staleTmp1, "interrupted_bytes_1");
      fs.writeFileSync(staleTmp2, "interrupted_bytes_2");
      fs.writeFileSync(legitimateFile, createMinimalValidPng(5, 5));

      const cleaned = cleanupStaleTempFiles(tmpDir);
      expect(cleaned).toBe(2);
      expect(fs.existsSync(staleTmp1)).toBe(false);
      expect(fs.existsSync(staleTmp2)).toBe(false);
      expect(fs.existsSync(legitimateFile)).toBe(true); // Legitimate cache file untouched!
    });

    it("6.2 recovers valid pending transaction journal into manifest following a simulated crash", () => {
      const validPng = createMinimalValidPng(12, 12);
      const finalImgPath = path.join(tmpDir, "frame_recovered_1_1.png");
      fs.writeFileSync(finalImgPath, validPng);

      const crypto = require("crypto");
      const sha256 = crypto.createHash("sha256").update(validPng).digest("hex");

      const journalPath = path.join(tmpDir, ".journal_recovered_1_1.json");
      writeJournalEntry(journalPath, {
        fileKey: "docRecover",
        nodeId: "9:9",
        frameName: "RecoveredFrame",
        width: 12,
        height: 12,
        imagePath: finalImgPath,
        expectedSha256: sha256,
        fileSizeBytes: validPng.length,
        capturedAt: new Date().toISOString(),
        captureMethod: "figma_rest_api_v1_images_one_shot",
        status: "PENDING_COMMIT",
      });

      const manifestPath = path.join(tmpDir, "crash_manifest.json");
      const manifest = createEmptyManifest();

      const { recoveredCount } = recoverPendingJournals(tmpDir, manifest, manifestPath);
      expect(recoveredCount).toBe(1);

      // Verify manifest now contains recovered entry
      const updatedManifest = loadCacheManifest(manifestPath);
      expect(updatedManifest.entries["FIGMA_REFERENCE:docRecover:9:9"]).toBeDefined();
      expect(updatedManifest.entries["FIGMA_REFERENCE:docRecover:9:9"].sha256Hash).toBe(sha256);

      // Journal is cleaned up after recovery
      expect(fs.existsSync(journalPath)).toBe(false);
    });

    it("6.3 does not promote unverified orphan files without valid transaction journal", () => {
      // Unknown rogue file in cache directory
      const rogueFile = path.join(tmpDir, "frame_rogue_99.png");
      fs.writeFileSync(rogueFile, createMinimalValidPng(10, 10));

      const manifestPath = path.join(tmpDir, "empty_manifest.json");
      const manifest = createEmptyManifest();

      // Recovery run
      const { recoveredCount } = recoverPendingJournals(tmpDir, manifest, manifestPath);
      expect(recoveredCount).toBe(0);

      // Manifest remains completely empty; rogue file is not promoted!
      expect(Object.keys(manifest.entries).length).toBe(0);
    });
  });

  // ==========================================================================
  // GATE-07: Objective Release Gate & Dry-Run Invariants (Part I)
  // ==========================================================================
  describe("GATE-07: Objective Release Gate & Dry-Run Invariants", () => {
    it("7.1 verifies 17 target frames batching plan and budget calculations", () => {
      const manifest = createEmptyManifest();
      const mock17Nodes = Array.from({ length: 17 }, (_, i) => ({
        nodeId: `757:${100 + i}`,
        frameName: `Frame ${i + 1}`,
      }));

      const plan = planOneShotCapture(
        {
          fileKeyOrUrl: "pentech_test",
          targetNodes: mock17Nodes,
          batchSize: 20,
          dryRun: true,
          confirmExecution: false,
        },
        manifest
      );

      expect(plan.totalTargetFrames).toBe(17);
      expect(plan.cachedFramesCount).toBe(0);
      expect(plan.toFetchNodeIds.length).toBe(17);
      expect(plan.expectedFigmaApiRequests).toBe(1); // Math.ceil(17 / 20) = 1
      expect(plan.expectedImageDownloads).toBe(17);
      expect(plan.totalHttpRequests).toBe(18); // 1 + 17 = 18 <= 30
      expect(plan.totalHttpRequests).toBeLessThanOrEqual(30);
    });

    it("7.2 enforces exact zero external network requests in dry run", async () => {
      const mockFetch = vi.fn();
      const result = await executeOneShotCapture({
        fileKeyOrUrl: "pentech_test",
        targetNodes: [{ nodeId: "1:1" }],
        dryRun: true,
        confirmExecution: false,
        fetchFn: mockFetch,
        outputDir: tmpDir,
      });

      expect(result.status).toBe("DRY_RUN");
      expect(result.actualFigmaApiCalls).toBe(0);
      expect(result.actualCdnDownloads).toBe(0);
      expect(result.totalHttpRequests).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(0);
    });
  });
});
