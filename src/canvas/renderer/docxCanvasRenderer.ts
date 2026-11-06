import JSZip from "jszip";
import {
  CanvasDocument,
  CanvasPage,
  CanvasElement,
  CanvasTextRun,
  CanvasResource,
  CanvasBounds,
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

/**
 * Build a VML path for an ellipse clipped by a rectangle boundary,
 * preserving the exact original curvature and center of the ellipse without squishing.
 * Uses true cubic Bézier curves (`c` commands) for arcs and straight cut lines (`l` commands) for clipped edges.
 */
export function buildClippedEllipsePath(
  origBounds: CanvasBounds,
  clipBounds: CanvasBounds
): { coordsize: string; path: string; bounds: CanvasBounds } {
  const minX = Math.max(origBounds.x, clipBounds.x);
  const minY = Math.max(origBounds.y, clipBounds.y);
  const maxX = Math.min(origBounds.x + origBounds.width, clipBounds.x + clipBounds.width);
  const maxY = Math.min(origBounds.y + origBounds.height, clipBounds.y + clipBounds.height);
  const visW = Math.max(0.1, maxX - minX);
  const visH = Math.max(0.1, maxY - minY);

  const cx = origBounds.x + origBounds.width / 2;
  const cy = origBounds.y + origBounds.height / 2;
  const rx = origBounds.width / 2;
  const ry = origBounds.height / 2;

  const angles: number[] = [];
  const N = 16;
  for (let i = 0; i < N; i++) {
    angles.push((i * 2 * Math.PI) / N);
  }

  // Exact intersections with boundary lines
  function checkX(boundaryX: number) {
    if (rx <= 0) return;
    const dx = (boundaryX - cx) / rx;
    if (Math.abs(dx) <= 1) {
      const dy = Math.sqrt(Math.max(0, 1 - dx * dx));
      for (const sign of [-1, 1]) {
        const y = cy + sign * ry * dy;
        if (y >= minY - 1e-4 && y <= maxY + 1e-4) {
          let a = Math.atan2((y - cy) / (ry || 1), dx);
          if (a < 0) a += 2 * Math.PI;
          angles.push(a);
        }
      }
    }
  }

  function checkY(boundaryY: number) {
    if (ry <= 0) return;
    const dy = (boundaryY - cy) / ry;
    if (Math.abs(dy) <= 1) {
      const dx = Math.sqrt(Math.max(0, 1 - dy * dy));
      for (const sign of [-1, 1]) {
        const x = cx + sign * rx * dx;
        if (x >= minX - 1e-4 && x <= maxX + 1e-4) {
          let a = Math.atan2(dy, (x - cx) / (rx || 1));
          if (a < 0) a += 2 * Math.PI;
          angles.push(a);
        }
      }
    }
  }

  checkX(minX);
  checkX(maxX);
  checkY(minY);
  checkY(maxY);

  angles.sort((a, b) => a - b);
  const uniqueAngles: number[] = [];
  for (let i = 0; i < angles.length; i++) {
    if (i === 0 || angles[i] - angles[i - 1] > 1e-5) {
      uniqueAngles.push(angles[i]);
    }
  }

  function toClampedCoord(px: number, py: number): { x: number; y: number } {
    const cxClamped = Math.min(maxX, Math.max(minX, px));
    const cyClamped = Math.min(maxY, Math.max(minY, py));
    return {
      x: Math.round(((cxClamped - minX) / visW) * 1000),
      y: Math.round(((cyClamped - minY) / visH) * 1000),
    };
  }

  function toLocalCoord(px: number, py: number): { x: number; y: number } {
    return {
      x: Math.round(((px - minX) / visW) * 1000),
      y: Math.round(((py - minY) / visH) * 1000),
    };
  }

  function isInside(px: number, py: number): boolean {
    return px >= minX - 1e-3 && px <= maxX + 1e-3 && py >= minY - 1e-3 && py <= maxY + 1e-3;
  }

  type PathCmd =
    | { type: "m"; x: number; y: number }
    | { type: "l"; x: number; y: number }
    | { type: "c"; x1: number; y1: number; x2: number; y2: number; x: number; y: number };

  const commands: PathCmd[] = [];
  const startPt = toClampedCoord(cx + rx * Math.cos(uniqueAngles[0]), cy + ry * Math.sin(uniqueAngles[0]));
  commands.push({ type: "m", x: startPt.x, y: startPt.y });

  for (let i = 0; i < uniqueAngles.length; i++) {
    const a0 = uniqueAngles[i];
    const a1 = i === uniqueAngles.length - 1 ? uniqueAngles[0] + 2 * Math.PI : uniqueAngles[i + 1];
    const delta = a1 - a0;
    if (delta < 1e-5) continue;

    const midA = (a0 + a1) / 2;
    const midX = cx + rx * Math.cos(midA);
    const midY = cy + ry * Math.sin(midA);

    const p0x = cx + rx * Math.cos(a0);
    const p0y = cy + ry * Math.sin(a0);
    const p1x = cx + rx * Math.cos(a1);
    const p1y = cy + ry * Math.sin(a1);

    const segInside = isInside(midX, midY) || (isInside(p0x, p0y) && isInside(p1x, p1y));

    if (segInside) {
      const k = (4 / 3) * Math.tan(delta / 4);
      const cp1x = p0x + k * (-rx * Math.sin(a0));
      const cp1y = p0y + k * (ry * Math.cos(a0));
      const cp2x = p1x - k * (-rx * Math.sin(a1));
      const cp2y = p1y - k * (ry * Math.cos(a1));

      // Control points preserve true tangent without artificial clamping
      const lcp1 = toLocalCoord(cp1x, cp1y);
      const lcp2 = toLocalCoord(cp2x, cp2y);
      const lp1 = toClampedCoord(p1x, p1y);

      commands.push({
        type: "c",
        x1: lcp1.x,
        y1: lcp1.y,
        x2: lcp2.x,
        y2: lcp2.y,
        x: lp1.x,
        y: lp1.y,
      });
    } else {
      const lp1 = toClampedCoord(p1x, p1y);
      const lastCmd = commands[commands.length - 1];
      const lastX = lastCmd.x;
      const lastY = lastCmd.y;
      if (lp1.x !== lastX || lp1.y !== lastY) {
        if (lastCmd.type === "l" && commands.length >= 2) {
          const prevCmd = commands[commands.length - 2];
          const onEdgeX =
            (prevCmd.x === 0 && lastCmd.x === 0 && lp1.x === 0) ||
            (prevCmd.x === 1000 && lastCmd.x === 1000 && lp1.x === 1000);
          const onEdgeY =
            (prevCmd.y === 0 && lastCmd.y === 0 && lp1.y === 0) ||
            (prevCmd.y === 1000 && lastCmd.y === 1000 && lp1.y === 1000);
          if (onEdgeX || onEdgeY) {
            lastCmd.x = lp1.x;
            lastCmd.y = lp1.y;
            continue;
          }
        }
        commands.push({ type: "l", x: lp1.x, y: lp1.y });
      }
    }
  }

  const strCommands = commands.map((c) => {
    if (c.type === "m") return `m ${c.x},${c.y}`;
    if (c.type === "c") return `c ${c.x1},${c.y1},${c.x2},${c.y2},${c.x},${c.y}`;
    return `l ${c.x},${c.y}`;
  });
  strCommands.push("x e");

  return {
    coordsize: "1000,1000",
    path: strCommands.join(" "),
    bounds: { x: minX, y: minY, width: visW, height: visH },
  };
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

    for (const [resId, res] of Object.entries(doc.resources || {})) {
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

    let overrideEntries = "";
    for (const [resId, res] of Object.entries(doc.resources || {})) {
      const extIdx = resId.lastIndexOf(".");
      const hasExt = extIdx !== -1 && extIdx > 0;
      if (!hasExt) {
        let mime = res.mimeType || "image/png";
        if (mime.includes("jpeg") || mime.includes("jpg")) mime = "image/jpeg";
        else if (mime.includes("png")) mime = "image/png";
        overrideEntries += `\n  <Override PartName="/word/media/${resId}" ContentType="${mime}"/>`;
      }
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
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${overrideEntries}
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

      const curWidthTwips = ptToTwip(Math.min(1584, pageWidthPt));
      const curHeightTwips = ptToTwip(Math.min(1584, pageHeightPt));
      const curIsLandscape = pageWidthPt > pageHeightPt;
      const curOrient = curIsLandscape ? "landscape" : "portrait";

      const isLast = pIdx === doc.pages.length - 1;

      let pPrXml = "";
      if (!isLast) {
        // In Word VML drawing architecture, every page MUST be an isolated section
        // (<w:sectPr><w:type w:val="nextPage"/>...</w:sectPr>) so that Word establishes
        // a new drawing origin (0, 0) for absolute-positioned VML shapes.
        // Without this, adjacent pages with identical dimensions collapse onto the exact same canvas!
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
        // Final page paragraph has no sectPr in pPr (it will be at the end of body)
        pPrXml = `<w:pPr>
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
    const finalWidthTwips = ptToTwip(Math.min(1584, lastWidthPt));
    const finalHeightTwips = ptToTwip(Math.min(1584, lastHeightPt));
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

  private buildRoundedRectPath(
    wPt: number,
    hPt: number,
    radii: [number, number, number, number]
  ): { coordsize: string; path: string } {
    const M = 10;
    const W = Math.round(wPt * M);
    const H = Math.round(hPt * M);

    const maxR = Math.min(W / 2, H / 2);
    let rTL = Math.min(Math.max(0, Math.round(radii[0] * M)), maxR);
    let rTR = Math.min(Math.max(0, Math.round(radii[1] * M)), maxR);
    let rBR = Math.min(Math.max(0, Math.round(radii[2] * M)), maxR);
    let rBL = Math.min(Math.max(0, Math.round(radii[3] * M)), maxR);

    const K = 0.55228475;
    const commands: string[] = [];

    commands.push(`m ${rTL},0`);
    commands.push(`l ${W - rTR},0`);
    if (rTR > 0) {
      const kTR = Math.round(rTR * K);
      commands.push(`c ${W - rTR + kTR},0,${W},${rTR - kTR},${W},${rTR}`);
    }
    commands.push(`l ${W},${H - rBR}`);
    if (rBR > 0) {
      const kBR = Math.round(rBR * K);
      commands.push(`c ${W},${H - rBR + kBR},${W - rBR + kBR},${H},${W - rBR},${H}`);
    }
    commands.push(`l ${rBL},${H}`);
    if (rBL > 0) {
      const kBL = Math.round(rBL * K);
      commands.push(`c ${rBL - kBL},${H},0,${H - rBL + kBL},0,${H - rBL}`);
    }
    commands.push(`l 0,${rTL}`);
    if (rTL > 0) {
      const kTL = Math.round(rTL * K);
      commands.push(`c 0,${rTL - kTL},${rTL - kTL},0,${rTL},0`);
    }
    commands.push("x e");

    return {
      coordsize: `${W},${H}`,
      path: commands.join(" "),
    };
  }

  public buildClippedEllipsePath(
    origBounds: CanvasBounds,
    clipBounds: CanvasBounds
  ): { coordsize: string; path: string; bounds: CanvasBounds } {
    return buildClippedEllipsePath(origBounds, clipBounds);
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
        const evalHeight = elem.contentHeightPt || elem.bounds.height;
        const estimatedLines = evalHeight / firstLineHeight;
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

    // Subtle horizontal tolerance buffer for single-line text (wrapStyle === "mso-wrap-style:none"):
    // Word's DirectWrite / font substitution (e.g. Pretendard -> Malgun Gothic / Arial) can measure glyphs 1-3% wider than Figma.
    // Adding a minor 2.5-5pt buffer avoids accidental single-word wrapping without altering visible design layout.
    // Optical center / right edge compensation: When widening the bounding box, adjust x so the optical
    // anchor (center or right) remains completely invariant in Word's paragraph flow.
    let effectiveWidth = width;
    let adjustedX = x;
    let buffer = 0;
    if (elem.type === "text" && elem.textAutoResize === "WIDTH_AND_HEIGHT") {
      buffer = Math.max(3, effectiveWidth * 0.03);
      effectiveWidth += buffer;
    } else if (hasText && wrapStyle === "mso-wrap-style:none") {
      buffer = Math.max(2, Math.min(8, effectiveWidth * 0.025));
      effectiveWidth += buffer;
    }

    if (buffer > 0) {
      if (elem.paragraphAlign === "center") {
        adjustedX -= buffer / 2;
      } else if (elem.paragraphAlign === "right") {
        adjustedX -= buffer;
      }
    }

    const renderW = elem.type === "vector" && effectiveWidth <= 0.01 && height > 0 ? (elem.style.strokeWidth ? Math.max(0.75, elem.style.strokeWidth) : 0.75) : effectiveWidth;
    const renderH = elem.type === "vector" && height <= 0.01 && effectiveWidth > 0 ? (elem.style.strokeWidth ? Math.max(0.75, elem.style.strokeWidth) : 0.75) : height;
    const baseStyle = `position:absolute;left:0;top:0;margin-left:${adjustedX.toFixed(
      3
    )}pt;margin-top:${y.toFixed(3)}pt;width:${renderW.toFixed(
      3
    )}pt;height:${renderH.toFixed(
      3
    )}pt;z-index:${z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page;${wrapStyle}${rotStyle}`;

    const altId = elem.sourceNodeId || elem.id;
    const altAttr = altId ? `alt="${escapeXml(altId)}"` : "";
    const titleAttr = `o:title="${escapeXml(elem.name || elem.sourceNodeId || elem.id || "")}"`;

    // 0. Table (<w:tbl> or positioned cell cards fallback)
    if (elem.type === "table" && elem.tableData) {
      const td = elem.tableData;
      const rowCount = td.rowCount || td.cells.length;
      const colCount = td.colCount || (td.cells[0]?.length ?? 0);
      const colWidths = td.colWidthsPt || [];
      const rowHeights = td.rowHeightsPt || [];

      const colXOffsets: number[] = [0];
      for (let c = 0; c < colCount; c++) {
        const cw = colWidths[c] || (renderW / Math.max(1, colCount));
        colXOffsets.push(colXOffsets[c] + cw);
      }

      const rowYOffsets: number[] = [0];
      for (let r = 0; r < rowCount; r++) {
        const firstCell = td.cells[r]?.[0];
        const rh = rowHeights[r] || firstCell?.heightPt || (renderH / Math.max(1, rowCount));
        rowYOffsets.push(rowYOffsets[r] + rh);
      }

      const occupied: boolean[][] = Array.from({ length: rowCount }, () => Array(colCount).fill(false));
      const renderedCells: string[] = [];
      let subIdx = 0;

      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
          if (occupied[r][c]) continue;
          const cell = td.cells[r]?.find((cellItem) => cellItem.col === c) || td.cells[r]?.[c];
          if (!cell) continue;

          const colSpan = Math.max(1, cell.colSpan || 1);
          const rowSpan = Math.max(1, cell.rowSpan || 1);

          for (let dr = 0; dr < rowSpan; dr++) {
            for (let dc = 0; dc < colSpan; dc++) {
              if (r + dr < rowCount && c + dc < colCount) {
                occupied[r + dr][c + dc] = true;
              }
            }
          }

          const cellX = adjustedX + colXOffsets[c];
          const cellY = y + rowYOffsets[r];
          const cellW = (colXOffsets[c + colSpan] ?? (colXOffsets[c] + (renderW / colCount))) - colXOffsets[c];
          const cellH = (rowYOffsets[r + rowSpan] ?? (rowYOffsets[r] + (renderH / rowCount))) - rowYOffsets[r];

          const cellTextRuns =
            cell.paragraphs && cell.paragraphs.length > 0
              ? cell.paragraphs.flatMap((p, idx) =>
                  idx > 0 ? [{ text: "\n" }, ...p] : p
                )
              : cell.textRuns;

          const cellElem: CanvasElement = {
            id: `${elem.id}_c_${r}_${c}`,
            name: `${elem.name || "Table"}_Cell_${r}_${c}`,
            type: "card",
            bounds: { x: cellX, y: cellY, width: cellW, height: cellH },
            zIndex: z + subIdx + 1,
            style: {
              fillColor: cell.backgroundColor,
              strokeColor: cell.borderColor || "#D0D5DD",
              strokeWidth: cell.borderWidth !== undefined ? cell.borderWidth : 1,
            },
            textRuns: cellTextRuns,
            paragraphAlign: cell.align,
            verticalAlign: cell.verticalAlign || (r === 0 ? "center" : "top"),
          };
          renderedCells.push(this.renderElement(pageIdx, elemIdx * 100 + subIdx, cellElem, imageRelMap, resources));
          subIdx++;
        }
      }
      return renderedCells.join("\n");
    }

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

      const elemOpacity = typeof elem.opacity === "number" ? elem.opacity : 1.0;
      const fillAlpha = (elem.style.fillOpacity ?? 1) * elemOpacity;
      const strokeOpacityAttr = hasStroke && elemOpacity < 1 ? ` opacity="${elemOpacity.toFixed(2)}"` : "";
      const dashChild = hasStroke && (elem.style.strokeDashed || elemOpacity < 1)
        ? `<v:stroke${elem.style.strokeDashed ? ' dashstyle="dash"' : ""}${strokeOpacityAttr}/>`
        : "";
      const opacityChild =
        hasFill && fillAlpha < 1
          ? `<v:fill opacity="${fillAlpha.toFixed(2)}"/>`
          : "";
      const shadowChild = elem.style.shadow
        ? `<v:shadow on="t" type="single" color="#${cleanHex(elem.style.shadow.color, "000000")}" offset="${(elem.style.shadow.offsetX || 0).toFixed(2)}pt,${(elem.style.shadow.offsetY || 0).toFixed(2)}pt"${typeof elem.style.shadow.opacity === "number" ? ` opacity="${elem.style.shadow.opacity.toFixed(2)}"` : ""}/>`
        : "";

      const pathChild = elem.fillRule === "evenodd" ? '<v:path fillrule="evenodd"/>' : "";

      const orig = elem.originalBounds;
      const isVectorClipped = !!(
        orig &&
        elem.clipBounds &&
        (orig.x < elem.clipBounds.x - 0.01 ||
          orig.y < elem.clipBounds.y - 0.01 ||
          orig.x + orig.width > elem.clipBounds.x + elem.clipBounds.width + 0.01 ||
          orig.y + orig.height > elem.clipBounds.y + elem.clipBounds.height + 0.01)
      );

      let vmlCoordAttrs = 'coordsize="1000,1000"';
      if (isVectorClipped && orig && orig.width > 0 && orig.height > 0) {
        const ox = Math.round(((adjustedX - orig.x) / orig.width) * 1000);
        const oy = Math.round(((y - orig.y) / orig.height) * 1000);
        const cw = Math.max(1, Math.round((renderW / orig.width) * 1000));
        const ch = Math.max(1, Math.round((renderH / orig.height) * 1000));
        vmlCoordAttrs = `coordorigin="${ox},${oy}" coordsize="${cw},${ch}"`;
      }

      // F-01: When fill and stroke geometries have distinct paths, emit discrete fill and stroke shapes
      if (elem.strokeVectorPath && elem.strokeVectorPath !== pathStr && hasFill && hasStroke) {
        const fillShape = `<v:shape id="${shapeId}" ${altAttr} ${titleAttr} style="${baseStyle}" ${vmlCoordAttrs} path="${pathStr}" filled="t" ${fillcolorAttr} stroked="f">${opacityChild}${pathChild}${shadowChild}</v:shape>`;
        const strokeShape = `<v:shape id="${shapeId}_s" ${altAttr} ${titleAttr} style="${baseStyle}" ${vmlCoordAttrs} path="${elem.strokeVectorPath}" filled="f" stroked="t" ${strokecolorAttr} ${strokeweightAttr}>${dashChild}</v:shape>`;
        return `<w:r>\n  <w:pict>\n    ${fillShape}\n    ${strokeShape}\n  </w:pict>\n</w:r>`;
      }

      if (dashChild || opacityChild || shadowChild || pathChild) {
        return `<w:r>
  <w:pict>
    <v:shape id="${shapeId}"
             ${altAttr}
             ${titleAttr}
             style="${baseStyle}"
             ${vmlCoordAttrs}
             path="${pathStr}"
             ${filledAttr}
             ${fillcolorAttr}
             ${strokedAttr}
             ${strokecolorAttr}
             ${strokeweightAttr}>${dashChild}${opacityChild}${shadowChild}${pathChild}</v:shape>
  </w:pict>
</w:r>`;
      }

      return `<w:r>
  <w:pict>
    <v:shape id="${shapeId}"
             ${altAttr}
             ${titleAttr}
             style="${baseStyle}"
             ${vmlCoordAttrs}
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

      let clipCropTop = 0;
      let clipCropBottom = 0;
      let clipCropLeft = 0;
      let clipCropRight = 0;

      if (elem.clipBounds && elem.originalBounds) {
        const orig = elem.originalBounds;
        if (orig.width > 0 && orig.height > 0) {
          if (imgX > orig.x + 0.01) {
            clipCropLeft = Math.max(0, Math.min(0.95, (imgX - orig.x) / orig.width));
          }
          if (imgY > orig.y + 0.01) {
            clipCropTop = Math.max(0, Math.min(0.95, (imgY - orig.y) / orig.height));
          }
          if (orig.x + orig.width > imgX + imgBoxW + 0.01) {
            clipCropRight = Math.max(0, Math.min(0.95, (orig.x + orig.width - (imgX + imgBoxW)) / orig.width));
          }
          if (orig.y + orig.height > imgY + imgBoxH + 0.01) {
            clipCropBottom = Math.max(0, Math.min(0.95, (orig.y + orig.height - (imgY + imgBoxH)) / orig.height));
          }
        }
      }

      if (elem.imageCrop) {
        const baseCrop = elem.imageCrop;
        const spanX = 1 - Math.max(0, Math.min(0.95, (baseCrop.left || 0) + (baseCrop.right || 0)));
        const spanY = 1 - Math.max(0, Math.min(0.95, (baseCrop.top || 0) + (baseCrop.bottom || 0)));
        const totalTop = (baseCrop.top || 0) + spanY * clipCropTop;
        const totalBottom = (baseCrop.bottom || 0) + spanY * clipCropBottom;
        const totalLeft = (baseCrop.left || 0) + spanX * clipCropLeft;
        const totalRight = (baseCrop.right || 0) + spanX * clipCropRight;

        const ct = Math.round(Math.max(0, Math.min(0.95, totalTop)) * 65536);
        const cb = Math.round(Math.max(0, Math.min(0.95, totalBottom)) * 65536);
        const cl = Math.round(Math.max(0, Math.min(0.95, totalLeft)) * 65536);
        const cr = Math.round(Math.max(0, Math.min(0.95, totalRight)) * 65536);
        const parts: string[] = [];
        if (ct > 0) parts.push(`croptop="${ct}f"`);
        if (cb > 0) parts.push(`cropbottom="${cb}f"`);
        if (cl > 0) parts.push(`cropleft="${cl}f"`);
        if (cr > 0) parts.push(`cropright="${cr}f"`);
        if (parts.length > 0) {
          cropAttr = " " + parts.join(" ");
        }
      } else if (clipCropTop > 0 || clipCropBottom > 0 || clipCropLeft > 0 || clipCropRight > 0) {
        const ct = Math.round(clipCropTop * 65536);
        const cb = Math.round(clipCropBottom * 65536);
        const cl = Math.round(clipCropLeft * 65536);
        const cr = Math.round(clipCropRight * 65536);
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
      } else if (elem.imageScaleMode !== "STRETCH" && imgW > 0 && imgH > 0 && width > 0 && height > 0) {
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

      const imgStyleObj = elem.style || {};
      const imgRadii = imgStyleObj.cornerRadii;
      const imgRadius = (imgRadii && imgRadii[0] > 0 ? imgRadii[0] : imgStyleObj.cornerRadius) || 0;
      const minImgDim = Math.max(1e-3, Math.min(imgBoxW, imgBoxH));

      let imgTag = "v:rect";
      let imgShapeExtraAttrs = "";
      if (imgRadius > 0) {
        imgTag = "v:roundrect";
        // Phase 31.1 Empirical Verification: Word for Mac native rendering renders
        // corner radius R = arcsize * minDim. The previous formula doubled R and saturated at min/4.
        imgShapeExtraAttrs = `arcsize="${Math.min(0.5, imgRadius / minImgDim).toFixed(3)}" `;
      }

      const imgHasFill = !!imgStyleObj.fillColor && imgStyleObj.fillColor !== "none";
      const imgFilledAttr = imgHasFill ? 'filled="t"' : 'filled="f"';
      const imgFillcolorAttr = imgHasFill ? ` fillcolor="#${cleanHex(imgStyleObj.fillColor)}"` : "";

      const imgHasStroke = !!imgStyleObj.strokeColor && (imgStyleObj.strokeWidth || 0) > 0;
      const imgStrokedAttr = imgHasStroke ? 'stroked="t"' : 'stroked="f"';
      const imgStrokecolorAttr = imgHasStroke ? `strokecolor="#${cleanHex(imgStyleObj.strokeColor)}"` : "";
      const imgStrokeweightAttr = imgHasStroke
        ? `strokeweight="${(imgStyleObj.strokeWidth || 1).toFixed(2)}pt"`
        : "";

      const imgShadowChild = imgStyleObj.shadow
        ? `<v:shadow on="t" type="single" color="#${cleanHex(
            imgStyleObj.shadow.color,
            "000000"
          )}" offset="${(imgStyleObj.shadow.offsetX || 0).toFixed(2)}pt,${(
            imgStyleObj.shadow.offsetY || 0
          ).toFixed(2)}pt"${
            typeof imgStyleObj.shadow.opacity === "number"
              ? ` opacity="${imgStyleObj.shadow.opacity.toFixed(2)}"`
              : ""
          }/>`
        : "";

      const imgDashChild = imgHasStroke && imgStyleObj.strokeDashed ? '<v:stroke dashstyle="dash"/>' : "";
      const imgElemOpacity = typeof elem.opacity === "number" ? elem.opacity : 1.0;
      const imgOpacityChild = imgElemOpacity < 1 ? `<v:fill opacity="${imgElemOpacity.toFixed(2)}"/>` : "";

      return `<w:r>
  <w:pict>
    <${imgTag} id="${shapeId}"
             ${altAttr}
             ${titleAttr}
             style="${imgStyle}"
             ${imgShapeExtraAttrs}${imgFilledAttr}${imgFillcolorAttr}
             ${imgStrokedAttr}
             ${imgStrokecolorAttr}
             ${imgStrokeweightAttr}>${imgDashChild}${imgOpacityChild}${imgShadowChild}
      <v:imagedata r:id="${relId}"${cropAttr} o:title="${escapeXml(elem.name || "image")}"/>
    </${imgTag}>
  </w:pict>
</w:r>`;
    }

    // 3. Card or Text
    const style = elem.style || {};
    const isText = elem.type === "text" || (elem.textRuns && elem.textRuns.length > 0);
    const hasFill = !!style.fillColor && style.fillColor !== "none";
    const hasStroke = !!style.strokeColor && (style.strokeWidth || 0) > 0;

    const filledAttr = hasFill ? 'filled="t"' : 'filled="f"';
    const fillcolorAttr = hasFill ? `fillcolor="#${cleanHex(style.fillColor)}"` : "";

    const strokedAttr = hasStroke ? 'stroked="t"' : 'stroked="f"';
    const strokecolorAttr = hasStroke ? `strokecolor="#${cleanHex(style.strokeColor)}"` : "";
    const strokeweightAttr = hasStroke
      ? `strokeweight="${(style.strokeWidth || 1).toFixed(2)}pt"`
      : "";

    // In VML, strokes are centered on the shape path. For INSIDE strokes (the Figma default),
    // insetting the shape bounds by strokeWidth / 2 aligns the outer stroke edge precisely to [x, y, width, height].
    let shapeX = adjustedX;
    let shapeY = y;
    let shapeW = effectiveWidth;
    let shapeH = height;
    if (!isText && (elem.type === "card" || elem.type === "oval") && hasStroke && style.strokeAlign === "INSIDE") {
      const strokeW = style.strokeWidth || 1;
      const halfStroke = strokeW / 2;
      shapeX = x + halfStroke;
      shapeY = y + halfStroke;
      shapeW = Math.max(0.1, width - strokeW);
      shapeH = Math.max(0.1, height - strokeW);
    }

    // Corner radius or Oval or Asymmetric or Clipped Oval
    const isOval = elem.type === "oval";
    const orig = elem.originalBounds;
    const isOvalClipped = !!(
      isOval &&
      orig &&
      elem.clipBounds &&
      (orig.x < elem.clipBounds.x - 0.01 ||
        orig.y < elem.clipBounds.y - 0.01 ||
        orig.x + orig.width > elem.clipBounds.x + elem.clipBounds.width + 0.01 ||
        orig.y + orig.height > elem.clipBounds.y + elem.clipBounds.height + 0.01)
    );

    let tag = isOval ? "v:oval" : "v:rect";
    let extraShapeAttrs = "";

    if (isOvalClipped && orig && elem.clipBounds) {
      const built = this.buildClippedEllipsePath(orig, elem.clipBounds);
      tag = "v:shape";
      extraShapeAttrs = `coordsize="${built.coordsize}" path="${built.path}" `;
      shapeX = built.bounds.x;
      shapeY = built.bounds.y;
      shapeW = built.bounds.width;
      shapeH = built.bounds.height;
    } else {
      let radii = style.cornerRadii;
      const isCardClipped = !!(
        !isOval &&
        orig &&
        elem.clipBounds &&
        (orig.x < elem.clipBounds.x - 0.01 ||
          orig.y < elem.clipBounds.y - 0.01 ||
          orig.x + orig.width > elem.clipBounds.x + elem.clipBounds.width + 0.01 ||
          orig.y + orig.height > elem.clipBounds.y + elem.clipBounds.height + 0.01)
      );

      if (isCardClipped && orig && elem.clipBounds) {
        let rArray: [number, number, number, number] | undefined = undefined;
        if (Array.isArray(radii) && radii.length === 4) {
          rArray = [...radii] as [number, number, number, number];
        } else if (style.cornerRadius && style.cornerRadius > 0) {
          const cr = style.cornerRadius;
          rArray = [cr, cr, cr, cr];
        }
        if (rArray) {
          const isLeftClipped = shapeX > orig.x + 0.1;
          const isTopClipped = shapeY > orig.y + 0.1;
          const isRightClipped = orig.x + orig.width > shapeX + shapeW + 0.1;
          const isBottomClipped = orig.y + orig.height > shapeY + shapeH + 0.1;

          if (isTopClipped || isLeftClipped) rArray[0] = 0;
          if (isTopClipped || isRightClipped) rArray[1] = 0;
          if (isBottomClipped || isRightClipped) rArray[2] = 0;
          if (isBottomClipped || isLeftClipped) rArray[3] = 0;
          radii = rArray;
        }
      }

      const isAsymmetric =
        !isOval &&
        Array.isArray(radii) &&
        radii.length === 4 &&
        !(radii[0] === radii[1] && radii[1] === radii[2] && radii[2] === radii[3]) &&
        radii.some((r) => r > 0);

      const minDim = Math.max(1e-3, Math.min(shapeW, shapeH));

      if (isAsymmetric && radii) {
        tag = "v:shape";
        const built = this.buildRoundedRectPath(shapeW, shapeH, radii);
        extraShapeAttrs = `coordsize="${built.coordsize}" path="${built.path}" `;
      } else if (!isOval) {
        const scalarRadius =
          (radii && radii[0] > 0 ? radii[0] : style.cornerRadius) || 0;
        const isRound = scalarRadius > 0;
        tag = isRound ? "v:roundrect" : "v:rect";
        if (isRound) {
          // Phase 31.1 Empirical Verification: Word for Mac native rendering renders
          // corner radius R = arcsize * minDim. The previous formula doubled R and saturated at min/4.
          extraShapeAttrs = `arcsize="${Math.min(
            0.5,
            minDim > 0 ? scalarRadius / minDim : 0
          ).toFixed(3)}" `;
        }
      }
    }

    const shapeStyle = `position:absolute;left:0;top:0;margin-left:${shapeX.toFixed(
      3
    )}pt;margin-top:${shapeY.toFixed(3)}pt;width:${shapeW.toFixed(
      3
    )}pt;height:${shapeH.toFixed(
      3
    )}pt;z-index:${z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page;${wrapStyle}${rotStyle}`;

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
      // For vertically centered elements (v-text-anchor:middle), keep fixed height so Word anchors to middle
      const shouldFitHeight =
        elem.verticalAlign !== "center" &&
        (isPureText ||
          elem.textAutoResize === "HEIGHT" ||
          elem.textAutoResize === "WIDTH_AND_HEIGHT");
      const fitTextAttr =
        shouldFitHeight && !hasFill && !hasStroke
          ? "mso-fit-shape-to-text:t"
          : "mso-fit-shape-to-text:f";

      const hasHardNewline = elem.textRuns.some((r) => r.text && /[\r\n]/.test(r.text));
      const isSingleLine =
        !hasHardNewline &&
        (elem.textAutoResize === "WIDTH_AND_HEIGHT" ||
          (elem.bounds.height > 0 &&
            firstLineHeight &&
            elem.bounds.height <= firstLineHeight * 1.45) ||
          (elem.bounds.height > 0 &&
            maxFontSize &&
            elem.bounds.height <= maxFontSize * 1.6));

      const isTightLine = !!(firstLineHeight && firstLineHeight < maxFontSize * 1.25);
      const isVerticallyCenteredSingleLine = elem.verticalAlign === "center" && isSingleLine;
      const lineRule = isTightLine || isVerticallyCenteredSingleLine ? "atLeast" : "exact";

      const spacingXml = firstLineHeight
        ? `<w:spacing w:before="0" w:after="0" w:line="${Math.round(firstLineHeight * 20)}" w:lineRule="${lineRule}"/>`
        : `<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>`;

      const vAnchor = elem.verticalAlign === "center" ? "v-text-anchor:middle" : elem.verticalAlign === "bottom" ? "v-text-anchor:bottom" : "v-text-anchor:top";
      // In OpenXML ECMA-376 Part 1 §17.3.1.44, disabling word wrap in paragraph properties is <w:wordWrap w:val="0"/>
      // (Note: <w:noWrap/> is only valid in table cell properties w:tcPr per §17.4.38 and causes Word corruption dialogs)
      const wordWrapXml = isSingleLine ? '<w:wordWrap w:val="0"/>\n              ' : "";
      textboxContentXml = `
      <v:textbox style="${fitTextAttr};mso-next-textbox:none;${vAnchor}" ${insetAttr}>
        <w:txbxContent>
          <w:p>
            <w:pPr>
              ${wordWrapXml}<w:jc w:val="${jcVal}"/>
              ${spacingXml}
              <w:contextualSpacing w:val="0"/>
              <w:autoSpaceDE w:val="0"/>
              <w:autoSpaceDN w:val="0"/>
              <w:snapToGrid w:val="0"/>
              <w:overflowPunct w:val="0"/>
            </w:pPr>
            ${runsXml.join("\n            ")}
          </w:p>
        </w:txbxContent>
      </v:textbox>`;
    }

    const elemOpacity = typeof elem.opacity === "number" ? elem.opacity : 1.0;
    const fillAlpha = (style.fillOpacity ?? 1) * elemOpacity;
    const strokeOpacityAttr = hasStroke && elemOpacity < 1 ? ` opacity="${elemOpacity.toFixed(2)}"` : "";
    const dashChild = hasStroke && (style.strokeDashed || elemOpacity < 1)
      ? `<v:stroke${style.strokeDashed ? ' dashstyle="dash"' : ""}${strokeOpacityAttr}/>`
      : "";
    const opacityChild =
      hasFill && fillAlpha < 1
        ? `<v:fill opacity="${fillAlpha.toFixed(2)}"/>`
        : "";
    const shadowChild = style.shadow
      ? `<v:shadow on="t" type="single" color="#${cleanHex(
          style.shadow.color,
          "000000"
        )}" offset="${(style.shadow.offsetX || 0).toFixed(2)}pt,${(
          style.shadow.offsetY || 0
        ).toFixed(2)}pt"${
          typeof style.shadow.opacity === "number"
            ? ` opacity="${style.shadow.opacity.toFixed(2)}"`
            : ""
        }/>`
      : "";

    return `<w:r>
  <w:pict>
    <${tag} id="${shapeId}"
            ${altAttr}
            ${titleAttr}
            style="${shapeStyle}"
            ${extraShapeAttrs}${filledAttr}
            ${fillcolorAttr}
            ${strokedAttr}
            ${strokecolorAttr}
            ${strokeweightAttr}>${dashChild}${opacityChild}${shadowChild}${textboxContentXml}
    </${tag}>
  </w:pict>
</w:r>`;
  }
}
