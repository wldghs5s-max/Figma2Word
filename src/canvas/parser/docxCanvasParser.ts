import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
import {
  CanvasDocument,
  CanvasPage,
  CanvasElement,
  CanvasTextRun,
  CanvasResource,
  CanvasStyle,
  CanvasPadding,
} from "../types.js";

/**
 * Parses XML attributes of an opening or self-closing XML tag into a key-value record,
 * regardless of attribute order or whitespace.
 */
export function parseXmlAttributes(tagStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!tagStr) return attrs;
  const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(["'])([\s\S]*?)\2/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tagStr)) !== null) {
    attrs[match[1]] = match[3];
  }
  return attrs;
}

function parseVmlStyle(styleStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!styleStr) return result;
  for (const part of styleStr.split(";")) {
    const idx = part.indexOf(":");
    if (idx !== -1) {
      const k = part.substring(0, idx).trim().toLowerCase();
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

function parseCoordPair(coordStr?: string): [number, number] {
  if (!coordStr) return [0, 0];
  const parts = coordStr.split(",");
  const x = parsePt(parts[0]);
  const y = parsePt(parts[1]);
  return [x, y];
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
    const warnings: string[] = [];
    const notices: string[] = [];

    // 1. Load relationships for images with attribute-order agnostic XML parsing
    const relsMap = new Map<string, string>(); // rId -> targetPath
    const relsFile = zip.file("word/_rels/document.xml.rels");
    if (relsFile) {
      const relsXml = await relsFile.async("string");
      const relTagRegex = /<Relationship\b[\s\S]*?>/g;
      let rMatch: RegExpExecArray | null;
      while ((rMatch = relTagRegex.exec(relsXml)) !== null) {
        const attrs = parseXmlAttributes(rMatch[0]);
        if (attrs.Id && attrs.Target) {
          // Security & Scope: Skip external relationships
          if (attrs.TargetMode === "External") {
            notices.push(`Skipped external relationship: ${attrs.Id} -> ${attrs.Target}`);
            continue;
          }
          // Sanitize target path against directory traversal
          const cleanTarget = path
            .normalize(attrs.Target)
            .replace(/\\/g, "/")
            .replace(/^(\.\.\/)+/, "")
            .replace(/^(\.\/)+/, "");
          relsMap.set(attrs.Id, cleanTarget);
        }
      }
    }

    // 2. Load media resources
    const resources: Record<string, CanvasResource> = {};
    for (const [rId, target] of relsMap.entries()) {
      if (target.includes("media/")) {
        const zipPath = target.startsWith("word/") ? target : `word/${target}`;
        const imgFile = zip.file(zipPath);
        if (imgFile) {
          const imgData = await imgFile.async("nodebuffer");
          const resId = path.basename(target);
          const ext = path.extname(target).toLowerCase();
          let mimeType = "image/png";
          if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
          else if (ext === ".gif") mimeType = "image/gif";
          else if (ext === ".svg") mimeType = "image/svg+xml";

          resources[resId] = {
            id: resId,
            name: resId,
            mimeType,
            data: imgData,
          };
        }
      }
    }

    // 3. Split paragraphs in w:body using depth tracking to avoid inner textbox paragraphs
    const pages: CanvasPage[] = [];
    const bodyMatch = docXml.match(/<w:body[\s>]([\s\S]*?)<\/w:body>/);
    const bodyContent = bodyMatch ? bodyMatch[1] : docXml;

    // Check for unsupported elements in DOCX body (Scope Definition)
    if (bodyContent.includes("<w:tbl")) {
      warnings.push("Native Word table (<w:tbl>) detected in DOCX body. VML Canvas engine specializes in absolute positioned canvas layouts; native flow tables are not parsed into canvas elements.");
    }
    if (bodyContent.includes("<w:drawing") || bodyContent.includes("<wp:anchor") || bodyContent.includes("<wp:inline")) {
      warnings.push("DrawingML (<w:drawing>) detected in DOCX body. VML Canvas engine specializes in absolute VML shapes (<v:*>); DrawingML shapes were skipped.");
    }

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

      // Check for raw top-level body text outside of <w:pict>
      const hasPict = pStr.includes("<w:pict");
      const hasDirectText = pStr.includes("<w:t>") || pStr.includes("<w:t ");
      if (hasDirectText && !hasPict) {
        warnings.push(`Page ${pageNumber}: Top-level paragraph contains flow text outside <w:pict>. Only VML canvas textboxes are converted into canvas elements.`);
      }

      // Extract all pict shapes inside this paragraph (self-closing or paired tags)
      const shapeRegex =
        /<v:(rect|roundrect|shape|line|oval|polyline)\b[^>]*\/>|<v:(rect|roundrect|shape|line|oval|polyline)\b[\s\S]*?<\/v:\2>/g;
      const shapes = Array.from(pStr.matchAll(shapeRegex)).map((m) => m[0]);

      for (const sStr of shapes) {
        // Skip background rects (id="bg_N")
        if (sStr.includes('id="bg_')) continue;

        const elem = this.parseVmlShape(sStr, relsMap, resources, pageNumber, currentElements.length);
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
      diagnostics: { notices, warnings },
    };
  }

  private parseVmlShape(
    shapeXml: string,
    relsMap: Map<string, string>,
    resources: Record<string, CanvasResource>,
    pageIdx: number,
    elemIdx: number
  ): CanvasElement | null {
    const tagMatch = shapeXml.match(/<v:(rect|roundrect|shape|line|oval|polyline)\b/);
    if (!tagMatch) return null;
    const tag = tagMatch[1];

    const openTagMatch = shapeXml.match(/<v:[a-zA-Z0-9_:-]+[^>]*>/);
    const openTagStr = openTagMatch ? openTagMatch[0] : shapeXml;
    const attrs = parseXmlAttributes(openTagStr);
    const styleStr = attrs["style"] || "";
    const styleMap = parseVmlStyle(styleStr);

    // Extract metadata & original IDs preserved in alt / o:title / id
    const altText = attrs["alt"];
    const titleText = attrs["o:title"];
    const elementId = altText || attrs["id"] || `elem_p${pageIdx}_e${elemIdx}`;
    const elementName = titleText || attrs["name"] || undefined;

    const zIndex = parseInt(styleMap["z-index"] || "1", 10);

    // 1. Line shape (<v:line from="..." to="..."/>)
    if (tag === "line") {
      const [x1, y1] = parseCoordPair(attrs["from"]);
      const [x2, y2] = parseCoordPair(attrs["to"]);

      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      const strokeColor = attrs["strokecolor"] ? attrs["strokecolor"] : undefined;
      const strokeWidth = attrs["strokeweight"] ? parsePt(attrs["strokeweight"]) : 1;

      return {
        id: elementId,
        name: elementName || "Line",
        type: "line",
        bounds: { x, y, width, height },
        zIndex,
        style: {
          strokeColor,
          strokeWidth,
        },
      };
    }

    // Coordinates for Rect / Shape / Roundrect
    const x = parsePt(styleMap["margin-left"]);
    const y = parsePt(styleMap["margin-top"]);
    const width = parsePt(styleMap["width"]);
    const height = parsePt(styleMap["height"]);

    const filled = attrs["filled"] !== "f" && attrs["filled"] !== "false";
    const stroked = attrs["stroked"] !== "f" && attrs["stroked"] !== "false";

    const fillColor = filled && attrs["fillcolor"] ? attrs["fillcolor"] : undefined;
    const strokeColor = stroked && attrs["strokecolor"] ? attrs["strokecolor"] : undefined;
    const strokeWidth = stroked && attrs["strokeweight"] ? parsePt(attrs["strokeweight"]) : undefined;

    let cornerRadius: number | undefined;
    if (tag === "roundrect" && attrs["arcsize"]) {
      const arc = parseFloat(attrs["arcsize"]);
      if (!isNaN(arc) && arc > 0) {
        cornerRadius = arc * Math.max(width, height);
      }
    }

    const style: CanvasStyle = {
      fillColor,
      strokeColor,
      strokeWidth,
      cornerRadius,
    };

    // 2. Check imagedata
    const imgTagMatch = shapeXml.match(/<v:imagedata\b[\s\S]*?>/);
    if (imgTagMatch) {
      const imgAttrs = parseXmlAttributes(imgTagMatch[0]);
      const rId = imgAttrs["r:id"] || imgAttrs["id"];
      if (rId) {
        const target = relsMap.get(rId);
        const resId = target ? path.basename(target) : rId;
        return {
          id: elementId,
          name: elementName || imgAttrs["o:title"] || "image",
          type: "image",
          bounds: { x, y, width, height },
          zIndex,
          style,
          imageRef: resId,
        };
      }
    }

    // 3. Check textbox & padding
    let innerPaddingPt: CanvasPadding | undefined;
    const textboxTagMatch = shapeXml.match(/<v:textbox\b[\s\S]*?>/);
    if (textboxTagMatch) {
      const tbAttrs = parseXmlAttributes(textboxTagMatch[0]);
      if (tbAttrs["inset"]) {
        const parts = tbAttrs["inset"].split(",").map((p) => parsePt(p));
        if (parts.length >= 4) {
          innerPaddingPt = {
            left: parts[0],
            top: parts[1],
            right: parts[2],
            bottom: parts[3],
          };
        }
      }
    }

    const textRuns: CanvasTextRun[] = [];
    let align: "left" | "center" | "right" | "justify" = "left";

    const jcTagMatch = shapeXml.match(/<w:jc\b[\s\S]*?>/);
    if (jcTagMatch) {
      const jcAttrs = parseXmlAttributes(jcTagMatch[0]);
      const jc = jcAttrs["w:val"];
      if (jc === "center" || jc === "right" || jc === "justify") {
        align = jc;
      }
    }

    // Check line spacing
    let lineHeightPt: number | undefined;
    const spacingTagMatch = shapeXml.match(/<w:spacing\b[\s\S]*?>/);
    if (spacingTagMatch) {
      const spAttrs = parseXmlAttributes(spacingTagMatch[0]);
      if (spAttrs["w:line"] && spAttrs["w:lineRule"] === "exact") {
        lineHeightPt = parseInt(spAttrs["w:line"], 10) / 20;
      }
    }

    const rRegex = /<w:r[\s>][\s\S]*?<\/w:r>/g;
    const runs = Array.from(shapeXml.matchAll(rRegex)).map((m) => m[0]);

    for (const rXml of runs) {
      const tMatch = rXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
      if (tMatch) {
        const text = tMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");

        const rFontsMatch = rXml.match(/<w:rFonts\b[\s\S]*?>/);
        let fontFamily = "Pretendard";
        if (rFontsMatch) {
          const fAttrs = parseXmlAttributes(rFontsMatch[0]);
          fontFamily = fAttrs["w:eastAsia"] || fAttrs["w:ascii"] || "Pretendard";
        }

        const szMatch = rXml.match(/<w:sz\b[\s\S]*?>/);
        let fontSizePt = 10;
        if (szMatch) {
          const szAttrs = parseXmlAttributes(szMatch[0]);
          if (szAttrs["w:val"]) {
            fontSizePt = parseInt(szAttrs["w:val"], 10) / 2;
          }
        }

        const colorMatch = rXml.match(/<w:color\b[\s\S]*?>/);
        let color = "#000000";
        if (colorMatch) {
          const cAttrs = parseXmlAttributes(colorMatch[0]);
          if (cAttrs["w:val"]) {
            color = `#${cAttrs["w:val"]}`;
          }
        }

        const bold = rXml.includes("<w:b/>") || rXml.includes("<w:b ");
        const italic = rXml.includes("<w:i/>") || rXml.includes("<w:i ");
        const underline = rXml.includes("<w:u ") || rXml.includes("<w:u/>");
        const strike = rXml.includes("<w:strike ") || rXml.includes("<w:strike/>");

        textRuns.push({
          text,
          fontFamily,
          fontSizePt,
          fontWeight: bold ? 700 : 400,
          italic: italic || undefined,
          underline: underline || undefined,
          strike: strike || undefined,
          color,
          lineHeightPt,
        });
      }
    }

    const hasText = textRuns.length > 0;
    const type = hasText ? "text" : "card";

    return {
      id: elementId,
      name: elementName,
      type,
      bounds: { x, y, width, height },
      zIndex,
      style,
      innerPaddingPt,
      textRuns: hasText ? textRuns : undefined,
      paragraphAlign: align,
    };
  }
}
