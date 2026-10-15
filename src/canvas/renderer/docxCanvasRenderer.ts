import JSZip from "jszip";
import {
  CanvasDocument,
  CanvasPage,
  CanvasElement,
  CanvasTextRun,
  CanvasResource,
  ptToTwip,
} from "../types.js";

export interface DocxCanvasRendererOptions {
  creator?: string;
}

function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function cleanHex(color?: string, fallback: string = "000000"): string {
  if (!color) return fallback;
  return color.replace("#", "").trim().toUpperCase();
}

export function resolveEastAsiaFont(fontFamily?: string): { ascii: string; eastAsia: string } {
  if (!fontFamily) {
    return { ascii: "Pretendard", eastAsia: "맑은 고딕" };
  }
  const f = fontFamily.trim();
  const isKoreanFont =
    f.includes("맑은 고딕") ||
    f.includes("Malgun") ||
    f.includes("Pretendard") ||
    f.includes("Noto Sans KR") ||
    f.includes("Nanum") ||
    f.includes("나눔") ||
    f.includes("돋움") ||
    f.includes("Dotum") ||
    f.includes("굴림") ||
    f.includes("Gulim") ||
    f.includes("바탕") ||
    f.includes("Batang") ||
    f.includes("Gungsuh") ||
    f.includes("KoPub");

  if (isKoreanFont) {
    return { ascii: f, eastAsia: f };
  }
  return { ascii: f, eastAsia: "맑은 고딕" };
}

export class DocxCanvasRenderer {
  private creator: string;

  constructor(options?: DocxCanvasRendererOptions) {
    this.creator = options?.creator || "Figma2Word Canvas Engine";
  }

  public async renderToBuffer(doc: CanvasDocument): Promise<Buffer> {
    const zip = new JSZip();

    // 1. [Content_Types].xml
    zip.file("[Content_Types].xml", this.buildContentTypesXml(doc));

    // 2. _rels/.rels
    zip.file("_rels/.rels", this.buildRootRelsXml());

    // 3. docProps/core.xml & app.xml
    zip.file("docProps/core.xml", this.buildCorePropsXml(doc));
    zip.file("docProps/app.xml", this.buildAppPropsXml(doc));

    // 4. word/styles.xml & settings.xml
    zip.file("word/styles.xml", this.buildStylesXml());
    zip.file("word/settings.xml", this.buildSettingsXml());

    // 5. word/media/
    const imageRelMap = new Map<string, string>(); // resourceId -> rId
    let rIdCounter = 2; // rId1 is styles.xml

    for (const [resId, res] of Object.entries(doc.resources)) {
      const rId = `rId${rIdCounter++}`;
      imageRelMap.set(resId, rId);
      zip.file(`word/media/${resId}`, res.data);
    }

    // 6. word/_rels/document.xml.rels
    zip.file(
      "word/_rels/document.xml.rels",
      this.buildDocumentRelsXml(imageRelMap)
    );

    // 7. word/document.xml
    zip.file("word/document.xml", this.buildDocumentXml(doc, imageRelMap));

    // Generate binary buffer
    const content = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return content;
  }

  private buildContentTypesXml(doc: CanvasDocument): string {
    const mediaExtensions = new Set<string>(["png", "jpeg", "jpg"]);
    let defaultEntries = "";
    for (const ext of mediaExtensions) {
      const mime = ext === "png" ? "image/png" : "image/jpeg";
      defaultEntries += `<Default Extension="${ext}" ContentType="${mime}"/>`;
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${defaultEntries}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`.trim();
  }

  private buildRootRelsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`.trim();
  }

  private buildCorePropsXml(doc: CanvasDocument): string {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(doc.title)}</dc:title>
  <dc:creator>${escapeXml(this.creator)}</dc:creator>
  <cp:lastModifiedBy>${escapeXml(this.creator)}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`.trim();
  }

  private buildAppPropsXml(doc: CanvasDocument): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>${escapeXml(this.creator)}</Application>
  <Pages>${doc.pages.length}</Pages>
</Properties>`.trim();
  }

