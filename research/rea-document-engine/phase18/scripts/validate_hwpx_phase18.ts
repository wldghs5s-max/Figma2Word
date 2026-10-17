import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { FigmaCanvasParser } from "../../../../src/canvas/parser/figmaCanvasParser.js";
import { HwpxCanvasRenderer } from "../../../../src/canvas/renderer/hwpxCanvasRenderer.js";
import { DocxCanvasRenderer } from "../../../../src/canvas/renderer/docxCanvasRenderer.js";
import { DocxCanvasParser } from "../../../../src/canvas/parser/docxCanvasParser.js";

interface HwpxAuditResult {
  fixtureName: string;
  pageCount: number;
  elementCount: number;
  l1ZipValid: boolean;
  l1XmlWellFormed: boolean;
  l2CharPrRefsValid: boolean;
  l2ParaPrRefsValid: boolean;
  l2BinRefsValid: boolean;
  l2RatioRangeValid: boolean;
  l2ImgDimAndClipValid: boolean;
  l2InstIdConsistent: boolean;
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
  "samples/real-world/sample-b-nested-autolayout.json",
  "samples/real-world/sample-c-stress-absolute.json",
  "samples/real-world/sample-d-edge-cases.json",
  "samples/real-world/sample-e2e-card-grid.json",
  "samples/real-world/sample-e2e-complex-layout.json",
  "samples/real-world/sample-e2e-document.json",
  "debug/customer/Report1-Live-Snapshot.json",
  "debug/customer/Report2-Live-Snapshot.json",
  "debug/customer/Report3-Live-Snapshot.json",
];

