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
    size: Math.max(1, Math.round(border.width * 8)), // 1/8 pt units
    color: colorToHex(border.color) ?? "000000",
  };
}

/**
 * Convert spacing to docx cell margin or paragraph spacing
 */
export function spacingToCellMargin(spacing?: Partial<Spacing>) {
  if (!spacing) return undefined;
  return {
    top: spacing.top !== undefined ? ptToDxa(spacing.top) : 0,
    bottom: spacing.bottom !== undefined ? ptToDxa(spacing.bottom) : 0,
    left: spacing.left !== undefined ? ptToDxa(spacing.left) : 0,
    right: spacing.right !== undefined ? ptToDxa(spacing.right) : 0,
  };
}
