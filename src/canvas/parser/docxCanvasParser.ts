import JSZip from "jszip";
import {
  CanvasDocument,
  CanvasPage,
  CanvasElement,
  CanvasElementType,
  CanvasTextRun,
  CanvasResource,
  CanvasStyle,
  CanvasPadding,
} from "../types.js";
import { SvgPath, vmlToSvgPath } from "../geometry/svgPathParser.js";

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
  public async parse(input: Buffer | Uint8Array | ArrayBuffer | string): Promise<CanvasDocument> {
    let buffer: Buffer | Uint8Array | ArrayBuffer;
    const MAX_INPUT_SIZE = 100 * 1024 * 1024; // 100 MB

    if (typeof input === "string") {
      if (input.includes("\0")) {
        throw new Error("Invalid DOCX path: Null byte detected.");
      }
      const fs = await import("fs");
      const stat = await fs.promises.stat(input);
      if (stat.size > MAX_INPUT_SIZE) {
        throw new Error(`DOCX file exceeds maximum allowed size of 100MB: ${stat.size} bytes`);
      }
      buffer = await fs.promises.readFile(input);
    } else {
      buffer = input;
      const byteLength = "byteLength" in buffer ? buffer.byteLength : (buffer as any).length;
      if (byteLength > MAX_INPUT_SIZE) {
        throw new Error(`DOCX buffer exceeds maximum allowed size of 100MB: ${byteLength} bytes`);
      }
    }

    // ZIP Bomb & entry count protection
    const MAX_ZIP_ENTRIES = 5000;
    const MAX_TOTAL_UNCOMPRESSED_SIZE = 250 * 1024 * 1024; // 250 MB

    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.keys(zip.files);
    if (entries.length > MAX_ZIP_ENTRIES) {
      throw new Error(`DOCX package contains excessive entry count (${entries.length} > ${MAX_ZIP_ENTRIES}). Possible ZIP bomb.`);
    }

    let totalDecompressedBytes = 0;
    for (const filename of entries) {
      const fileEntry = zip.files[filename];
      if (fileEntry && (fileEntry as any)._data && typeof (fileEntry as any)._data.uncompressedSize === "number") {
        totalDecompressedBytes += (fileEntry as any)._data.uncompressedSize;
        if (totalDecompressedBytes > MAX_TOTAL_UNCOMPRESSED_SIZE) {
          throw new Error(`DOCX package uncompressed size exceeds safety limit of 250MB. Possible ZIP bomb.`);
        }
      }
    }

    const docXmlFile = zip.file("word/document.xml");
    if (!docXmlFile) {
      throw new Error("Invalid DOCX package: word/document.xml missing.");
    }

    const docXml = await docXmlFile.async("string");
    const warnings: string[] = [];
    const notices: string[] = [];

    // Diagnostic Scope Checks (F-14):
    if (docXml.includes("<w:tbl")) {
      warnings.push("[SCOPE_NOTICE] Document contains native Word tables (<w:tbl>). Canvas 2D engine targets absolute canvas layouts; flow tables are preserved only as background/container cards.");
    }
    if (docXml.includes("<c:chart") || (docXml.includes("<w:drawing") && docXml.includes("chart"))) {
      warnings.push("[SCOPE_NOTICE] Document contains embedded ChartML (<c:chart>). Embedded office charts are outside Canvas IR shape scope.");
    }
    if (docXml.includes("<w:object") || docXml.includes("<o:OLEObject")) {
      warnings.push("[SCOPE_NOTICE] Document contains embedded OLE objects. OLE binary packages are outside Canvas IR scope.");
    }

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
          const cleanTarget = attrs.Target
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
          const imgData = await imgFile.async("uint8array");
          const resId = target.split("/").pop() || target;
          const extIdx = resId.lastIndexOf(".");
          const ext = extIdx !== -1 ? resId.substring(extIdx).toLowerCase() : "";
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

    // Extract body-level final <w:sectPr> default page size
    let defaultPageWidthPt = 595.28;
    let defaultPageHeightPt = 841.89;
    const allSectPrMatches = Array.from(bodyContent.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
    if (allSectPrMatches.length > 0) {
      const lastSectXml = allSectPrMatches[allSectPrMatches.length - 1][0];
      const pgSzMatch = lastSectXml.match(/<w:pgSz\b[\s\S]*?>/);
      if (pgSzMatch) {
        const pgAttrs = parseXmlAttributes(pgSzMatch[0]);
        const wTwips = parseInt(pgAttrs["w:w"] || "0", 10);
        const hTwips = parseInt(pgAttrs["w:h"] || "0", 10);
        if (wTwips > 0 && hTwips > 0) {
          defaultPageWidthPt = Math.round((wTwips / 20) * 100) / 100;
          defaultPageHeightPt = Math.round((hTwips / 20) * 100) / 100;
        }
      }
    }

    let pageNumber = 1;
    let currentElements: CanvasElement[] = [];
    let currentBgColor: string | undefined;
    let currentSectionSize: { width: number; height: number } | undefined;

    const flushPage = (overrideSize?: { width: number; height: number }) => {
      if (currentElements.length > 0 || currentBgColor || pages.length === 0) {
        const sz = overrideSize || currentSectionSize || {
          width: defaultPageWidthPt,
          height: defaultPageHeightPt,
        };
        pages.push({
          pageNumber,
          bounds: { x: 0, y: 0, width: sz.width, height: sz.height },
          backgroundColor: currentBgColor,
          elements: [...currentElements].sort((a, b) => a.zIndex - b.zIndex),
        });
        currentElements = [];
        currentBgColor = undefined;
        currentSectionSize = undefined;
        pageNumber++;
      }
    };

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const pStr = paragraphs[pIdx];

      // Strip inner <v:textbox> content when checking top-level paragraph properties
      const pTopLevel = pStr.replace(/<v:textbox\b[\s\S]*?<\/v:textbox>/g, "");

      // Check if this paragraph starts a new page
      const hasPageBreak =
        pTopLevel.includes("<w:pageBreakBefore/>") ||
        (pTopLevel.includes("<w:pageBreakBefore") &&
          !pTopLevel.includes('<w:pageBreakBefore w:val="0"'));
      if (hasPageBreak && pIdx > 0) {
        flushPage();
      }

      // Check for raw top-level body text outside of <w:pict>
      const hasPict = pStr.includes("<w:pict");
      const hasDirectText = pTopLevel.includes("<w:t>") || pTopLevel.includes("<w:t ");
      if (hasDirectText && !hasPict) {
        warnings.push(`Page ${pageNumber}: Top-level paragraph contains flow text outside <w:pict>. Only VML canvas textboxes are converted into canvas elements.`);
      }

      // Extract all pict shapes inside this paragraph (self-closing or paired tags)
      const shapeRegex =
        /<v:(rect|roundrect|shape|line|oval|polyline)\b[^>]*\/>|<v:(rect|roundrect|shape|line|oval|polyline)\b[\s\S]*?<\/v:\2>/g;
      const shapes = Array.from(pStr.matchAll(shapeRegex)).map((m) => m[0]);

      for (const sStr of shapes) {
        // Recover background color from full-page background rects (id="bg_N") and skip adding as normal element
        if (sStr.includes('id="bg_')) {
          const bgAttrs = parseXmlAttributes(sStr);
          if (bgAttrs["fillcolor"] && bgAttrs["filled"] !== "f") {
            currentBgColor = bgAttrs["fillcolor"];
          }
          continue;
        }

        const elem = this.parseVmlShape(sStr, relsMap, resources, pageNumber, currentElements.length);
        if (elem) {
          currentElements.push(elem);
        }
      }

      // Check if this paragraph ends a section with an inline <w:sectPr>
      const inlineSectMatch = pTopLevel.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/);
      if (inlineSectMatch) {
        const pgSzMatch = inlineSectMatch[0].match(/<w:pgSz\b[\s\S]*?>/);
        let inlineSize: { width: number; height: number } | undefined;
        if (pgSzMatch) {
          const pgAttrs = parseXmlAttributes(pgSzMatch[0]);
          const wTwips = parseInt(pgAttrs["w:w"] || "0", 10);
          const hTwips = parseInt(pgAttrs["w:h"] || "0", 10);
          if (wTwips > 0 && hTwips > 0) {
            inlineSize = {
              width: Math.round((wTwips / 20) * 100) / 100,
              height: Math.round((hTwips / 20) * 100) / 100,
            };
          }
        }
        if (pIdx < paragraphs.length - 1) {
          flushPage(inlineSize);
        } else if (inlineSize) {
          currentSectionSize = inlineSize;
        }
      }
    }

    // Flush last page
    flushPage();

    const firstPage = pages[0];
    const docWidthPt = firstPage ? firstPage.bounds.width : defaultPageWidthPt;
    const docHeightPt = firstPage ? firstPage.bounds.height : defaultPageHeightPt;
    const docOrientation = docWidthPt > docHeightPt ? "landscape" : "portrait";

    return {
      title: "Extracted Canvas Document",
      pageSize: {
        name:
          (Math.abs(docWidthPt - 595.28) < 2 && Math.abs(docHeightPt - 841.89) < 2) ||
          (Math.abs(docWidthPt - 841.89) < 2 && Math.abs(docHeightPt - 595.28) < 2)
            ? "A4"
            : "Custom",
        widthPt: docWidthPt,
        heightPt: docHeightPt,
        orientation: docOrientation,
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
    const strokeDashed =
      shapeXml.includes('dashstyle="dash"') || shapeXml.includes('dashstyle="dot"') || undefined;

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
          strokeDashed,
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
        const minSide = Math.max(1, Math.min(width, height));
        // Phase 31.1 Empirical Verification: Word for Mac native rendering renders
        // corner radius R = arcsize * minSide
        cornerRadius = Math.round(arc * minSide * 100) / 100;
      }
    }

    // 1b. Shadow (<v:shadow>)
    let shadow: CanvasStyle["shadow"] = undefined;
    const shadowMatch = shapeXml.match(/<v:shadow\b[^>]*>/);
    if (shadowMatch) {
      const sAttrs = parseXmlAttributes(shadowMatch[0]);
      if (sAttrs["on"] === "t" || sAttrs["on"] === "true") {
        const sColor = sAttrs["color"]
          ? sAttrs["color"].startsWith("#")
            ? sAttrs["color"]
            : `#${sAttrs["color"]}`
          : undefined;
        let sOffX = 0;
        let sOffY = 0;
        if (sAttrs["offset"]) {
          const parts = sAttrs["offset"].split(",");
          if (parts.length >= 2) {
            sOffX = parsePt(parts[0]);
            sOffY = parsePt(parts[1]);
          }
        }
        const sOpacity = sAttrs["opacity"] ? parseFloat(sAttrs["opacity"]) : undefined;
        shadow = {
          color: sColor,
          offsetX: sOffX,
          offsetY: sOffY,
          opacity: sOpacity,
        };
      }
    }

    const style: CanvasStyle = {
      fillColor,
      strokeColor,
      strokeWidth,
      strokeDashed,
      cornerRadius,
      shadow,
    };

    // 2. Check imagedata
    const imgTagMatch = shapeXml.match(/<v:imagedata\b[\s\S]*?>/);
    if (imgTagMatch) {
      const imgAttrs = parseXmlAttributes(imgTagMatch[0]);
      const rId = imgAttrs["r:id"] || imgAttrs["id"];
      if (rId) {
        const target = relsMap.get(rId);
        const resId = target ? (target.split("/").pop() || target) : rId;

        const parseVmlCrop = (val?: string): number => {
          if (!val) return 0;
          if (val.endsWith("f")) {
            const num = parseFloat(val.slice(0, -1));
            return isNaN(num) ? 0 : Math.max(0, Math.min(0.95, num / 65536));
          }
          const num = parseFloat(val);
          return isNaN(num) ? 0 : Math.max(0, Math.min(0.95, num));
        };

        const cTop = parseVmlCrop(imgAttrs["croptop"]);
        const cBottom = parseVmlCrop(imgAttrs["cropbottom"]);
        const cLeft = parseVmlCrop(imgAttrs["cropleft"]);
        const cRight = parseVmlCrop(imgAttrs["cropright"]);
        const hasCrop = cTop > 0 || cBottom > 0 || cLeft > 0 || cRight > 0;

        return {
          id: elementId,
          name: elementName || imgAttrs["o:title"] || "image",
          type: "image",
          bounds: { x, y, width, height },
          zIndex,
          style,
          imageRef: resId,
          imageScaleMode: hasCrop ? "CROP" : "FILL",
          imageCrop: hasCrop ? { top: cTop, bottom: cBottom, left: cLeft, right: cRight } : undefined,
        };
      }
    }

    // 3. Check textbox, padding & vertical alignment
    let innerPaddingPt: CanvasPadding | undefined;
    let verticalAlign: "top" | "center" | "bottom" | undefined;
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
      if (tbAttrs["style"]) {
        const tbStyle = parseVmlStyle(tbAttrs["style"]);
        const anchor = tbStyle["v-text-anchor"];
        if (anchor === "middle") verticalAlign = "center";
        else if (anchor === "bottom") verticalAlign = "bottom";
        else if (anchor === "top") verticalAlign = "top";
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

    // Check paragraph line spacing inside <w:pPr>
    let lineHeightPt: number | undefined;
    const pPrMatch = shapeXml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/);
    const spacingTagMatch = (pPrMatch ? pPrMatch[0] : shapeXml).match(/<w:spacing\b[^>]*w:line=[^>]*>/);
    if (spacingTagMatch) {
      const spAttrs = parseXmlAttributes(spacingTagMatch[0]);
      if (spAttrs["w:line"] && spAttrs["w:lineRule"] === "exact") {
        lineHeightPt = parseInt(spAttrs["w:line"], 10) / 20;
      }
    }

    const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
    const paragraphs = Array.from(shapeXml.matchAll(pRegex)).map((m) => m[0]);
    const parasToProcess = paragraphs.length > 0 ? paragraphs : [shapeXml];

    for (let pIdx = 0; pIdx < parasToProcess.length; pIdx++) {
      const pXml = parasToProcess[pIdx];
      if (pIdx > 0 && textRuns.length > 0) {
        const lastRun = textRuns[textRuns.length - 1];
        if (!lastRun.text.endsWith("\n")) {
          lastRun.text += "\n";
        }
      }

      const rRegex = /<w:r[\s>][\s\S]*?<\/w:r>/g;
      const runs = Array.from(pXml.matchAll(rRegex)).map((m) => m[0]);

      for (const rXml of runs) {
        const tokenRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/?>|<w:cr\b[^>]*\/?>/g;
        let text = "";
        let tokenMatch: RegExpExecArray | null;
        let hasContent = false;
        while ((tokenMatch = tokenRegex.exec(rXml)) !== null) {
          hasContent = true;
          if (tokenMatch[1] !== undefined) {
            text += tokenMatch[1]
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'");
          } else {
            text += "\n";
          }
        }

        if (hasContent && text.length > 0) {
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

          let letterSpacingPt: number | undefined;
          const rSpMatch = rXml.match(/<w:spacing\b[^>]*w:val=[^>]*>/);
          if (rSpMatch) {
            const rSpAttrs = parseXmlAttributes(rSpMatch[0]);
            if (rSpAttrs["w:val"]) {
              const twips = parseInt(rSpAttrs["w:val"], 10);
              if (!isNaN(twips)) {
                letterSpacingPt = Math.round((twips / 20) * 100) / 100;
              }
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
            letterSpacingPt,
          });
        }
      }
    }

    const hasText = textRuns.length > 0;
    let type: CanvasElementType = hasText ? "text" : "card";
    if (tag === "oval") {
      type = "oval";
    } else if (tag === "shape" && attrs["path"]) {
      type = "vector";
    }

    let vectorPoints: { x: number; y: number }[] | undefined;
    let vectorSubpaths: { points: { x: number; y: number }[]; closed: boolean }[] | undefined;
    let vectorPath: string | undefined;
    if (type === "vector" && attrs["path"]) {
      vectorPath = attrs["path"];
      const cleanPath = vmlToSvgPath(vectorPath);
      const parsed = SvgPath.parse(cleanPath);
      const wHwpu = Math.max(10, Math.round(width * 100));
      const hHwpu = Math.max(10, Math.round(height * 100));
      vectorPoints = parsed.toHwpxPolygonPoints(wHwpu, hHwpu);
      vectorSubpaths = parsed.toHwpxSubpathsWithClosed(wHwpu, hHwpu);
    }

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
      verticalAlign,
      vectorPath,
      vectorPoints,
      vectorSubpaths,
    };
  }
}
