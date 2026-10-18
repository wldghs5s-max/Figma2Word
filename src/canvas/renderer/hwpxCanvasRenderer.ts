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
  underline: boolean;
  strike: boolean;
  letterSpacingPct: number;
}

interface ParaPrEntry {
  id: number;
  horizontal: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY";
  spacingType: "PERCENT" | "FIXED";
  spacingValue: number;
  spacingUnit: "PERCENT" | "HWPUNIT";
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

    for (const [resId, res] of Object.entries(doc.resources || {})) {
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
      const fontSizePt = Math.round((run.fontSizePt || 10) * 10) / 10;
      const letterSpacingPct =
        run.letterSpacingPt !== undefined && fontSizePt > 0
          ? Math.max(-50, Math.min(50, Math.round((run.letterSpacingPt / fontSizePt) * 100)))
          : 0;
      const key: CharPrKey = {
        fontId,
        fontSizePt,
        colorHex: cleanHex(run.color, "000000"),
        bold: (run.fontWeight || 400) >= 600,
        italic: !!run.italic,
        underline: !!run.underline,
        strike: !!run.strike,
        letterSpacingPct,
      };
      const serialized = `${fontId}_${key.fontSizePt}_${key.colorHex}_${key.bold}_${key.italic}_${key.underline}_${key.strike}_${key.letterSpacingPct}`;
      if (charPrRegistry.has(serialized)) {
        return charPrRegistry.get(serialized)!;
      }
      const newId = charPrList.length;
      charPrRegistry.set(serialized, newId);
      charPrList.push({ id: newId, key });
      return newId;
    };

    const paraPrList: ParaPrEntry[] = [
      { id: 0, horizontal: "LEFT", spacingType: "PERCENT", spacingValue: 160, spacingUnit: "PERCENT" },
      { id: 1, horizontal: "CENTER", spacingType: "PERCENT", spacingValue: 160, spacingUnit: "PERCENT" },
      { id: 2, horizontal: "RIGHT", spacingType: "PERCENT", spacingValue: 160, spacingUnit: "PERCENT" },
      { id: 3, horizontal: "JUSTIFY", spacingType: "PERCENT", spacingValue: 160, spacingUnit: "PERCENT" },
    ];
    const paraPrRegistry = new Map<string, number>([
      ["LEFT_PERCENT_160", 0],
      ["CENTER_PERCENT_160", 1],
      ["RIGHT_PERCENT_160", 2],
      ["JUSTIFY_PERCENT_160", 3],
    ]);

    const getParaPrId = (
      align?: "left" | "center" | "right" | "justify",
      lineHeightPt?: number
    ): number => {
      const horizontal: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY" =
        align === "center"
          ? "CENTER"
          : align === "right"
          ? "RIGHT"
          : align === "justify"
          ? "JUSTIFY"
          : "LEFT";
      if (!lineHeightPt || lineHeightPt <= 0) {
        return paraPrRegistry.get(`${horizontal}_PERCENT_160`) ?? 0;
      }
      const spacingValue = Math.max(100, Math.round(lineHeightPt * 100));
      const key = `${horizontal}_FIXED_${spacingValue}`;
      if (paraPrRegistry.has(key)) {
        return paraPrRegistry.get(key)!;
      }
      const newId = paraPrList.length;
      paraPrRegistry.set(key, newId);
      paraPrList.push({
        id: newId,
        horizontal,
        spacingType: "FIXED",
        spacingValue,
        spacingUnit: "HWPUNIT",
      });
      return newId;
    };

    // 7. Contents/section0.xml (builds shapes & populates charPrRegistry / paraPrRegistry)
    const section0Xml = this.buildSection0Xml(doc, imageBinMap, getCharPrId, getParaPrId);
    zip.file("Contents/section0.xml", section0Xml);

