import { z } from "zod";

export const ColorSchema = z.object({
  r: z.number().min(0).max(255),
  g: z.number().min(0).max(255),
  b: z.number().min(0).max(255),
  a: z.number().min(0).max(1).default(1),
  hex: z.string().optional(),
});
export type Color = z.infer<typeof ColorSchema>;

export const BorderStyleSchema = z.object({
  color: ColorSchema.optional(),
  width: z.number().min(0).default(1), // in pt or px
  style: z.enum(["solid", "dashed", "dotted", "none"]).default("solid"),
});
export type BorderStyle = z.infer<typeof BorderStyleSchema>;

export const SpacingSchema = z.object({
  top: z.number().default(0),
  right: z.number().default(0),
  bottom: z.number().default(0),
  left: z.number().default(0),
});
export type Spacing = z.infer<typeof SpacingSchema>;

export const TextStyleSchema = z.object({
  fontFamily: z.string().default("Calibri"),
  fontSize: z.number().default(11), // in pt
  fontWeight: z.union([z.number(), z.enum(["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"])]).default("normal"),
  italic: z.boolean().default(false),
  underline: z.boolean().default(false),
  strike: z.boolean().default(false),
  color: ColorSchema.default({ r: 0, g: 0, b: 0, a: 1, hex: "000000" }),
  lineHeight: z.number().optional(), // multiplier or pt
  letterSpacing: z.number().optional(),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const LayoutDirectionSchema = z.enum(["vertical", "horizontal", "none"]);
export type LayoutDirection = z.infer<typeof LayoutDirectionSchema>;

export const AlignmentSchema = z.enum(["left", "center", "right", "justify"]);
export type Alignment = z.infer<typeof AlignmentSchema>;

