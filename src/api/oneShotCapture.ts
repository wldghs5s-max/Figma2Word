import * as fs from "fs";
import * as path from "path";
import { parseFigmaUrl, FigmaApiError } from "./figmaClient.js";
import {
  FigmaNetworkMode,
} from "./types.js";
import {
  getFigmaNetworkMode,
  assertFigmaNetworkAllowed,
  maskToken,
  redactSecretFromText,
} from "./networkMode.js";
import {
  CacheManifest,
  CacheEntry,
  loadCacheManifest,
  saveCacheManifest,
  registerCacheEntry,
  computeFileSha256,
  getFigmaReferenceDetailed,
  writeJournalEntry,
  removeJournalEntry,
  cleanupStaleTempFiles,
  recoverPendingJournals,
  isPathInsideDirectory,
} from "../cache/cacheManifest.js";
import { validateSecureCdnUrl } from "./urlSecurity.js";
import { validatePngBuffer } from "../cache/pngValidator.js";

export interface TargetFrameItem {
  nodeId: string;
  frameName?: string;
  width?: number;
  height?: number;
  isCached: boolean;
  cacheStatus?: string;
}

export interface OneShotCapturePlan {
  fileKey: string;
  totalTargetFrames: number;
  cachedFramesCount: number;
  toFetchNodeIds: string[];
  expectedFigmaApiRequests: number;
  expectedImageDownloads: number;
  totalHttpRequests: number;
  batchSize: number;
  dryRunOnly: boolean;
  targetFrames: TargetFrameItem[];
}

export interface RequestBudget {
  maxApiCallLimit: number;
  maxCdnCallLimit: number;
  maxTotalHttpLimit: number;
}

export interface OneShotCaptureOptions {
  fileKeyOrUrl: string;
  accessToken?: string;
  targetNodes?: Array<{ nodeId: string; frameName?: string; width?: number; height?: number }>;
  networkMode?: FigmaNetworkMode;
  dryRun?: boolean; // default: true
  confirmExecution?: boolean; // must be strictly true to make ANY network calls
  maxApiCallLimit?: number; // default: 5
  maxCdnCallLimit?: number; // default: 25
  maxTotalHttpLimit?: number; // default: 30
  batchSize?: number; // max ids per API call, default: 20
  outputDir?: string;
  manifestPath?: string;
  fetchFn?: typeof fetch; // mockable for unit testing
}

export type CaptureExecutionStatus =
  | "DRY_RUN"
  | "BLOCKED_OFFLINE"
  | "BLOCKED_NO_APPROVAL"
  | "COMPLETED"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "RATE_LIMITED";

export interface OneShotCaptureResult {
  status: CaptureExecutionStatus;
  success: boolean;
  dryRun: boolean;
  plan: OneShotCapturePlan;
  actualFigmaApiCalls: number;
  actualCdnDownloads: number;
  totalHttpRequests: number;
  capturedEntries: CacheEntry[];
  errors: string[];
  abortedDueToRateLimit?: boolean;
  budgetExceeded?: boolean;
}

export { maskToken };

export interface SecureCdnFetchResult {
  ok: boolean;
  status: number;
  buffer?: Buffer;
  error?: string;
  isRateLimit?: boolean;
  isAuthError?: boolean;
  redirectCount: number;
  redirectChain: string[];
  finalUrl: string;
}

/**
 * Downloads CDN image with explicit, manual redirect tracking and SSRF defense (Phase 34A.1 / GATE-02).
 * - redirect: "manual" prevents standard fetch from following redirects invisibly.
 * - Every redirect hop (301, 302, 303, 307, 308) is re-validated via validateSecureCdnUrl().
 * - HTTPS -> HTTP protocol downgrade is strictly blocked.
 * - Target loopback, localhost, and cloud metadata addresses are blocked.
 * - Redirect loops and excess redirect hops (> maxRedirects) are rejected.
 * - Never sends Authorization or X-Figma-Token to CDN endpoints.
 */
