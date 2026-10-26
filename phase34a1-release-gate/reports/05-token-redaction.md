# Report 05: Token Complete Redaction & Secret Safety (GATE-04)

## 1. Context & Identified Vulnerability
In Phase 34A, two token handling functions existed in `src/api/networkMode.ts`:
1. `sanitizeSecret(secret)`: returned `"***MASKED_SECRET***"`.
2. `maskToken(token)`: returned `${trimmed.substring(0, 4)}...${trimmed.substring(trimmed.length - 4)}` (e.g. `figd...7890`).

**Vulnerability:**
`maskToken()` leaked the vendor prefix (`figd`) and the last 4 characters of the access token in diagnostic logs and test output. Furthermore, if a network error (such as DNS failure, connection reset, or HTTP client error) included the raw token string in `error.message`, it could be stored in `result.errors` or serialized to logs.

## 2. Remediated Architecture (`src/api/networkMode.ts` & `src/api/oneShotCapture.ts`)

### 1) Unified 100% Token Masking
Modified `maskToken(token?: string)` to match `sanitizeSecret`:
- If token is empty or undefined: returns `"<none>"`.
- If token is present: strictly returns `"***MASKED_SECRET***"`.
- Zero prefix, suffix, length, or entropy information is disclosed.

### 2) Automatic Error String Sanitization (`redactSecretFromText`)
Implemented `redactSecretFromText(text: string, secret?: string)`:
- Scans error messages, exception strings, and serialized output.
- Globally replaces occurrences of `secret.trim()` with `"***MASKED_SECRET***"`.
- Regular expression replaces common credential patterns:
  - `X-Figma-Token: <token>` $\to$ `X-Figma-Token: ***MASKED_SECRET***`
  - `Bearer <token>` $\to$ `Bearer ***MASKED_SECRET***`
- In `oneShotCapture.ts`, all entries in `result.errors` are mapped through `redactSecretFromText(err, options.accessToken)` before returning.

### 3) CDN Request Header Exclusion
CDN download requests strictly exclude `X-Figma-Token` and `Authorization` headers.

## 3. Test Verification (`tests/phase34a1-release-gate.test.ts`)

| Test Case | Description | Result |
|---|---|---|
| `4.1` | `maskToken` and `sanitizeSecret` completely mask tokens without leaking prefix/suffix | **PASSED** (Both return `"***MASKED_SECRET***"`, empty/undefined return `"<none>"`) |
| `4.2` | Serialized capture results and network error messages never leak access tokens | **PASSED** (Error message `Failed with figd_HIGHLY_SENSITIVE_...` scrubbed to `***MASKED_SECRET***`) |
