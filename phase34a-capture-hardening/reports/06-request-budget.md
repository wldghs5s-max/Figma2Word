# Report 06: Request Budget Enforcement & Fail-Fast Safety

## 1. Motivation
Figma Personal Access Tokens are prone to strict rate limits and account suspension if excessive API calls are dispatched. To ensure absolute predictability, Phase 34A establishes hard request budget ceilings and Fail-Fast abort conditions.

---

## 2. Request Budget Ceilings
The request budget specifies maximum upper bounds for any One-Shot Capture invocation:

```ts
export interface RequestBudget {
  maxApiCallLimit: number;   // Default: 5 calls
  maxCdnCallLimit: number;   // Default: 25 calls
  maxTotalHttpLimit: number; // Default: 30 calls
}
```

### Enforcement Rules:
1. Prior to issuing any Figma REST API call, the engine checks:
   `if (apiCallsCount >= maxApi || (apiCallsCount + cdnDownloadsCount) >= maxTotal) { break; }`
2. Prior to issuing each CDN image download, the engine checks:
   `if (cdnDownloadsCount >= maxCdn || (apiCallsCount + cdnDownloadsCount) >= maxTotal) { break; }`
3. If any ceiling is reached, capture halts immediately, flags `budgetExceeded: true`, and returns partial results without attempting further calls.

---

## 3. Fail-Fast Error Abort
If any API call returns:
- **HTTP 429 (Too Many Requests)**: Capture immediately halts with status `RATE_LIMITED`. Retries and backoff loops are strictly forbidden to avoid token suspension.
- **HTTP 401 or 403 (Authentication/Authorization Error)**: Halts immediately with status `FAILED`.
- **HTTP 5xx (Server Error)**: Halts batch processing immediately.

---

## 4. Preservation of Partial Success
When errors occur mid-batch (e.g. 1st image succeeds, 2nd image fails with HTTP 500):
1. The successfully downloaded image is written to disk and its hash registered in `cache-manifest.json`.
2. The manifest is persisted immediately (`if (capturedEntries.length > 0) saveCacheManifest()`).
3. Execution terminates with status `PARTIAL_SUCCESS`.
4. A subsequent Dry Run automatically skips the cached image, requiring requests only for remaining missing nodes.

---

## 5. Verification Evidence
Unit tests in `tests/phase34a-capture-hardening.test.ts` (Tests 5.1 and 5.2) verify:
- Immediate halt when `maxApiCallLimit` ceiling is reached.
- Successful preservation of 1st valid frame into cache manifest and disk upon 2nd frame HTTP 500 failure, yielding `status: "PARTIAL_SUCCESS"`.
