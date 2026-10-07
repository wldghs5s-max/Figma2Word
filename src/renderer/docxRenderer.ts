import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  ImageRun,
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
  ShapeElement,
  TableElement,
  ContainerElement,
  TextRun as ModelTextRun,
} from "../model/index.js";
import {
  colorToHex,
  mmToDxa,
  ptToDxa,
  ptToHalfPt,
  toDocxBorder,
  spacingToCellMargin,
} from "./utils.js";
import * as fs from "fs";

export class DocxRenderer {
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
  public renderElement(element: DocElement): Paragraph | Table | (Paragraph | Table)[] {
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
      default:
        return new Paragraph({ text: "" });
    }
  }

  private renderHeading(elem: HeadingElement): Paragraph {
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

    return new Paragraph({
      heading: levelMap[elem.level] || HeadingLevel.HEADING_1,
      alignment: alignmentMap[elem.alignment] || AlignmentType.LEFT,
      spacing: {
        before: elem.spacing?.top !== undefined ? ptToDxa(elem.spacing.top) : ptToDxa(6),
        after: elem.spacing?.bottom !== undefined ? ptToDxa(elem.spacing.bottom) : ptToDxa(3),
      },
      children: runs,
    });
  }

  private renderParagraph(elem: ParagraphElement): Paragraph {
    const alignmentMap: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
      left: AlignmentType.LEFT,
      center: AlignmentType.CENTER,
      right: AlignmentType.RIGHT,
      justify: AlignmentType.JUSTIFIED,
    };

    const runs = elem.runs.map((r) => this.renderTextRun(r));

    return new Paragraph({
      alignment: alignmentMap[elem.alignment] || AlignmentType.LEFT,
      bullet: elem.isBullet ? { level: 0 } : undefined,
      spacing: {
        before: elem.spacing?.top !== undefined ? ptToDxa(elem.spacing.top) : 0,
        after: elem.spacing?.bottom !== undefined ? ptToDxa(elem.spacing.bottom) : ptToDxa(3),
        line: ptToDxa(14),
      },
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
      let imageBuffer: Buffer;
      if (elem.source.startsWith("data:")) {
        const base64Data = elem.source.replace(/^data:image\/\w+;base64,/, "");
        imageBuffer = Buffer.from(base64Data, "base64");
      } else if (fs.existsSync(elem.source)) {
        imageBuffer = fs.readFileSync(elem.source);
      } else {
        // Fallback: 1x1 transparent PNG buffer
        imageBuffer = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          "base64"
        );
      }

      const alignmentMap: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
        left: AlignmentType.LEFT,
        center: AlignmentType.CENTER,
        right: AlignmentType.RIGHT,
        justify: AlignmentType.LEFT,
      };

      const imageRun = new ImageRun({
        type: "png",
        data: imageBuffer,
        transformation: {
          width: Math.round(elem.width),
          height: Math.round(elem.height),
        },
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
    const borderSize = Math.max(1, Math.round(elem.thickness * 8));

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

  private renderShape(elem: ShapeElement): Table | Paragraph {
    // Shapes like rectangles, cards, or styled boxes are rendered as 1x1 Word Tables
    // with background shading and borders, preserving editability and exact box layout.
    const hexBg = colorToHex(elem.fill);
    const borderDef = toDocxBorder(elem.stroke);
    const content = elem.content ? this.renderElements(elem.content) : [new Paragraph({ text: "" })];

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

  private renderContainer(elem: ContainerElement): (Paragraph | Table)[] | Table {
    // If container has horizontal layout, render as a 1-row multi-column Table
    if (elem.layoutDirection === "horizontal" && elem.children.length > 1) {
      const defaultColWidth = Math.floor(100 / elem.children.length);
      const cells = elem.children.map((child, idx) => {
        const colWidthPercent = elem.columnWidths?.[idx] ?? defaultColWidth;
        const rendered = this.renderElement(child);
        const children = Array.isArray(rendered) ? rendered : [rendered];

        const borderDef = toDocxBorder(elem.border);
        const hexBg = colorToHex(elem.background);

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
          margins: spacingToCellMargin(elem.padding),
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

    // If container has background or border (Card style), wrap in 1x1 Table
    if (elem.background || elem.border) {
      const hexBg = colorToHex(elem.background);
      const borderDef = toDocxBorder(elem.border);
      const children = this.renderElements(elem.children);

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
    return this.renderElements(elem.children);
  }
}
