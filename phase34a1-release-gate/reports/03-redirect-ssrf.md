# Report 03: CDN Redirect Control & SSRF Defense (GATE-02)

## 1. Context & Identified Vulnerability
In Phase 34A, CDN image downloads used Node standard `fetch(url)` which defaults to `redirect: "follow"`.
**Vulnerability:** Even if the initial CDN URL was validated against SSRF rules, a compromised or open redirect endpoint on an S3 bucket or CloudFront distribution could issue a `302 Redirect` to:
- `http://169.254.169.254/latest/meta-data/` (AWS instance credentials)
- `http://127.0.0.1/` or `http://localhost/` (Internal developer services)
- `http://10.0.0.1/` (Private internal network infrastructure)
- `http://...` (Plaintext protocol downgrade)

The runtime `fetch` would automatically follow the redirect without re-validating the destination.

## 2. Remediated Architecture (`src/api/oneShotCapture.ts` & `src/api/urlSecurity.ts`)

### 1) Explicit Manual Redirect Interception
Implemented `fetchCdnImageWithSecureRedirects()`:
- Specifies `redirect: "manual"` on every HTTP request.
- Detects redirect status codes: `301 Moved Permanently`, `302 Found`, `303 See Other`, `307 Temporary Redirect`, `308 Permanent Redirect`.

### 2) Hop-by-Hop SSRF Re-validation
For each redirect:
1. Extracts `Location` header. If missing, aborts.
2. Resolves destination against current URL via `new URL(location, currentUrl).href`.
3. Checks protocol: must be strictly `https:`. Blocks any HTTPS $\to$ HTTP downgrade.
4. Detects loops: tracks `visitedUrls = new Set<string>()`. If destination was already visited, aborts.
5. Re-evaluates destination against `validateSecureCdnUrl()`:
   - Blocks `127.0.0.1`, `localhost`, `::1`, `0.0.0.0`, `.local`, `.internal`
   - Blocks private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
   - Blocks cloud metadata IP (`169.254.169.254`)
   - Blocks link-local / unique-local IPv6 (`fe80:`, `fc00:`, `fd00:`)
   - Blocks non-standard HTTPS ports (only port 443 permitted)
   - Checks trusted domain suffix list (`figma.com`, `amazonaws.com`, `cloudfront.net`)
6. Redirect limit: max 3 hops (configurable). Aborts if limit exceeded.

### 3) Zero Credential Leakage to CDN Endpoints
CDN requests strictly omit `X-Figma-Token` and `Authorization` headers. Even if a redirect points to another domain, zero user credentials or access tokens are transmitted.

### 4) Remaining Risks & Honest Technical Assessment
- **DNS Rebinding:** String-based URL inspection cannot fully prevent DNS rebinding attacks where an attacker controls an authoritative DNS server that returns an external IP on first lookup and an internal IP (`127.0.0.1`) on connection. In pure Node.js `fetch` without native socket-level IP pinning, this theoretical boundary exists. However, because downloads are restricted to verified domains (`figma.com`, `amazonaws.com`, `cloudfront.net`), DNS rebinding would require hijacking authoritative DNS for Figma or Amazon AWS domains.
- **Third-Party CDN Suffixes:** Broad wildcard suffixes (`*.s3.amazonaws.com`) encompass other AWS customers. Before Phase 34B execution, the exact image URLs returned by Figma API can be reviewed in dry-run mode.

## 3. Test Verification (`tests/phase34a1-release-gate.test.ts`)

| Test Case | Description | Result |
|---|---|---|
| `2.1` | Follows legitimate HTTPS 302 redirect (S3 $\to$ CloudFront) | **PASSED** (1 hop recorded, image downloaded successfully) |
| `2.2` | Blocks redirect to loopback (`https://127.0.0.1/`) | **PASSED** (Rejected: `Loopback/local domain '127.0.0.1'`) |
| `2.3` | Blocks redirect to cloud metadata (`https://169.254.169.254/`) | **PASSED** (Rejected: `Private or cloud metadata IP address`) |
| `2.4` | Blocks redirect to private IP (`https://10.0.0.1/`) | **PASSED** (Rejected: `Private or cloud metadata IP address`) |
| `2.5` | Blocks protocol downgrade (HTTPS $\to$ HTTP) | **PASSED** (Rejected: `Insecure protocol downgrade forbidden`) |
| `2.6` | Detects redirect loop (A $\to$ A) | **PASSED** (Rejected: `Redirect loop detected`) |
| `2.7` | Aborts when exceeding max redirect count (> 2) | **PASSED** (Rejected: `Exceeded maximum redirect limit (2)`) |
