import * as fs from "fs";
import * as path from "path";
import { parseFigmaUrl, FigmaApiError } from "./figmaClient.js";
import {
  CacheManifest,
  CacheEntry,
  loadCacheManifest,
  saveCacheManifest,
  registerCacheEntry,
  computeFileSha256,
  getFigmaReference,
} from "../cache/cacheManifest.js";

export interface TargetFrameItem {
  nodeId: string;
  frameName?: string;
  width?: number;
  height?: number;
  isCached: boolean;
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

export interface OneShotCaptureOptions {
  fileKeyOrUrl: string;
  accessToken?: string;
  targetNodes?: Array<{ nodeId: string; frameName?: string; width?: number; height?: number }>;
  dryRun?: boolean; // default: true
  confirmExecution?: boolean; // must be strictly true to make any HTTP calls
  maxApiCallLimit?: number; // safety guard ceiling, default: 5
  batchSize?: number; // max ids per API call, default: 20
  outputDir?: string;
  manifestPath?: string;
  fetchFn?: typeof fetch; // mockable for unit testing
}

export interface OneShotCaptureResult {
  success: boolean;
  dryRun: boolean;
  plan: OneShotCapturePlan;
  actualFigmaApiCalls: number;
  actualImageDownloads: number;
  capturedEntries: CacheEntry[];
  errors: string[];
  abortedDueToRateLimit?: boolean;
}

/**
 * Safely masks secret access tokens for logs and diagnostics
 */
export function maskToken(token?: string): string {
  if (!token) return "<none>";
  const trimmed = token.trim();
  if (trimmed.length <= 8) return "********";
  return `${trimmed.substring(0, 4)}...${trimmed.substring(trimmed.length - 4)}`;
}

/**
 * Plans a one-shot capture operation without making any network requests.
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
    const existingRef = getFigmaReference(manifest, fileKey, node.nodeId);
    const isCached = existingRef !== null;
    targetFrames.push({
      nodeId: node.nodeId,
      frameName: node.frameName,
      width: node.width,
      height: node.height,
      isCached,
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
 * Executes or dry-runs a One-Shot Reference Capture.
 * By default (dryRun: true or confirmExecution !== true), makes ZERO HTTP requests.
 */
export async function executeOneShotCapture(
  options: OneShotCaptureOptions
): Promise<OneShotCaptureResult> {
  const manifestPath =
    options.manifestPath || path.resolve(process.cwd(), "debug/cache/cache-manifest.json");
  const manifest = loadCacheManifest(manifestPath);

  const plan = planOneShotCapture(options, manifest);

  // If dry-run or not confirmed, abort immediately with zero network activity
  if (plan.dryRunOnly) {
    return {
      success: true,
      dryRun: true,
      plan,
      actualFigmaApiCalls: 0,
      actualImageDownloads: 0,
      capturedEntries: [],
      errors: [],
    };
  }

  // Execution mode: Requires accessToken
  if (!options.accessToken) {
    throw new FigmaApiError("Cannot execute One-Shot capture without access token", 401);
  }

  const fetchImpl = options.fetchFn || globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("No fetch implementation available for capture");
  }

  const maxCalls = options.maxApiCallLimit || 5;
  const outputDir =
    options.outputDir || path.resolve(process.cwd(), `debug/cache/figma_references/${plan.fileKey}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let apiCallsCount = 0;
  let imageDownloadsCount = 0;
  const capturedEntries: CacheEntry[] = [];
  const errors: string[] = [];
  let abortedDueToRateLimit = false;

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
    if (apiCallsCount >= maxCalls) {
      errors.push(`Reached safety ceiling of max API calls (${maxCalls}). Aborting further calls.`);
      break;
    }

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

    if (apiRes.status === 429) {
      abortedDueToRateLimit = true;
      errors.push(`Figma API Rate Limit (429) encountered. Immediately halting capture with Fail-Fast.`);
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

      imageDownloadsCount++;
      try {
        const dlRes = await fetchImpl(imgUrl);
        if (!dlRes.ok) {
          errors.push(`Failed to download image for node '${nodeId}': HTTP ${dlRes.status}`);
          continue;
        }

        const arrayBuffer = await dlRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const safeNodeId = nodeId.replace(/[:\/]/g, "_");
        const outFileName = `frame_${safeNodeId}.png`;
        const outFilePath = path.join(outputDir, outFileName);

        fs.writeFileSync(outFilePath, buffer);

        const sha256 = computeFileSha256(outFilePath);
        const meta = targetNodeLookup.get(nodeId);

        const entry: CacheEntry = {
          sourceType: "FIGMA_REFERENCE",
          fileKey: plan.fileKey,
          nodeId,
          frameName: meta?.frameName || `Frame ${nodeId}`,
          width: meta?.width || 0,
          height: meta?.height || 0,
          imagePath: path.relative(process.cwd(), outFilePath),
          sha256Hash: sha256,
          fileSizeBytes: buffer.length,
          capturedAt: new Date().toISOString(),
          captureMethod: "figma_rest_api_v1_images_one_shot",
          verificationStatus: "VERIFIED",
          versionMatch: "UNVERIFIED", // Version match unknown until confirmed against snapshot
        };

        registerCacheEntry(manifest, entry);
        capturedEntries.push(entry);
      } catch (dlErr: any) {
        errors.push(`Error downloading image for node '${nodeId}': ${dlErr.message}`);
      }
    }
  }

  // Atomically persist manifest if any entries were captured
  if (capturedEntries.length > 0) {
    saveCacheManifest(manifest, manifestPath);
  }

  return {
    success: errors.length === 0,
    dryRun: false,
    plan,
    actualFigmaApiCalls: apiCallsCount,
    actualImageDownloads: imageDownloadsCount,
    capturedEntries,
    errors,
    abortedDueToRateLimit,
  };
}
