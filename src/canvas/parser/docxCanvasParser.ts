import JSZip from "jszip";
import * as fs from "fs";
import {
  CanvasDocument,
  CanvasPage,
  CanvasElement,
  CanvasTextRun,
  CanvasResource,
  CanvasStyle,
} from "../types.js";

function parseVmlStyle(styleStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!styleStr) return result;
  for (const part of styleStr.split(";")) {
    const idx = part.indexOf(":");
    if (idx !== -1) {
      const k = part.substring(0, idx).trim();
      const v = part.substring(idx + 1).trim();
      result[k] = v;
    }
  }
  return result;
}

function parsePt(ptStr?: string): number {
  if (!ptStr) return 0;
  const num = parseFloat(ptStr.replace("pt", "").trim());
  return isNaN(num) ? 0 : num;
}

export class DocxCanvasParser {
  public async parse(input: Buffer | string): Promise<CanvasDocument> {
    const buffer =
      typeof input === "string" ? await fs.promises.readFile(input) : input;

    const zip = await JSZip.loadAsync(buffer);

    const docXmlFile = zip.file("word/document.xml");
    if (!docXmlFile) {
      throw new Error("Invalid DOCX package: word/document.xml missing.");
    }

    const docXml = await docXmlFile.async("string");

    // Load relationships for images
    const relsMap = new Map<string, string>(); // rId -> targetPath
    const relsFile = zip.file("word/_rels/document.xml.rels");
    if (relsFile) {
      const relsXml = await relsFile.async("string");
      const relMatches = relsXml.matchAll(
        /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g
      );
      for (const match of relMatches) {
        relsMap.set(match[1], match[2]);
      }
    }

    // Load media resources
    const resources: Record<string, CanvasResource> = {};
    for (const [rId, target] of relsMap.entries()) {
      if (target.startsWith("media/")) {
        const zipPath = `word/${target}`;
        const imgFile = zip.file(zipPath);
        if (imgFile) {
          const imgData = await imgFile.async("nodebuffer");
          const resId = target.replace("media/", "");
          const mimeType = resId.endsWith(".jpg") ? "image/jpeg" : "image/png";
          resources[resId] = {
            id: resId,
            name: resId,
            mimeType,
            data: imgData,
          };
        }
      }
    }

    // Split paragraphs in w:body using depth tracking to avoid inner textbox paragraphs
    const pages: CanvasPage[] = [];
    const bodyMatch = docXml.match(/<w:body[\s>]([\s\S]*?)<\/w:body>/);
    const bodyContent = bodyMatch ? bodyMatch[1] : docXml;

    const paragraphs: string[] = [];
    let pDepth = 0;
    let pStartIndex = -1;
    const tagRegex = /<\/?w:p(?:\s[^>]*?)?(\/?)>/g;
    let tMatch: RegExpExecArray | null;

    while ((tMatch = tagRegex.exec(bodyContent)) !== null) {
      const fullTag = tMatch[0];
      const isSelfClosing = fullTag.endsWith("/>") || tMatch[1] === "/";
      const isClosing = fullTag.startsWith("</");

      if (!isClosing && !isSelfClosing) {
        if (pDepth === 0) {
          pStartIndex = tMatch.index;
        }
        pDepth++;
      } else if (isClosing) {
        pDepth--;
        if (pDepth === 0 && pStartIndex !== -1) {
          paragraphs.push(
            bodyContent.substring(pStartIndex, tMatch.index + fullTag.length)
          );
          pStartIndex = -1;
        }
      } else if (isSelfClosing && pDepth === 0) {
        paragraphs.push(tMatch[0]);
      }
    }

    let pageNumber = 1;
    let currentElements: CanvasElement[] = [];

    const flushPage = () => {
      if (currentElements.length > 0 || pages.length === 0) {
        pages.push({
          pageNumber,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [...currentElements].sort((a, b) => a.zIndex - b.zIndex),
        });
        currentElements = [];
        pageNumber++;
      }
    };

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const pStr = paragraphs[pIdx];

      // Check if this paragraph starts a new page
      const hasPageBreak =
        pStr.includes("<w:pageBreakBefore/>") ||
        (pStr.includes("<w:pageBreakBefore") &&
          !pStr.includes('<w:pageBreakBefore w:val="0"'));
      if (hasPageBreak && pIdx > 0) {
        flushPage();
      }

      // Extract all pict shapes inside this paragraph
      const shapeRegex = /<v:(rect|roundrect|shape|line)[\s>][\s\S]*?<\/v:\1>/g;
      const shapes = Array.from(pStr.matchAll(shapeRegex)).map((m) => m[0]);

      for (const sStr of shapes) {
        const elem = this.parseVmlShape(sStr, relsMap, resources);
        if (elem) {
          currentElements.push(elem);
        }
      }
    }

