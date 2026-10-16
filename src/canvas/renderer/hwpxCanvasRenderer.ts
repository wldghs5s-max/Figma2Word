import JSZip from "jszip";
import {
  CanvasDocument,
  CanvasPage,
  CanvasElement,
  CanvasTextRun,
  CanvasResource,
  ptToHwpu,
} from "../types.js";
import { SvgPath } from "../geometry/svgPathParser.js";

export interface HwpxCanvasRendererOptions {
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

interface CharPrKey {
  fontId: number;
  fontSizePt: number;
  colorHex: string;
  bold: boolean;
  italic: boolean;
}

export class HwpxCanvasRenderer {
  private creator: string;

  constructor(options?: HwpxCanvasRendererOptions) {
    this.creator = options?.creator || "Figma2Word Canvas Engine";
  }

  public async buildZip(doc: CanvasDocument): Promise<JSZip> {
    const zip = new JSZip();

    // 1. mimetype (MUST be first entry, STORED uncompressed, 19 bytes)
    zip.file("mimetype", "application/hwp+zip", {
      compression: "STORE",
    });

    // 2. version.xml & settings.xml
    zip.file("version.xml", this.buildVersionXml());
    zip.file("settings.xml", this.buildSettingsXml());

    // 3. META-INF/container.xml
    zip.file("META-INF/container.xml", this.buildContainerXml());

    // 4. BinData/
    const imageBinMap = new Map<string, { binId: string; ext: string; mimeType: string }>();
    let binCounter = 1;

    for (const [resId, res] of Object.entries(doc.resources)) {
      const binId = `BIN${binCounter.toString().padStart(4, "0")}`;
      const isJpeg =
        res.mimeType === "image/jpeg" ||
        res.mimeType === "image/jpg" ||
        (res.data && res.data.length >= 3 && res.data[0] === 0xff && res.data[1] === 0xd8);
      const ext = isJpeg ? "jpg" : "png";
      const mimeType = isJpeg ? "image/jpeg" : "image/png";
      const binFileName = `${binId}.${ext}`;
      imageBinMap.set(resId, { binId, ext, mimeType });
      zip.file(`BinData/${binFileName}`, res.data);
      binCounter++;
    }

    // 5. META-INF/manifest.xml & Contents/content.hpf
    zip.file("META-INF/manifest.xml", this.buildManifestXml(imageBinMap));
    zip.file("Contents/content.hpf", this.buildContentHpf(doc, imageBinMap));

    // 6. Dynamic Font Registry (7 OWPML languages)
    const fontRegistry = new Map<string, number>();
    fontRegistry.set("맑은 고딕", 0); // Default fallback at index 0

    for (const page of doc.pages) {
      for (const elem of page.elements) {
        if (elem.textRuns) {
          for (const run of elem.textRuns) {
            const font = run.fontFamily?.trim() || "맑은 고딕";
            if (!fontRegistry.has(font)) {
              fontRegistry.set(font, fontRegistry.size);
            }
          }
        }
      }
    }

    // Dynamic style registries
    const charPrRegistry = new Map<string, number>(); // serializedKey -> id
    const charPrList: { id: number; key: CharPrKey }[] = [];

    const getCharPrId = (run: CanvasTextRun): number => {
      const font = run.fontFamily?.trim() || "맑은 고딕";
      const fontId = fontRegistry.get(font) ?? 0;
      const key: CharPrKey = {
        fontId,
        fontSizePt: Math.round((run.fontSizePt || 10) * 10) / 10,
        colorHex: cleanHex(run.color, "000000"),
        bold: (run.fontWeight || 400) >= 600,
        italic: !!run.italic,
      };
      const serialized = `${fontId}_${key.fontSizePt}_${key.colorHex}_${key.bold}_${key.italic}`;
      if (charPrRegistry.has(serialized)) {
        return charPrRegistry.get(serialized)!;
      }
      const newId = charPrList.length;
      charPrRegistry.set(serialized, newId);
      charPrList.push({ id: newId, key });
      return newId;
    };

    // 7. Contents/section0.xml (builds shapes & populates charPrRegistry)
    const section0Xml = this.buildSection0Xml(doc, imageBinMap, getCharPrId);
    zip.file("Contents/section0.xml", section0Xml);

    // 8. Contents/header.xml (outputs registered fontfaces & charPr styles)
    zip.file("Contents/header.xml", this.buildHeaderXml(charPrList, fontRegistry));

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
      type: "application/hwp+zip",
    });
  }

  public async renderToBuffer(doc: CanvasDocument): Promise<Buffer> {
    const uint8 = await this.renderToUint8Array(doc);
    return Buffer.from(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  }

  private buildVersionXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.2" application="Hancom Office Hangul" appVersion="10, 0, 0, 7888 WIN32LEWindows_8"/>`.trim();
  }

  private buildSettingsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app">
  <ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>
