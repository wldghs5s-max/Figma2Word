import { Color, BorderStyle, Spacing } from "../model/style.js";
import { BorderStyle as DocxBorderStyle, WidthType } from "docx";

/**
 * Converts millimeters to DXA (twips: 1/20 of a pt; 1 mm ~ 56.7 dxa)
 */
export function mmToDxa(mm: number): number {
  return Math.round((mm * 1440) / 25.4);
}

/**
 * Converts points to DXA (1 pt = 20 dxa)
 */
export function ptToDxa(pt: number): number {
  return Math.round(pt * 20);
}

/**
 * Converts points to half-points (docx uses half-points for font size)
 */
export function ptToHalfPt(pt: number): number {
  return Math.round(pt * 2);
}

/**
 * Converts Color model to 6-digit hex string (without #)
 */
export function colorToHex(color?: Color): string | undefined {
  if (!color) return undefined;
  if (color.hex) {
    return color.hex.replace(/^#/, "").toUpperCase();
  }
  const r = Math.round(color.r).toString(16).padStart(2, "0");
  const g = Math.round(color.g).toString(16).padStart(2, "0");
  const b = Math.round(color.b).toString(16).padStart(2, "0");
  return `${r}${g}${b}`.toUpperCase();
}

/**
 * Converts model border to docx border definition
 */
export function toDocxBorder(border?: BorderStyle) {
  if (!border || border.style === "none" || border.width === 0) {
    return {
      style: DocxBorderStyle.NONE,
      size: 0,
      color: "auto",
    };
  }

  let style: (typeof DocxBorderStyle)[keyof typeof DocxBorderStyle] = DocxBorderStyle.SINGLE;
  if (border.style === "dashed") style = DocxBorderStyle.DASHED;
  if (border.style === "dotted") style = DocxBorderStyle.DOTTED;

  return {
    style,
    size: Math.max(1, Math.round(pxToPt(border.width) * 8)), // 1/8 pt units
    color: colorToHex(border.color) ?? "000000",
  };
}

/**
 * Convert spacing to docx cell margin or paragraph spacing
 */
/**
 * Figma padding and gaps are pixels. Word spacing is points.
 */
export function pxToPt(px?: number): number {
  if (px === undefined || px === null || Number.isNaN(px) || px === 0) return 0;
  return Math.max(0.5, Math.round(px * 0.75 * 10) / 10);
}

export function spacingToCellMargin(spacing?: Partial<Spacing>) {
  if (!spacing) return undefined;
  return {
    top: spacing.top !== undefined ? ptToDxa(pxToPt(spacing.top)) : 0,
    bottom: spacing.bottom !== undefined ? ptToDxa(pxToPt(spacing.bottom)) : 0,
    left: spacing.left !== undefined ? ptToDxa(pxToPt(spacing.left)) : 0,
    right: spacing.right !== undefined ? ptToDxa(pxToPt(spacing.right)) : 0,
  };
}

export type DocxImageType = "png" | "jpg" | "gif" | "bmp";

export function decodeBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
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

export function detectImageType(bytes: Uint8Array, mime?: string): DocxImageType | null {
  const normalized = mime?.toLowerCase().split(";")[0].trim();
  if (normalized === "image/jpeg" || normalized === "image/jpg" || normalized === "image/pjpeg") {
    return "jpg";
  }
  if (normalized === "image/png") return "png";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/bmp" || normalized === "image/x-ms-bmp") return "bmp";

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "bmp";
  return null;
}

export function fitImageSize(
  width: number,
  height: number,
  maxWidth: number
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.round(width || 1));
  const safeHeight = Math.max(1, Math.round(height || 1));
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || safeWidth <= maxWidth) {
    return { width: safeWidth, height: safeHeight };
  }
  const scale = maxWidth / safeWidth;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}
