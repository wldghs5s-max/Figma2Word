import { FigmaNetworkMode } from "./types.js";
import { FigmaApiError } from "./figmaClient.js";

/**
 * Returns the active Figma network mode.
 * Default is strictly 'offline' (Phase 33 & 34A Zero Figma API calls by default).
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

export interface NetworkPermissionParams {
  operation: string;
  networkMode?: FigmaNetworkMode;
  explicitApproval?: boolean;
  dryRun?: boolean;
}

/**
 * Common, unified network authorization gatekeeper (Phase 34A).
 * Both FigmaClient and OneShotCapture MUST pass this gate before initiating ANY HTTP request.
 *
 * Invariant rules:
 * 1. networkMode MUST be explicitly 'online' (defaults to process.env.FIGMA_NETWORK_MODE -> 'offline').
 * 2. dryRun MUST be explicitly false.
 * 3. explicitApproval MUST be strictly true (user-approved).
 * Any violation throws a structured FigmaApiError fail-closed.
 */
export function assertFigmaNetworkAllowed(params: NetworkPermissionParams): void {
  const mode = params.networkMode ?? getFigmaNetworkMode();

  if (mode !== "online") {
    throw new FigmaApiError(
      `[OfflinePolicy] [BLOCKED_OFFLINE] Blocked Figma network call (${params.operation}): Network mode is '${mode}'. Real HTTP calls strictly forbidden by default.`,
      403,
      { code: "BLOCKED_OFFLINE", operation: params.operation }
    );
  }

  if (params.dryRun !== false) {
    throw new FigmaApiError(
      `[OfflinePolicy] [DRY_RUN_BLOCKED] Blocked Figma network call (${params.operation}): Operation is designated as Dry Run.`,
      400,
      { code: "DRY_RUN_BLOCKED", operation: params.operation }
    );
  }

  if (params.explicitApproval !== true) {
    throw new FigmaApiError(
      `[OfflinePolicy] [BLOCKED_NO_APPROVAL] Blocked Figma network call (${params.operation}): Explicit user approval (confirmExecution=true) is missing.`,
      403,
      { code: "BLOCKED_NO_APPROVAL", operation: params.operation }
    );
  }
}

/**
 * Masks secret access tokens for logs and diagnostics.
 * Hardened for Phase 34A.1 (GATE-04): Strictly redacts token without leaking ANY identifying substrings.
 * Unifies maskToken() with sanitizeSecret() to guarantee zero leakage.
 */
export function maskToken(token?: string): string {
  if (!token || token.trim().length === 0) return "<none>";
  return "***MASKED_SECRET***";
}

/**
 * Strictly sanitizes tokens and credentials without leaking ANY identifying substrings (Phase 34A Hardened).
 */
export function sanitizeSecret(secret?: string): string {
  if (!secret || secret.trim().length === 0) return "<none>";
  return "***MASKED_SECRET***";
}

/**
 * Scans a text message, error message, or log string and redacts all instances of the secret token
 * as well as common credential header patterns (Phase 34A.1 / GATE-04).
 */
export function redactSecretFromText(text: string, secret?: string): string {
  if (!text || typeof text !== "string") return String(text ?? "");
  let result = text;
  if (secret && secret.trim().length > 0) {
    result = result.replaceAll(secret.trim(), "***MASKED_SECRET***");
  }
  result = result.replace(/(?:X-Figma-Token|Bearer)\s*[:=]\s*[^\s,;"]+/gi, "X-Figma-Token: ***MASKED_SECRET***");
  return result;
}