  private buildStylesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Inter" w:hAnsi="Inter" w:eastAsia="맑은 고딕" w:cs="Inter"/>
        <w:sz w:val="20"/>
        <w:szCs w:val="20"/>
        <w:lang w:val="ko-KR" w:eastAsia="ko-KR" w:bidi="ar-SA"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`.trim();
  }

  private buildSettingsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
</w:settings>`.trim();
  }

  private buildDocumentRelsXml(imageRelMap: Map<string, string>): string {
    let rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`;

    for (const [resId, rId] of imageRelMap.entries()) {
      rels += `\n  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${resId}"/>`;
    }

    rels += "\n</Relationships>";
    return rels.trim();
  }

  private buildDocumentXml(
    doc: CanvasDocument,
    imageRelMap: Map<string, string>
  ): string {
    const widthTwips = ptToTwip(doc.pageSize?.widthPt || 595.28);
    const heightTwips = ptToTwip(doc.pageSize?.heightPt || 841.89);

    const pageParagraphs: string[] = [];

    for (let pIdx = 0; pIdx < doc.pages.length; pIdx++) {
      const page = doc.pages[pIdx];
      const runsXml: string[] = [];

      // 1. If page has custom background color, inject full-page background rect
      if (page.backgroundColor) {
        runsXml.push(
          this.buildBackgroundRect(
            pIdx,
            page.backgroundColor,
            doc.pageSize.widthPt,
            doc.pageSize.heightPt
          )
        );
      }

      // 2. Render all page elements
      for (let eIdx = 0; eIdx < page.elements.length; eIdx++) {
        const elem = page.elements[eIdx];
        const elemXml = this.renderElement(
          pIdx,
          eIdx,
          elem,
          imageRelMap,
          doc.resources
        );
        if (elemXml) {
          runsXml.push(elemXml);
        }
      }

      // Page break & paragraph properties
      const pageBreakBeforeXml =
        pIdx > 0 ? "<w:pageBreakBefore/>" : '<w:pageBreakBefore w:val="0"/>';

      const pPrXml = `<w:pPr>
  ${pageBreakBeforeXml}
  <w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>
  <w:autoSpaceDE w:val="0"/>
  <w:autoSpaceDN w:val="0"/>
</w:pPr>`;

      pageParagraphs.push(`<w:p>
  ${pPrXml}
  ${runsXml.join("\n  ")}
</w:p>`);
    }

    // Section properties (A4, 0 margins)
    const sectPrXml = `<w:sectPr>
  <w:pgSz w:w="${widthTwips}" w:h="${heightTwips}" w:orient="portrait"/>
  <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>
</w:sectPr>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${pageParagraphs.join("\n")}
    ${sectPrXml}
  </w:body>
</w:document>`.trim();
  }

  private buildBackgroundRect(
    pageIdx: number,
    colorHex: string,
    widthPt: number,
    heightPt: number
  ): string {
    const hex = cleanHex(colorHex, "FFFFFF");
    return `<w:r>
  <w:pict>
    <v:rect id="bg_${pageIdx}"
            style="position:absolute;left:0;top:0;margin-left:0pt;margin-top:0pt;width:${widthPt.toFixed(
              3
            )}pt;height:${heightPt.toFixed(
      3
    )}pt;z-index:0;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none"
            filled="t"
            stroked="f"
            fillcolor="#${hex}"/>
  </w:pict>
</w:r>`;
  }

  private renderElement(
    pageIdx: number,
    elemIdx: number,
    elem: CanvasElement,
    imageRelMap: Map<string, string>,
    resources?: Record<string, CanvasResource>
  ): string {
    const shapeId = `s_${pageIdx}_${elemIdx}`;
    const { x, y, width, height } = elem.bounds;
    const z = elem.zIndex;

    const baseStyle = `position:absolute;left:0;top:0;margin-left:${x.toFixed(
      3
    )}pt;margin-top:${y.toFixed(3)}pt;width:${width.toFixed(
      3
    )}pt;height:${height.toFixed(
      3
    )}pt;z-index:${z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none`;

    const altAttr = elem.id ? `alt="${escapeXml(elem.id)}"` : "";
    const titleAttr = `o:title="${escapeXml(elem.name || elem.id || "")}"`;

    // 1. Line
    if (elem.type === "line") {
      const strokeColor = cleanHex(elem.style.strokeColor, "000000");
      const strokeW = elem.style.strokeWidth ? elem.style.strokeWidth.toFixed(2) : "1.00";
      return `<w:r>
  <w:pict>
    <v:line id="${shapeId}"
            ${altAttr}
            ${titleAttr}
            from="${x.toFixed(3)}pt,${y.toFixed(3)}pt"
            to="${(x + width).toFixed(3)}pt,${(y + height).toFixed(3)}pt"
            style="position:absolute;z-index:${z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page"
            strokecolor="#${strokeColor}"
            strokeweight="${strokeW}pt"/>
  </w:pict>
</w:r>`;
    }

    // 1b. Vector Shape
    if (elem.type === "vector") {
      const hasFill = !!elem.style.fillColor;
      const hasStroke = !!elem.style.strokeColor && (elem.style.strokeWidth || 0) > 0;
      const filledAttr = hasFill ? 'filled="t"' : 'filled="f"';
      const fillcolorAttr = hasFill ? `fillcolor="#${cleanHex(elem.style.fillColor)}"` : "";
      const strokedAttr = hasStroke ? 'stroked="t"' : 'stroked="f"';
      const strokecolorAttr = hasStroke ? `strokecolor="#${cleanHex(elem.style.strokeColor)}"` : "";
      const strokeweightAttr = hasStroke
        ? `strokeweight="${(elem.style.strokeWidth || 1).toFixed(2)}pt"`
        : "";

      const pathStr = elem.vectorPath || "";
      if (!pathStr) {
        return "";
      }

      return `<w:r>
  <w:pict>
    <v:shape id="${shapeId}"
             ${altAttr}
             ${titleAttr}
             style="${baseStyle}"
             coordsize="1000,1000"
             path="${pathStr}"
             ${filledAttr}
             ${fillcolorAttr}
             ${strokedAttr}
             ${strokecolorAttr}
             ${strokeweightAttr}/>
  </w:pict>
</w:r>`;
    }

    // 2. Image
    if (elem.type === "image" && elem.imageRef) {
      const relId = imageRelMap.get(elem.imageRef) || "rId1";
      let cropAttr = "";
      const res = resources && elem.imageRef ? resources[elem.imageRef] : undefined;
      if (res && res.data && res.data.length > 24) {
        let imgW = 0;
        let imgH = 0;
        // PNG check: 89 50 4E 47
        if (
          res.data[0] === 0x89 &&
          res.data[1] === 0x50 &&
          res.data[2] === 0x4e &&
          res.data[3] === 0x47
        ) {
          imgW = res.data.readUInt32BE(16);
          imgH = res.data.readUInt32BE(20);
        } else if (res.data[0] === 0xff && res.data[1] === 0xd8) {
          // Basic JPEG SOF0/SOF2 marker parser
          let offset = 2;
          while (offset < res.data.length - 8) {
            const marker = res.data.readUInt16BE(offset);
            offset += 2;
            if (marker === 0xffc0 || marker === 0xffc2) {
              imgH = res.data.readUInt16BE(offset + 3);
              imgW = res.data.readUInt16BE(offset + 5);
              break;
            }
            const len = res.data.readUInt16BE(offset);
            offset += len;
          }
        }

        if (imgW > 0 && imgH > 0 && width > 0 && height > 0) {
          const arImg = imgW / imgH;
          const arBox = width / height;
          if (arImg < arBox * 0.99) {
            // Image is taller than container box: crop top & bottom (object-fit: cover)
            const cropY = (1.0 - arImg / arBox) / 2.0;
            const cropVal = Math.round(cropY * 65536);
            cropAttr = ` croptop="${cropVal}f" cropbottom="${cropVal}f"`;
          } else if (arImg > arBox * 1.01) {
            // Image is wider than container box: crop left & right
            const cropX = (1.0 - arBox / arImg) / 2.0;
            const cropVal = Math.round(cropX * 65536);
            cropAttr = ` cropleft="${cropVal}f" cropright="${cropVal}f"`;
          }
        }
      }

      return `<w:r>
  <w:pict>
    <v:shape id="${shapeId}"
             ${altAttr}
             ${titleAttr}
             style="${baseStyle}"
             filled="f"
             stroked="f">
      <v:imagedata r:id="${relId}"${cropAttr} o:title="${escapeXml(elem.name || "image")}"/>
    </v:shape>
  </w:pict>
</w:r>`;
    }

    // 3. Card or Text
    const isText = elem.type === "text" || (elem.textRuns && elem.textRuns.length > 0);
    const hasFill = !!elem.style.fillColor;
    const hasStroke = !!elem.style.strokeColor && (elem.style.strokeWidth || 0) > 0;

    const filledAttr = hasFill ? 'filled="t"' : 'filled="f"';
    const fillcolorAttr = hasFill ? `fillcolor="#${cleanHex(elem.style.fillColor)}"` : "";

    const strokedAttr = hasStroke ? 'stroked="t"' : 'stroked="f"';
    const strokecolorAttr = hasStroke ? `strokecolor="#${cleanHex(elem.style.strokeColor)}"` : "";
    const strokeweightAttr = hasStroke
      ? `strokeweight="${(elem.style.strokeWidth || 1).toFixed(2)}pt"`
      : "";

    // Corner radius or Oval
    const isOval = elem.type === "oval";
    const isRound = !isOval && !!elem.style.cornerRadius && elem.style.cornerRadius > 0;
    const tag = isOval ? "v:oval" : isRound ? "v:roundrect" : "v:rect";
    const arcsizeAttr = isRound
      ? `arcsize="${Math.min(
          0.5,
          (elem.style.cornerRadius || 0) / Math.max(width, height)
        ).toFixed(3)}"`
      : "";

    let textboxContentXml = "";
    if (isText && elem.textRuns) {
      const jcVal = elem.paragraphAlign || "left";
      const runsXml: string[] = [];

      for (const run of elem.textRuns) {
        const { ascii, eastAsia } = resolveEastAsiaFont(run.fontFamily);
        const fontAscii = escapeXml(ascii);
        const fontEastAsia = escapeXml(eastAsia);
        const fontSizeHalfPt = Math.round((run.fontSizePt || 10) * 2);
        const colorHex = cleanHex(run.color, "000000");

        const boldXml = (run.fontWeight || 400) >= 600 ? "<w:b/>" : "";
        const italicXml = run.italic ? "<w:i/>" : "";
        const uXml = run.underline ? '<w:u w:val="single"/>' : "";
        const strikeXml = run.strike ? "<w:strike/>" : "";

        runsXml.push(`<w:r>
  <w:rPr>
    <w:rFonts w:ascii="${fontAscii}" w:hAnsi="${fontAscii}" w:eastAsia="${fontEastAsia}" w:cs="${fontAscii}"/>
    <w:sz w:val="${fontSizeHalfPt}"/>
    <w:szCs w:val="${fontSizeHalfPt}"/>
    <w:color w:val="${colorHex}"/>
    ${boldXml}
    ${italicXml}
    ${uXml}
    ${strikeXml}
  </w:rPr>
  <w:t xml:space="preserve">${escapeXml(run.text)}</w:t>
</w:r>`);
      }

      const pad = elem.innerPaddingPt || {};
      const padTop = pad.top ?? 0;
      const padRight = pad.right ?? 0;
      const padBottom = pad.bottom ?? 0;
      const padLeft = pad.left ?? 0;
      const insetAttr = `inset="${padLeft.toFixed(2)}pt,${padTop.toFixed(2)}pt,${padRight.toFixed(2)}pt,${padBottom.toFixed(2)}pt"`;

      const firstLineHeight = elem.textRuns.find((r) => r.lineHeightPt)?.lineHeightPt;
      const spacingXml = firstLineHeight
        ? `<w:spacing w:before="0" w:after="0" w:line="${Math.round(firstLineHeight * 20)}" w:lineRule="exact"/>`
        : `<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>`;

      textboxContentXml = `
      <v:textbox style="mso-fit-shape-to-text:f;mso-next-textbox:none" ${insetAttr}>
        <w:txbxContent>
          <w:p>
            <w:pPr>
              <w:jc w:val="${jcVal}"/>
              ${spacingXml}
            </w:pPr>
            ${runsXml.join("\n            ")}
          </w:p>
        </w:txbxContent>
      </v:textbox>`;
    }

    return `<w:r>
  <w:pict>
    <${tag} id="${shapeId}"
            ${altAttr}
            ${titleAttr}
            style="${baseStyle}"
            ${filledAttr}
            ${fillcolorAttr}
            ${strokedAttr}
            ${strokecolorAttr}
            ${strokeweightAttr}
            ${arcsizeAttr}>${textboxContentXml}
    </${tag}>
  </w:pict>
</w:r>`;
  }
}
