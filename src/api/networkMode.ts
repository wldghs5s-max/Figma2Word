import { FigmaNetworkMode } from "./types.js";
import { FigmaApiError } from "./figmaClient.js";

/**
 * Returns the active Figma network mode.
 * Default is strictly 'offline' (Phase 33 Zero Figma API calls by default).
 * Only returns 'online' if process.env.FIGMA_NETWORK_MODE is explicitly set to 'online'.
 */
export function getFigmaNetworkMode(): FigmaNetworkMode {
  const envMode = process.env.FIGMA_NETWORK_MODE?.toLowerCase().trim();
  if (envMode === "online") {
    return "online";
  }
  return "offline";
}

/**
 * Checks whether the current environment operates in offline mode.
 */
export function isOfflineMode(): boolean {
  return getFigmaNetworkMode() === "offline";
}

/**
 * Enforces the zero-API offline invariant.
 * Throws a structured FigmaApiError with code REFERENCE_NOT_CACHED if called in offline mode.
 */
export function assertOnlineAllowed(operationName: string): void {
  if (isOfflineMode()) {
    throw new FigmaApiError(
      `[OfflinePolicy] Blocked Figma network call (${operationName}): System is running in OFFLINE mode (FIGMA_NETWORK_MODE=offline). Zero Figma API calls allowed by default.`,
      403,
      { code: "REFERENCE_NOT_CACHED", operation: operationName }
    );
  }
}
