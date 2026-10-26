/**
 * Validates external download URLs against SSRF, internal network traversal,
 * protocol smuggling, and cloud metadata access (Phase 34A).
 */

const TRUSTED_CDN_SUFFIXES = [
  "figma.com",
  "amazonaws.com",
  "cloudfront.net",
  "figma-alpha.s3.amazonaws.com",
];

/**
 * Checks if an IPv4 address string falls into private, loopback, or link-local ranges.
 */
function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP: treat as unsafe
  }

  const [b0, b1] = parts;
  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;
  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;
  // 10.0.0.0/8 (Private)
  if (b0 === 10) return true;
  // 172.16.0.0/12 (Private: 172.16 - 172.31)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (b0 === 192 && b1 === 168) return true;
  // 169.254.0.0/16 (Link-Local / Cloud Metadata 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  return false;
}

/**
 * Validates that an image download URL is strictly secure and safe to fetch.
 */
export function validateSecureCdnUrl(urlStr: string): { valid: boolean; reason?: string } {
  if (!urlStr || typeof urlStr !== "string") {
    return { valid: false, reason: "Download URL must be a non-empty string" };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    return { valid: false, reason: `Malformed URL: ${urlStr}` };
  }

  // 1. Protocol MUST be HTTPS
  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      reason: `Insecure protocol '${parsed.protocol}'. Only HTTPS is permitted.`,
    };
  }

  // 2. Reject credentials in URL (user:pass@host)
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      reason: "URL must not contain embedded userinfo or credentials.",
    };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // 3. Reject empty hostname
  if (!hostname) {
    return { valid: false, reason: "URL hostname cannot be empty." };
  }

  // 4. Reject localhost and loopbacks
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  ) {
    return {
      valid: false,
      reason: `Forbidden target: Loopback/localhost '${hostname}' is rejected.`,
    };
  }

  // 5. Check if hostname is an IPv4 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (isPrivateOrReservedIpv4(hostname)) {
      return {
        valid: false,
        reason: `Forbidden target: Private or cloud metadata IP address '${hostname}'.`,
      };
    }
  }

  // 6. Check if hostname is an IPv6 literal
  if (hostname.startsWith("[") || hostname.includes(":")) {
    const cleanIpv6 = hostname.replace(/^\[|\]$/g, "");
    if (
      cleanIpv6 === "::1" ||
      cleanIpv6.startsWith("fe80:") ||
      cleanIpv6.startsWith("fc00:") ||
      cleanIpv6.startsWith("fd00:")
    ) {
      return {
        valid: false,
        reason: `Forbidden target: Private or link-local IPv6 address '${hostname}'.`,
      };
    }
  }

  // 7. Verify hostname against trusted CDN suffixes
  const isTrustedHost = TRUSTED_CDN_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );

  if (!isTrustedHost) {
    return {
      valid: false,
      reason: `Untrusted download host '${hostname}'. Host must belong to verified Figma/AWS CDN domain.`,
    };
  }

  return { valid: true };
}
