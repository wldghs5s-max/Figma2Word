import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  XmlAttributeComponent,
  XmlComponent,
  Header,
  Footer,
  ImageRun,
  PageBreak,
  AlignmentType,
  HeadingLevel,
  WidthType,
  ShadingType,
  BorderStyle as DocxBorderStyle,
  Packer,
} from "docx";
import {
  InternalDocument,
  DocElement,
  ParagraphElement,
  HeadingElement,
  ImageElement,
  LineElement,
  PageBreakElement,
  ShapeElement,
  TableElement,
  ContainerElement,
  TextRun as ModelTextRun,
  Color,
  BorderStyle,
  Spacing,
} from "../model/index.js";
import {
  colorToHex,
  decodeDataUrl,
  detectImageType,
  DocxImageType,
  fitImageSize,
  mmToDxa,
  ptToDxa,
  ptToHalfPt,
  pxToPt,
  toDocxBorder,
  spacingToCellMargin,
} from "./utils.js";
import * as fs from "fs";

interface TextChrome {
  fill?: Color;
  border?: BorderStyle;
  padding?: Partial<Spacing>;
}

class TableFillAttributes extends XmlAttributeComponent<{
  val: string;
  color: string;
  fill: string;
}> {
  protected readonly xmlKeys = {
    val: "w:val",
    color: "w:color",
    fill: "w:fill",
  };
}

/** docx Table() does not pass shading through to w:tblPr, so the fill is attached directly. */
class TableFill extends XmlComponent {
  constructor(fill: string) {
    super("w:shd");
    this.root.push(new TableFillAttributes({ val: "clear", color: "auto", fill }));
  }
}

export class DocxRenderer {
  private contentWidthPx = 600;

  /**
   * Main entry: Render Internal Document to Buffer (Node.js)
   */
  public async renderToBuffer(doc: InternalDocument): Promise<Buffer> {
    const document = this.createDocument(doc);
    return await Packer.toBuffer(document);
  }

  /**
   * Browser-friendly entry: Render Internal Document to Blob
   */
  public async renderToBlob(doc: InternalDocument): Promise<Blob> {
    const document = this.createDocument(doc);
    return await Packer.toBlob(document);
  }

  /**
   * Render and save to local file
   */
  public async renderToFile(doc: InternalDocument, outputPath: string): Promise<void> {
    const buffer = await this.renderToBuffer(doc);
    await fs.promises.writeFile(outputPath, buffer);
  }

  /**
   * Constructs the docx Document object
   */
  public createDocument(doc: InternalDocument): Document {
    const { pageConfig, metadata } = doc;
    this.updateContentWidth(pageConfig);

    // Margins (default: 25.4mm = 1 inch)
    const margins = {
      top: mmToDxa(pageConfig?.marginsMm?.top ?? 25.4),
      right: mmToDxa(pageConfig?.marginsMm?.right ?? 25.4),
      bottom: mmToDxa(pageConfig?.marginsMm?.bottom ?? 25.4),
      left: mmToDxa(pageConfig?.marginsMm?.left ?? 25.4),
    };

    // Page Dimensions (default A4: 210 x 297mm)
    const widthDxa = mmToDxa(pageConfig?.widthMm ?? 210);
    const heightDxa = mmToDxa(pageConfig?.heightMm ?? 297);

    // Header & Footer
    let docxHeader: Header | undefined;
    if (doc.header && doc.header.elements.length > 0) {
      const headerChildren = this.renderElements(doc.header.elements);
      docxHeader = new Header({
        children: headerChildren,
      });
    }

    let docxFooter: Footer | undefined;
    if (doc.footer && doc.footer.elements.length > 0) {
      const footerChildren = this.renderElements(doc.footer.elements);
      docxFooter = new Footer({
        children: footerChildren,
      });
    }

    // Sections
    const sections = (doc.sections.length > 0 ? doc.sections : [{ elements: [] }]).map(
      (sec, idx) => {
        const children = this.renderElements(sec.elements);

        return {
          properties: {
            page: {
              size: {
                width: pageConfig.orientation === "landscape" ? heightDxa : widthDxa,
                height: pageConfig.orientation === "landscape" ? widthDxa : heightDxa,
                orientation:
                  pageConfig.orientation === "landscape"
                    ? ("landscape" as const)
                    : ("portrait" as const),
              },
              margin: margins,
            },
          },
          headers: docxHeader ? { default: docxHeader } : undefined,
          footers: docxFooter ? { default: docxFooter } : undefined,
          children: children.length > 0 ? children : [new Paragraph({ text: "" })],
        };
      }
    );

    return new Document({
      title: metadata.title,
      creator: metadata.author || "Figma2Word",
      description: `Converted from Figma by Figma2Word at ${metadata.convertedAt}`,
      sections,
    });
  }