</ha:HWPApplicationSetting>`.trim();
  }

  private buildContainerXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
  </rootfiles>
</container>`.trim();
  }

  private buildManifestXml(
    imageBinMap: Map<string, { binId: string; ext: string; mimeType: string }>
  ): string {
    let items = `  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/hwp+zip"/>
  <manifest:file-entry manifest:full-path="Contents/content.hpf" manifest:media-type="application/hwpml-package+xml"/>
  <manifest:file-entry manifest:full-path="Contents/header.xml" manifest:media-type="application/xml"/>
  <manifest:file-entry manifest:full-path="Contents/section0.xml" manifest:media-type="application/xml"/>
  <manifest:file-entry manifest:full-path="settings.xml" manifest:media-type="application/xml"/>`;

    for (const { binId, ext, mimeType } of imageBinMap.values()) {
      items += `\n  <manifest:file-entry manifest:full-path="BinData/${binId}.${ext}" manifest:media-type="${mimeType}"/>`;
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
${items}
</manifest:manifest>`.trim();
  }

  private buildContentHpf(
    doc: CanvasDocument,
    imageBinMap: Map<string, { binId: string; ext: string; mimeType: string }>
  ): string {
    let binItems = "";
    for (const { binId, ext, mimeType } of imageBinMap.values()) {
      binItems += `\n    <opf:item id="${binId}" href="BinData/${binId}.${ext}" media-type="${mimeType}" isEmbeded="1"/>`;
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="1.2" unique-identifier="bookid">
  <opf:metadata>
    <opf:title>${escapeXml(doc.title)}</opf:title>
    <opf:language>ko</opf:language>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>${binItems}
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="header"/>
    <opf:itemref idref="section0"/>
  </opf:spine>
</opf:package>`.trim();
  }

  private buildHeaderXml(
    charPrList: { id: number; key: CharPrKey }[],
    fontRegistry: Map<string, number>
  ): string {
    let charPrEntries = "";
    for (const { id, key } of charPrList) {
      const heightHwpu = Math.round(key.fontSizePt * 100);
      const boldAttr = key.bold ? ' bold="1"' : "";
      const italicAttr = key.italic ? ' italic="1"' : "";
      charPrEntries += `\n    <hh:charPr id="${id}" height="${heightHwpu}" textColor="#${key.colorHex}" shadeColor="none" useFontSpace="1" useKerning="1" symMark="NONE" borderFillIDRef="1"${boldAttr}${italicAttr}>
      <hh:fontRef hangul="${key.fontId}" latin="${key.fontId}" hanja="${key.fontId}" japanese="${key.fontId}" other="${key.fontId}" symbol="${key.fontId}" user="${key.fontId}"/>
      <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
    </hh:charPr>`;
    }

    if (charPrList.length === 0) {
      charPrEntries = `\n    <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="1" useKerning="1" symMark="NONE" borderFillIDRef="1">
      <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
    </hh:charPr>`;
    }

    const langs = ["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"];
    const fontCnt = fontRegistry.size;
    const fontXmlEntries = Array.from(fontRegistry.entries())
      .map(([face, id]) => `<hh:font id="${id}" face="${escapeXml(face)}" type="TTF" isEmbedded="0"/>`)
      .join("\n        ");

    const fontfaceBlocks = langs
      .map(
        (lang) => `<hh:fontface lang="${lang}" fontCnt="${fontCnt}">
        ${fontXmlEntries}
      </hh:fontface>`
      )
      .join("\n      ");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.0">
  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
  <hh:refList>
    <hh:fontfaces itemCnt="7">
      ${fontfaceBlocks}
    </hh:fontfaces>
    <hh:borderFills itemCnt="1">
      <hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
        <hh:slash type="NONE" Crooked="0" isCounter="0"/>
        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
        <hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:diagonal type="NONE" width="0.1 mm" color="#000000"/>
        <hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/></hc:fillBrush>
      </hh:borderFill>
    </hh:borderFills>
    <hh:charProperties itemCnt="${Math.max(1, charPrList.length)}">${charPrEntries}
    </hh:charProperties>
    <hh:paraProperties itemCnt="4">
      <hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">
        <hh:align horizontal="LEFT" vertical="BASELINE"/>
        <hh:lineSpacing type="PERCENT" value="160" unit="PERCENT"/>
      </hh:paraPr>
      <hh:paraPr id="1" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">
        <hh:align horizontal="CENTER" vertical="BASELINE"/>
        <hh:lineSpacing type="PERCENT" value="160" unit="PERCENT"/>
      </hh:paraPr>
      <hh:paraPr id="2" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">
        <hh:align horizontal="RIGHT" vertical="BASELINE"/>
        <hh:lineSpacing type="PERCENT" value="160" unit="PERCENT"/>
      </hh:paraPr>
      <hh:paraPr id="3" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">
        <hh:align horizontal="JUSTIFY" vertical="BASELINE"/>
        <hh:lineSpacing type="PERCENT" value="160" unit="PERCENT"/>
      </hh:paraPr>
    </hh:paraProperties>
    <hh:styles itemCnt="1">
      <hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0"/>
    </hh:styles>
  </hh:refList>
</hh:head>`.trim();
  }

  private buildSection0Xml(
    doc: CanvasDocument,
    imageBinMap: Map<string, { binId: string; ext: string; mimeType: string }>,
    getCharPrId: (run: CanvasTextRun) => number
  ): string {
    const pageParas: string[] = [];
    let globalShapeId = 1;

    for (let pIdx = 0; pIdx < doc.pages.length; pIdx++) {
      const page = doc.pages[pIdx];
      const pageBreakAttr = pIdx === 0 ? ' pageBreak="0"' : ' pageBreak="1"';

      const shapesXml: string[] = [];

      // 1. Full-page background rect if specified
      if (page.backgroundColor) {
        const bgW = ptToHwpu(doc.pageSize?.widthPt || 595.28);
        const bgH = ptToHwpu(doc.pageSize?.heightPt || 841.89);
        shapesXml.push(
          `<hp:run><hp:rect id="${globalShapeId++}" zOrder="0" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${globalShapeId}" ratio="0">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="${bgW}" height="${bgH}"/>
  <hp:curSz width="${bgW}" height="${bgH}"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="${Math.round(bgW / 2)}" centerY="${Math.round(bgH / 2)}" rotateimage="1"/>
  <hp:renderingInfo>
    <hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:pos treatAsChar="0" horzRelTo="PAPER" vertRelTo="PAPER" horzAlign="LEFT" vertAlign="TOP" horzOffset="0" vertOffset="0"/>
  <hp:lineShape color="#000000" width="0" style="NONE" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
  <hc:fillBrush><hc:winBrush faceColor="#${cleanHex(page.backgroundColor)}" hatchColor="#999999" alpha="0"/></hc:fillBrush>
</hp:rect></hp:run>`
        );
      }

      // 2. Render all elements
      for (const elem of page.elements) {
        const rendered = this.renderElement(
          globalShapeId++,
          elem,
          imageBinMap,
          getCharPrId,
          doc.resources
        );
        if (rendered) {
          shapesXml.push(`<hp:run>${rendered}</hp:run>`);
        }
      }

      // Dynamic page size and orientation
      const isLandscape = doc.pageSize.widthPt > doc.pageSize.heightPt;
      const landscapeAttr = isLandscape ? "WIDELY" : "NARROWLY";
      const widthHwpu = Math.round(doc.pageSize.widthPt * 100);
      const heightHwpu = Math.round(doc.pageSize.heightPt * 100);

      // First page includes secPr
      const secPrXml =
        pIdx === 0
          ? `<hp:secPr id="0" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0">
  <hp:grid char="0" line="0"/>
  <hp:startNum pageStartsOn="BOTH" page="1" pic="1" tbl="1" equation="1"/>
  <hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>
  <hp:pagePr landscape="${landscapeAttr}" width="${widthHwpu}" height="${heightHwpu}" gutterType="LEFT_ONLY">
    <hp:margin header="0" footer="0" gutter="0" left="0" right="0" top="0" bottom="0"/>
  </hp:pagePr>
</hp:secPr>`
          : "";

      pageParas.push(`<hp:p id="${pIdx}" paraPrIDRef="0" styleIDRef="0"${pageBreakAttr} columnBreak="0" merged="0">
  ${secPrXml}
  ${shapesXml.join("\n  ")}
</hp:p>`);
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"
        xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"
        xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  ${pageParas.join("\n  ")}
</hs:sec>`.trim();
  }

  private renderElement(
    shapeId: number,
    elem: CanvasElement,
    imageBinMap: Map<string, { binId: string; ext: string; mimeType: string }>,
    getCharPrId: (run: CanvasTextRun) => number,
    resources?: Record<string, CanvasResource>
  ): string {
    const xHwpu = ptToHwpu(elem.bounds.x);
    const yHwpu = ptToHwpu(elem.bounds.y);
    const wHwpu = Math.max(100, ptToHwpu(elem.bounds.width));
    const hHwpu = Math.max(100, ptToHwpu(elem.bounds.height));
    const zOrder = elem.zIndex;

    // 1. Image with exact FILL Cover Crop & Aspect Ratio Clipping
    if (elem.type === "image" && elem.imageRef) {
      const binEntry = imageBinMap.get(elem.imageRef);
      if (binEntry) {
        const binId = binEntry.binId;
        const res = resources?.[elem.imageRef];
        let imgW = 0;
        let imgH = 0;

        if (res && res.data) {
          const d = res.data;
          const readU16 = (off: number) => ((d[off] || 0) << 8) | (d[off + 1] || 0);
          const readU32 = (off: number) =>
            (((d[off] || 0) << 24) >>> 0) +
            ((d[off + 1] || 0) << 16) +
            ((d[off + 2] || 0) << 8) +
            (d[off + 3] || 0);

          if (d.length >= 24 && d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47) {
            imgW = readU32(16);
            imgH = readU32(20);
          } else if (d.length >= 4 && d[0] === 0xff && d[1] === 0xd8) {
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

        let dimW = wHwpu;
        let dimH = hHwpu;
        let clipLeft = 0;
        let clipRight = wHwpu;
        let clipTop = 0;
        let clipBottom = hHwpu;

        if (imgW > 0 && imgH > 0) {
          dimW = Math.round(imgW * 100);
          dimH = Math.round(imgH * 100);
          const arImg = imgW / imgH;
          const arBox = wHwpu / hHwpu;

          if (arImg > arBox * 1.01) {
            // Image is wider than container: crop left & right
            const visW = dimH * arBox;
            const cropX = (dimW - visW) / 2.0;
            clipLeft = Math.round(cropX);
            clipRight = Math.round(dimW - cropX);
            clipTop = 0;
            clipBottom = dimH;
          } else if (arImg < arBox * 0.99) {
            // Image is taller than container: crop top & bottom
            const visH = dimW / arBox;
            const cropY = (dimH - visH) / 2.0;
            clipLeft = 0;
            clipRight = dimW;
            clipTop = Math.round(cropY);
            clipBottom = Math.round(dimH - cropY);
          } else {
            clipLeft = 0;
            clipRight = dimW;
            clipTop = 0;
            clipBottom = dimH;
          }
        }

        return `<hp:pic id="${shapeId}" zOrder="${zOrder}" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${shapeId}" ratio="0">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="${wHwpu}" height="${hHwpu}"/>
  <hp:curSz width="${wHwpu}" height="${hHwpu}"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="${Math.round(wHwpu / 2)}" centerY="${Math.round(hHwpu / 2)}" rotateimage="1"/>
  <hp:renderingInfo>
    <hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:pos treatAsChar="0" horzRelTo="PAPER" vertRelTo="PAPER" horzAlign="LEFT" vertAlign="TOP" horzOffset="${xHwpu}" vertOffset="${yHwpu}"/>
  <hp:lineShape color="#000000" width="0" style="NONE" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
  <hp:imgRect pt0_x="0" pt0_y="0" pt1_x="${wHwpu}" pt1_y="0" pt2_x="${wHwpu}" pt2_y="${hHwpu}" pt3_x="0" pt3_y="${hHwpu}"/>
  <hp:imgClip left="${clipLeft}" right="${clipRight}" top="${clipTop}" bottom="${clipBottom}"/>
  <hp:inImgDim dimwidth="${dimW}" dimheight="${dimH}"/>
  <hc:img binRef="${binId}"/>
</hp:pic>`;
      }
    }

    // 2. Card / Rect / Textbox
    const isText = elem.type === "text" || (elem.textRuns && elem.textRuns.length > 0);
    const hasFill = !!elem.style.fillColor;
    const hasStroke = !!elem.style.strokeColor && (elem.style.strokeWidth || 0) > 0;

    const lineStyle = hasStroke ? "SOLID" : "NONE";
    const lineColor = hasStroke ? `#${cleanHex(elem.style.strokeColor)}` : "#000000";
    const lineWidth = hasStroke ? Math.round((elem.style.strokeWidth || 1) * 10).toString() : "0";

    const fillBrush = hasFill
      ? `<hc:fillBrush><hc:winBrush faceColor="#${cleanHex(elem.style.fillColor)}" hatchColor="#999999" alpha="0"/></hc:fillBrush>`
      : `<hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/></hc:fillBrush>`;

    const isLine = elem.type === "line";
    const shapeW = isLine ? Math.max(10, wHwpu) : wHwpu;
    const shapeH = isLine ? Math.max(10, hHwpu) : hHwpu;

    let drawTextPart = "";
    if (isText && elem.textRuns && elem.textRuns.length > 0) {
      let paraPrId = 0;
      if (elem.paragraphAlign === "center") paraPrId = 1;
      else if (elem.paragraphAlign === "right") paraPrId = 2;
      else if (elem.paragraphAlign === "justify") paraPrId = 3;

      // Split runs across lines into separate paragraphs
      const paragraphs: Array<Array<{ charPrId: number; text: string }>> = [[]];

      for (const run of elem.textRuns) {
        const charPrId = getCharPrId(run);
        const lines = run.text.split(/\r\n|\r|\n/);
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            paragraphs.push([]);
          }
          if (lines[i].length > 0 || lines.length === 1) {
            paragraphs[paragraphs.length - 1].push({ charPrId, text: lines[i] });
          }
        }
      }

      const parasXml: string[] = paragraphs.map((paraRuns, pIdx) => {
        const runsStr =
          paraRuns.length > 0
            ? paraRuns
                .map((r) => `<hp:run charPrIDRef="${r.charPrId}"><hp:t>${escapeXml(r.text)}</hp:t></hp:run>`)
                .join("")
            : `<hp:run charPrIDRef="0"><hp:t/></hp:run>`;
        return `<hp:p id="${pIdx}" paraPrIDRef="${paraPrId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${runsStr}</hp:p>`;
      });

      const drawName = escapeXml(elem.name || elem.id || "");
      const vertAlignAttr =
        elem.verticalAlign === "center" ? "CENTER" : elem.verticalAlign === "bottom" ? "BOTTOM" : "TOP";

      drawTextPart = `
  <hp:drawText lastWidth="${shapeW}" name="${drawName}" editable="1">
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="SQUEEZE" vertAlign="${vertAlignAttr}" linkListIDRef="0" linkListNextIDRef="0" textWidth="${shapeW}" textHeight="${shapeH}" hasTextRef="0" hasNumRef="0">
      ${parasXml.join("\n      ")}
    </hp:subList>
  </hp:drawText>`;
    }

    // 3. Vector Shape (KS X 6101 native hp:polygon with multi-subpath and open-path support)
    if (elem.type === "vector") {
      let subpaths = elem.vectorSubpaths;
      if (!subpaths || subpaths.length === 0) {
        if (elem.rawSvgPath) {
          subpaths = SvgPath.parse(elem.rawSvgPath).toHwpxSubpathsWithClosed(shapeW, shapeH);
        } else if (elem.vectorPoints && elem.vectorPoints.length > 0) {
          subpaths = [{ points: elem.vectorPoints, closed: true }];
        }
      }

      if (subpaths && subpaths.length > 0) {
        const renderedPolygons = subpaths.map((sp, idx) => {
          const subId = `${shapeId}_${idx + 1}`;
          const pts = sp.points;
          const ptXml =
            pts.length > 0
              ? pts.map((p) => `<hp:pt x="${p.x}" y="${p.y}"/>`).join("\n  ")
              : `<hp:pt x="0" y="0"/>\n  <hp:pt x="${shapeW}" y="0"/>\n  <hp:pt x="${shapeW}" y="${shapeH}"/>\n  <hp:pt x="0" y="${shapeH}"/>`;

          const subFillBrush =
            sp.closed && hasFill
              ? fillBrush
              : `<hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/></hc:fillBrush>`;

          return `<hp:polygon id="${subId}" zOrder="${zOrder}" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${subId}" ratio="0">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="${shapeW}" height="${shapeH}"/>
  <hp:curSz width="${shapeW}" height="${shapeH}"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="${Math.round(shapeW / 2)}" centerY="${Math.round(shapeH / 2)}" rotateimage="1"/>
  <hp:renderingInfo>
    <hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:pos treatAsChar="0" horzRelTo="PAPER" vertRelTo="PAPER" horzAlign="LEFT" vertAlign="TOP" horzOffset="${xHwpu}" vertOffset="${yHwpu}"/>
  <hp:lineShape color="${lineColor}" width="${lineWidth}" style="${lineStyle}" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
  ${subFillBrush}
  ${ptXml}${idx === 0 ? drawTextPart : ""}
</hp:polygon>`;
        });

        return renderedPolygons.join("\n</hp:run>\n<hp:run>");
      }
    }

    const isOval = elem.type === "oval";
    const shapeTag = isOval ? "hp:oval" : "hp:rect";
    const cornerRadius = elem.style?.cornerRadius || 0;
    const minDim = Math.min(elem.bounds.width, elem.bounds.height);
    const ratio =
      !isOval && cornerRadius > 0 && minDim > 0
        ? Math.min(100, Math.max(0, Math.round((cornerRadius / (minDim / 2)) * 100)))
        : 0;

    return `<${shapeTag} id="${shapeId}" zOrder="${zOrder}" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${shapeId}" ratio="${ratio}">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="${shapeW}" height="${shapeH}"/>
  <hp:curSz width="${shapeW}" height="${shapeH}"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="${Math.round(shapeW / 2)}" centerY="${Math.round(shapeH / 2)}" rotateimage="1"/>
  <hp:renderingInfo>
    <hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:pos treatAsChar="0" horzRelTo="PAPER" vertRelTo="PAPER" horzAlign="LEFT" vertAlign="TOP" horzOffset="${xHwpu}" vertOffset="${yHwpu}"/>
  <hp:lineShape color="${lineColor}" width="${lineWidth}" style="${lineStyle}" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
  ${fillBrush}${drawTextPart}
</${shapeTag}>`;
  }
}