    // Flush last page
    flushPage();

    return {
      title: "Extracted Canvas Document",
      pageSize: {
        name: "A4",
        widthPt: 595.28,
        heightPt: 841.89,
        unit: "pt",
      },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages,
      resources,
      diagnostics: { notices: [], warnings: [] },
    };
  }

  private parseVmlShape(
    shapeXml: string,
    relsMap: Map<string, string>,
    resources: Record<string, CanvasResource>
  ): CanvasElement | null {
    const tagMatch = shapeXml.match(/<v:(rect|roundrect|shape|line)/);
    if (!tagMatch) return null;
    const tag = tagMatch[1];

    const styleMatch = shapeXml.match(/style="([^"]*)"/);
    const styleStr = styleMatch ? styleMatch[1] : "";
    const styleMap = parseVmlStyle(styleStr);

    const x = parsePt(styleMap["margin-left"]);
    const y = parsePt(styleMap["margin-top"]);
    const width = parsePt(styleMap["width"]);
    const height = parsePt(styleMap["height"]);
    const zIndex = parseInt(styleMap["z-index"] || "1", 10);

    const filled = !shapeXml.includes('filled="f"');
    const stroked = !shapeXml.includes('stroked="f"');

    const fillcolorMatch = shapeXml.match(/fillcolor="([^"]*)"/);
    const strokecolorMatch = shapeXml.match(/strokecolor="([^"]*)"/);
    const strokeweightMatch = shapeXml.match(/strokeweight="([^"]*)"/);

    const style: CanvasStyle = {
      fillColor: filled && fillcolorMatch ? fillcolorMatch[1] : undefined,
      strokeColor: stroked && strokecolorMatch ? strokecolorMatch[1] : undefined,
      strokeWidth:
        stroked && strokeweightMatch ? parsePt(strokeweightMatch[1]) : undefined,
    };

    // Check imagedata
    const imgMatch = shapeXml.match(/<v:imagedata[^>]*r:id="([^"]+)"/);
    if (imgMatch) {
      const rId = imgMatch[1];
      const target = relsMap.get(rId);
      const resId = target ? target.replace("media/", "") : rId;
      return {
        id: `img_${resId}`,
        type: "image",
        bounds: { x, y, width, height },
        zIndex,
        style,
        imageRef: resId,
      };
    }

    // Check textbox
    const textRuns: CanvasTextRun[] = [];
    let align: "left" | "center" | "right" | "justify" = "left";

    const jcMatch = shapeXml.match(/<w:jc[^>]*w:val="([^"]+)"/);
    if (jcMatch) {
      const jc = jcMatch[1];
      if (jc === "center" || jc === "right" || jc === "justify") {
        align = jc;
      }
    }

    const rRegex = /<w:r[\s>][\s\S]*?<\/w:r>/g;
    const runs = Array.from(shapeXml.matchAll(rRegex)).map((m) => m[0]);

    for (const rXml of runs) {
      const tMatch = rXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
      if (tMatch) {
        const text = tMatch[1];
        const fontMatch = rXml.match(/<w:rFonts[^>]*w:ascii="([^"]+)"/);
        const szMatch = rXml.match(/<w:sz[^>]*w:val="([^"]+)"/);
        const colorMatch = rXml.match(/<w:color[^>]*w:val="([^"]+)"/);

        const bold = rXml.includes("<w:b/>") || rXml.includes("<w:b ");
        const italic = rXml.includes("<w:i/>") || rXml.includes("<w:i ");
        const underline = rXml.includes("<w:u ");

        textRuns.push({
          text,
          fontFamily: fontMatch ? fontMatch[1] : "Inter",
          fontSizePt: szMatch ? parseInt(szMatch[1], 10) / 2 : 10,
          fontWeight: bold ? 700 : 400,
          italic,
          underline,
          color: colorMatch ? `#${colorMatch[1]}` : "#000000",
        });
      }
    }

    const hasText = textRuns.length > 0;
    const type = hasText ? "text" : "card";

    return {
      id: `elem_${x}_${y}`,
      type,
      bounds: { x, y, width, height },
      zIndex,
      style,
      textRuns: hasText ? textRuns : undefined,
      paragraphAlign: align,
    };
  }
}