async function runAudit() {
  console.log("=== Phase 18: HWPX Level 1 & Level 2 Deep Semantic & Schema Audit ===");
  const results: HwpxAuditResult[] = [];
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
    let l1ZipValid = false;
    let zip: JSZip | null = null;
    try {
      zip = await JSZip.loadAsync(hwpxBuf);
      const mimetype = await zip.file("mimetype")?.async("string");
      const hasManifest = zip.file("META-INF/manifest.xml") !== null;
      const hasHpf = zip.file("Contents/content.hpf") !== null;
      const hasHeader = zip.file("Contents/header.xml") !== null;
      const hasSec0 = zip.file("Contents/section0.xml") !== null;

      l1ZipValid = !!(
        mimetype?.trim() === "application/hwp+zip" &&
        hasManifest &&
        hasHpf &&
        hasHeader &&
        hasSec0
      );
    } catch (e: any) {
      details.push(`ZIP error: ${e.message}`);
    }

    // Level 1: XML Well-formedness
    let l1XmlWellFormed = false;
    let secXml = "";
    let headerXml = "";
    if (zip) {
      try {
        secXml = await zip.file("Contents/section0.xml")!.async("string");
        headerXml = await zip.file("Contents/header.xml")!.async("string");
        const openRuns = (secXml.match(/<hp:run\b/g) || []).length;
        const closeRuns = (secXml.match(/<\/hp:run>/g) || []).length;
        l1XmlWellFormed =
          secXml.startsWith("<?xml") &&
          headerXml.startsWith("<?xml") &&
          secXml.endsWith("</hs:sec>") &&
          headerXml.endsWith("</hh:head>") &&
          openRuns === closeRuns;
        if (openRuns !== closeRuns) {
          details.push(`Mismatched <hp:run> tags: open=${openRuns}, close=${closeRuns}`);
        }
      } catch (e: any) {
        details.push(`XML read error: ${e.message}`);
      }
    }

    // Level 2: CharPr references
    let l2CharPrRefsValid = true;
    const charPrIds = new Set<string>();
    for (const m of headerXml.matchAll(/<hh:charPr\b[^>]*\bid="(\d+)"/g)) {
      charPrIds.add(m[1]);
    }
    for (const m of secXml.matchAll(/charPrIDRef="(\d+)"/g)) {
      if (!charPrIds.has(m[1])) {
        l2CharPrRefsValid = false;
        details.push(`Dangling charPrIDRef: ${m[1]}`);
      }
    }

    // Level 2: ParaPr references
    let l2ParaPrRefsValid = true;
    const paraPrIds = new Set<string>();
    for (const m of headerXml.matchAll(/<hh:paraPr\b[^>]*\bid="(\d+)"/g)) {
      paraPrIds.add(m[1]);
    }
    for (const m of secXml.matchAll(/paraPrIDRef="(\d+)"/g)) {
      if (!paraPrIds.has(m[1])) {
        l2ParaPrRefsValid = false;
        details.push(`Dangling paraPrIDRef: ${m[1]}`);
      }
    }

    // Level 2: BinData references
    let l2BinRefsValid = true;
    for (const m of secXml.matchAll(/binaryItemIDRef="([^"]+)"/g)) {
      const binId = m[1];
      const foundInZip = Object.keys(zip?.files || {}).some((k) => k.includes(binId));
      if (!foundInZip) {
        l2BinRefsValid = false;
        details.push(`Missing BinData file in ZIP for: ${binId}`);
      }
    }

    // Level 2: Ratio Range (0-50)
    let l2RatioRangeValid = true;
    for (const m of secXml.matchAll(/<hp:rect\b[^>]*\bratio="(\d+)"/g)) {
      const r = parseInt(m[1], 10);
      if (r < 0 || r > 50) {
        l2RatioRangeValid = false;
        details.push(`Ratio out of bounds [0, 50]: ${r}`);
      }
    }

    // Level 2: ImgDim & ImgClip consistency
    let l2ImgDimAndClipValid = true;
    const picBlocks = Array.from(secXml.matchAll(/<hp:pic\b[\s\S]*?<\/hp:pic>/g)).map((m) => m[0]);
    for (const pic of picBlocks) {
      const dimMatch = pic.match(/<hp:imgDim\b[^>]*\bdimwidth="(\d+)"\s+dimheight="(\d+)"/);
      const clipMatch = pic.match(
        /<hp:imgClip\b[^>]*\bleft="(-?\d+)"\s+right="(-?\d+)"\s+top="(-?\d+)"\s+bottom="(-?\d+)"/
      );
      if (!dimMatch || !clipMatch) {
        l2ImgDimAndClipValid = false;
        details.push("Missing imgDim or imgClip in <hp:pic>");
        continue;
      }
      const dw = parseInt(dimMatch[1], 10);
      const dh = parseInt(dimMatch[2], 10);
      const cl = parseInt(clipMatch[1], 10);
      const cr = parseInt(clipMatch[2], 10);
      const ct = parseInt(clipMatch[3], 10);
      const cb = parseInt(clipMatch[4], 10);
      if (dw <= 0 || dh <= 0 || cl < 0 || ct < 0 || cr <= cl || cb <= ct || cr > dw || cb > dh) {
        l2ImgDimAndClipValid = false;
        details.push(`Invalid imgDim/imgClip: dim=${dw}x${dh}, clip=[${cl},${cr},${ct},${cb}]`);
      }
    }

    // Level 2: Shape id === instid consistency
    let l2InstIdConsistent = true;
    for (const m of secXml.matchAll(/<hp:(?:rect|oval|line|polygon|pic)\b[^>]*\bid="([^"]+)"[^>]*\binstid="([^"]+)"/g)) {
      if (m[1] !== m[2]) {
        l2InstIdConsistent = false;
        details.push(`Mismatched id="${m[1]}" vs instid="${m[2]}"`);
      }
    }

    const totalElems = doc.pages.reduce((acc, p) => acc + p.elements.length, 0);
    results.push({
      fixtureName,
      pageCount: doc.pages.length,
      elementCount: totalElems,
      l1ZipValid,
      l1XmlWellFormed,
      l2CharPrRefsValid,
      l2ParaPrRefsValid,
      l2BinRefsValid,
      l2RatioRangeValid,
      l2ImgDimAndClipValid,
      l2InstIdConsistent,
      details,
    });
  }

  console.table(
    results.map((r) => ({
      Fixture: r.fixtureName,
      Pages: r.pageCount,
      Elements: r.elementCount,
      L1_Zip: r.l1ZipValid ? "PASS" : "FAIL",
      L1_Xml: r.l1XmlWellFormed ? "PASS" : "FAIL",
      L2_CharPr: r.l2CharPrRefsValid ? "PASS" : "FAIL",
      L2_ParaPr: r.l2ParaPrRefsValid ? "PASS" : "FAIL",
      L2_BinRef: r.l2BinRefsValid ? "PASS" : "FAIL",
      L2_Ratio: r.l2RatioRangeValid ? "PASS" : "FAIL",
      L2_ImgClip: r.l2ImgDimAndClipValid ? "PASS" : "FAIL",
      L2_InstId: r.l2InstIdConsistent ? "PASS" : "FAIL",
    }))
  );

  const outJsonPath = path.resolve(
    process.cwd(),
    "research/rea-document-engine/phase18/hwpx_audit_results.json"
  );
  fs.writeFileSync(outJsonPath, JSON.stringify(results, null, 2), "utf-8");

  const allPassed = results.every(
    (r) =>
      r.l1ZipValid &&
      r.l1XmlWellFormed &&
      r.l2CharPrRefsValid &&
      r.l2ParaPrRefsValid &&
      r.l2BinRefsValid &&
      r.l2RatioRangeValid &&
      r.l2ImgDimAndClipValid &&
      r.l2InstIdConsistent
  );

  if (!allPassed) {
    console.error("Some fixtures failed HWPX validation:", results.filter((r) => r.details.length > 0));
    process.exit(1);
  }
  console.log(`\n>>> ALL ${results.length} FIXTURES PASSED HWPX LEVEL 1 & LEVEL 2 DEEP AUDIT! <<<`);
}

runAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
