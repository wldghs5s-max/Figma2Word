/**
 * Cross-platform binary utilities for Canvas IR.
 * Safe for both Node.js and Browser environments (no direct Buffer global requirement).
 */

export function decodeBase64(b64: string): Uint8Array {
  // If Buffer is available in the environment (e.g. Node.js), use it for speed
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  // Otherwise, use browser atob
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i) & 0xff;
  }
  return bytes;
}

export function decodeDataUrl(source: string): { mime?: string; bytes: Uint8Array } | null {
  if (!source.startsWith("data:")) return null;
  const comma = source.indexOf(",");
  if (comma < 0) return null;

  const meta = source.slice(5, comma);
  const payload = source.slice(comma + 1).replace(/\s/g, "");
  if (!payload) return null;

  const mime = meta.split(";")[0] || undefined;
  try {
    return { mime, bytes: decodeBase64(payload) };
  } catch {
    return null;
  }
}