    // 8. Contents/header.xml (outputs registered fontfaces, charPr & paraPr styles)
    zip.file("Contents/header.xml", this.buildHeaderXml(charPrList, fontRegistry, paraPrList, 1));

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
    fontRegistry: Map<string, number>,
    paraPrList: ParaPrEntry[],
    secCnt: number = 1
  ): string {
    let charPrEntries = "";
    for (const { id, key } of charPrList) {
      const heightHwpu = Math.round(key.fontSizePt * 100);
      const boldAttr = key.bold ? ' bold="1"' : "";
      const italicAttr = key.italic ? ' italic="1"' : "";
      const ls = key.letterSpacingPct || 0;
      const underlineXml = key.underline
        ? `\n      <hh:underline type="BOTTOM" shape="SOLID" color="#${key.colorHex}"/>`
        : "";
      const strikeXml = key.strike
        ? `\n      <hh:strikeout shape="CONTINUOUS" color="#${key.colorHex}"/>`
        : "";
      charPrEntries += `\n    <hh:charPr id="${id}" height="${heightHwpu}" textColor="#${key.colorHex}" shadeColor="none" useFontSpace="1" useKerning="1" symMark="NONE" borderFillIDRef="1"${boldAttr}${italicAttr}>
      <hh:fontRef hangul="${key.fontId}" latin="${key.fontId}" hanja="${key.fontId}" japanese="${key.fontId}" other="${key.fontId}" symbol="${key.fontId}" user="${key.fontId}"/>
      <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:spacing hangul="${ls}" latin="${ls}" hanja="${ls}" japanese="${ls}" other="${ls}" symbol="${ls}" user="${ls}"/>
      <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${underlineXml}${strikeXml}
    </hh:charPr>`;
    }

    if (charPrList.length === 0) {
      charPrEntries = `\n    <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="1" useKerning="1" symMark="NONE" borderFillIDRef="1">
      <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:underline type="NONE" shape="SOLID" color="#000000"/>
      <hh:strikeout shape="NONE" color="#000000"/>
    </hh:charPr>`;
    }

    const paraPrEntries = paraPrList
      .map(
        (p) => `      <hh:paraPr id="${p.id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="0" suppressLineNumbers="0" checked="0">
        <hh:align horizontal="${p.horizontal}" vertical="BASELINE"/>
        <hh:heading type="NONE" idRef="0" level="0"/>
        <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
        <hh:autoSpacing eAsianEng="0" eAsianNum="0"/>
        <hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>
        <hh:lineSpacing type="${p.spacingType}" value="${p.spacingValue}" unit="${p.spacingUnit}"/>
        <hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>
      </hh:paraPr>`
      )
      .join("\n");

    const langs = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"];
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
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.2" secCnt="${secCnt}">
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
    <hh:paraProperties itemCnt="${paraPrList.length}">
${paraPrEntries}
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
    getCharPrId: (run: CanvasTextRun) => number,
    getParaPrId: (align?: "left" | "center" | "right" | "justify", lineHeightPt?: number) => number
  ): string {
    const pageParas: string[] = [];
    let globalShapeId = 1;
    const nextId = () => globalShapeId++;

    for (let pIdx = 0; pIdx < doc.pages.length; pIdx++) {
      const page = doc.pages[pIdx];
      const pageBreakAttr = pIdx === 0 ? ' pageBreak="0"' : ' pageBreak="1"';

      // Dynamic page size and orientation (per page)
      const pageWidthPt = page.bounds.width || doc.pageSize.widthPt || 595.28;
      const pageHeightPt = page.bounds.height || doc.pageSize.heightPt || 841.89;
      const isLandscape = pageWidthPt > pageHeightPt;
      // In KS X 6101 (OWPML): WIDELY = Portrait (세로), NARROWLY = Landscape (가로)
      const landscapeAttr = isLandscape ? "NARROWLY" : "WIDELY";
      // OWPML paper dimensions are strictly defined in portrait-base coordinates (width <= height)
      const baseWidthPt = isLandscape ? Math.min(pageWidthPt, pageHeightPt) : pageWidthPt;
      const baseHeightPt = isLandscape ? Math.max(pageWidthPt, pageHeightPt) : pageHeightPt;
      const widthHwpu = Math.round(baseWidthPt * 100);
      const heightHwpu = Math.round(baseHeightPt * 100);

      const shapesXml: string[] = [];

      // 1. Full-page background rect if specified
      if (page.backgroundColor) {
        const bgW = ptToHwpu(pageWidthPt);
        const bgH = ptToHwpu(pageHeightPt);
        const bgId = nextId();
        const bgRect = this.renderRectXml({
          id: bgId,
          zOrder: 0,
          x: 0,
          y: 0,
          w: bgW,
          h: bgH,
          fillColorHex: cleanHex(page.backgroundColor),
          lineColorHex: "000000",
          lineWidth: "0",
          lineStyle: "NONE",
          ratio: 0,
        });
        shapesXml.push(`<hp:run>${bgRect}</hp:run>`);
      }

      // 2. Render all elements
      for (const elem of page.elements) {
        const rendered = this.renderElement(
          nextId,
          elem,
          imageBinMap,
          getCharPrId,
          getParaPrId,
          doc.resources
        );
        for (const shapeXml of rendered) {
          shapesXml.push(`<hp:run>${shapeXml}</hp:run>`);
        }
      }

      // Section properties in hp:run inside the first hp:p (or on page orientation/dimension change)
      const prevPage = pIdx > 0 ? doc.pages[pIdx - 1] : undefined;
      const prevWidthPt = prevPage ? (prevPage.bounds.width || doc.pageSize.widthPt) : undefined;
      const prevHeightPt = prevPage ? (prevPage.bounds.height || doc.pageSize.heightPt) : undefined;
      const orientationChanged =
        prevWidthPt !== undefined &&
        (Math.abs(prevWidthPt - pageWidthPt) > 1 || Math.abs(prevHeightPt! - pageHeightPt) > 1);

      const secPrRunXml =
        pIdx === 0 || orientationChanged
          ? `<hp:run charPrIDRef="0">
      <hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">
        <hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>
        <hp:startNum pageStartsOn="BOTH" page="${pIdx + 1}" pic="1" tbl="1" equation="1"/>
        <hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="NONE" fill="NONE" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>
        <hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>
        <hp:pagePr landscape="${landscapeAttr}" width="${widthHwpu}" height="${heightHwpu}" gutterType="LEFT_ONLY">
          <hp:margin header="0" footer="0" gutter="0" left="0" right="0" top="0" bottom="0"/>
        </hp:pagePr>
        <hp:footNotePr>
          <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
          <hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>
          <hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/>
          <hp:numbering type="CONTINUOUS" newNum="1"/>
          <hp:placement place="EACH_COLUMN" beneathText="0"/>
        </hp:footNotePr>
        <hp:endNotePr>
          <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
          <hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>
          <hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>
          <hp:numbering type="CONTINUOUS" newNum="1"/>
          <hp:placement place="END_OF_DOCUMENT" beneathText="0"/>
        </hp:endNotePr>
        <hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="0" right="0" top="0" bottom="0"/>
        </hp:pageBorderFill>
      </hp:secPr>
      <hp:ctrl>
        <hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCnt="1" sameSz="1" sameGap="0"/>
      </hp:ctrl>
    </hp:run>`
          : "";

      const allRuns = [secPrRunXml, ...shapesXml].filter(Boolean);
      pageParas.push(`<hp:p id="${pIdx}" paraPrIDRef="0" styleIDRef="0"${pageBreakAttr} columnBreak="0" merged="0">
  ${allRuns.join("\n  ")}
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
    nextId: () => number,
    elem: CanvasElement,
    imageBinMap: Map<string, { binId: string; ext: string; mimeType: string }>,
    getCharPrId: (run: CanvasTextRun) => number,
    getParaPrId: (align?: "left" | "center" | "right" | "justify", lineHeightPt?: number) => number,
    resources?: Record<string, CanvasResource>
  ): string[] {
    const xHwpu = ptToHwpu(elem.bounds.x);
    const yHwpu = ptToHwpu(elem.bounds.y);
    const wHwpu = Math.max(100, ptToHwpu(elem.bounds.width));
    const hHwpu = Math.max(100, ptToHwpu(elem.bounds.height));
    const zOrder = elem.zIndex;

    // 1. Image with FILL Cover Crop, Explicit CROP, or FIT Letterbox
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

        let picX = xHwpu;
        let picY = yHwpu;
        let picW = wHwpu;
        let picH = hHwpu;
        let dimW = imgW > 0 ? Math.round(imgW * 75) : wHwpu;
        let dimH = imgH > 0 ? Math.round(imgH * 75) : hHwpu;
        let clipLeft = 0;
        let clipRight = dimW;
        let clipTop = 0;
        let clipBottom = dimH;

        if (
          elem.imageCrop &&
          (elem.imageCrop.top > 0 ||
            elem.imageCrop.bottom > 0 ||
            elem.imageCrop.left > 0 ||
            elem.imageCrop.right > 0)
        ) {
          const cLeft = Math.max(0, Math.min(0.95, elem.imageCrop.left));
          const cRight = Math.max(0, Math.min(0.95, elem.imageCrop.right));
          const cTop = Math.max(0, Math.min(0.95, elem.imageCrop.top));
          const cBottom = Math.max(0, Math.min(0.95, elem.imageCrop.bottom));
          clipLeft = Math.round(dimW * cLeft);
          clipRight = Math.round(dimW * (1 - cRight));
          clipTop = Math.round(dimH * cTop);
          clipBottom = Math.round(dimH * (1 - cBottom));
        } else if (elem.imageScaleMode === "FIT" && imgW > 0 && imgH > 0) {
          const arImg = imgW / imgH;
          const arBox = wHwpu / hHwpu;
          if (arImg > arBox * 1.01) {
            picH = Math.max(100, Math.round(wHwpu / arImg));
            picY = Math.round(yHwpu + (hHwpu - picH) / 2);
          } else if (arImg < arBox * 0.99) {
            picW = Math.max(100, Math.round(hHwpu * arImg));
            picX = Math.round(xHwpu + (wHwpu - picW) / 2);
          }
          clipLeft = 0;
          clipRight = dimW;
          clipTop = 0;
          clipBottom = dimH;
        } else if (imgW > 0 && imgH > 0) {
          const arImg = imgW / imgH;
          const arBox = wHwpu / hHwpu;

          if (arImg > arBox * 1.01) {
            const visW = dimH * arBox;
            const cropX = (dimW - visW) / 2.0;
            clipLeft = Math.round(cropX);
            clipRight = Math.round(dimW - cropX);
            clipTop = 0;
            clipBottom = dimH;
          } else if (arImg < arBox * 0.99) {
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

        const picId = nextId();
        return [
          this.renderPicXml({
            id: picId,
            zOrder,
            x: picX,
            y: picY,
            w: picW,
            h: picH,
            binId,
            clipLeft,
            clipRight,
            clipTop,
            clipBottom,
            dimW,
            dimH,
          }),
        ];
      }
    }

    // 2. Line (Canonical representation: thin filled rect for H/V dividers matching authentic Hancom, or native hp:line)
    if (elem.type === "line") {
      const isHorizontal = elem.bounds.height <= 4 || elem.bounds.width >= elem.bounds.height * 2;
      const isVertical = elem.bounds.width <= 4 || elem.bounds.height >= elem.bounds.width * 2;
      const isSolid = !elem.style.strokeDashed;

      // Authentic Hancom standard: 100% of horizontal/vertical dividers are serialized as thin filled rectangles
      if ((isHorizontal || isVertical) && isSolid) {
        const rectId = nextId();
        const strokeColor = cleanHex(elem.style.strokeColor, "000000");
        const strokeWidthPt = elem.style.strokeWidth || 1;
        const strokeHwpu = Math.max(75, Math.round(strokeWidthPt * 100));

        const lineW = isHorizontal ? wHwpu : strokeHwpu;
        const lineH = isHorizontal ? strokeHwpu : hHwpu;

        return [
          this.renderRectXml({
            id: rectId,
            zOrder,
            x: xHwpu,
            y: yHwpu,
            w: lineW,
            h: lineH,
            fillColorHex: strokeColor,
            lineColorHex: "000000",
            lineWidth: "0",
            lineStyle: "NONE",
            ratio: 0,
          }),
        ];
      }

      // Otherwise render as native KS X 6101 / OWPML <hp:line> with valid startPt/endPt and isReverseHV="0"
      const lineId = nextId();
      const strokeColor = cleanHex(elem.style.strokeColor, "000000");
      const strokeW = Math.max(10, Math.round((elem.style.strokeWidth || 1) * 10)).toString();
      const strokeStyle = elem.style.strokeDashed ? "DASH" : "SOLID";
      const lineShapeW = Math.max(1, wHwpu);
      const lineShapeH = Math.max(0, hHwpu);
      return [
        this.renderLineXml({
          id: lineId,
          zOrder,
          x: xHwpu,
          y: yHwpu,
          w: lineShapeW,
          h: lineShapeH,
          startPt: { x: 0, y: 0 },
          endPt: { x: lineShapeW, y: lineShapeH },
          colorHex: strokeColor,
          width: strokeW,
          style: strokeStyle,
          endCap: "FLAT",
        }),
      ];
    }

    // Common text & style calculation
    const isText = elem.type === "text" || (elem.textRuns && elem.textRuns.length > 0);
    const hasFill = !!elem.style.fillColor;
    const hasStroke = !!elem.style.strokeColor && (elem.style.strokeWidth || 0) > 0;

    const lineStyle = hasStroke ? (elem.style.strokeDashed ? "DASH" : "SOLID") : "NONE";
    const lineColor = hasStroke ? cleanHex(elem.style.strokeColor, "000000") : "000000";
    const lineWidth = hasStroke ? Math.round((elem.style.strokeWidth || 1) * 10).toString() : "0";

    const fillBrushXml = hasFill
      ? `<hc:fillBrush><hc:winBrush faceColor="#${cleanHex(elem.style.fillColor)}" hatchColor="#999999" alpha="0"/></hc:fillBrush>`
      : `<hc:fillBrush/>`;

    const shapeW = wHwpu;
    const shapeH = hHwpu;

    let drawTextPart = "";
    if (isText && elem.textRuns && elem.textRuns.length > 0) {
      const firstLineHeightPt = elem.textRuns.find((r) => r.lineHeightPt && r.lineHeightPt > 0)?.lineHeightPt;
      const paraPrId = getParaPrId(elem.paragraphAlign, firstLineHeightPt);

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
      const cornerRadiusPt = elem.style?.cornerRadius || 0;
      const isPillOrBadge =
        (elem.bounds.height <= 36 || cornerRadiusPt >= elem.bounds.height / 3) && paragraphs.length <= 1;

      const vertAlignAttr =
        elem.verticalAlign === "center" || (hasFill && !elem.verticalAlign && isPillOrBadge)
          ? "CENTER"
          : elem.verticalAlign === "bottom"
          ? "BOTTOM"
          : "TOP";

      // Margin in OWPML textMargin: strictly use explicit innerPaddingPt, otherwise 0 matching authentic Hancom standard
      const marginL = elem.innerPaddingPt?.left ? ptToHwpu(elem.innerPaddingPt.left) : 0;
      const marginR = elem.innerPaddingPt?.right ? ptToHwpu(elem.innerPaddingPt.right) : 0;
      const marginT = elem.innerPaddingPt?.top ? ptToHwpu(elem.innerPaddingPt.top) : 0;
      const marginB = elem.innerPaddingPt?.bottom ? ptToHwpu(elem.innerPaddingPt.bottom) : 0;

      drawTextPart = `
  <hp:drawText lastWidth="${shapeW}" name="${drawName}" editable="1">
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${vertAlignAttr}" linkListIDRef="0" linkListNextIDRef="0" textWidth="${shapeW}" textHeight="0" hasTextRef="0" hasNumRef="0">
      ${parasXml.join("\n      ")}
    </hp:subList>
    <hp:textMargin left="${marginL}" right="${marginR}" top="${marginT}" bottom="${marginB}"/>
  </hp:drawText>`;
    }

    // 3. Vector Shape (KS X 6101 native hp:polygon for closed paths / hp:line for open subpaths)
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
        const renderedShapes: string[] = [];
        for (let idx = 0; idx < subpaths.length; idx++) {
          const sp = subpaths[idx];
          const pts = sp.points;

          // Open subpath: emit connected <hp:line> segments
          if (!sp.closed && pts.length >= 2) {
            const openStrokeColor = hasStroke
              ? lineColor
              : hasFill
              ? cleanHex(elem.style.fillColor, "000000")
              : "000000";
            const openStrokeWidth = hasStroke ? lineWidth : "15";
            const openStrokeStyle = elem.style.strokeDashed ? "DASH" : "SOLID";
            const endCap = pts.length > 2 ? "ROUND" : "FLAT";

            for (let segIdx = 0; segIdx < pts.length - 1; segIdx++) {
              const p0 = pts[segIdx];
              const p1 = pts[segIdx + 1];
              const lineId = nextId();
              renderedShapes.push(
                this.renderLineXml({
                  id: lineId,
                  zOrder,
                  x: xHwpu,
                  y: yHwpu,
                  w: shapeW,
                  h: shapeH,
                  p0: { x: p0.x, y: p0.y },
                  p1: { x: p1.x, y: p1.y },
                  colorHex: openStrokeColor,
                  width: openStrokeWidth,
                  style: openStrokeStyle,
                  endCap,
                })
              );
            }
            continue;
          }

          // Closed polygon
          const polyId = nextId();
          const subFillBrush =
            sp.closed && hasFill
              ? fillBrushXml
              : `<hc:fillBrush/>`;

          const polyPts =
            pts.length > 0
              ? pts
              : [
                  { x: 0, y: 0 },
                  { x: shapeW, y: 0 },
                  { x: shapeW, y: shapeH },
                  { x: 0, y: shapeH },
                ];

          renderedShapes.push(
            this.renderPolygonXml({
              id: polyId,
              zOrder,
              x: xHwpu,
              y: yHwpu,
              w: shapeW,
              h: shapeH,
              points: polyPts,
              colorHex: lineColor,
              width: lineWidth,
              style: lineStyle,
              fillBrushXml: subFillBrush,
              drawTextXml: idx === 0 ? drawTextPart : "",
            })
          );
        }

        return renderedShapes;
      }
    }

    // 4. Oval / Ellipse
    if (elem.type === "oval") {
      const ovalId = nextId();
      return [
        this.renderOvalXml({
          id: ovalId,
          zOrder,
          x: xHwpu,
          y: yHwpu,
          w: shapeW,
          h: shapeH,
          colorHex: lineColor,
          width: lineWidth,
          style: lineStyle,
          fillBrushXml,
          drawTextXml: drawTextPart,
        }),
      ];
    }

    // 5. Card / Rect / Textbox
    const cornerRadius = elem.style?.cornerRadius || 0;
    const minDim = Math.min(elem.bounds.width, elem.bounds.height);
    const ratio =
      cornerRadius > 0 && minDim > 0
        ? Math.min(50, Math.max(0, Math.round((cornerRadius / (minDim / 2)) * 50)))
        : 0;

    const rectId = nextId();
    return [
      this.renderRectXml({
        id: rectId,
        zOrder,
        x: xHwpu,
        y: yHwpu,
        w: shapeW,
        h: shapeH,
        lineColorHex: lineColor,
        lineWidth: lineWidth,
        lineStyle: lineStyle,
        colorHex: lineColor,
        width: lineWidth,
        style: lineStyle,
        fillBrushXml,
        drawTextXml: drawTextPart,
        ratio,
      }),
    ];
  }

  /**
   * Helper: Serializes <hp:rect> with strict KS X 6101 element sequence and coordinates
   */
  private renderRectXml(p: {
    id: number;
    zOrder: number;
    x: number;
    y: number;
    w: number;
    h: number;
    fillColorHex?: string;
    lineColorHex?: string;
    lineWidth?: string;
    lineStyle?: string;
    colorHex?: string;
    width?: string;
    style?: string;
    ratio: number;
    fillBrushXml?: string;
    drawTextXml?: string;
  }): string {
    const rawColor = p.lineColorHex || p.colorHex || "000000";
    const rawWidth = p.lineWidth || p.width || "0";
    const rawStyle = p.lineStyle || p.style || "NONE";

    const cleanLineColor = cleanHex(rawColor, "000000");
    const safeWidth = /^\d+$/.test(String(rawWidth).trim()) ? String(rawWidth).trim() : "0";
    const safeStyle = ["NONE", "SOLID", "DASH", "DOT", "DASH_DOT", "DASH_DOT_DOT"].includes(rawStyle)
      ? rawStyle
      : "NONE";

    const fillBrush =
      p.fillBrushXml ||
      (p.fillColorHex
        ? `<hc:fillBrush><hc:winBrush faceColor="#${cleanHex(p.fillColorHex)}" hatchColor="#999999" alpha="0"/></hc:fillBrush>`
        : `<hc:fillBrush/>`);

    const drawText = p.drawTextXml || "";

    return `<hp:rect id="${p.id}" zOrder="${p.zOrder}" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${p.id}" ratio="${p.ratio}">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="${p.w}" height="${p.h}"/>
  <hp:curSz width="${p.w}" height="${p.h}"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="${Math.round(p.w / 2)}" centerY="${Math.round(p.h / 2)}" rotateimage="1"/>
  <hp:renderingInfo>
    <hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:lineShape color="#${cleanLineColor}" width="${safeWidth}" style="${safeStyle}" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
  ${fillBrush}${drawText}
  <hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>
  <hc:pt0 x="0" y="0"/>
  <hc:pt1 x="${p.w}" y="0"/>
  <hc:pt2 x="${p.w}" y="${p.h}"/>
  <hc:pt3 x="0" y="${p.h}"/>
  <hp:sz width="${p.w}" height="${p.h}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="1" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="${p.y}" horzOffset="${p.x}"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
</hp:rect>`;
  }

  /**
   * Helper: Serializes <hp:ellipse> conforming to KS X 6101 and authentic Hancom documents
   */
  private renderOvalXml(p: {
    id: number;
    zOrder: number;
    x: number;
    y: number;
    w: number;
    h: number;
    colorHex: string;
    width: string;
    style: string;
    fillBrushXml: string;
    drawTextXml: string;
  }): string {
    const cx = Math.round(p.w / 2);
    const cy = Math.round(p.h / 2);

    const safeColor = cleanHex(p.colorHex, "000000");
    const safeWidth = /^\d+$/.test(String(p.width).trim()) ? String(p.width).trim() : "0";
    const safeStyle = ["NONE", "SOLID", "DASH", "DOT", "DASH_DOT", "DASH_DOT_DOT"].includes(p.style)
      ? p.style
      : "NONE";

    return `<hp:ellipse intervalDirty="0" hasArcPr="0" arcType="NORMAL" id="${p.id}" zOrder="${p.zOrder}" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${p.id}">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="${p.w}" height="${p.h}"/>
  <hp:curSz width="${p.w}" height="${p.h}"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="${cx}" centerY="${cy}" rotateimage="1"/>
  <hp:renderingInfo>
    <hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:lineShape color="#${safeColor}" width="${safeWidth}" style="${safeStyle}" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
  ${p.fillBrushXml}${p.drawTextXml}
  <hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>
  <hc:center x="${cx}" y="${cy}"/>
  <hc:ax1 x="${p.w}" y="${cy}"/>
  <hc:ax2 x="${cx}" y="${p.h}"/>
  <hc:start1 x="${p.w}" y="${cy}"/>
  <hc:end1 x="${p.w}" y="${cy}"/>
  <hc:start2 x="${p.w}" y="${cy}"/>
  <hc:end2 x="${p.w}" y="${cy}"/>
  <hp:sz width="${p.w}" height="${p.h}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="1" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="${p.y}" horzOffset="${p.x}"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
</hp:ellipse>`;
  }

  /**
   * Helper: Serializes <hp:line> with hc:startPt, hc:endPt conforming to OWPML LineType
   */
  private renderLineXml(p: {
    id: number;
    zOrder: number;
    x: number;
    y: number;
    w: number;
    h: number;
    startPt?: { x: number; y: number };
    endPt?: { x: number; y: number };
    p0?: { x: number; y: number };
    p1?: { x: number; y: number };
    colorHex: string;
    width: string;
    style: string;
    endCap: string;
  }): string {
    const safeColor = cleanHex(p.colorHex, "000000");
    const safeWidth = /^\d+$/.test(String(p.width).trim()) ? String(p.width).trim() : "10";
    const safeStyle = ["NONE", "SOLID", "DASH", "DOT", "DASH_DOT", "DASH_DOT_DOT"].includes(p.style)
      ? p.style
      : "SOLID";

    const startX = p.startPt?.x ?? p.p0?.x ?? 0;
    const startY = p.startPt?.y ?? p.p0?.y ?? 0;
    const endX = p.endPt?.x ?? p.p1?.x ?? p.w;
    const endY = p.endPt?.y ?? p.p1?.y ?? p.h;

    return `<hp:line id="${p.id}" zOrder="${p.zOrder}" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${p.id}" isReverseHV="0">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="${p.w}" height="${p.h}"/>
  <hp:curSz width="${p.w}" height="${p.h}"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="${Math.round(p.w / 2)}" centerY="${Math.round(p.h / 2)}" rotateimage="1"/>
  <hp:renderingInfo>
    <hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:lineShape color="#${safeColor}" width="${safeWidth}" style="${safeStyle}" endCap="${p.endCap}" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
  <hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>
  <hc:startPt x="${startX}" y="${startY}"/>
  <hc:endPt x="${endX}" y="${endY}"/>
  <hp:sz width="${p.w}" height="${p.h}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="1" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="${p.y}" horzOffset="${p.x}"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
</hp:line>`;
  }

  /**
   * Helper: Serializes <hp:polygon> with hc:pt list conforming to OWPML PolygonType
   */
  private renderPolygonXml(p: {
    id: number;
    zOrder: number;
    x: number;
    y: number;
    w: number;
    h: number;
    points: Array<{ x: number; y: number }>;
    colorHex: string;
    width: string;
    style: string;
    fillBrushXml: string;
    drawTextXml: string;
  }): string {
    const safeColor = cleanHex(p.colorHex, "000000");
    const safeWidth = /^\d+$/.test(String(p.width).trim()) ? String(p.width).trim() : "0";
    const safeStyle = ["NONE", "SOLID", "DASH", "DOT", "DASH_DOT", "DASH_DOT_DOT"].includes(p.style)
      ? p.style
      : "NONE";

    const closedPts = [...p.points];
    if (closedPts.length >= 3) {
      const first = closedPts[0];
      const last = closedPts[closedPts.length - 1];
      if (first.x !== last.x || first.y !== last.y) {
        closedPts.push({ x: first.x, y: first.y });
      }
    }

    const ptXml = closedPts.map((pt) => `<hc:pt x="${pt.x}" y="${pt.y}"/>`).join("\n  ");

    return `<hp:polygon id="${p.id}" zOrder="${p.zOrder}" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${p.id}">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="${p.w}" height="${p.h}"/>
  <hp:curSz width="${p.w}" height="${p.h}"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="${Math.round(p.w / 2)}" centerY="${Math.round(p.h / 2)}" rotateimage="1"/>
  <hp:renderingInfo>
    <hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:lineShape color="#${safeColor}" width="${safeWidth}" style="${safeStyle}" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
  ${p.fillBrushXml}${p.drawTextXml}
  <hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>
  ${ptXml}
  <hp:sz width="${p.w}" height="${p.h}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="1" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="${p.y}" horzOffset="${p.x}"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
</hp:polygon>`;
  }

  /**
   * Helper: Serializes <hp:pic> with nested imgRect points, imgClip, inMargin, imgDim, and hc:img
   */
  private renderPicXml(p: {
    id: number;
    zOrder: number;
    x: number;
    y: number;
    w: number;
    h: number;
    binId: string;
    clipLeft: number;
    clipRight: number;
    clipTop: number;
    clipBottom: number;
    dimW: number;
    dimH: number;
  }): string {
    return `<hp:pic id="${p.id}" zOrder="${p.zOrder}" numberingType="PICTURE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${p.id}" reverse="0">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="${p.w}" height="${p.h}"/>
  <hp:curSz width="${p.w}" height="${p.h}"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="${Math.round(p.w / 2)}" centerY="${Math.round(p.h / 2)}" rotateimage="1"/>
  <hp:renderingInfo>
    <hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:lineShape color="#000000" width="0" style="NONE" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
  <hp:imgRect>
    <hc:pt0 x="0" y="0"/>
    <hc:pt1 x="${p.w}" y="0"/>
    <hc:pt2 x="${p.w}" y="${p.h}"/>
    <hc:pt3 x="0" y="${p.h}"/>
  </hp:imgRect>
  <hp:imgClip left="${p.clipLeft}" right="${p.clipRight}" top="${p.clipTop}" bottom="${p.clipBottom}"/>
  <hp:inMargin left="0" right="0" top="0" bottom="0"/>
  <hp:imgDim dimwidth="${p.dimW}" dimheight="${p.dimH}"/>
  <hc:img binaryItemIDRef="${p.binId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>
  <hp:effects/>
  <hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>
  <hp:sz width="${p.w}" height="${p.h}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="1" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="${p.y}" horzOffset="${p.x}"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
</hp:pic>`;
  }
}
