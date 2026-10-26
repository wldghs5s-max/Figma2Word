# Report 05: External URL & SSRF Security Boundaries

## 1. Problem Statement
The Figma API `/v1/images/:key` returns arbitrary URLs pointing to CDN-hosted image assets. If an attacker or compromised API response returned an internal URL (e.g., `http://169.254.169.254/latest/meta-data/` or `http://localhost:8080/admin`), an automated capture tool could inadvertently trigger Server-Side Request Forgery (SSRF) or exfiltrate local infrastructure data.

---

## 2. Security Defense: `validateSecureCdnUrl`
Implemented in [`src/api/urlSecurity.ts`](file:///Users/mac/projects/Figma2Word/Figma2Word/src/api/urlSecurity.ts#L22):

```ts
export function validateSecureCdnUrl(rawUrl: string): UrlValidationResult {
  // Protocol: HTTPS strictly required
  // No embedded user credentials (user:pass@)
  // Hostname & IP checks:
  // - Rejects localhost, loopback (127.0.0.1, ::1)
  // - Rejects private RFC1918 IPs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  // - Rejects link-local / cloud metadata IP (169.254.169.254)
  // - Requires trusted domain suffix (*.figma.com, *.s3.amazonaws.com, *.cloudfront.net)
}
```

### Trusted Domain Allowlist:
- `figma.com` (and `*.figma.com`)
- `s3.amazonaws.com` (and `*.s3.amazonaws.com`, `*.s3.*.amazonaws.com`)
- `cloudfront.net` (and `*.cloudfront.net`)

---

## 3. Credential Leakage Prevention
Additionally, [`validateSecureCdnUrl`](file:///Users/mac/projects/Figma2Word/Figma2Word/src/api/urlSecurity.ts#L22) rejects URLs with embedded credentials (`parsed.username` or `parsed.password`).

Crucially, in [`oneShotCapture.ts`](file:///Users/mac/projects/Figma2Word/Figma2Word/src/api/oneShotCapture.ts#L376), when downloading CDN images, the authorization header is explicitly omitted:
```ts
const dlRes = await fetchImpl(imgUrl, {
  method: "GET",
  headers: {
    Accept: "image/png,*/*",
    // Explicitly NO "X-Figma-Token" or "Authorization"
  },
});
```
This ensures third-party CDNs never receive the Figma access token.

---

## 4. Verification Evidence
Unit tests in `tests/phase34a-capture-hardening.test.ts` (Tests 4.1 - 4.5 and 5.3) confirm:
- Acceptance of genuine AWS S3 and CloudFront Figma image URLs.
- Rejection of HTTP protocol and malformed URLs.
- Rejection of localhost, `127.0.0.1`, and private IP ranges.
- Rejection of cloud metadata IP (`169.254.169.254`).
- Rejection of URLs with embedded credentials.
- Zero authorization headers passed to CDN download endpoints.
