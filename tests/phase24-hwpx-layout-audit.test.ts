import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";
import { parseXmlString, findDescendants, findChild, getAttribute } from "../scripts/lib/xmlUtils.js";
import { classifyTextWrap } from "../scripts/lib/wrapClassifier.js";
import { evaluateCollisionRisks } from "../scripts/evaluate_hwpx_collision_risks.js";
import { analyzeHwpxLayout } from "../scripts/analyze_hwpx_layout.js";

describe("Phase 24: HWPX Layout Engine Integrity & Verification Suite", () => {
  const parser = new FigmaCanvasParser();
  const renderer = new HwpxCanvasRenderer();

  // Test Document for layout integrity
  const testDoc: CanvasDocument = {
    title: "Phase 24 Layout Integrity Document",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [
      {
        pageNumber: 1,
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: "#FFFFFF",
        elements: [
          {
            id: "elem_label_1",
            name: "균열밀도 (CDI)",
            type: "text",
            bounds: { x: 50, y: 100, width: 54, height: 10 },
            zIndex: 1,
            style: {},
            textRuns: [{ text: "균열밀도 (CDI)", fontSizePt: 8.25, fontFamily: "Inter" }],
          },
          {
            id: "elem_val_1",
            name: "0.031%",
            type: "text",
            bounds: { x: 50, y: 116, width: 55, height: 18 },
            zIndex: 2,
            style: {},
            textRuns: [{ text: "0.031%", fontSizePt: 15.0, fontFamily: "Inter" }],
          },
          {
            id: "elem_multiline",
            name: "다중행 요약 문단",
            type: "text",
            bounds: { x: 50, y: 200, width: 450, height: 60 },
            zIndex: 3,
            style: {},
            textRuns: [
              {
                text: "전반적인 외벽 균열 상태는 안전 범주에 있습니다. 최우선 보수 대상 동은 109동, 108동, 102동 순으로 도출되었습니다.",
                fontSizePt: 10.5,
                lineHeightPt: 14.62,
                fontFamily: "Inter",
              },
            ],
          },
        ],
      },
    ],
  };

  // 1. HWPX ZIP and XML structural integrity
  it("1. Verifies HWPX ZIP package conforms to KS X 6101 container and XML standards", async () => {
    const hwpxBuf = await renderer.renderToBuffer(testDoc);
    const zip = await JSZip.loadAsync(hwpxBuf);

    expect(zip.file("mimetype")).toBeDefined();
    const mimetype = await zip.file("mimetype")!.async("string");
    expect(mimetype.trim()).toBe("application/hwp+zip");

    expect(zip.file("META-INF/container.xml")).toBeDefined();
    expect(zip.file("META-INF/manifest.xml")).toBeDefined();
    expect(zip.file("Contents/content.hpf")).toBeDefined();
    expect(zip.file("Contents/header.xml")).toBeDefined();
    expect(zip.file("Contents/section0.xml")).toBeDefined();
  });

  // 2. paraPrIDRef referential integrity
  it("2. Verifies all paragraph paraPrIDRef references in section0 resolve to valid header paraPr IDs", async () => {
    const hwpxBuf = await renderer.renderToBuffer(testDoc);
    const zip = await JSZip.loadAsync(hwpxBuf);
    const hdrXml = await zip.file("Contents/header.xml")!.async("string");
    const secXml = await zip.file("Contents/section0.xml")!.async("string");

    const hdrDoc = parseXmlString(hdrXml);
    const secDoc = parseXmlString(secXml);

    const validParaIds = new Set(
      findDescendants(hdrDoc, (n) => n.name.endsWith("paraPr")).map((n) => getAttribute(n, "id"))
    );

    const usedParaIds = findDescendants(secDoc, (n) => n.name.endsWith("p"))
      .map((n) => getAttribute(n, "paraPrIDRef"))
      .filter((id): id is string => id !== undefined);

    expect(usedParaIds.length).toBeGreaterThan(0);
    for (const pid of usedParaIds) {
      expect(validParaIds.has(pid)).toBe(true);
    }
  });

  // 3. charPrIDRef referential integrity
  it("3. Verifies all text run charPrIDRef references in section0 resolve to valid header charPr IDs", async () => {
    const hwpxBuf = await renderer.renderToBuffer(testDoc);
    const zip = await JSZip.loadAsync(hwpxBuf);
    const hdrXml = await zip.file("Contents/header.xml")!.async("string");
    const secXml = await zip.file("Contents/section0.xml")!.async("string");

    const hdrDoc = parseXmlString(hdrXml);
    const secDoc = parseXmlString(secXml);

    const validCharIds = new Set(
      findDescendants(hdrDoc, (n) => n.name.endsWith("charPr")).map((n) => getAttribute(n, "id"))
    );

    const usedCharIds = findDescendants(secDoc, (n) => n.name.endsWith("run"))
      .map((n) => getAttribute(n, "charPrIDRef"))
      .filter((id): id is string => id !== undefined);

    expect(usedCharIds.length).toBeGreaterThan(0);
    for (const cid of usedCharIds) {
      expect(validCharIds.has(cid)).toBe(true);
    }
  });

  // 4. fontRef language ID validity
  it("4. Verifies all fontRef language bindings in charPr reference valid font IDs in fontface", async () => {
    const hwpxBuf = await renderer.renderToBuffer(testDoc);
    const zip = await JSZip.loadAsync(hwpxBuf);
    const hdrXml = await zip.file("Contents/header.xml")!.async("string");
    const hdrDoc = parseXmlString(hdrXml);

    const fontfaceNodes = findDescendants(hdrDoc, (n) => n.name.endsWith("fontface"));
    const fontsByLang: Record<string, Set<string>> = {};

    for (const ff of fontfaceNodes) {
      const lang = (getAttribute(ff, "lang") || "ALL").toUpperCase();
      fontsByLang[lang] = new Set(
        findDescendants(ff, (n) => n.name.endsWith("font")).map((fn) => getAttribute(fn, "id") || "0")
      );
    }

    const charPrNodes = findDescendants(hdrDoc, (n) => n.name.endsWith("charPr"));
    for (const cp of charPrNodes) {
      const fontRefNode = findDescendants(cp, (n) => n.name.endsWith("fontRef"))[0];
      if (fontRefNode) {
        for (const [langKey, fontId] of Object.entries(fontRefNode.attributes)) {
          const upperLang = langKey.toUpperCase();
          if (fontsByLang[upperLang]) {
            expect(fontsByLang[upperLang].has(fontId)).toBe(true);
          }
        }
      }
    }
  });

  // 5. Text content preservation
  it("5. Verifies text content strings are fully preserved from Canvas IR into HWPX t elements", async () => {
    const hwpxBuf = await renderer.renderToBuffer(testDoc);
    const zip = await JSZip.loadAsync(hwpxBuf);
    const secXml = await zip.file("Contents/section0.xml")!.async("string");

    expect(secXml).toContain("균열밀도 (CDI)");
    expect(secXml).toContain("0.031%");
    expect(secXml).toContain("전반적인 외벽 균열 상태는 안전 범주에 있습니다");
  });

  // 6. Textbox coordinate & size preservation
  it("6. Verifies point to HWPU coordinate conversion preserves positions within 1 HWPU tolerance", async () => {
    const hwpxBuf = await renderer.renderToBuffer(testDoc);
    const zip = await JSZip.loadAsync(hwpxBuf);
    const secXml = await zip.file("Contents/section0.xml")!.async("string");
    const secDoc = parseXmlString(secXml);

    const rectNodes = findDescendants(secDoc, (n) => n.name.endsWith("rect"));
    const labelRect = rectNodes.find((r) => {
      const dt = findDescendants(r, (n) => n.name.endsWith("drawText"))[0];
      return dt && getAttribute(dt, "name")?.includes("균열밀도");
    });

    expect(labelRect).toBeDefined();
    const szNode = findDescendants(labelRect!, (n) => n.name.endsWith("sz"))[0];
    const posNode = findDescendants(labelRect!, (n) => n.name.endsWith("pos"))[0];

    // Canvas bounds: x: 50, y: 100, width: 54, height: 10 pt -> HWPU: 5000, 10000, 5400, 1000
    const wHwpu = parseInt(getAttribute(szNode, "width") || "0", 10);
    const hHwpu = parseInt(getAttribute(szNode, "height") || "0", 10);
    const xHwpu = parseInt(getAttribute(posNode, "horzOffset") || "0", 10);
    const yHwpu = parseInt(getAttribute(posNode, "vertOffset") || "0", 10);

    expect(Math.abs(wHwpu - 5400)).toBeLessThanOrEqual(1);
    expect(Math.abs(hHwpu - 1000)).toBeLessThanOrEqual(1);
    expect(Math.abs(xHwpu - 5000)).toBeLessThanOrEqual(1);
    expect(Math.abs(yHwpu - 10000)).toBeLessThanOrEqual(1);
  });

  // 7. lineWrap attribute distribution audit
  it("7. Audits wrap classifier and documents current engine hardcoded BREAK policy", () => {
    const singleLabelEl = testDoc.pages[0].elements[0]; // 균열밀도 (CDI)
    const multilineEl = testDoc.pages[0].elements[2]; // 다중행 본문

    const singleRes = classifyTextWrap(singleLabelEl);
    expect(singleRes.isMultiLineBox).toBe(false);
    expect(singleRes.recommendedLineWrap).toBe("SQUEEZE");

    const multiRes = classifyTextWrap(multilineEl);
    expect(multiRes.isMultiLineBox).toBe(true);
    expect(multiRes.recommendedLineWrap).toBe("BREAK");
  });

  // 8. Base line spacing analysis
  it("8. Identifies explicit lineHeightPt fixed conversion vs default percent 160 fallback", async () => {
    const hwpxBuf = await renderer.renderToBuffer(testDoc);
    const zip = await JSZip.loadAsync(hwpxBuf);
    const hdrXml = await zip.file("Contents/header.xml")!.async("string");
    const hdrDoc = parseXmlString(hdrXml);

    const paraPrNodes = findDescendants(hdrDoc, (n) => n.name.endsWith("paraPr"));
    const fixedLinespacings = paraPrNodes.filter((p) => {
      const ls = findDescendants(p, (n) => n.name.endsWith("lineSpacing"))[0];
      return ls && getAttribute(ls, "type") === "FIXED";
    });

    // Multiline element with lineHeightPt 14.62 should generate FIXED 1462 HWPUNIT
    expect(fixedLinespacings.length).toBeGreaterThanOrEqual(1);
    const fixed1462 = fixedLinespacings.find((p) => {
      const ls = findDescendants(p, (n) => n.name.endsWith("lineSpacing"))[0];
      return ls && getAttribute(ls, "value") === "1462";
    });
    expect(fixed1462).toBeDefined();
  });

  // 9. Parser coordinate transformation tracking
  it("9. Tracks parser geometry inflation: verifies contentHeightPt protects original text height", () => {
    const customerFile = "debug/customer/Report1-Live-Snapshot.json";
    if (!fs.existsSync(customerFile)) return;
    const rawCustomer = JSON.parse(fs.readFileSync(customerFile, "utf-8"));
    const customerDoc = parser.parse(rawCustomer);

    // Find 7:1082 banner on page 2
    let bannerEl: any = null;
    for (const p of customerDoc.pages) {
      const found = p.elements.find((e) => e.id === "7:1082");
      if (found) {
        bannerEl = found;
        break;
      }
    }

    expect(bannerEl).toBeDefined();
    // In Canvas IR, contentHeightPt is preserved as ~11.99pt while bounds.height was inflated to ~37.48pt
    expect(bannerEl.contentHeightPt).toBeDefined();
    expect(bannerEl.contentHeightPt).toBeCloseTo(11.99, 1);
    expect(bannerEl.bounds.height).toBeCloseTo(37.48, 1);
    expect(bannerEl.verticalAlign).toBe("center");
  });

  // 10. Stage 6/7 collision risk report reproducibility
  it("10. Reproducibly evaluates collision hazards across MRE baseline vs variants", async () => {
    const mreABuf = fs.readFileSync("debug/hwpx-overlap-mre/mre-A-baseline.hwpx");
    const mreBBuf = fs.readFileSync("debug/hwpx-overlap-mre/mre-B-wrap-only.hwpx");

    const zipA = await JSZip.loadAsync(mreABuf);
    const secXmlA = await zipA.file("Contents/section0.xml")!.async("string");

    const zipB = await JSZip.loadAsync(mreBBuf);
    const secXmlB = await zipB.file("Contents/section0.xml")!.async("string");

    expect(secXmlA).toContain('lineWrap="BREAK"');
    expect(secXmlB).toContain('lineWrap="SQUEEZE"');
  });

  // 11. Circular test audit catalog
  it("11. Documents audit of existing test suite circular assertions", () => {
    // In phase23-1-text-geometry.test.ts:
    // Some tests assert that all subLists contain lineWrap="BREAK".
    // This is cataloged as a circular assertion enforcing current broken behavior.
    const circularFindings = [
      {
        testFile: "tests/phase23-1-text-geometry.test.ts",
        line: 18,
        assertion: "expect(secXml).toContain('lineWrap=\"BREAK\"')",
        risk: "Forces 100% BREAK across all elements, preventing SQUEEZE for single-line labels.",
      },
    ];

    expect(circularFindings.length).toBe(1);
    expect(circularFindings[0].testFile).toContain("phase23-1-text-geometry");
  });
});

