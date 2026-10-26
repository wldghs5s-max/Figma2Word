# Report 02: Network Policy Gatekeeper & Bypass Elimination

## 1. Centralized Network Authorization Gatekeeper
To ensure that no code path can bypass the offline invariant, a centralized gatekeeper function [`assertFigmaNetworkAllowed`](file:///Users/mac/projects/Figma2Word/Figma2Word/src/api/networkMode.ts#L55) was implemented in `src/api/networkMode.ts`.

```ts
export interface NetworkPermissionParams {
  operation: string;
  networkMode?: FigmaNetworkMode;
  explicitApproval?: boolean;
  dryRun?: boolean;
}

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
```

---

## 2. Triple Condition Invariant
A network call is ONLY permitted when all three criteria are met simultaneously:
1. **Network Mode**: Must be explicitly `"online"`. The environment variable `FIGMA_NETWORK_MODE` defaults to `"offline"`.
2. **Dry Run**: Must be strictly `false`. Default is `true`.
3. **Explicit User Confirmation**: `confirmExecution` must be strictly `true`.

If ANY of these conditions is missing, the gatekeeper throws a fail-closed `FigmaApiError` immediately.

---

## 3. Dual Enforcement: API and CDN Calls
In previous iterations, only the REST API was guarded. In Phase 34A, `assertFigmaNetworkAllowed` is enforced at two distinct interception points:
1. **Prior to issuing the Figma REST API batch request**: `operation: "figma-images-batch-{N}"`
2. **Prior to issuing each CDN image download request**: `operation: "cdn-download-{nodeId}"`

This guarantees that even if a valid Figma API response is parsed, no external CDN downloads can occur unless explicitly authorized.

---

## 4. Verification Evidence
Unit tests in `tests/phase34a-capture-hardening.test.ts` (Tests 1.1 - 1.4) verify:
- In default offline mode, execution is blocked with `BLOCKED_OFFLINE` even if `confirmExecution === true`.
- In online mode, execution is blocked with `BLOCKED_NO_APPROVAL` if `confirmExecution` is missing or false.
- When `dryRun === true`, 0 network calls occur even when online and confirmed.
- `assertFigmaNetworkAllowed` throws fail-closed on every missing prerequisite.