export async function fetchCdnImageWithSecureRedirects(
  initialUrl: string,
  fetchImpl: typeof fetch,
  options?: {
    maxRedirects?: number;
    timeoutMs?: number;
    maxBytes?: number;
  }
): Promise<SecureCdnFetchResult> {
  const maxRedirects = options?.maxRedirects ?? 3;
  const timeoutMs = options?.timeoutMs ?? 30000;
  const maxBytes = options?.maxBytes ?? 50 * 1024 * 1024;

  let currentUrl = initialUrl;
  const redirectChain: string[] = [];
  const visitedUrls = new Set<string>([initialUrl]);

  while (true) {
    // 1. SSRF and Domain Security validation for current hop
    const check = validateSecureCdnUrl(currentUrl);
    if (!check.valid) {
      return {
        ok: false,
        status: 0,
        error: `SSRF validation failed for URL '${currentUrl}': ${check.reason}`,
        redirectCount: redirectChain.length,
        redirectChain,
        finalUrl: currentUrl,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetchImpl(currentUrl, {
        method: "GET",
        headers: {
          Accept: "image/png,*/*",
        },
        redirect: "manual", // Strictly disable auto-follow
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        return {
          ok: false,
          status: 408,
          error: `Download timed out after ${timeoutMs}ms for '${currentUrl}'`,
          redirectCount: redirectChain.length,
          redirectChain,
          finalUrl: currentUrl,
        };
      }
      return {
        ok: false,
        status: 0,
        error: `Network error downloading from '${currentUrl}': ${err.message}`,
        redirectCount: redirectChain.length,
        redirectChain,
        finalUrl: currentUrl,
      };
    } finally {
      clearTimeout(timer);
    }

    const status = res.status ?? (res.ok ? 200 : 500);

    // 2. Check for redirect responses
    if ([301, 302, 303, 307, 308].includes(status)) {
      if (redirectChain.length >= maxRedirects) {
        return {
          ok: false,
          status,
          error: `Exceeded maximum redirect limit (${maxRedirects}) while downloading CDN image`,
          redirectCount: redirectChain.length,
          redirectChain,
          finalUrl: currentUrl,
        };
      }

      const location = res.headers?.get ? res.headers.get("location") : (res.headers as any)?.location;
      if (!location) {
        return {
          ok: false,
          status,
          error: `Redirect response (HTTP ${status}) missing 'Location' header`,
          redirectCount: redirectChain.length,
          redirectChain,
          finalUrl: currentUrl,
        };
      }

      let destUrl: string;
      try {
        destUrl = new URL(location, currentUrl).href;
      } catch {
        return {
          ok: false,
          status,
          error: `Malformed redirect Location header '${location}'`,
          redirectCount: redirectChain.length,
          redirectChain,
          finalUrl: currentUrl,
        };
      }

      // Check protocol downgrade
      const destParsed = new URL(destUrl);
      if (destParsed.protocol !== "https:") {
        return {
          ok: false,
          status,
          error: `Insecure protocol downgrade forbidden: redirect target '${destUrl}' is not HTTPS`,
          redirectCount: redirectChain.length,
          redirectChain,
          finalUrl: currentUrl,
        };
      }

      // Detect redirect loops
      if (visitedUrls.has(destUrl)) {
        return {
          ok: false,
          status,
          error: `Redirect loop detected at '${destUrl}'`,
          redirectCount: redirectChain.length,
          redirectChain,
          finalUrl: currentUrl,
        };
      }

      // Immediate re-validation against SSRF
      const destValidation = validateSecureCdnUrl(destUrl);
      if (!destValidation.valid) {
        return {
          ok: false,
          status,
          error: `Insecure redirect destination blocked: ${destValidation.reason}`,
          redirectCount: redirectChain.length,
          redirectChain,
          finalUrl: currentUrl,
        };
      }

      redirectChain.push(currentUrl);
      visitedUrls.add(destUrl);
      currentUrl = destUrl;
      continue; // Follow next hop safely
    }

    // 3. Fail-Fast on Rate Limiting (429) or Access Denied (401/403)
    if (status === 429) {
      return {
        ok: false,
        status: 429,
        isRateLimit: true,
        error: "CDN Rate Limit (429) encountered. Immediately halting capture with Fail-Fast.",
        redirectCount: redirectChain.length,
        redirectChain,
        finalUrl: currentUrl,
      };
    }

    if (status === 401 || status === 403) {
      return {
        ok: false,
        status,
        isAuthError: true,
        error: `CDN access denied with HTTP ${status}. Halting capture with Fail-Fast.`,
        redirectCount: redirectChain.length,
        redirectChain,
        finalUrl: currentUrl,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status,
        error: `CDN server returned HTTP ${status}`,
        redirectCount: redirectChain.length,
        redirectChain,
        finalUrl: currentUrl,
      };
    }

    // 4. Read body buffer and check size limit
    const cl = res.headers?.get ? res.headers.get("content-length") : (res.headers as any)?.["content-length"];
    if (cl && parseInt(cl, 10) > maxBytes) {
      return {
        ok: false,
        status: 200,
        error: `CDN image Content-Length (${cl} bytes) exceeds maximum limit (${maxBytes} bytes)`,
        redirectCount: redirectChain.length,
        redirectChain,
        finalUrl: currentUrl,
      };
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > maxBytes) {
      return {
        ok: false,
        status: 200,
        error: `CDN image buffer size (${buffer.length} bytes) exceeds maximum limit (${maxBytes} bytes)`,
        redirectCount: redirectChain.length,
        redirectChain,
        finalUrl: currentUrl,
      };
    }

    return {
      ok: true,
      status: 200,
      buffer,
      redirectCount: redirectChain.length,
      redirectChain,
      finalUrl: currentUrl,
    };
  }
}

/**
 * Plans a one-shot capture operation without initiating any network activity.
 * Hardened for Phase 34A.1 (GATE-03): Always supplies allowedCacheDir to enforce path isolation.
 */
export function planOneShotCapture(
  options: OneShotCaptureOptions,
  manifest: CacheManifest
): OneShotCapturePlan {
  const parsed = parseFigmaUrl(options.fileKeyOrUrl);
  const fileKey = parsed.fileKey;

  const targetNodes = options.targetNodes || (parsed.nodeId ? [{ nodeId: parsed.nodeId }] : []);
  const batchSize = Math.max(1, options.batchSize || 20);

  const targetFrames: TargetFrameItem[] = [];
  const toFetchNodeIds: string[] = [];

  const allowedCacheDir =
    options.outputDir ||
    (options.manifestPath ? path.dirname(path.resolve(options.manifestPath)) : undefined);

  for (const node of targetNodes) {
    // Deep verification with enforced cache root
    const lookup = getFigmaReferenceDetailed(manifest, fileKey, node.nodeId, {
      allowedCacheDir,
    });
    const isCached = lookup.status === "VALID";

    targetFrames.push({
      nodeId: node.nodeId,
      frameName: node.frameName,
      width: node.width,
      height: node.height,
      isCached,
      cacheStatus: lookup.status,
    });

    if (!isCached) {
      toFetchNodeIds.push(node.nodeId);
    }
  }

  const expectedFigmaApiRequests = toFetchNodeIds.length > 0
    ? Math.ceil(toFetchNodeIds.length / batchSize)
    : 0;
  const expectedImageDownloads = toFetchNodeIds.length;
  const totalHttpRequests = expectedFigmaApiRequests + expectedImageDownloads;

  const dryRunOnly = options.dryRun !== false || options.confirmExecution !== true;

  return {
    fileKey,
    totalTargetFrames: targetFrames.length,
    cachedFramesCount: targetFrames.length - toFetchNodeIds.length,
    toFetchNodeIds,
    expectedFigmaApiRequests,
    expectedImageDownloads,
    totalHttpRequests,
    batchSize,
    dryRunOnly,
    targetFrames,
  };
}

/**
 * Executes or dry-runs a One-Shot Reference Capture with full Phase 34A.1 Hardening & Failure Recovery.
 */
export async function executeOneShotCapture(
  options: OneShotCaptureOptions
): Promise<OneShotCaptureResult> {
  const manifestPath =
    options.manifestPath || path.resolve(process.cwd(), "debug/cache/cache-manifest.json");
  const manifest = loadCacheManifest(manifestPath);

  const plan = planOneShotCapture(options, manifest);

  // 1. Dry Run evaluation
  if (options.dryRun !== false) {
    return {
      status: "DRY_RUN",
      success: true,
      dryRun: true,
      plan,
      actualFigmaApiCalls: 0,
      actualCdnDownloads: 0,
      totalHttpRequests: 0,
      capturedEntries: [],
      errors: [],
    };
  }

  // 2. Explicit approval check
  if (options.confirmExecution !== true) {
    return {
      status: "BLOCKED_NO_APPROVAL",
      success: false,
      dryRun: false,
      plan,
      actualFigmaApiCalls: 0,
      actualCdnDownloads: 0,
      totalHttpRequests: 0,
      capturedEntries: [],
      errors: ["Execution blocked: confirmExecution must be strictly true to initiate network requests."],
    };
  }

  // 3. Network Policy evaluation (Unified gatekeeper)
  const networkMode = options.networkMode ?? getFigmaNetworkMode();
  try {
    assertFigmaNetworkAllowed({
      operation: "one-shot-capture-init",
      networkMode,
      explicitApproval: options.confirmExecution,
      dryRun: options.dryRun,
    });
  } catch (policyErr: any) {
    return {
      status: policyErr.details?.code === "BLOCKED_OFFLINE" ? "BLOCKED_OFFLINE" : "BLOCKED_NO_APPROVAL",
      success: false,
      dryRun: false,
      plan,
      actualFigmaApiCalls: 0,
      actualCdnDownloads: 0,
      totalHttpRequests: 0,
      capturedEntries: [],
      errors: [policyErr.message],
    };
  }

  // 4. Token validation (required in live execution mode)
  if (!options.accessToken || options.accessToken.trim().length === 0) {
    throw new FigmaApiError("Cannot execute One-Shot capture without access token in live mode", 401);
  }

  // 5. If all frames are already cached, succeed immediately without any HTTP calls
  if (plan.toFetchNodeIds.length === 0) {
    return {
      status: "COMPLETED",
      success: true,
      dryRun: false,
      plan,
      actualFigmaApiCalls: 0,
      actualCdnDownloads: 0,
      totalHttpRequests: 0,
      capturedEntries: [],
      errors: [],
    };
  }

  const fetchImpl = options.fetchFn || globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("No fetch implementation available for capture");
  }

  // Budget limits
  const maxApi = options.maxApiCallLimit ?? 5;
  const maxCdn = options.maxCdnCallLimit ?? 25;
  const maxTotal = options.maxTotalHttpLimit ?? 30;

  const outputDir =
    options.outputDir || path.resolve(process.cwd(), `debug/cache/figma_references/${plan.fileKey}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Clean up any stale temp files and recover pending journals from previous crash
  cleanupStaleTempFiles(outputDir);
  recoverPendingJournals(outputDir, manifest, manifestPath);

  let apiCallsCount = 0;
  let cdnDownloadsCount = 0;
  const capturedEntries: CacheEntry[] = [];
  const errors: string[] = [];
  let abortedDueToRateLimit = false;
  let abortedDueToAuth = false;
  let budgetExceeded = false;

  // Split toFetchNodeIds into batches
  const batches: string[][] = [];
  for (let i = 0; i < plan.toFetchNodeIds.length; i += plan.batchSize) {
    batches.push(plan.toFetchNodeIds.slice(i, i + plan.batchSize));
  }

  const targetNodeLookup = new Map<string, { frameName?: string; width?: number; height?: number }>();
  for (const t of options.targetNodes || []) {
    targetNodeLookup.set(t.nodeId, t);
  }

  for (const batch of batches) {
    // Budget check before API call
    if (apiCallsCount >= maxApi || (apiCallsCount + cdnDownloadsCount) >= maxTotal) {
      budgetExceeded = true;
      errors.push(`Budget ceiling reached: API calls (${apiCallsCount}/${maxApi}), Total (${apiCallsCount + cdnDownloadsCount}/${maxTotal}).`);
      break;
    }

    // Gatekeeper check before Figma API call
    assertFigmaNetworkAllowed({
      operation: `figma-images-batch-${batch.length}`,
      networkMode,
      explicitApproval: options.confirmExecution,
      dryRun: options.dryRun,
    });

    apiCallsCount++;
    const idsParam = batch.join(",");
    const apiUrl = `https://api.figma.com/v1/images/${encodeURIComponent(plan.fileKey)}?ids=${encodeURIComponent(idsParam)}&format=png`;

    let apiRes: Response;
    try {
      apiRes = await fetchImpl(apiUrl, {
        method: "GET",
        headers: {
          "X-Figma-Token": options.accessToken,
          Accept: "application/json",
        },
      });
    } catch (netErr: any) {
      errors.push(`Network error calling Figma images API: ${netErr.message}`);
      break;
    }

    // Fail-fast error handlers on API response
    if (apiRes.status === 429) {
      abortedDueToRateLimit = true;
      errors.push("Figma API Rate Limit (429) encountered. Immediately halting capture with Fail-Fast.");
      break;
    }

    if (apiRes.status === 401 || apiRes.status === 403) {
      abortedDueToAuth = true;
      errors.push(`Figma images API authentication failed with HTTP ${apiRes.status}`);
      break;
    }

    if (!apiRes.ok) {
      errors.push(`Figma images API failed with HTTP ${apiRes.status}`);
      break;
    }

    let body: any;
    try {
      body = await apiRes.json();
    } catch (parseErr: any) {
      errors.push(`Failed to parse Figma API response: ${parseErr.message}`);
      break;
    }

    const images: Record<string, string> = body.images || {};

    for (const nodeId of batch) {
      const imgUrl = images[nodeId];
      if (!imgUrl) {
        errors.push(`Figma returned no image URL for node '${nodeId}'`);
        continue;
      }

      // 1. Initial URL security check (SSRF & Protocol protection)
      const urlValidation = validateSecureCdnUrl(imgUrl);
      if (!urlValidation.valid) {
        errors.push(`Blocked insecure CDN download URL for node '${nodeId}': ${urlValidation.reason}`);
        continue;
      }

      // 2. Budget check before CDN call
      if (cdnDownloadsCount >= maxCdn || (apiCallsCount + cdnDownloadsCount) >= maxTotal) {
        budgetExceeded = true;
        errors.push(`Budget ceiling reached during CDN downloads: (${cdnDownloadsCount}/${maxCdn}).`);
        break;
      }

      // 3. Gatekeeper check before CDN download
      assertFigmaNetworkAllowed({
        operation: `cdn-download-${nodeId}`,
        networkMode,
        explicitApproval: options.confirmExecution,
        dryRun: options.dryRun,
      });

      cdnDownloadsCount++;

      let tempFilePath: string | null = null;
      let journalFilePath: string | null = null;
      try {
        // Download via secure redirect fetcher (manual redirect, no auth headers, SSRF re-validated on hops)
        const dlResult = await fetchCdnImageWithSecureRedirects(imgUrl, fetchImpl);

        // Fail-Fast check on CDN response (GATE-05)
        if (dlResult.isRateLimit) {
          abortedDueToRateLimit = true;
          errors.push(dlResult.error || `CDN rate limit (429) encountered on node '${nodeId}'`);
          break; // Halt entire capture immediately
        }

        if (dlResult.isAuthError) {
          abortedDueToAuth = true;
          errors.push(dlResult.error || `CDN access denied (HTTP ${dlResult.status}) on node '${nodeId}'`);
          break; // Halt entire capture immediately
        }

        if (!dlResult.ok || !dlResult.buffer) {
          errors.push(dlResult.error || `Failed to download image for node '${nodeId}': HTTP ${dlResult.status}`);
          continue;
        }

        const buffer = dlResult.buffer;

        // 4. Validate PNG binary integrity (GATE-01 deep validation: IHDR, CRC, IDAT decompression, IEND)
        const pngResult = validatePngBuffer(buffer);
        if (!pngResult.valid) {
          errors.push(`Downloaded data for node '${nodeId}' is not a valid PNG: ${pngResult.reason}`);
          continue;
        }

        // 5. Pre-write path verification: ensure files stay strictly inside outputDir
        const safeNodeId = nodeId.replace(/[:\/]/g, "_");
        tempFilePath = path.join(outputDir, `.tmp_${safeNodeId}_${Date.now()}.png`);
        const outFileName = `frame_${safeNodeId}.png`;
        const finalFilePath = path.join(outputDir, outFileName);

        if (!isPathInsideDirectory(tempFilePath, outputDir) || !isPathInsideDirectory(finalFilePath, outputDir)) {
          errors.push(`Path traversal blocked during cache write for node '${nodeId}'`);
          continue;
        }

        // 6. Write temporary file and compute SHA-256
        fs.writeFileSync(tempFilePath, buffer);
        const sha256 = computeFileSha256(tempFilePath);
        const meta = targetNodeLookup.get(nodeId);

        // 7. Write transaction journal before moving to final path (Method B/C recovery protection)
        journalFilePath = path.join(outputDir, `.journal_${safeNodeId}.json`);
        writeJournalEntry(journalFilePath, {
          fileKey: plan.fileKey,
          nodeId,
          frameName: meta?.frameName || `Frame ${nodeId}`,
          width: pngResult.width ?? meta?.width ?? 0,
          height: pngResult.height ?? meta?.height ?? 0,
          imagePath: finalFilePath,
          expectedSha256: sha256,
          fileSizeBytes: buffer.length,
          capturedAt: new Date().toISOString(),
          captureMethod: "figma_rest_api_v1_images_one_shot",
          status: "PENDING_COMMIT",
        });

        // 8. Atomic move to final cache location
        fs.renameSync(tempFilePath, finalFilePath);
        tempFilePath = null; // Successfully transferred

        const entry: CacheEntry = {
          sourceType: "FIGMA_REFERENCE",
          fileKey: plan.fileKey,
          nodeId,
          frameName: meta?.frameName || `Frame ${nodeId}`,
          width: pngResult.width ?? meta?.width ?? 0,
          height: pngResult.height ?? meta?.height ?? 0,
          imagePath: path.relative(process.cwd(), finalFilePath),
          sha256Hash: sha256,
          fileSizeBytes: buffer.length,
          capturedAt: new Date().toISOString(),
          captureMethod: "figma_rest_api_v1_images_one_shot",
          verificationStatus: "VERIFIED",
          versionMatch: "UNVERIFIED",
          resolution: {
            width: pngResult.width || 0,
            height: pngResult.height || 0,
          },
        };

        // 9. Frame-by-frame commit (Method A): Register entry and save manifest immediately!
        registerCacheEntry(manifest, entry);
        saveCacheManifest(manifest, manifestPath);
        capturedEntries.push(entry);

        // 10. Clean up journal after successful manifest commit
        removeJournalEntry(journalFilePath);
        journalFilePath = null;
      } catch (dlErr: any) {
        errors.push(`Error downloading image for node '${nodeId}': ${dlErr.message}`);
      } finally {
        // Cleanup leftover temp file on error
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          try {
            fs.unlinkSync(tempFilePath);
          } catch {}
        }
      }
    }

    if (abortedDueToRateLimit || abortedDueToAuth || budgetExceeded) {
      break;
    }
  }

  let finalStatus: CaptureExecutionStatus = "COMPLETED";
  if (abortedDueToRateLimit) {
    finalStatus = "RATE_LIMITED";
  } else if (errors.length > 0) {
    finalStatus = capturedEntries.length > 0 ? "PARTIAL_SUCCESS" : "FAILED";
  }

  return {
    status: finalStatus,
    success: errors.length === 0 && !abortedDueToRateLimit && !abortedDueToAuth && !budgetExceeded,
    dryRun: false,
    plan,
    actualFigmaApiCalls: apiCallsCount,
    actualCdnDownloads: cdnDownloadsCount,
    totalHttpRequests: apiCallsCount + cdnDownloadsCount,
    capturedEntries,
    errors: errors.map((e) => redactSecretFromText(e, options.accessToken)),
    abortedDueToRateLimit,
    budgetExceeded,
  };
}