  /**
   * Render an array of DocElements to Paragraphs and Tables
   */
  public renderElements(elements: DocElement[]): (Paragraph | Table)[] {
    const result: (Paragraph | Table)[] = [];
    for (const elem of elements) {
      const rendered = this.renderElement(elem);
      if (Array.isArray(rendered)) {
        result.push(...rendered);
      } else if (rendered) {
        result.push(rendered);
      }
    }
    return result;
  }

  /**
   * Render a single DocElement
   */
  public renderElement(element: DocElement): Paragraph | Table | (Paragraph | Table)[] | null {
    switch (element.type) {
      case "heading":
        return this.renderHeading(element);
      case "paragraph":
        return this.renderParagraph(element);
      case "image":
        return this.renderImage(element);
      case "line":
        return this.renderLine(element);
      case "table":
        return this.renderTable(element);
      case "shape":
        return this.renderShape(element);
      case "container":
        return this.renderContainer(element);
      case "page_break":
        return this.renderPageBreak(element);
      default:
        return null;
    }
  }

  private renderPageBreak(_elem: PageBreakElement): Paragraph {
    return new Paragraph({
      children: [new PageBreak()],
    });
  }

  private renderHeading(elem: HeadingElement, chrome?: TextChrome): Paragraph {
    const levelMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
      4: HeadingLevel.HEADING_4,
      5: HeadingLevel.HEADING_5,
      6: HeadingLevel.HEADING_6,
    };

