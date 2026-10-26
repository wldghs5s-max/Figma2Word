# Report 01: Initial Code Audit & Vulnerability Assessment

## 1. Background
In Phase 33, One-Shot Capture was introduced to batch reference captures into a single workflow. A security and architecture audit of the Phase 33 implementation revealed several critical vulnerabilities that violated enterprise security and offline-by-default invariants.

---

## 2. Identified Vulnerabilities & Remediation Matrix

| ID | Component | Vulnerability Description | Risk Level | Remediated In |
|---|---|---|---|---|
| **VULN-01** | `oneShotCapture.ts` | **Offline Mode Bypass**: `executeOneShotCapture` called `fetch` directly without checking `isOfflineMode()` or `assertOnlineAllowed()`. Passing `confirmExecution: true` triggered real network requests even in offline mode. | **CRITICAL** | `assertFigmaNetworkAllowed()` enforced universally. |
| **VULN-02** | `oneShotCapture.ts` | **SSRF in CDN Downloads**: Download URLs returned in the Figma API JSON response were passed directly to `fetch` without validating hostname, IP scheme, or protocol. A poisoned response could probe AWS metadata (`169.254.169.254`) or localhost services. | **HIGH** | `validateSecureCdnUrl()` in `urlSecurity.ts`. |
| **VULN-03** | `cacheManifest.ts` | **False Cache Hits**: `getFigmaReference()` returned an entry if its `sourceType === 'FIGMA_REFERENCE'`, without verifying if the file actually existed on disk, matched its recorded SHA-256 hash, or was a valid PNG. | **HIGH** | `getFigmaReferenceDetailed()` with fail-closed validation. |
| **VULN-04** | `oneShotCapture.ts` | **Payload Poisoning**: Downloaded data was written directly to `.png` without verifying binary format. An HTTP 403 HTML page or JSON error could be saved as a reference PNG, poisoning subsequent fidelity tests. | **HIGH** | `validatePngBuffer()` in `pngValidator.ts`. |
| **VULN-05** | `oneShotCapture.ts` | **Token Header Leakage to CDNs**: HTTP headers including `X-Figma-Token` were susceptible to being passed along during CDN redirect loops or external image fetching. | **HIGH** | Explicitly stripped auth headers on all CDN downloads. |
| **VULN-06** | `networkMode.ts` | **Secret Exposure in Diagnostics**: `maskToken()` previously revealed partial prefixes/suffixes (e.g. `figd...7890`), which could aid credential recovery in compromised log repositories. | **MEDIUM** | `sanitizeSecret()` replaced with strict redaction. |
| **VULN-07** | `cacheManifest.ts` | **Directory Traversal**: Cached entries could specify relative paths containing `../` escaping the cache directory boundary. | **MEDIUM** | Strict `isPathInsideDirectory()` path containment check. |

---

## 3. Audit Conclusion
All 7 vulnerabilities were systematically remediated with unit test coverage in `tests/phase34a-capture-hardening.test.ts`. Zero real network calls are possible without satisfying all gatekeeper criteria simultaneously.
