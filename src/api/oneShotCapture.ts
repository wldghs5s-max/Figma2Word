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
} from "./networkMode.js";
import {
  CacheManifest,
  CacheEntry,
  loadCacheManifest,
  saveCacheManifest,
  registerCacheEntry,
  computeFileSha256,
  getFigmaReferenceDetailed,
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

/**
 * Plans a one-shot capture operation without initiating any network activity (Phase 34A).
 * Integrates deep cache validation to prevent false hits on corrupted or missing files.
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

  for (const node of targetNodes) {
    // Deep verification: only treat as cached if status is strictly 'VALID'
    const lookup = getFigmaReferenceDetailed(manifest, fileKey, node.nodeId);
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
 * Executes or dry-runs a One-Shot Reference Capture with full Phase 34A Hardening.
 *
 * Safety Invariants:
 * 1. ZERO network calls by default (dryRun: true or confirmExecution !== true).
 * 2. Unified assertFigmaNetworkAllowed() check enforced on BOTH API calls and CDN downloads.
 * 3. Strict SSRF & CDN URL validation (HTTPS only, no private/loopback/cloud metadata IP).
 * 4. Never sends authorization headers to third-party or CDN domains.
 * 5. Validates PNG signature, IHDR structure, dimension limits, and HTML/JSON error rejection.
 * 6. Atomic temporary file download and replacement.
 * 7. Enforces strict request budgets for API, CDN, and Total HTTP requests.
 * 8. Immediate Fail-Fast abort on HTTP 429, 401, or 403.
 * 9. Safe token masking in all diagnostic logging.
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

  let apiCallsCount = 0;
  let cdnDownloadsCount = 0;
  const capturedEntries: CacheEntry[] = [];
  const errors: string[] = [];
  let abortedDueToRateLimit = false;
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

    // Fail-fast error handlers
    if (apiRes.status === 429) {
      abortedDueToRateLimit = true;
      errors.push("Figma API Rate Limit (429) encountered. Immediately halting capture with Fail-Fast.");
      break;
    }

    if (apiRes.status === 401 || apiRes.status === 403) {
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

      // 1. Validate URL security (SSRF & Protocol protection)
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
      try {
        // Critical Security: Do NOT pass X-Figma-Token to CDN endpoints!
        const dlRes = await fetchImpl(imgUrl, {
          method: "GET",
          headers: {
            Accept: "image/png,*/*",
          },
        });

        if (!dlRes.ok) {
          errors.push(`Failed to download image for node '${nodeId}': HTTP ${dlRes.status}`);
          continue;
        }

        const arrayBuffer = await dlRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 4. Validate PNG binary integrity BEFORE moving to cache
        const pngResult = validatePngBuffer(buffer);
        if (!pngResult.valid) {
          errors.push(`Downloaded data for node '${nodeId}' is not a valid PNG: ${pngResult.reason}`);
          continue;
        }

        // 5. Atomic write: write to unique temp file, then atomic rename
        const safeNodeId = nodeId.replace(/[:\/]/g, "_");
        tempFilePath = path.join(outputDir, `.tmp_${safeNodeId}_${Date.now()}.png`);
        const outFileName = `frame_${safeNodeId}.png`;
        const finalFilePath = path.join(outputDir, outFileName);

        fs.writeFileSync(tempFilePath, buffer);

        // Atomic move
        fs.renameSync(tempFilePath, finalFilePath);
        tempFilePath = null; // Successfully transferred

        const sha256 = computeFileSha256(finalFilePath);
        const meta = targetNodeLookup.get(nodeId);

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

        registerCacheEntry(manifest, entry);
        capturedEntries.push(entry);
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

    if (abortedDueToRateLimit || budgetExceeded) {
      break;
    }
  }

  // Atomically persist manifest if any new entries were successfully captured
  if (capturedEntries.length > 0) {
    saveCacheManifest(manifest, manifestPath);
  }

  let finalStatus: CaptureExecutionStatus = "COMPLETED";
  if (abortedDueToRateLimit) {
    finalStatus = "RATE_LIMITED";
  } else if (errors.length > 0) {
    finalStatus = capturedEntries.length > 0 ? "PARTIAL_SUCCESS" : "FAILED";
  }

  return {
    status: finalStatus,
    success: errors.length === 0 && !abortedDueToRateLimit && !budgetExceeded,
    dryRun: false,
    plan,
    actualFigmaApiCalls: apiCallsCount,
    actualCdnDownloads: cdnDownloadsCount,
    totalHttpRequests: apiCallsCount + cdnDownloadsCount,
    capturedEntries,
    errors,
    abortedDueToRateLimit,
    budgetExceeded,
  };
}
