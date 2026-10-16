import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { FigmaCanvasParser } from "../../../../src/canvas/parser/figmaCanvasParser.js";
import { HwpxCanvasRenderer } from "../../../../src/canvas/renderer/hwpxCanvasRenderer.js";

interface ValidationResult {
  fixtureName: string;
  pageCount: number;
  elementCount: number;
  level1ZipValid: boolean;
  level1XmlWellFormed: boolean;
  level2CharPrRefsValid: boolean;
  level2BinRefsValid: boolean;
  level2RatioRangeValid: boolean;
  level2ImgDimUnitsValid: boolean;
  details: string[];
}

const FIXTURES = [
  "samples/synthetic-figma/single-page-brief.json",
  "samples/synthetic-figma/multi-page-report.json",
  "samples/synthetic-figma/image-centric-portfolio.json",
  "samples/synthetic-figma/text-centric-article.json",
  "samples/synthetic-figma/vector-centric-infographic.json",
  "samples/synthetic-figma/complex-nested-dashboard.json",
  "samples/synthetic-figma/table-card-hybrid.json",
  "samples/real-world/sample-a-proposal-doc.json",
  "samples/real-world/sample-e2e-card-grid.json",
];

async function validateHwpx() {
  console.log("=== Phase 17: HWPX Level 1 & Level 2 Semantic Audit ===");
  const results: ValidationResult[] = [];
  const renderer = new HwpxCanvasRenderer();

  for (const relPath of FIXTURES) {
    const fullPath = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`Skipping missing fixture: ${relPath}`);
      continue;
    }

    const rawJson = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    const fixtureName = path.basename(relPath, ".json");
    const parser = new FigmaCanvasParser({ titleOverride: fixtureName });
    const doc = parser.parse(rawJson);

    const hwpxBuf = await renderer.renderToBuffer(doc);
    const details: string[] = [];

    // Level 1: ZIP Packaging
    let level1ZipValid = false;
    let zip: JSZip | null = null;
    try {
      zip = await JSZip.loadAsync(hwpxBuf);
      const mimetype = await zip.file("mimetype")?.async("string");
      const hasManifest = zip.file("META-INF/manifest.xml") !== null;
      const hasHpf = zip.file("Contents/content.hpf") !== null;
      const hasHeader = zip.file("Contents/header.xml") !== null;
      const hasSec0 = zip.file("Contents/section0.xml") !== null;

      level1ZipValid = !!(mimetype?.includes("hwp") && hasManifest && hasHpf && hasHeader && hasSec0);
      details.push(`ZIP check: mimetype=${mimetype?.trim()}, manifest=${hasManifest}, header=${hasHeader}, sec0=${hasSec0}`);
    } catch (e: any) {
      details.push(`ZIP error: ${e.message}`);
    }

    // Level 1: XML Well-formedness
    let level1XmlWellFormed = false;
    let secXml = "";
    let headerXml = "";
    if (zip) {
      try {
        secXml = await zip.file("Contents/section0.xml")!.async("string");
        headerXml = await zip.file("Contents/header.xml")!.async("string");
        level1XmlWellFormed = secXml.startsWith("<?xml") && headerXml.startsWith("<?xml") && secXml.endsWith("</hs:sec>");
      } catch (e: any) {
        details.push(`XML read error: ${e.message}`);
      }
    }

    // Level 2: CharPr references
    let level2CharPrRefsValid = true;
    const charPrIds = new Set<string>();
    for (const m of headerXml.matchAll(/<hh:charPr\b[^>]*\bid="(\d+)"/g)) {
      charPrIds.add(m[1]);
    }
    for (const m of secXml.matchAll(/charPrIDRef="(\d+)"/g)) {
      if (!charPrIds.has(m[1])) {
        level2CharPrRefsValid = false;
        details.push(`Dangling charPrIDRef: ${m[1]}`);
      }
    }

    // Level 2: BinData references
    let level2BinRefsValid = true;
    for (const m of secXml.matchAll(/binaryItemIDRef="([^"]+)"/g)) {
      const binId = m[1];
      const foundInZip = Object.keys(zip?.files || {}).some((k) => k.includes(binId));
      if (!foundInZip) {
        level2BinRefsValid = false;
        details.push(`Missing BinData file in ZIP for: ${binId}`);
      }
    }

    // Level 2: Ratio Range (0-50)
    let level2RatioRangeValid = true;
    for (const m of secXml.matchAll(/<hp:rect\b[^>]*\bratio="(\d+)"/g)) {
      const r = parseInt(m[1], 10);
      if (r < 0 || r > 50) {
        level2RatioRangeValid = false;
        details.push(`Ratio out of bounds [0, 50]: ${r}`);
      }
    }

    // Level 2: ImgDim consistency
    let level2ImgDimUnitsValid = true;
    for (const m of secXml.matchAll(/<hp:imgDim\b[^>]*\bdimwidth="(\d+)"\s+dimheight="(\d+)"/g)) {
      const w = parseInt(m[1], 10);
      const h = parseInt(m[2], 10);
      if (w <= 0 || h <= 0) {
        level2ImgDimUnitsValid = false;
        details.push(`Invalid imgDim dimensions: ${w}x${h}`);
      }
    }

    const totalElems = doc.pages.reduce((acc, p) => acc + p.elements.length, 0);
    results.push({
      fixtureName,
      pageCount: doc.pages.length,
      elementCount: totalElems,
      level1ZipValid,
      level1XmlWellFormed,
      level2CharPrRefsValid,
      level2BinRefsValid,
      level2RatioRangeValid,
      level2ImgDimUnitsValid,
      details,
    });
  }

  console.table(
    results.map((r) => ({
      Fixture: r.fixtureName,
      Pages: r.pageCount,
      Elements: r.elementCount,
      L1_Zip: r.level1ZipValid ? "PASS" : "FAIL",
      L1_Xml: r.level1XmlWellFormed ? "PASS" : "FAIL",
      L2_CharPr: r.level2CharPrRefsValid ? "PASS" : "FAIL",
      L2_BinRef: r.level2BinRefsValid ? "PASS" : "FAIL",
      L2_Ratio: r.level2RatioRangeValid ? "PASS" : "FAIL",
      L2_ImgDim: r.level2ImgDimUnitsValid ? "PASS" : "FAIL",
    }))
  );

  const allPassed = results.every(
    (r) =>
      r.level1ZipValid &&
      r.level1XmlWellFormed &&
      r.level2CharPrRefsValid &&
      r.level2BinRefsValid &&
      r.level2RatioRangeValid &&
      r.level2ImgDimUnitsValid
  );

  if (allPassed) {
    console.log("\n>>> ALL FIXTURES PASSED HWPX LEVEL 1 & LEVEL 2 VALIDATION! <<<");
  } else {
    console.error("\n>>> SOME FIXTURES FAILED VALIDATION! <<<");
    process.exit(1);
  }
}

validateHwpx().catch((err) => {
  console.error(err);
  process.exit(1);
});