    const alignmentMap: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
      left: AlignmentType.LEFT,
      center: AlignmentType.CENTER,
      right: AlignmentType.RIGHT,
      justify: AlignmentType.JUSTIFIED,
    };

    const runs = elem.runs.map((r) => this.renderTextRun(r));
    const pad = spacingToCellMargin(chrome?.padding);

    return new Paragraph({
      heading: levelMap[elem.level] || HeadingLevel.HEADING_1,
      alignment: alignmentMap[elem.alignment] || AlignmentType.LEFT,
      spacing: {
        before: (elem.spacing?.top !== undefined ? ptToDxa(elem.spacing.top) : ptToDxa(6)) + (pad?.top ?? 0),
        after: (elem.spacing?.bottom !== undefined ? ptToDxa(elem.spacing.bottom) : ptToDxa(3)) + (pad?.bottom ?? 0),
      },
      indent: pad ? { left: pad.left, right: pad.right } : undefined,
      border: this.chromeBorder(chrome?.border),
      shading: this.chromeShading(chrome?.fill),
      children: runs,
    });
  }

  private renderParagraph(elem: ParagraphElement, chrome?: TextChrome): Paragraph {
    const alignmentMap: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
      left: AlignmentType.LEFT,
      center: AlignmentType.CENTER,
      right: AlignmentType.RIGHT,
      justify: AlignmentType.JUSTIFIED,
    };

    const runs = elem.runs.map((r) => this.renderTextRun(r));
    const pad = spacingToCellMargin(chrome?.padding);

    return new Paragraph({
      alignment: alignmentMap[elem.alignment] || AlignmentType.LEFT,
      bullet: elem.isBullet ? { level: 0 } : undefined,
      spacing: {
        before: (elem.spacing?.top !== undefined ? ptToDxa(elem.spacing.top) : 0) + (pad?.top ?? 0),
        after: (elem.spacing?.bottom !== undefined ? ptToDxa(elem.spacing.bottom) : ptToDxa(3)) + (pad?.bottom ?? 0),
        line: ptToDxa(14),
      },
      indent: pad ? { left: pad.left, right: pad.right } : undefined,
      border: this.chromeBorder(chrome?.border),
      shading: this.chromeShading(chrome?.fill),
      children: runs,
    });
  }


  private renderTextRun(modelRun: ModelTextRun): TextRun {
    const style = modelRun.style;
    const isBold =
      style?.fontWeight === "bold" ||
      (typeof style?.fontWeight === "number" && style.fontWeight >= 600) ||
      (typeof style?.fontWeight === "string" && parseInt(style.fontWeight, 10) >= 600);

    return new TextRun({
      text: modelRun.text,
      font: style?.fontFamily || "Calibri",
      size: style?.fontSize ? ptToHalfPt(style.fontSize) : 22, // 11pt = 22 half-pts
      bold: isBold,
      italics: style?.italic,
      underline: style?.underline ? {} : undefined,
      strike: style?.strike,
      color: colorToHex(style?.color),
    });
  }

  private renderImage(elem: ImageElement): Paragraph {
    try {
      const prepared = this.prepareImage(elem.source);
      if (!prepared) {
        return new Paragraph({
          text: `[Image: ${elem.altText || "image"}]`,
        });
      }

      const alignmentMap: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
        left: AlignmentType.LEFT,
        center: AlignmentType.CENTER,
        right: AlignmentType.RIGHT,
        justify: AlignmentType.LEFT,
      };

      const fitted = fitImageSize(elem.width, elem.height, this.contentWidthPx);
      const imageData =
        typeof Buffer !== "undefined" ? Buffer.from(prepared.bytes) : prepared.bytes;

      const imageRun = new ImageRun({
        type: prepared.type,
        data: imageData,
        transformation: fitted,
      });

      return new Paragraph({
        alignment: alignmentMap[elem.alignment] || AlignmentType.LEFT,
        spacing: {
          before: elem.spacing?.top ? ptToDxa(elem.spacing.top) : ptToDxa(4),
          after: elem.spacing?.bottom ? ptToDxa(elem.spacing.bottom) : ptToDxa(4),
        },
        children: [imageRun],
      });
    } catch {
      return new Paragraph({
        text: `[Image: ${elem.altText || "image"}]`,
      });
    }
  }

  private renderLine(elem: LineElement): Paragraph {
    const hex = colorToHex(elem.color) || "CCCCCC";
    const borderSize = Math.max(1, Math.round(pxToPt(elem.thickness) * 8));

    return new Paragraph({
      border: {
        bottom: {
          color: hex,
          space: 1,
          style: DocxBorderStyle.SINGLE,
          size: borderSize,
        },
      },
      spacing: {
        before: elem.spacing?.top ? ptToDxa(elem.spacing.top) : ptToDxa(8),
        after: elem.spacing?.bottom ? ptToDxa(elem.spacing.bottom) : ptToDxa(8),
      },
      text: "",
    });
  }

  private renderTable(elem: TableElement): Table {
    const rows = elem.rows.map((r) => {
      const cells = r.cells.map((c) => {
        const cellChildren = this.renderElements(c.children);

        const borderDef = c.border ? toDocxBorder(c.border) : toDocxBorder(elem.borders);
        const borders = {
          top: borderDef,
          bottom: borderDef,
          left: borderDef,
          right: borderDef,
        };

        const hexBg = colorToHex(c.background);

        return new TableCell({
          columnSpan: c.colSpan,
          rowSpan: c.rowSpan,
          borders,
          margins: spacingToCellMargin(c.padding),
          shading: hexBg
            ? {
                fill: hexBg,
                type: ShadingType.CLEAR,
                color: "auto",
              }
            : undefined,
          children: cellChildren.length > 0 ? cellChildren : [new Paragraph({ text: "" })],
        });
      });

      return new TableRow({
        tableHeader: r.isHeader,
        children: cells,
      });
    });

    const borderDef = toDocxBorder(elem.borders);

    return new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      borders: {
        top: borderDef,
        bottom: borderDef,
        left: borderDef,
        right: borderDef,
        insideHorizontal: borderDef,
        insideVertical: borderDef,
      },
      rows,
    });
  }

  private renderShape(elem: ShapeElement): Paragraph | Table | null {
    // If shape has no content (empty decorative shape, spacer, dot, bar), do NOT create a 100% Word Table!
    if (!elem.content || elem.content.length === 0) {
      return null;
    }

    const textLeaf = elem.content.length === 1 ? this.singleTextLeaf(elem.content[0]) : null;
    if (textLeaf) {
      const chrome = { fill: elem.fill, border: elem.stroke };
      return textLeaf.type === "heading"
        ? this.renderHeading(textLeaf, chrome)
        : this.renderParagraph(textLeaf, chrome);
    }

    // Shapes like rectangles, cards, or styled boxes with multiple children stay 1x1 Word Tables
    // with background shading and borders, preserving editability and exact box layout.
    const hexBg = colorToHex(elem.fill);
    const borderDef = toDocxBorder(elem.stroke);
    const content = this.renderElements(elem.content);

    return new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      borders: {
        top: borderDef,
        bottom: borderDef,
        left: borderDef,
        right: borderDef,
        insideHorizontal: { style: DocxBorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: DocxBorderStyle.NONE, size: 0, color: "auto" },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: {
                top: borderDef,
                bottom: borderDef,
                left: borderDef,
                right: borderDef,
              },
              shading: hexBg
                ? {
                    fill: hexBg,
                    type: ShadingType.CLEAR,
                    color: "auto",
                  }
                : undefined,
              margins: {
                top: ptToDxa(8),
                bottom: ptToDxa(8),
                left: ptToDxa(12),
                right: ptToDxa(12),
              },
              children: content.length > 0 ? content : [new Paragraph({ text: "" })],
            }),
          ],
        }),
      ],
    });
  }

  private renderContainer(elem: ContainerElement): Paragraph | (Paragraph | Table)[] | Table {
    const body = this.renderContainerBody(elem);
    if (!elem.backgroundImage) return body;

    const image = this.renderImage(elem.backgroundImage);
    if (Array.isArray(body)) {
      return body.length > 0 ? [image, ...body] : [image];
    }
    return [image, body];
  }

  private renderContainerBody(elem: ContainerElement): Paragraph | (Paragraph | Table)[] | Table {
    // If container has horizontal layout, render as a 1-row multi-column Table
    if (elem.layoutDirection === "horizontal" && elem.children.length > 1) {
      const defaultColWidth = Math.floor(100 / elem.children.length);
      const cells = elem.children.map((child, idx) => {
        const colWidthPercent = elem.columnWidths?.[idx] ?? defaultColWidth;
        const rendered = this.renderElement(child);
        const children: (Paragraph | Table)[] = Array.isArray(rendered)
          ? rendered
          : (rendered ? [rendered] : [new Paragraph({ text: "" })]);

        const borderDef = toDocxBorder(elem.border);
        const hexBg = colorToHex(elem.background);
        const pad = spacingToCellMargin(elem.padding) ?? { top: 0, bottom: 0, left: 0, right: 0 };
        const halfGap = elem.gap > 0 ? ptToDxa(pxToPt(elem.gap) / 2) : 0;

        return new TableCell({
          width: {
            size: colWidthPercent,
            type: WidthType.PERCENTAGE,
          },
          borders: {
            top: borderDef,
            bottom: borderDef,
            left: borderDef,
            right: borderDef,
          },
          margins: {
            top: pad.top,
            bottom: pad.bottom,
            left: pad.left + (idx > 0 ? halfGap : 0),
            right: pad.right + (idx < elem.children.length - 1 ? halfGap : 0),
          },
          shading: hexBg
            ? {
                fill: hexBg,
                type: ShadingType.CLEAR,
                color: "auto",
              }
            : undefined,
          children: children.length > 0 ? children : [new Paragraph({ text: "" })],
        });
      });

      return new Table({
        width: {
          size: 100,
          type: WidthType.PERCENTAGE,
        },
        borders: {
          top: { style: DocxBorderStyle.NONE, size: 0, color: "auto" },
          bottom: { style: DocxBorderStyle.NONE, size: 0, color: "auto" },
          left: { style: DocxBorderStyle.NONE, size: 0, color: "auto" },
          right: { style: DocxBorderStyle.NONE, size: 0, color: "auto" },
          insideHorizontal: { style: DocxBorderStyle.NONE, size: 0, color: "auto" },
          insideVertical: { style: DocxBorderStyle.NONE, size: 0, color: "auto" },
        },
        rows: [
          new TableRow({
            children: cells,
          }),
        ],
      });
    }

    // A single text chip/button keeps its fill and border on the paragraph.
    // A surrounding table cell already provides the position, so another 1x1 table is not required.
    if ((elem.background || elem.border) && !elem.backgroundImage && elem.children.length === 1) {
      const textLeaf = this.singleTextLeaf(elem.children[0]);
      if (textLeaf) {
        const chrome = { fill: elem.background, border: elem.border, padding: elem.padding };
        return textLeaf.type === "heading"
          ? this.renderHeading(textLeaf, chrome)
          : this.renderParagraph(textLeaf, chrome);
      }

      const safeWrapper = this.renderSafeIdenticalWrapper(elem);
      if (safeWrapper) return safeWrapper;

      const backgroundRow = this.renderConditionalBackgroundWrapper(elem);
      if (backgroundRow) return backgroundRow;
    }

    // If container has background or border (Card style), wrap in 1x1 Table
    if (elem.background || elem.border) {
      const hexBg = colorToHex(elem.background);
      const borderDef = toDocxBorder(elem.border);
      const children = this.renderSequence(elem.children, elem.gap);

      return new Table({
        width: {
          size: 100,
          type: WidthType.PERCENTAGE,
        },
        borders: {
          top: borderDef,
          bottom: borderDef,
          left: borderDef,
          right: borderDef,
          insideHorizontal: { style: DocxBorderStyle.NONE, size: 0, color: "auto" },
          insideVertical: { style: DocxBorderStyle.NONE, size: 0, color: "auto" },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: {
                  top: borderDef,
                  bottom: borderDef,
                  left: borderDef,
                  right: borderDef,
                },
                margins: spacingToCellMargin(elem.padding),
                shading: hexBg
                  ? {
                      fill: hexBg,
                      type: ShadingType.CLEAR,
                      color: "auto",
                    }
                  : undefined,
                children: children.length > 0 ? children : [new Paragraph({ text: "" })],
              }),
            ],
          }),
        ],
      });
    }

    // Default vertical flow layout: render children sequentially
    return this.renderSequence(elem.children, elem.gap);
  }

  /**
   * STEP 2-B-5: drop a parent 1x1 only for the two measured SAFE shapes.
   * Any uncertain structure keeps the existing table.
   */
  private renderSafeIdenticalWrapper(
    parent: ContainerElement
  ): Paragraph | Table | (Paragraph | Table)[] | null {
    if (parent.children.length !== 1 || parent.backgroundImage) return null;
    if (!this.isZeroPadding(parent.padding)) return null;

    const child = parent.children[0];
    if (child.type !== "container" || child.backgroundImage) return null;
    if (child.layoutDirection === "horizontal" && child.children.length > 1) return null;
    if (this.containsImage(child)) return null;

    const parentFill = colorToHex(parent.background);
    const childFill = colorToHex(child.background);
    const parentBorder = this.hasVisibleBorder(parent.border);
    const childBorder = this.hasVisibleBorder(child.border);

    // SAFE-A: white parent with no border and no padding around a white child that already has its own border.
    if (
      parentFill === "FFFFFF" &&
      !parentBorder &&
      childFill === "FFFFFF" &&
      childBorder
    ) {
      return this.renderElement(child);
    }

    // SAFE-B: border-only parent whose single empty child is already filled with the same color.
    const parentBorderHex = colorToHex(parent.border?.color);
    if (
      !parentFill &&
      parentBorder &&
      parentBorderHex === "A1B0BF" &&
      childFill === "A1B0BF" &&
      !childBorder &&
      child.children.length === 0 &&
      this.isZeroPadding(child.padding)
    ) {
      return this.renderElement({ ...child, border: parent.border });
    }

    return null;
  }

  /**
   * STEP 2-B-6: drop a background-only 1x1 around a text-only 1xN row.
   * The parent fill moves to w:tblPr/w:shd so the row stays one painted area.
   * Padding, borders, images, and nested tables stay on the existing path.
   */
  private renderConditionalBackgroundWrapper(parent: ContainerElement): Table | null {
    if (parent.children.length !== 1 || parent.backgroundImage) return null;
    if (!this.isZeroPadding(parent.padding) || this.hasVisibleBorder(parent.border)) return null;
    const parentFill = colorToHex(parent.background);
    if (!parentFill) return null;

    const child = parent.children[0];
    if (child.type !== "container" || child.backgroundImage) return null;
    if (child.layoutDirection !== "horizontal" || child.children.length < 2) return null;
    if (colorToHex(child.background) || this.hasVisibleBorder(child.border)) return null;
    if (this.containsImage(child)) return null;
    if (!child.children.every((column) => this.isTextColumn(column))) return null;

    const rendered = this.renderElement(child);
    if (!(rendered instanceof Table)) return null;
    return this.applyTableFill(rendered, parentFill);
  }

  /** A column that renders as paragraphs, including one filled text chip. Nested tables and shapes stay out. */
  private isTextColumn(element: DocElement): boolean {
    if (element.type === "paragraph" || element.type === "heading") return true;
    if (element.type !== "container" || element.backgroundImage || this.containsImage(element)) return false;
    if (element.layoutDirection === "horizontal" && element.children.length > 1) return false;
    if (element.background || this.hasVisibleBorder(element.border)) {
      return element.children.length === 1 && this.singleTextLeaf(element.children[0]) !== null;
    }
    return element.children.every((child) => this.isTextColumn(child));
  }

  private applyTableFill(table: Table, fill: string): Table | null {
    const root = (table as unknown as { root?: Array<{ root?: unknown[] }> }).root;
    const tableProperties = root?.[0];
    if (!tableProperties?.root) return null;
    tableProperties.root.push(new TableFill(fill));
    return table;
  }

  private isZeroPadding(padding?: Partial<Spacing>): boolean {
    if (!padding) return true;
    return (
      (padding.top ?? 0) === 0 &&
      (padding.right ?? 0) === 0 &&
      (padding.bottom ?? 0) === 0 &&
      (padding.left ?? 0) === 0
    );
  }

  private hasVisibleBorder(border?: BorderStyle): boolean {
    return !!border && border.style !== "none" && border.width > 0;
  }

  private containsImage(element: DocElement): boolean {
    if (element.type === "image") return true;
    if (element.type === "container") {
      if (element.backgroundImage) return true;
      return element.children.some((child) => this.containsImage(child));
    }
    if (element.type === "shape") {
      return (element.content ?? []).some((child) => this.containsImage(child));
    }
    if (element.type === "table") {
      return element.rows.some((row) =>
        row.cells.some((cell) => cell.children.some((child) => this.containsImage(child)))
      );
    }
    return false;
  }

  /**
   * Follow wrappers that do not add a fill, border, image, padding, or gap.
   * Stop when the remaining element is a single paragraph or heading.
   */
  private singleTextLeaf(element: DocElement): ParagraphElement | HeadingElement | null {
    if (element.type === "paragraph" || element.type === "heading") return element;
    if (element.type !== "container" || element.children.length !== 1) return null;
    if (element.background || element.border || element.backgroundImage) return null;
    if (element.gap > 0) return null;
    const padding = element.padding;
    if (
      padding &&
      ((padding.top ?? 0) > 0 ||
        (padding.right ?? 0) > 0 ||
        (padding.bottom ?? 0) > 0 ||
        (padding.left ?? 0) > 0)
    ) {
      return null;
    }
    return this.singleTextLeaf(element.children[0]);
  }

  private chromeShading(fill?: Color) {
    const hex = colorToHex(fill);
    if (!hex) return undefined;
    return {
      type: ShadingType.CLEAR,
      fill: hex,
      color: "auto",
    };
  }

  private chromeBorder(border?: BorderStyle) {
    if (!border) return undefined;
    const borderDef = { ...toDocxBorder(border), space: 1 };
    return {
      top: borderDef,
      bottom: borderDef,
      left: borderDef,
      right: borderDef,
    };
  }

  private renderSequence(elements: DocElement[], gapPt = 0): (Paragraph | Table)[] {
    const result: (Paragraph | Table)[] = [];
    for (const elem of elements) {
      const rendered = this.renderElement(elem);
      const pieces = Array.isArray(rendered) ? rendered : rendered ? [rendered] : [];
      if (pieces.length === 0) continue;
      if (result.length > 0 && gapPt > 0) {
        result.push(
          new Paragraph({
            spacing: { before: ptToDxa(pxToPt(gapPt)), after: 0 },
          })
        );
      }
      result.push(...pieces);
    }
    return result;
  }

  private prepareImage(source: string): { type: DocxImageType; bytes: Uint8Array } | null {
    let bytes: Uint8Array | null = null;
    let mime: string | undefined;

    if (source.startsWith("data:")) {
      const decoded = decodeDataUrl(source);
      if (!decoded) return null;
      bytes = decoded.bytes;
      mime = decoded.mime;
    } else if (this.canReadLocalFile(source)) {
      bytes = new Uint8Array(fs.readFileSync(source));
    } else {
      return null;
    }

    const type = detectImageType(bytes, mime);
    if (!type) return null;
    return { type, bytes };
  }

  private canReadLocalFile(source: string): boolean {
    return typeof process !== "undefined" && !!process.versions?.node && fs.existsSync(source);
  }

  private updateContentWidth(pageConfig?: InternalDocument["pageConfig"]) {
    const widthMm =
      pageConfig?.orientation === "landscape"
        ? (pageConfig?.heightMm ?? 297)
        : (pageConfig?.widthMm ?? 210);
    const margins = (pageConfig?.marginsMm?.left ?? 25.4) + (pageConfig?.marginsMm?.right ?? 25.4);
    const contentMm = Math.max(40, widthMm - margins);
    this.contentWidthPx = Math.max(120, Math.round((contentMm / 25.4) * 96));
  }
}
