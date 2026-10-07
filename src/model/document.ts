import { z } from "zod";
import { DocElement, DocElementSchema } from "./elements.js";
import { SpacingSchema } from "./style.js";

export const PageSizeNameSchema = z.enum(["A4", "Letter", "A3", "Custom"]);
export type PageSizeName = z.infer<typeof PageSizeNameSchema>;

export const PageOrientationSchema = z.enum(["portrait", "landscape"]);
export type PageOrientation = z.infer<typeof PageOrientationSchema>;

export const PageConfigSchema = z.object({
  size: PageSizeNameSchema.default("A4"),
  widthMm: z.number().default(210), // A4 default: 210mm
  heightMm: z.number().default(297), // A4 default: 297mm
  orientation: PageOrientationSchema.default("portrait"),
  marginsMm: SpacingSchema.default({
    top: 25.4, // standard 1 inch
    right: 25.4,
    bottom: 25.4,
    left: 25.4,
  }),
});
export type PageConfig = z.infer<typeof PageConfigSchema>;

export const DocumentHeaderFooterSchema = z.object({
  elements: z.array(DocElementSchema).default([]),
});
export type DocumentHeaderFooter = z.infer<typeof DocumentHeaderFooterSchema>;

export const DocumentSectionSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  pageConfig: PageConfigSchema.optional(),
  elements: z.array(DocElementSchema),
});
export type DocumentSection = z.infer<typeof DocumentSectionSchema>;

export const DocumentMetadataSchema = z.object({
  title: z.string().default("Converted Figma Document"),
  author: z.string().optional(),
  sourceFigmaFile: z.string().optional(),
  convertedAt: z.string().default(() => new Date().toISOString()),
  conversionMode: z.enum(["balanced", "fidelity", "editability"]).default("balanced"),
});
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

export const InternalDocumentSchema = z.object({
  version: z.literal("1.0.0").default("1.0.0"),
  metadata: DocumentMetadataSchema.default({
    title: "Converted Figma Document",
    convertedAt: new Date().toISOString(),
    conversionMode: "balanced",
  }),
  pageConfig: PageConfigSchema.default({
    size: "A4",
    widthMm: 210,
    heightMm: 297,
    orientation: "portrait",
    marginsMm: {
      top: 25.4,
      right: 25.4,
      bottom: 25.4,
      left: 25.4,
    },
  }),
  header: DocumentHeaderFooterSchema.optional(),
  footer: DocumentHeaderFooterSchema.optional(),
  sections: z.array(DocumentSectionSchema).default([]),
});
export type InternalDocument = z.infer<typeof InternalDocumentSchema>;
