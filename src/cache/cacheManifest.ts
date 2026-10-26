import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { validatePngBuffer } from "./pngValidator.js";
import { isPathInsideDirectory } from "../../tools/visual-regression/safe_word_automation.js";

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

export type CacheLookupStatus =
  | "VALID"
  | "MISSING"
  | "CORRUPT"
  | "INVALID_FORMAT"
  | "SOURCE_MISMATCH"
  | "PATH_TRAVERSAL"
  | "VERSION_UNVERIFIED";

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

export interface DetailedLookupResult {
  status: CacheLookupStatus;
  entry?: CacheEntry;
  reason?: string;
  resolvedPath?: string;
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
 * Verifies integrity of a cache entry against local disk and optional binary PNG format (Phase 34A).
 */
export function verifyCacheEntry(
  entry: CacheEntry,
  baseDir: string = process.cwd(),
  options?: { validateFormat?: boolean }
): { valid: boolean; reason?: string } {
  const resolvedPath = path.isAbsolute(entry.imagePath)
    ? entry.imagePath
    : path.resolve(baseDir, entry.imagePath);

  if (!fs.existsSync(resolvedPath)) {
    return { valid: false, reason: `File not found on disk: ${entry.imagePath}` };
  }

  // Prevent symlink traversal
  try {
    const lstat = fs.lstatSync(resolvedPath);
    if (lstat.isSymbolicLink()) {
      return { valid: false, reason: `Symbolic links are forbidden for cache security: ${entry.imagePath}` };
    }
  } catch (err: any) {
    return { valid: false, reason: `Cannot stat file: ${err.message}` };
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

  // Phase 34A Hardening: Verify PNG structural integrity if requested
  if (options?.validateFormat) {
    try {
      const fileBytes = fs.readFileSync(resolvedPath);
      const pngResult = validatePngBuffer(fileBytes);
      if (!pngResult.valid) {
        return {
          valid: false,
          reason: `Corrupt PNG structure: ${pngResult.reason}`,
        };
      }
    } catch (err: any) {
      return { valid: false, reason: `Failed to read PNG for verification: ${err.message}` };
    }
  }

  return { valid: true };
}

/**
 * Performs deep, exhaustive validation on a FIGMA_REFERENCE cache candidate (Phase 34A).
 * Distinguishes VALID, MISSING, CORRUPT, INVALID_FORMAT, SOURCE_MISMATCH, and PATH_TRAVERSAL.
 */
export function getFigmaReferenceDetailed(
  manifest: CacheManifest,
  fileKey: string,
  nodeId: string,
  options?: {
    baseDir?: string;
    allowedCacheDir?: string;
  }
): DetailedLookupResult {
  const baseDir = options?.baseDir || process.cwd();
  const key = getManifestKey("FIGMA_REFERENCE", fileKey, nodeId);
  const entry = manifest.entries[key];

  if (!entry) {
    // Check if it was mis-registered as non-FIGMA_REFERENCE
    const anyKeyMatch = Object.values(manifest.entries).find(
      (e) => e.fileKey === fileKey && e.nodeId.replace(/-/g, ":") === nodeId.replace(/-/g, ":")
    );
    if (anyKeyMatch && anyKeyMatch.sourceType !== "FIGMA_REFERENCE") {
      return {
        status: "SOURCE_MISMATCH",
        reason: `Cache entry has sourceType '${anyKeyMatch.sourceType}', expected 'FIGMA_REFERENCE'`,
      };
    }
    return { status: "MISSING", reason: "No entry found in manifest" };
  }

  if (entry.sourceType !== "FIGMA_REFERENCE") {
    return {
      status: "SOURCE_MISMATCH",
      reason: `Cache entry has invalid sourceType '${entry.sourceType}', expected 'FIGMA_REFERENCE'`,
    };
  }

  const resolvedPath = path.isAbsolute(entry.imagePath)
    ? entry.imagePath
    : path.resolve(baseDir, entry.imagePath);

  // Path Traversal Security: Ensure target resides inside allowedCacheDir
  if (options?.allowedCacheDir) {
    const normAllowed = path.resolve(baseDir, options.allowedCacheDir);
    if (!isPathInsideDirectory(resolvedPath, normAllowed)) {
      return {
        status: "PATH_TRAVERSAL",
        reason: `Target image path '${entry.imagePath}' escapes allowed cache directory '${options.allowedCacheDir}'`,
        resolvedPath,
      };
    }
  }

  // Symlink check
  try {
    if (fs.existsSync(resolvedPath)) {
      const lstat = fs.lstatSync(resolvedPath);
      if (lstat.isSymbolicLink()) {
        return {
          status: "PATH_TRAVERSAL",
          reason: `Symbolic link detected at '${entry.imagePath}'`,
          resolvedPath,
        };
      }
    }
  } catch {
    return { status: "MISSING", reason: `File access error: ${entry.imagePath}`, resolvedPath };
  }

  if (!fs.existsSync(resolvedPath)) {
    return { status: "MISSING", reason: `File not found on disk: ${entry.imagePath}`, resolvedPath };
  }

  // Size check
  const stat = fs.statSync(resolvedPath);
  if (entry.fileSizeBytes !== undefined && entry.fileSizeBytes !== stat.size) {
    return {
      status: "CORRUPT",
      reason: `Size mismatch: expected ${entry.fileSizeBytes} B, found ${stat.size} B`,
      resolvedPath,
    };
  }

  // Hash check
  if (entry.sha256Hash) {
    const actualHash = computeFileSha256(resolvedPath);
    if (actualHash !== entry.sha256Hash) {
      return {
        status: "CORRUPT",
        reason: `SHA-256 hash mismatch: expected ${entry.sha256Hash}, got ${actualHash}`,
        resolvedPath,
      };
    }
  }

  // PNG binary validation
  const fileBytes = fs.readFileSync(resolvedPath);
  const pngValidation = validatePngBuffer(fileBytes);
  if (!pngValidation.valid) {
    return {
      status: "INVALID_FORMAT",
      reason: `Invalid PNG binary: ${pngValidation.reason}`,
      resolvedPath,
    };
  }

  return {
    status: "VALID",
    entry,
    resolvedPath,
  };
}

/**
 * Retrieves genuine FIGMA_REFERENCE cache entry for a given nodeId.
 * Phase 34A Hardening: Invokes getFigmaReferenceDetailed() and strictly returns entry ONLY if status === 'VALID'.
 * Any missing file, hash mismatch, or format corruption returns null (fail-closed).
 */
export function getFigmaReference(
  manifest: CacheManifest,
  fileKey: string,
  nodeId: string,
  baseDir?: string
): CacheEntry | null {
  const detailed = getFigmaReferenceDetailed(manifest, fileKey, nodeId, { baseDir });
  if (detailed.status === "VALID" && detailed.entry) {
    return detailed.entry;
  }
  return null;
}
