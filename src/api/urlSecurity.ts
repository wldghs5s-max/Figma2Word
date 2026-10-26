/**
 * Validates external download URLs against SSRF, internal network traversal,
 * protocol smuggling, and cloud metadata access.
 * Hardened for Phase 34A.1 (GATE-02).
 */

export const TRUSTED_CDN_SUFFIXES = [
  "figma.com",
  "amazonaws.com",
  "cloudfront.net",
  "figma-alpha.s3.amazonaws.com",
];

export interface UrlSecurityOptions {
  allowedDomains?: string[];
  allowStandardPortsOnly?: boolean; // default true (only port 443 or default)
}

/**
 * Checks if an IPv4 address string falls into private, loopback, link-local, or reserved ranges.
 */
export function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP: treat as unsafe
  }

  const [b0, b1] = parts;
  // 0.0.0.0/8 (Current network / "this" network)
  if (b0 === 0) return true;
  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;
  // 10.0.0.0/8 (Private)
  if (b0 === 10) return true;
  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (b0 === 192 && b1 === 168) return true;
  // 169.254.0.0/16 (Link-Local / Cloud Metadata 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (TEST-NET)
  if (b0 === 192 && b1 === 0 && parts[2] === 2) return true;
  if (b0 === 198 && b1 === 51 && parts[2] === 100) return true;
  if (b0 === 203 && b1 === 0 && parts[2] === 113) return true;
  // 224.0.0.0/4 (Multicast)
  if (b0 >= 224 && b0 <= 239) return true;
  // 240.0.0.0/4 (Reserved / Future use)
  if (b0 >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address string falls into loopback, unique local, link-local, or IPv4-mapped ranges.
 */
export function isPrivateOrReservedIpv6(cleanIpv6: string): boolean {
  const lower = cleanIpv6.toLowerCase();
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // Link-local
  if (lower.startsWith("fc00:") || lower.startsWith("fd00:") || lower.startsWith("fc") || lower.startsWith("fd")) return true; // Unique local
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1)
    const ipv4Part = lower.replace("::ffff:", "");
    if (ipv4Part.includes(".") && isPrivateOrReservedIpv4(ipv4Part)) return true;
  }
  return false;
}

/**
 * Validates that an image download URL is strictly secure and safe to fetch.
 * Protects against SSRF, internal network scans, loopbacks, cloud metadata, and protocol smuggling.
 */
export function validateSecureCdnUrl(
  urlStr: string,
  options?: UrlSecurityOptions
): { valid: boolean; reason?: string } {
  if (!urlStr || typeof urlStr !== "string") {
    return { valid: false, reason: "Download URL must be a non-empty string" };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    return { valid: false, reason: `Malformed URL: ${urlStr}` };
  }

  // 1. Protocol MUST be HTTPS (Reject HTTP, FTP, file:, data:, gopher:, etc.)
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

  // 4. Reject non-standard HTTPS port (prevents port scanning of internal services)
  const port = parsed.port;
  const allowStandardOnly = options?.allowStandardPortsOnly ?? true;
  if (allowStandardOnly && port && port !== "443" && port !== "") {
    return {
      valid: false,
      reason: `Non-standard port '${port}' is forbidden for secure CDN access. Only port 443 is permitted.`,
    };
  }

  // 5. Reject localhost, 0.0.0.0, and loopbacks
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return {
      valid: false,
      reason: `Forbidden target: Loopback/local domain '${hostname}' is rejected.`,
    };
  }

  // 6. Check if hostname is an IPv4 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (isPrivateOrReservedIpv4(hostname)) {
      return {
        valid: false,
        reason: `Forbidden target: Private or cloud metadata IP address '${hostname}'.`,
      };
    }
  }

  // 7. Check if hostname is an IPv6 literal
  if (hostname.startsWith("[") || hostname.includes(":")) {
    const cleanIpv6 = hostname.replace(/^\[|\]$/g, "");
    if (isPrivateOrReservedIpv6(cleanIpv6)) {
      return {
        valid: false,
        reason: `Forbidden target: Private, link-local, or loopback IPv6 address '${hostname}'.`,
      };
    }
  }

  // 8. Verify hostname against trusted CDN suffixes
  const allowed = options?.allowedDomains || TRUSTED_CDN_SUFFIXES;
  const isTrustedHost = allowed.some(
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
