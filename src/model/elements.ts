import { z } from "zod";
import {
  AlignmentSchema,
  BorderStyleSchema,
  ColorSchema,
  LayoutDirectionSchema,
  SpacingSchema,
  TextStyleSchema,
} from "./style.js";

// Text Run (inline text with styling)
export const TextRunSchema = z.object({
  type: z.literal("run").default("run"),
  text: z.string(),
  style: TextStyleSchema.partial().optional(),
});
export type TextRun = z.infer<typeof TextRunSchema>;

// Paragraph Element
export const ParagraphElementSchema = z.object({
  id: z.string().optional(),
  type: z.literal("paragraph"),
  runs: z.array(TextRunSchema),
  alignment: AlignmentSchema.default("left"),
  spacing: SpacingSchema.partial().optional(),
  isBullet: z.boolean().optional(),
  isNumbered: z.boolean().optional(),
});
export type ParagraphElement = z.infer<typeof ParagraphElementSchema>;

// Heading Element
export const HeadingElementSchema = z.object({
  id: z.string().optional(),
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).default(1),
  runs: z.array(TextRunSchema),
  alignment: AlignmentSchema.default("left"),
  spacing: SpacingSchema.partial().optional(),
});
export type HeadingElement = z.infer<typeof HeadingElementSchema>;

// Image Element
export const ImageElementSchema = z.object({
  id: z.string().optional(),
  type: z.literal("image"),
  source: z.string(), // base64, data URI, or local file path
  width: z.number().min(1), // in px or pt
  height: z.number().min(1),
  altText: z.string().optional(),
  caption: z.string().optional(),
  alignment: AlignmentSchema.default("left"),
  spacing: SpacingSchema.partial().optional(),
});
export type ImageElement = z.infer<typeof ImageElementSchema>;

// Line / Divider Element
export const LineElementSchema = z.object({
  id: z.string().optional(),
  type: z.literal("line"),
  thickness: z.number().default(1),
  color: ColorSchema.optional(),
  length: z.union([z.number(), z.literal("100%")]).default("100%"),
  spacing: SpacingSchema.partial().optional(),
});
export type LineElement = z.infer<typeof LineElementSchema>;

// Page Break Element
export const PageBreakElementSchema = z.object({
  id: z.string().optional(),
  type: z.literal("page_break"),
});
export type PageBreakElement = z.infer<typeof PageBreakElementSchema>;


// Shape Element (e.g. Card background, badge, box)
export const ShapeElementSchema = z.object({
  id: z.string().optional(),
  type: z.literal("shape"),
  shapeType: z.enum(["rectangle", "rounded_rectangle", "ellipse"]).default("rectangle"),
  width: z.number().optional(),
  height: z.number().optional(),
  fill: ColorSchema.optional(),
  stroke: BorderStyleSchema.optional(),
  cornerRadius: z.number().optional(),
  content: z.array(z.lazy(() => DocElementSchema)).optional(),
});
export type ShapeElement = {
  id?: string;
  type: "shape";
  shapeType: "rectangle" | "rounded_rectangle" | "ellipse";
  width?: number;
  height?: number;
  fill?: z.infer<typeof ColorSchema>;
  stroke?: z.infer<typeof BorderStyleSchema>;
  cornerRadius?: number;
  content?: DocElement[];
};

// Table Cell Element
export const TableCellSchema = z.object({
  id: z.string().optional(),
  children: z.array(z.lazy(() => DocElementSchema)),
  background: ColorSchema.optional(),
  border: BorderStyleSchema.optional(),
  padding: SpacingSchema.partial().optional(),
  colSpan: z.number().min(1).default(1),
  rowSpan: z.number().min(1).default(1),
  width: z.number().optional(), // width in percentage or pt
});
export type TableCell = {
  id?: string;
  children: DocElement[];
  background?: z.infer<typeof ColorSchema>;
  border?: z.infer<typeof BorderStyleSchema>;
  padding?: Partial<z.infer<typeof SpacingSchema>>;
  colSpan: number;
  rowSpan: number;
  width?: number;
};

// Table Row Element
export const TableRowSchema = z.object({
  id: z.string().optional(),
  cells: z.array(TableCellSchema),
  isHeader: z.boolean().default(false),
});
export type TableRow = {
  id?: string;
  cells: TableCell[];
  isHeader: boolean;
};

// Table Element
export const TableElementSchema = z.object({
  id: z.string().optional(),
  type: z.literal("table"),
  rows: z.array(TableRowSchema),
  columnWidths: z.array(z.number()).optional(),
  borders: BorderStyleSchema.optional(),
  alignment: AlignmentSchema.default("left"),
  spacing: SpacingSchema.partial().optional(),
});
export type TableElement = {
  id?: string;
  type: "table";
  rows: TableRow[];
  columnWidths?: number[];
  borders?: z.infer<typeof BorderStyleSchema>;
  alignment: z.infer<typeof AlignmentSchema>;
  spacing?: Partial<z.infer<typeof SpacingSchema>>;
};

// Container Element (e.g. Card, Horizontal Group, Flex Layout)
export const ContainerElementSchema = z.object({
  id: z.string().optional(),
  type: z.literal("container"),
  layoutDirection: LayoutDirectionSchema.default("vertical"),
  gap: z.number().default(0),
  padding: SpacingSchema.partial().optional(),
  background: ColorSchema.optional(),
  border: BorderStyleSchema.optional(),
  cornerRadius: z.number().optional(),
  width: z.union([z.number(), z.literal("100%")]).optional(),
  columnWidths: z.array(z.number()).optional(),
  children: z.array(z.lazy(() => DocElementSchema)),
});
export type ContainerElement = {
  id?: string;
  type: "container";
  layoutDirection: "vertical" | "horizontal" | "none";
  gap: number;
  padding?: Partial<z.infer<typeof SpacingSchema>>;
  background?: z.infer<typeof ColorSchema>;
  border?: z.infer<typeof BorderStyleSchema>;
  cornerRadius?: number;
  width?: number | "100%";
  columnWidths?: number[];
  children: DocElement[];
};

// Union of all supported document elements
export const DocElementSchema: z.ZodType<DocElement> = z.lazy(() =>
  z.discriminatedUnion("type", [
    HeadingElementSchema,
    ParagraphElementSchema,
    ImageElementSchema,
    LineElementSchema,
    PageBreakElementSchema,
    ShapeElementSchema as any,
    TableElementSchema as any,
    ContainerElementSchema as any,
  ])
);

export type DocElement =
  | HeadingElement
  | ParagraphElement
  | ImageElement
  | LineElement
  | PageBreakElement
  | ShapeElement
  | TableElement
  | ContainerElement;

