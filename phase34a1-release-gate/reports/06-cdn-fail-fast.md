# Report 06: CDN Error Fail-Fast & Request Budget (GATE-05)

## 1. Context & Identified Vulnerability
In Phase 34A, Figma REST API requests implemented Fail-Fast on HTTP 429 (`RATE_LIMITED`) and HTTP 401/403 (`FAILED`).
However, during CDN image downloads:
```ts
if (!dlRes.ok) {
  errors.push(`Failed to download image for node '${nodeId}': HTTP ${dlRes.status}`);
  continue; // Vulnerability: simply continued to next image
}
```
**Vulnerability:** If the CDN returned HTTP 429 (Rate Limit exceeded) or HTTP 401/403 (Signed URL expired or access denied), the loop continued downloading the remaining images. This risked spamming the CDN, exhausting rate limits, or triggering IP bans.

## 2. Remediated Architecture (`src/api/oneShotCapture.ts`)

### 1) CDN Fail-Fast on 429, 401, and 403
In `executeOneShotCapture`:
- If `dlResult.isRateLimit` (HTTP 429):
  - Sets `abortedDueToRateLimit = true`.
  - Records error: `"CDN Rate Limit (429) encountered. Immediately halting capture with Fail-Fast."`.
  - Breaks out of the node loop and breaks out of all remaining batch loops immediately.
  - Final execution status is set to `"RATE_LIMITED"`.
- If `dlResult.isAuthError` (HTTP 401 or 403):
  - Sets `abortedDueToAuth = true`.
  - Records error: `"CDN access denied (HTTP 403) on node '${nodeId}'"`.
  - Breaks out of the loop immediately.
  - Final execution status is set to `"FAILED"`.

### 2) Zero Subsequent Network Requests
Once a Fail-Fast condition is triggered:
- Total HTTP request counters freeze.
- Exactly 0 further HTTP requests are dispatched to either Figma API or CDN endpoints.

### 3) Partial Success State Preservation
Any images successfully downloaded, verified, and committed before the 429 or 401/403 event are safely preserved in both the cache directory and `cache-manifest.json`. The next run identifies these preserved frames as `VALID` and only schedules the remaining missing frames.

### 4) Request Budget Invariants
Enforces conservative request limits:
- `maxApiCallLimit`: 5 requests
- `maxCdnCallLimit`: 25 downloads
- `maxTotalHttpLimit`: 30 operations
Counters are incremented **before** every request attempt, guaranteeing failed attempts count against the budget ceiling.

## 3. Test Verification (`tests/phase34a1-release-gate.test.ts`)

| Test Case | Description | Result |
|---|---|---|
| `5.1` | Immediately halts entire capture when CDN returns HTTP 429 | **PASSED** (CDN calls stopped at 1, status: `"RATE_LIMITED"`, 0 subsequent calls) |
| `5.2` | Immediately halts entire capture when CDN returns HTTP 403 | **PASSED** (CDN calls stopped at 1, status: `"FAILED"`, 0 subsequent calls) |
| `5.3` | Preserves earlier successful downloads when subsequent frame hits CDN 429 | **PASSED** (Frame 1:1 committed in manifest, Frame 1:2 hit 429, Frame 1:3 never called) |
