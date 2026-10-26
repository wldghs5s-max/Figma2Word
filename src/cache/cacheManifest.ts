import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export type CacheSourceType =
  | "FIGMA_REFERENCE" // Genuine original frame image rendered by Figma
  | "WORD_RENDERED" // Rendered from generated DOCX by MS Word
  | "REFERENCE_DOCX_RENDERED" // Rendered from human/reference DOCX
  | "UNKNOWN"; // Unverified or ambiguous origin

export type VersionMatchStatus =
  | "VERIFIED" // Proven to match identical design snapshot
  | "UNVERIFIED" // Unknown if Figma version matches current snapshot
  | "MISMATCH"; // Proven to be a differing version

export type VerificationStatus =
  | "VERIFIED"
  | "NOT_VERIFIED"
  | "CORRUPTED"
  | "MISSING";

export interface CacheEntry {
  sourceType: CacheSourceType;
  fileKey: string;
  nodeId: string;
  frameName: string;
  width: number;
  height: number;
  imagePath: string; // Relative or normalized path
  resolution?: {
    width: number;
    height: number;
    dpi?: number;
  };
  sha256Hash?: string;
  fileSizeBytes?: number;
  capturedAt: string; // ISO-8601
  captureMethod: string;
  verificationStatus: VerificationStatus;
  versionMatch: VersionMatchStatus;
  metadata?: Record<string, any>;
}

export interface CacheManifest {
  schemaVersion: string;
  description: string;
  lastUpdated: string;
  entries: Record<string, CacheEntry>; // key: `${sourceType}:${fileKey}:${nodeId}`
}

/**
 * Creates a new blank cache manifest
 */
export function createEmptyManifest(): CacheManifest {
  return {
    schemaVersion: "1.0.0",
    description: "Figma2Word Offline Reference & Rendering Cache Manifest",
    lastUpdated: new Date().toISOString(),
    entries: {},
  };
}

/**
 * Generates canonical key for manifest entries
 */
export function getManifestKey(sourceType: CacheSourceType, fileKey: string, nodeId: string): string {
  const normNodeId = nodeId.replace(/-/g, ":");
  return `${sourceType}:${fileKey}:${normNodeId}`;
}

/**
 * Loads cache manifest from JSON file. Returns empty manifest if file does not exist.
 */
export function loadCacheManifest(manifestPath: string): CacheManifest {
  if (!fs.existsSync(manifestPath)) {
    return createEmptyManifest();
  }
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.entries || typeof parsed.entries !== "object") {
      return createEmptyManifest();
    }
    return parsed as CacheManifest;
  } catch {
    return createEmptyManifest();
  }
}

/**
 * Saves cache manifest atomically to JSON file
 */
export function saveCacheManifest(manifest: CacheManifest, manifestPath: string): void {
  manifest.lastUpdated = new Date().toISOString();
  const dir = path.dirname(manifestPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${manifestPath}.tmp_${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2), "utf8");
  fs.renameSync(tmpPath, manifestPath);
}

/**
 * Registers or updates an entry in the manifest
 */
export function registerCacheEntry(manifest: CacheManifest, entry: CacheEntry): void {
  const key = getManifestKey(entry.sourceType, entry.fileKey, entry.nodeId);
  manifest.entries[key] = entry;
}

/**
 * Computes SHA-256 hash of a file
 */
export function computeFileSha256(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Verifies integrity of a cache entry against local disk
 */
export function verifyCacheEntry(
  entry: CacheEntry,
  baseDir: string = process.cwd()
): { valid: boolean; reason?: string } {
  const resolvedPath = path.isAbsolute(entry.imagePath)
    ? entry.imagePath
    : path.resolve(baseDir, entry.imagePath);

  if (!fs.existsSync(resolvedPath)) {
    return { valid: false, reason: `File not found on disk: ${entry.imagePath}` };
  }

  const stat = fs.statSync(resolvedPath);
  if (entry.fileSizeBytes !== undefined && entry.fileSizeBytes !== stat.size) {
    return {
      valid: false,
      reason: `File size mismatch: expected ${entry.fileSizeBytes} bytes, found ${stat.size} bytes`,
    };
  }

  if (entry.sha256Hash) {
    const actualHash = computeFileSha256(resolvedPath);
    if (actualHash !== entry.sha256Hash) {
      return {
        valid: false,
        reason: `SHA-256 hash mismatch: expected ${entry.sha256Hash}, got ${actualHash}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Retrieves genuine FIGMA_REFERENCE cache entry for a given nodeId.
 * Strictly forbids returning WORD_RENDERED or REFERENCE_DOCX_RENDERED as genuine Figma reference.
 */
export function getFigmaReference(
  manifest: CacheManifest,
  fileKey: string,
  nodeId: string
): CacheEntry | null {
  const key = getManifestKey("FIGMA_REFERENCE", fileKey, nodeId);
  const entry = manifest.entries[key];
  if (!entry) return null;
  if (entry.sourceType !== "FIGMA_REFERENCE") {
    // Defense: do not allow non-FIGMA_REFERENCE to masquerade
    return null;
  }
  return entry;
}
