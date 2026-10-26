# Phase 34A: One-Shot Capture Hardening & Preflight Verification
## Executive Summary & Deliverables Index

### 1. Overview
Phase 34A elevates the Figma Reference Capture mechanism implemented in Phase 33 to enterprise-grade security and reliability standards prior to executing any real Figma API requests. 

**Core Principle**: **ZERO REAL FIGMA API CALLS BY DEFAULT**
No tokens were requested, stored, or sent to external endpoints during this phase. All verification was executed entirely offline or through hermetic unit test mocks.

---

### 2. Key Hardening Implementations

1. **Unified Network Gatekeeper** (`src/api/networkMode.ts`):
   - Eliminated the offline bypass vulnerability in `executeOneShotCapture()`.
   - Unified `assertFigmaNetworkAllowed()` checks across both API calls and CDN downloads.
   - Enforces `networkMode === "online"`, `dryRun === false`, and `confirmExecution === true` simultaneously.

2. **Strict SSRF & CDN URL Validation** (`src/api/urlSecurity.ts`):
   - Enforces HTTPS only.
   - Rejects loopback (`127.0.0.1`, `::1`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and AWS/GCP cloud metadata IP (`169.254.169.254`).
   - Rejects URLs with embedded user credentials (`user:pass@host`).
   - Allows only trusted CDN domains (`*.figma.com`, `*.s3.amazonaws.com`, `*.cloudfront.net`).

3. **Binary PNG Format & Anti-Poisoning Validation** (`src/cache/pngValidator.ts`):
   - Verifies 8-byte PNG signature (`89 50 4E 47 0D 0A 1A 0A`).
   - Parses 13-byte `IHDR` chunk for width, height, bit depth, and color type.
   - Strictly blocks HTML/JSON error documents disguised with `.png` extensions.
   - Enforces dimensions in range $[1, 16384]$ pixels.
   - Confirms terminating `IEND` chunk.

4. **Deep Cache Integrity & Path Traversal Guard** (`src/cache/cacheManifest.ts`):
   - Introduced `getFigmaReferenceDetailed()` returning exhaustive statuses: `VALID`, `MISSING`, `CORRUPT`, `INVALID_FORMAT`, `SOURCE_MISMATCH`, `PATH_TRAVERSAL`.
   - `getFigmaReference()` strictly returns non-null ONLY for `VALID` status.
   - Path containment check prevents cache traversal outside the root cache directory.

5. **Token Privacy & Header Sanitization**:
   - Stripped `X-Figma-Token` headers from all CDN download requests.
   - Replaced substring token leaks with full redaction (`***MASKED_SECRET***`).

6. **Request Budget Ceilings & Atomic File Persistence**:
   - Enforces hard ceilings (`maxApiCallLimit: 5`, `maxCdnCallLimit: 25`, `maxTotalHttpLimit: 30`).
   - Downloads to `.tmp_*` files and executes atomic file renames to prevent half-written cache corruption.

---

### 3. Deliverables Table

| Artifact Path | Description |
|---|---|
| [`reports/01-initial-audit.md`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/reports/01-initial-audit.md) | Initial code audit & vulnerability analysis |
| [`reports/02-network-policy.md`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/reports/02-network-policy.md) | Common network gatekeeper & bypass elimination |
| [`reports/03-cache-integrity.md`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/reports/03-cache-integrity.md) | Deep cache verification & path traversal guard |
| [`reports/04-png-validation.md`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/reports/04-png-validation.md) | Binary PNG parsing & payload anti-poisoning |
| [`reports/05-url-security.md`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/reports/05-url-security.md) | SSRF prevention & CDN allowlist enforcement |
| [`reports/06-request-budget.md`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/reports/06-request-budget.md) | Request budgets, batching, & fail-fast policies |
| [`reports/07-secret-safety.md`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/reports/07-secret-safety.md) | Token masking, header protection, & audit scrub |
| [`reports/08-failure-injection.md`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/reports/08-failure-injection.md) | Failure simulation results (429, 401, 500, corrupt) |
| [`reports/09-real-json-preflight.md`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/reports/09-real-json-preflight.md) | 187MB Figma JSON snapshot preflight & 17 frames audit |
| [`reports/10-regression-results.md`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/reports/10-regression-results.md) | Full regression results (74 test files, 505 passed) |
| [`reports/11-final-readiness.md`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/reports/11-final-readiness.md) | Final security checklist & Phase 34B execution conditions |
| [`preflight-summary.json`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/preflight-summary.json) | Structured machine-readable preflight audit data |
| [`evidence/logs/full_test_log.txt`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/evidence/logs/full_test_log.txt) | Complete stdout/stderr of 74 test files run |
| [`evidence/git_diff_summary.patch`](file:///Users/mac/projects/Figma2Word/Figma2Word/phase34a-capture-hardening/evidence/git_diff_summary.patch) | Git diff patch containing all Phase 34A changes |
