# Report 07: Secret Protection & Credential Redaction

## 1. Zero-Secret Exposure Policy
Figma Personal Access Tokens (PATs) must never appear in:
1. Console stdout or stderr logs
2. Git commits, diffs, or patches
3. Diagnostic JSON or Markdown reports
4. HTTP request headers to non-Figma domains (e.g. S3/CloudFront)
5. Zip audit archives

---

## 2. Hardened Redaction: `sanitizeSecret`
In Phase 33, `maskToken()` left the first 4 and last 4 characters visible (e.g. `figd...7890`). In Phase 34A, [`sanitizeSecret`](file:///Users/mac/projects/Figma2Word/Figma2Word/src/api/networkMode.ts#L86) was introduced to eliminate any substring leakage:

```ts
export function sanitizeSecret(secret?: string | null): string {
  if (!secret) return "";
  return "***MASKED_SECRET***";
}

export function maskToken(token?: string | null): string {
  return sanitizeSecret(token);
}
```

Both functions return `***MASKED_SECRET***` consistently.

---

## 3. URL Parameter Scrubbing
Figma file URLs may contain query parameters or fragments that users paste. The URL parser extracts only the document key and sanitizes the node ID parameter.

---

## 4. Preflight Secret Scrubbing
An automated audit across the codebase and git repository confirms:
- No Figma PAT tokens are stored in `.env`, test files, or scripts.
- No tokens are present in `preflight-summary.json`.
- The test suite uses synthetic mock tokens (`"figd_test_mock_secret"`) which are verified to be fully redacted.

---

## 5. Verification Evidence
Unit tests in `tests/phase34a-capture-hardening.test.ts` (Tests 6.1 and 6.2) verify:
- `sanitizeSecret` strictly returns `"***MASKED_SECRET***"` without exposing length or substrings.
- Error messages and output plan/result objects do not leak token literals.
