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

  public async buildZip(doc: CanvasDocument): Promise<JSZip> {
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

    return zip;
  }

  public async renderToUint8Array(doc: CanvasDocument): Promise<Uint8Array> {
    const zip = await this.buildZip(doc);
    return await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  }

  public async renderToBlob(doc: CanvasDocument): Promise<Blob> {
    const uint8 = await this.renderToUint8Array(doc);
    return new Blob([uint8 as any], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  public async renderToBuffer(doc: CanvasDocument): Promise<Buffer> {
    const uint8 = await this.renderToUint8Array(doc);
    return Buffer.from(uint8.buffer, uint8.byteOffset, uint8.byteLength);
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

      const pageWidthPt = page.bounds.width || doc.pageSize.widthPt;
      const pageHeightPt = page.bounds.height || doc.pageSize.heightPt;

      // 1. If page has custom background color, inject full-page background rect using per-page dimensions
      if (page.backgroundColor) {
        runsXml.push(
          this.buildBackgroundRect(
            pIdx,
            page.backgroundColor,
            pageWidthPt,
            pageHeightPt
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

      const curWidthTwips = ptToTwip(pageWidthPt);
      const curHeightTwips = ptToTwip(pageHeightPt);
      const curIsLandscape = pageWidthPt > pageHeightPt;
      const curOrient = curIsLandscape ? "landscape" : "portrait";

      const nextPage = pIdx < doc.pages.length - 1 ? doc.pages[pIdx + 1] : undefined;
      const nextWidthPt = nextPage ? (nextPage.bounds.width || doc.pageSize.widthPt) : undefined;
      const nextHeightPt = nextPage ? (nextPage.bounds.height || doc.pageSize.heightPt) : undefined;
      const nextDiffers =
        nextPage !== undefined &&
        (Math.abs(pageWidthPt - nextWidthPt!) > 1 || Math.abs(pageHeightPt - nextHeightPt!) > 1);

      let pPrXml = "";
      if (nextDiffers) {
        pPrXml = `<w:pPr>
  <w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>
  <w:autoSpaceDE w:val="0"/>
  <w:autoSpaceDN w:val="0"/>
  <w:sectPr>
    <w:type w:val="nextPage"/>
    <w:pgSz w:w="${curWidthTwips}" w:h="${curHeightTwips}" w:orient="${curOrient}"/>
    <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>
  </w:sectPr>
</w:pPr>`;
      } else {
        const pageBreakBeforeXml =
          pIdx > 0 ? "<w:pageBreakBefore/>" : '<w:pageBreakBefore w:val="0"/>';
        pPrXml = `<w:pPr>
  ${pageBreakBeforeXml}
  <w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>
  <w:autoSpaceDE w:val="0"/>
  <w:autoSpaceDN w:val="0"/>
</w:pPr>`;
      }

      pageParagraphs.push(`<w:p>
  ${pPrXml}
  ${runsXml.join("\n  ")}
</w:p>`);
    }

    // Section properties (dynamic size and orientation for final section)
    const lastPage = doc.pages.length > 0 ? doc.pages[doc.pages.length - 1] : undefined;
    const lastWidthPt = lastPage ? (lastPage.bounds.width || doc.pageSize.widthPt) : doc.pageSize.widthPt;
    const lastHeightPt = lastPage ? (lastPage.bounds.height || doc.pageSize.heightPt) : doc.pageSize.heightPt;
    const finalWidthTwips = ptToTwip(lastWidthPt);
    const finalHeightTwips = ptToTwip(lastHeightPt);
    const isLandscape = lastWidthPt > lastHeightPt;
    const orient = isLandscape ? "landscape" : "portrait";
    const sectPrXml = `<w:sectPr>
  <w:pgSz w:w="${finalWidthTwips}" w:h="${finalHeightTwips}" w:orient="${orient}"/>
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

    let rotDeg = 0;
    if (typeof elem.rotation === "number" && elem.rotation !== 0) {
      // If rotation is in radians (<= 2*PI) vs degrees, only apply to non-line elements
      rotDeg =
        Math.abs(elem.rotation) <= Math.PI * 2 + 0.01 && Math.abs(elem.rotation) < 6.5
          ? (-elem.rotation * 180) / Math.PI
          : elem.rotation;
    }
    const rotStyle =
      elem.type !== "line" && Math.abs(rotDeg) > 0.1
        ? `;rotation:${rotDeg.toFixed(2)}`
        : "";

    const hasText = !!(elem.textRuns && elem.textRuns.length > 0);

    // Precision typography wrapping:
    // Only elements designed as multi-line paragraphs or containing explicit newlines should auto-wrap.
    // Single-line labels, metrics, chips, badges, button texts, and auto-width elements must NOT wrap,
    // preventing Word DirectWrite font variance from dropping words into invisible/awkward second lines.
    let wrapStyle = "mso-wrap-style:none";
    if (hasText) {
      const isAutoWidth = elem.textAutoResize === "WIDTH_AND_HEIGHT";
      if (!isAutoWidth) {
        const hasHardNewline = elem.textRuns!.some((r) => r.text && /[\r\n]/.test(r.text));
        const maxFontSize = Math.max(...elem.textRuns!.map((r) => r.fontSizePt || 12));
        const firstLineHeight =
          elem.textRuns!.find((r) => r.lineHeightPt)?.lineHeightPt || maxFontSize * 1.25;
        const estimatedLines = elem.bounds.height / firstLineHeight;
        const totalChars = elem.textRuns!.reduce((sum, r) => sum + (r.text?.length || 0), 0);

        const isMultiLineBox =
          estimatedLines >= 1.45 ||
          hasHardNewline ||
          (totalChars >= 80 && elem.textAutoResize === "HEIGHT");

        if (isMultiLineBox) {
          wrapStyle = "mso-wrap-style:square";
        }
      }
    }

    const baseStyle = `position:absolute;left:0;top:0;margin-left:${x.toFixed(
      3
    )}pt;margin-top:${y.toFixed(3)}pt;width:${width.toFixed(
      3
    )}pt;height:${height.toFixed(
      3
    )}pt;z-index:${z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page;${wrapStyle}${rotStyle}`;

    const altAttr = elem.id ? `alt="${escapeXml(elem.id)}"` : "";
    const titleAttr = `o:title="${escapeXml(elem.name || elem.id || "")}"`;

    // 1. Line
    if (elem.type === "line") {
      const strokeColor = cleanHex(elem.style.strokeColor, "000000");
      const strokeW = elem.style.strokeWidth ? elem.style.strokeWidth.toFixed(2) : "1.00";
      const lineSpanX = width < 1 && height > 1 ? 0 : width;
      const lineSpanY = height <= 1 && width > 1 ? 0 : height;
      const dashChild = elem.style.strokeDashed ? '<v:stroke dashstyle="dash"/>' : "";
      return `<w:r>
  <w:pict>
    <v:line id="${shapeId}"
            ${altAttr}
            ${titleAttr}
            from="${x.toFixed(3)}pt,${y.toFixed(3)}pt"
            to="${(x + lineSpanX).toFixed(3)}pt,${(y + lineSpanY).toFixed(3)}pt"
            style="position:absolute;z-index:${z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page"
            strokecolor="#${strokeColor}"
            strokeweight="${strokeW}pt">${dashChild}</v:line>
  </w:pict>
</w:r>`;
    }

    // 1b. Vector Shape
    if (elem.type === "vector") {
      const allOpenSubpaths =
        elem.vectorSubpaths &&
        elem.vectorSubpaths.length > 0 &&
        elem.vectorSubpaths.every((sp) => !sp.closed);
      const hasFill = !!elem.style.fillColor && elem.style.fillColor !== "none" && !allOpenSubpaths;
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

      const dashChild = hasStroke && elem.style.strokeDashed ? '<v:stroke dashstyle="dash"/>' : "";
      const opacityChild =
        hasFill && elem.style.fillOpacity !== undefined && elem.style.fillOpacity < 1
          ? `<v:fill opacity="${elem.style.fillOpacity.toFixed(2)}"/>`
          : "";

      if (dashChild || opacityChild) {
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
             ${strokeweightAttr}>${dashChild}${opacityChild}</v:shape>
  </w:pict>
</w:r>`;
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
      let imgX = x;
      let imgY = y;
      let imgBoxW = width;
      let imgBoxH = height;

      const res = resources && elem.imageRef ? resources[elem.imageRef] : undefined;
      let imgW = 0;
      let imgH = 0;
      if (res && res.data && res.data.length > 24) {
        const d = res.data;
        const readU32 = (off: number) =>
          ((d[off] << 24) >>> 0) + (d[off + 1] << 16) + (d[off + 2] << 8) + d[off + 3];
        const readU16 = (off: number) =>
          (d[off] << 8) | d[off + 1];

        // PNG check: 89 50 4E 47
        if (
          d[0] === 0x89 &&
          d[1] === 0x50 &&
          d[2] === 0x4e &&
          d[3] === 0x47
        ) {
          imgW = readU32(16);
          imgH = readU32(20);
        } else if (d[0] === 0xff && d[1] === 0xd8) {
          // Basic JPEG SOF0/SOF2 marker parser
          let offset = 2;
          while (offset < d.length - 8) {
            const marker = readU16(offset);
            offset += 2;
            if (marker === 0xffc0 || marker === 0xffc2) {
              imgH = readU16(offset + 3);
              imgW = readU16(offset + 5);
              break;
            }
            const len = readU16(offset);
            offset += len;
          }
        }
      }

      if (elem.imageCrop) {
        const ct = Math.round(Math.max(0, Math.min(0.95, elem.imageCrop.top)) * 65536);
        const cb = Math.round(Math.max(0, Math.min(0.95, elem.imageCrop.bottom)) * 65536);
        const cl = Math.round(Math.max(0, Math.min(0.95, elem.imageCrop.left)) * 65536);
        const cr = Math.round(Math.max(0, Math.min(0.95, elem.imageCrop.right)) * 65536);
        const parts: string[] = [];
        if (ct > 0) parts.push(`croptop="${ct}f"`);
        if (cb > 0) parts.push(`cropbottom="${cb}f"`);
        if (cl > 0) parts.push(`cropleft="${cl}f"`);
        if (cr > 0) parts.push(`cropright="${cr}f"`);
        if (parts.length > 0) {
          cropAttr = " " + parts.join(" ");
        }
      } else if (elem.imageScaleMode === "FIT" && imgW > 0 && imgH > 0 && width > 0 && height > 0) {
        const arImg = imgW / imgH;
        const arBox = width / height;
        if (arImg > arBox) {
          imgBoxW = width;
          imgBoxH = width / arImg;
          imgY = y + (height - imgBoxH) / 2;
        } else {
          imgBoxH = height;
          imgBoxW = height * arImg;
          imgX = x + (width - imgBoxW) / 2;
        }
      } else if (imgW > 0 && imgH > 0 && width > 0 && height > 0) {
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

      const imgStyle = `position:absolute;left:0;top:0;margin-left:${imgX.toFixed(
        3
      )}pt;margin-top:${imgY.toFixed(3)}pt;width:${imgBoxW.toFixed(
        3
      )}pt;height:${imgBoxH.toFixed(
        3
      )}pt;z-index:${z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none${rotStyle}`;

      return `<w:r>
  <w:pict>
    <v:shape id="${shapeId}"
             ${altAttr}
             ${titleAttr}
             style="${imgStyle}"
             filled="f"
             stroked="f">
      <v:imagedata r:id="${relId}"${cropAttr} o:title="${escapeXml(elem.name || "image")}"/>
    </v:shape>
  </w:pict>
</w:r>`;
    }

    // 3. Card or Text
    const isText = elem.type === "text" || (elem.textRuns && elem.textRuns.length > 0);
    const hasFill = !!elem.style.fillColor && elem.style.fillColor !== "none";
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
    const minDim = Math.max(1e-3, Math.min(width, height));
    const arcsizeAttr = isRound
      ? `arcsize="${Math.min(0.5, (elem.style.cornerRadius || 0) / minDim).toFixed(3)}"`
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
        const letterSpacingTwips =
          typeof run.letterSpacingPt === "number" && run.letterSpacingPt !== 0
            ? ptToTwip(run.letterSpacingPt)
            : 0;
        const letterSpacingXml =
          letterSpacingTwips !== 0 ? `<w:spacing w:val="${letterSpacingTwips}"/>` : "";

        const lines = run.text.split(/\r\n|\r|\n/);
        const textParts = lines.map((l) => `<w:t xml:space="preserve">${escapeXml(l)}</w:t>`);
        const textXml = textParts.join("<w:br/>");

        runsXml.push(`<w:r>
  <w:rPr>
    <w:rFonts w:ascii="${fontAscii}" w:hAnsi="${fontAscii}" w:eastAsia="${fontEastAsia}" w:cs="${fontAscii}"/>
    <w:sz w:val="${fontSizeHalfPt}"/>
    <w:szCs w:val="${fontSizeHalfPt}"/>
    <w:color w:val="${colorHex}"/>
    ${letterSpacingXml}
    ${boldXml}
    ${italicXml}
    ${uXml}
    ${strikeXml}
  </w:rPr>
  ${textXml}
</w:r>`);
      }

      const pad = elem.innerPaddingPt || {};
      const padTop = pad.top ?? 0;
      const padRight = pad.right ?? 0;
      const padBottom = pad.bottom ?? 0;
      const padLeft = pad.left ?? 0;
      const insetAttr = `inset="${padLeft.toFixed(2)}pt,${padTop.toFixed(2)}pt,${padRight.toFixed(2)}pt,${padBottom.toFixed(2)}pt"`;

      const firstLineHeight = elem.textRuns.find((r) => r.lineHeightPt)?.lineHeightPt;
      const maxFontSize = Math.max(...elem.textRuns.map((r) => r.fontSizePt || 12));
      const isPureText = elem.type === "text" && !hasFill && !hasStroke;

      // Auto-fit height for pure text elements (or elements with auto-resize), fixed height for cards/buttons
      const shouldFitHeight =
        isPureText ||
        elem.textAutoResize === "HEIGHT" ||
        elem.textAutoResize === "WIDTH_AND_HEIGHT";
      const fitTextAttr =
        shouldFitHeight && !hasFill && !hasStroke
          ? "mso-fit-shape-to-text:t"
          : "mso-fit-shape-to-text:f";

      const isTightLine = !!(firstLineHeight && firstLineHeight < maxFontSize * 1.25);
      const lineRule = isTightLine ? "atLeast" : "exact";

      const spacingXml = firstLineHeight
        ? `<w:spacing w:before="0" w:after="0" w:line="${Math.round(firstLineHeight * 20)}" w:lineRule="${lineRule}"/>`
        : `<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>`;

      const vAnchor = elem.verticalAlign === "center" ? "v-text-anchor:middle" : elem.verticalAlign === "bottom" ? "v-text-anchor:bottom" : "v-text-anchor:top";
      textboxContentXml = `
      <v:textbox style="${fitTextAttr};mso-next-textbox:none;${vAnchor}" ${insetAttr}>
        <w:txbxContent>
          <w:p>
            <w:pPr>
              <w:jc w:val="${jcVal}"/>
              ${spacingXml}
              <w:contextualSpacing w:val="0"/>
              <w:autoSpaceDE w:val="0"/>
              <w:autoSpaceDN w:val="0"/>
            </w:pPr>
            ${runsXml.join("\n            ")}
          </w:p>
        </w:txbxContent>
      </v:textbox>`;
    }

    const dashChild = hasStroke && elem.style.strokeDashed ? '<v:stroke dashstyle="dash"/>' : "";
    const opacityChild =
      hasFill && elem.style.fillOpacity !== undefined && elem.style.fillOpacity < 1
        ? `<v:fill opacity="${elem.style.fillOpacity.toFixed(2)}"/>`
        : "";

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
            ${arcsizeAttr}>${dashChild}${opacityChild}${textboxContentXml}
    </${tag}>
  </w:pict>
</w:r>`;
  }
}
