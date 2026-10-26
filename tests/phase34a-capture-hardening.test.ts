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
} from "../src/api/index.js";
import {
  createEmptyManifest,
  registerCacheEntry,
  getFigmaReferenceDetailed,
  getFigmaReference,
  CacheEntry,
} from "../src/cache/cacheManifest.js";
import {
  validatePngBuffer,
  createMinimalValidPng,
} from "../src/cache/pngValidator.js";

describe("Phase 34A: One-Shot Capture Hardening & Preflight Verification Suite", () => {
  const originalFetch = globalThis.fetch;
  const originalEnvMode = process.env.FIGMA_NETWORK_MODE;
  let tmpDir: string;

  beforeEach(() => {
    delete process.env.FIGMA_NETWORK_MODE; // Default offline
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "f2w_p34a_test_"));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnvMode !== undefined) {
      process.env.FIGMA_NETWORK_MODE = originalEnvMode;
    } else {
      delete process.env.FIGMA_NETWORK_MODE;
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Section 1: Network Policy Gatekeeper & Bypass Prevention (Part B)
  // ==========================================================================
  describe("1. Network Policy Gatekeeper & Bypass Prevention", () => {
    it("1.1 blocks executeOneShotCapture in default offline mode even if confirmExecution=true", async () => {
      delete process.env.FIGMA_NETWORK_MODE;
      const mockFetch = vi.fn();

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        accessToken: "figd_secret",
        targetNodes: [{ nodeId: "1:1" }],
        dryRun: false,
        confirmExecution: true, // User confirmed, but environment is offline
        fetchFn: mockFetch,
        outputDir: tmpDir,
      });

      expect(result.status).toBe("BLOCKED_OFFLINE");
      expect(result.success).toBe(false);
      expect(result.actualFigmaApiCalls).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(0);
    });

    it("1.2 blocks execution in online mode when confirmExecution is false or missing", async () => {
      const mockFetch = vi.fn();

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        accessToken: "figd_secret",
        targetNodes: [{ nodeId: "1:1" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: false, // Not approved!
        fetchFn: mockFetch,
        outputDir: tmpDir,
      });

      expect(result.status).toBe("BLOCKED_NO_APPROVAL");
      expect(result.success).toBe(false);
      expect(result.actualFigmaApiCalls).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(0);
    });

    it("1.3 dryRun=true enforces 0 network calls even when online and confirmed", async () => {
      const mockFetch = vi.fn();

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        accessToken: "figd_secret",
        targetNodes: [{ nodeId: "1:1" }, { nodeId: "1:2" }],
        networkMode: "online",
        dryRun: true, // Designated as Dry Run
        confirmExecution: true,
        fetchFn: mockFetch,
        outputDir: tmpDir,
      });

      expect(result.status).toBe("DRY_RUN");
      expect(result.dryRun).toBe(true);
      expect(result.actualFigmaApiCalls).toBe(0);
      expect(result.actualCdnDownloads).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(0);
    });

    it("1.4 assertFigmaNetworkAllowed throws fail-closed on any missing prerequisite", () => {
      // Offline mode
      expect(() =>
        assertFigmaNetworkAllowed({
          operation: "test",
          networkMode: "offline",
          explicitApproval: true,
          dryRun: false,
        })
      ).toThrow(/BLOCKED_OFFLINE/);

      // Dry Run
      expect(() =>
        assertFigmaNetworkAllowed({
          operation: "test",
          networkMode: "online",
          explicitApproval: true,
          dryRun: true,
        })
      ).toThrow(/DRY_RUN_BLOCKED/);

      // No Approval
      expect(() =>
        assertFigmaNetworkAllowed({
          operation: "test",
          networkMode: "online",
          explicitApproval: false,
          dryRun: false,
        })
      ).toThrow(/BLOCKED_NO_APPROVAL/);
    });
  });

  // ==========================================================================
  // Section 2: Cache Integrity & Security Boundary (Part C)
  // ==========================================================================
  describe("2. Cache Integrity & Deep Verification", () => {
    it("2.1 flags MISSING when cache manifest entry points to non-existent disk file", () => {
      const manifest = createEmptyManifest();
      const entry: CacheEntry = {
        sourceType: "FIGMA_REFERENCE",
        fileKey: "docA",
        nodeId: "1:1",
        frameName: "MissingFrame",
        width: 100,
        height: 100,
        imagePath: path.join(tmpDir, "does_not_exist.png"),
        capturedAt: new Date().toISOString(),
        captureMethod: "test",
        verificationStatus: "VERIFIED",
        versionMatch: "UNVERIFIED",
      };
      registerCacheEntry(manifest, entry);

      const lookup = getFigmaReferenceDetailed(manifest, "docA", "1:1", { baseDir: tmpDir });
      expect(lookup.status).toBe("MISSING");
      expect(getFigmaReference(manifest, "docA", "1:1", tmpDir)).toBeNull();
    });

    it("2.2 flags CORRUPT when disk file SHA-256 hash does not match manifest", () => {
      const manifest = createEmptyManifest();
      const validPng = createMinimalValidPng(10, 10);
      const imgPath = path.join(tmpDir, "tampered.png");
      fs.writeFileSync(imgPath, validPng);

      const entry: CacheEntry = {
        sourceType: "FIGMA_REFERENCE",
        fileKey: "docA",
        nodeId: "1:2",
        frameName: "TamperedFrame",
        width: 10,
        height: 10,
        imagePath: imgPath,
        fileSizeBytes: validPng.length,
        sha256Hash: "0000000000000000000000000000000000000000000000000000000000000000", // Tampered
        capturedAt: new Date().toISOString(),
        captureMethod: "test",
        verificationStatus: "VERIFIED",
        versionMatch: "UNVERIFIED",
      };
      registerCacheEntry(manifest, entry);

      const lookup = getFigmaReferenceDetailed(manifest, "docA", "1:2", { baseDir: tmpDir });
      expect(lookup.status).toBe("CORRUPT");
      expect(lookup.reason).toContain("SHA-256 hash mismatch");
      expect(getFigmaReference(manifest, "docA", "1:2", tmpDir)).toBeNull();
    });

    it("2.3 flags INVALID_FORMAT when file is not a valid PNG binary", () => {
      const manifest = createEmptyManifest();
      const fakePngPath = path.join(tmpDir, "fake.png");
      fs.writeFileSync(fakePngPath, "<html><body>HTTP 502 Bad Gateway</body></html>");

      const crypto = require("crypto");
      const sha256 = crypto.createHash("sha256").update(fs.readFileSync(fakePngPath)).digest("hex");

      const entry: CacheEntry = {
        sourceType: "FIGMA_REFERENCE",
        fileKey: "docA",
        nodeId: "1:3",
        frameName: "FakePngFrame",
        width: 100,
        height: 100,
        imagePath: fakePngPath,
        fileSizeBytes: fs.statSync(fakePngPath).size,
        sha256Hash: sha256,
        capturedAt: new Date().toISOString(),
        captureMethod: "test",
        verificationStatus: "VERIFIED",
        versionMatch: "UNVERIFIED",
      };
      registerCacheEntry(manifest, entry);

      const lookup = getFigmaReferenceDetailed(manifest, "docA", "1:3", { baseDir: tmpDir });
      expect(lookup.status).toBe("INVALID_FORMAT");
      expect(getFigmaReference(manifest, "docA", "1:3", tmpDir)).toBeNull();
    });

    it("2.4 flags PATH_TRAVERSAL when entry imagePath attempts directory traversal outside cache root", () => {
      const manifest = createEmptyManifest();
      const allowedDir = path.join(tmpDir, "cache_storage");
      fs.mkdirSync(allowedDir, { recursive: true });

      const outsideFile = path.join(tmpDir, "secret_outside.png");
      const validPng = createMinimalValidPng(5, 5);
      fs.writeFileSync(outsideFile, validPng);

      const entry: CacheEntry = {
        sourceType: "FIGMA_REFERENCE",
        fileKey: "docA",
        nodeId: "1:4",
        frameName: "EscapedFrame",
        width: 5,
        height: 5,
        imagePath: outsideFile, // Absolute path outside allowedDir
        capturedAt: new Date().toISOString(),
        captureMethod: "test",
        verificationStatus: "VERIFIED",
        versionMatch: "UNVERIFIED",
      };
      registerCacheEntry(manifest, entry);

      const lookup = getFigmaReferenceDetailed(manifest, "docA", "1:4", {
        baseDir: tmpDir,
        allowedCacheDir: allowedDir,
      });
      expect(lookup.status).toBe("PATH_TRAVERSAL");
      expect(lookup.reason).toContain("escapes allowed cache directory");
    });

    it("2.5 returns VALID when entry passes all integrity, security, and format checks", () => {
      const manifest = createEmptyManifest();
      const validPng = createMinimalValidPng(20, 30);
      const imgPath = path.join(tmpDir, "valid.png");
      fs.writeFileSync(imgPath, validPng);

      const crypto = require("crypto");
      const sha256 = crypto.createHash("sha256").update(validPng).digest("hex");

      const entry: CacheEntry = {
        sourceType: "FIGMA_REFERENCE",
        fileKey: "docA",
        nodeId: "1:5",
        frameName: "PerfectFrame",
        width: 20,
        height: 30,
        imagePath: imgPath,
        fileSizeBytes: validPng.length,
        sha256Hash: sha256,
        capturedAt: new Date().toISOString(),
        captureMethod: "test",
        verificationStatus: "VERIFIED",
        versionMatch: "UNVERIFIED",
      };
      registerCacheEntry(manifest, entry);

      const lookup = getFigmaReferenceDetailed(manifest, "docA", "1:5", { baseDir: tmpDir });
      expect(lookup.status).toBe("VALID");
      expect(lookup.entry).toBeDefined();

      const ref = getFigmaReference(manifest, "docA", "1:5", tmpDir);
      expect(ref).not.toBeNull();
      expect(ref?.nodeId).toBe("1:5");
    });
  });

  // ==========================================================================
  // Section 3: PNG Binary Structure Validation (Part D)
  // ==========================================================================
  describe("3. PNG Structural & Content Validation", () => {
    it("3.1 validates genuine PNG buffer and extracts accurate dimensions", () => {
      const png = createMinimalValidPng(120, 80);
      const result = validatePngBuffer(png);
      expect(result.valid).toBe(true);
      expect(result.width).toBe(120);
      expect(result.height).toBe(80);
      expect(result.colorType).toBe(6); // RGBA
    });

    it("3.2 rejects truncated or fake PNG buffers missing valid IHDR / IEND", () => {
      // 1. Fake header only (8 bytes)
      const fakeHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(validatePngBuffer(fakeHeader).valid).toBe(false);

      // 2. Corrupt IHDR type
      const corruptIhdr = createMinimalValidPng(10, 10);
      corruptIhdr.write("XXXX", 12, "ascii");
      expect(validatePngBuffer(corruptIhdr).valid).toBe(false);

      // 3. Truncated buffer missing IEND
      const truncated = createMinimalValidPng(10, 10).subarray(0, 30);
      expect(validatePngBuffer(truncated).valid).toBe(false);
    });

    it("3.3 rejects HTML and JSON error documents masquerading as PNG", () => {
      const htmlDoc = Buffer.from("<!DOCTYPE html><html><body>Error 404</body></html>");
      expect(validatePngBuffer(htmlDoc).valid).toBe(false);
      expect(validatePngBuffer(htmlDoc).reason).toContain("HTML/JSON error document");

      const jsonDoc = Buffer.from('{"err": "File not found", "status": 404}');
      expect(validatePngBuffer(jsonDoc).valid).toBe(false);
    });

    it("3.4 rejects zero-dimension or excessively large images", () => {
      const badDimPng = createMinimalValidPng(1, 1);
      badDimPng.writeUInt32BE(0, 16); // width = 0
      expect(validatePngBuffer(badDimPng).valid).toBe(false);

      const hugeDimPng = createMinimalValidPng(1, 1);
      hugeDimPng.writeUInt32BE(30000, 16); // width = 30,000 (> 25,000 limit)
      expect(validatePngBuffer(hugeDimPng).valid).toBe(false);
    });
  });

  // ==========================================================================
  // Section 4: External URL & SSRF Security (Part E)
  // ==========================================================================
  describe("4. External URL & SSRF Security Boundaries", () => {
    it("4.1 accepts genuine Figma AWS S3 and CloudFront HTTPS URLs", () => {
      expect(
        validateSecureCdnUrl("https://figma-alpha.s3.amazonaws.com/images/asset_123.png").valid
      ).toBe(true);
      expect(
        validateSecureCdnUrl("https://s3.amazonaws.com/figma-images/abc.png").valid
      ).toBe(true);
      expect(
        validateSecureCdnUrl("https://d3j564wdfcw104.cloudfront.net/images/render.png").valid
      ).toBe(true);
      expect(
        validateSecureCdnUrl("https://api.figma.com/v1/images/key").valid
      ).toBe(true);
    });

    it("4.2 rejects insecure HTTP protocol and malformed URLs", () => {
      expect(
        validateSecureCdnUrl("http://figma-alpha.s3.amazonaws.com/images/asset.png").valid
      ).toBe(false);
      expect(validateSecureCdnUrl("ftp://figma.com/image.png").valid).toBe(false);
      expect(validateSecureCdnUrl("not-a-url").valid).toBe(false);
    });

    it("4.3 strictly rejects localhost, loopback, and private IP ranges", () => {
      expect(validateSecureCdnUrl("https://localhost/image.png").valid).toBe(false);
      expect(validateSecureCdnUrl("https://127.0.0.1/image.png").valid).toBe(false);
      expect(validateSecureCdnUrl("https://[::1]/image.png").valid).toBe(false);
      expect(validateSecureCdnUrl("https://192.168.1.50/image.png").valid).toBe(false);
      expect(validateSecureCdnUrl("https://10.0.0.1/image.png").valid).toBe(false);
      expect(validateSecureCdnUrl("https://172.20.0.1/image.png").valid).toBe(false);
    });

    it("4.4 strictly rejects cloud metadata service IP (169.254.169.254)", () => {
      expect(
        validateSecureCdnUrl("https://169.254.169.254/latest/meta-data/").valid
      ).toBe(false);
    });

    it("4.5 rejects URLs with embedded user credentials", () => {
      expect(
        validateSecureCdnUrl("https://admin:secret@s3.amazonaws.com/image.png").valid
      ).toBe(false);
    });
  });

  // ==========================================================================
  // Section 5: Budget Enforcement & Partial Failure Recovery (Part F)
  // ==========================================================================
  describe("5. Request Budget Enforcement & Partial Failure Recovery", () => {
    it("5.1 halts immediately when API call budget is exceeded", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/images/")) {
          return {
            ok: true,
            json: async () => ({ images: {} }),
          } as Response;
        }
        return { ok: true } as Response;
      });

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "testKey",
        accessToken: "figd_secret",
        targetNodes: [{ nodeId: "1:1" }, { nodeId: "1:2" }, { nodeId: "1:3" }],
        batchSize: 1, // 3 API calls needed
        maxApiCallLimit: 1, // Budget is strictly 1 API call
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        fetchFn: mockFetch,
        outputDir: tmpDir,
      });

      expect(result.budgetExceeded).toBe(true);
      expect(result.actualFigmaApiCalls).toBe(1); // Halts at budget ceiling
    });

    it("5.2 preserves partial success: successfully caches 1st valid frame and reports partial status", async () => {
      const validPng = createMinimalValidPng(50, 50);

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/images/")) {
          return {
            ok: true,
            json: async () => ({
              images: {
                "1:1": "https://figma-alpha.s3.amazonaws.com/img1.png",
                "1:2": "https://figma-alpha.s3.amazonaws.com/img2.png",
              },
            }),
          } as Response;
        }
        if (url.includes("img1.png")) {
          // Success
          return {
            ok: true,
            arrayBuffer: async () => Uint8Array.from(validPng).buffer,
          } as Response;
        }
        if (url.includes("img2.png")) {
          // Failure (HTTP 500)
          return {
            ok: false,
            status: 500,
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      const manifestPath = path.join(tmpDir, "test_manifest.json");

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "docKey",
        accessToken: "figd_secret",
        targetNodes: [{ nodeId: "1:1" }, { nodeId: "1:2" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        fetchFn: mockFetch,
        outputDir: tmpDir,
        manifestPath,
      });

      expect(result.status).toBe("PARTIAL_SUCCESS");
      expect(result.capturedEntries.length).toBe(1);
      expect(result.capturedEntries[0].nodeId).toBe("1:1");
      expect(result.errors.length).toBeGreaterThan(0);

      // Verify that the successfully downloaded 1:1 is preserved on disk and in manifest
      const savedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(savedManifest.entries["FIGMA_REFERENCE:docKey:1:1"]).toBeDefined();

      // Subsequent Dry Run should now recognize 1:1 as cached, leaving only 1:2 to fetch!
      const nextPlan = planOneShotCapture(
        {
          fileKeyOrUrl: "docKey",
          targetNodes: [{ nodeId: "1:1" }, { nodeId: "1:2" }],
          manifestPath,
        },
        savedManifest
      );

      expect(nextPlan.cachedFramesCount).toBe(1);
      expect(nextPlan.toFetchNodeIds).toEqual(["1:2"]);
    });

    it("5.3 ensures CDN downloads NEVER include authorization token headers", async () => {
      let cdnHeadersPassed: any = null;
      const validPng = createMinimalValidPng(10, 10);

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/v1/images/")) {
          return {
            ok: true,
            json: async () => ({ images: { "1:1": "https://figma-alpha.s3.amazonaws.com/pic.png" } }),
          } as Response;
        }
        if (url.includes("pic.png")) {
          cdnHeadersPassed = init?.headers;
          return {
            ok: true,
            arrayBuffer: async () => validPng.buffer,
          } as Response;
        }
        return { ok: false } as Response;
      });

      await executeOneShotCapture({
        fileKeyOrUrl: "docKey",
        accessToken: "SUPER_SECRET_PAT_TOKEN_9999",
        targetNodes: [{ nodeId: "1:1" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        fetchFn: mockFetch,
        outputDir: tmpDir,
      });

      expect(cdnHeadersPassed).toBeDefined();
      expect(cdnHeadersPassed["X-Figma-Token"]).toBeUndefined();
      expect(cdnHeadersPassed["Authorization"]).toBeUndefined();
    });
  });

  // ==========================================================================
  // Section 6: Secret Protection & Token Masking (Part G)
  // ==========================================================================
  describe("6. Secret Protection & Token Redaction", () => {
    it("6.1 sanitizeSecret strictly redacts secret without leaking substrings", () => {
      expect(sanitizeSecret("figd_1234567890abcdef")).toBe("***MASKED_SECRET***");
      expect(sanitizeSecret("")).toBe("<none>");
      expect(sanitizeSecret(undefined)).toBe("<none>");
    });

    it("6.2 ensures error messages and output objects do not leak token literals", async () => {
      const secretToken = "figd_CRITICAL_USER_SECRET_TOKEN_DO_NOT_LEAK";
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection reset by peer"));

      const result = await executeOneShotCapture({
        fileKeyOrUrl: "docKey",
        accessToken: secretToken,
        targetNodes: [{ nodeId: "1:1" }],
        networkMode: "online",
        dryRun: false,
        confirmExecution: true,
        fetchFn: mockFetch,
        outputDir: tmpDir,
      });

      const serialized = JSON.stringify(result);
      expect(serialized.includes(secretToken)).toBe(false);
    });
  });
});
