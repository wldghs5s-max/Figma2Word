import fs from "fs";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument, CanvasPage, CanvasElement } from "../src/canvas/types.js";

interface TextAnalysis {
  id: string;
  name: string;
  page: number;
  bounds: { x: number; y: number; width: number; height: number };
  fontSizePt: number;
  lineHeightPt: number;
  textAutoResize?: string;
  verticalAlign?: string;
  text: string;
  explicitLinesCount: number;
  estimatedCharWidthPt: number;
  estimatedWrappedLines: number;
  estimatedRequiredHeightPt: number;
  heightDeficitPt: number; // positive means text overflows height
  belowElements: Array<{
    id: string;
    name: string;
    type: string;
    bounds: { x: number; y: number; width: number; height: number };
    verticalGapPt: number; // next.y - (current.y + current.h)
    horizontalOverlap: boolean;
  }>;
}

function analyzeDoc(name: string, filePath: string) {
  console.log(`\n================================================================================`);
  console.log(`ANALYZING DOCUMENT: ${name} (${filePath})`);
  console.log(`================================================================================`);

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const parser = new FigmaCanvasParser();
  const doc = parser.parse(raw);

  console.log(`Page count: ${doc.pages.length}, Page size: ${doc.pageSize.widthPt}x${doc.pageSize.heightPt} (${doc.pageSize.orientation})`);

  const allAnalyses: TextAnalysis[] = [];

  for (const page of doc.pages) {
    const pageNum = page.pageNumber;
    const elements = page.elements;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.type !== "text" && (!el.textRuns || el.textRuns.length === 0)) continue;

      const fullText = el.textRuns?.map((r) => r.text).join("") || "";
      const fsPt = el.textRuns?.[0]?.fontSizePt || 10;
      const lhPt = el.textRuns?.[0]?.lineHeightPt || fsPt * 1.35;

      const explicitLines = fullText.split(/\r\n|\r|\n/);

      // Estimate total lines wrapped by box width
      let estTotalLines = 0;
      let totalCharWidth = 0;
      for (const line of explicitLines) {
        if (line.length === 0) {
          estTotalLines += 1;
          continue;
        }
        let lineW = 0;
        for (const ch of line) {
          const code = ch.charCodeAt(0);
          if (
            (code >= 0x1100 && code <= 0x11ff) ||
            (code >= 0x3130 && code <= 0x318f) ||
            (code >= 0xac00 && code <= 0xd7a3) ||
            (code >= 0x4e00 && code <= 0x9fff) ||
            (code >= 0xff00 && code <= 0xffef)
          ) {
            lineW += fsPt * 1.0;
          } else {
            lineW += fsPt * 0.55;
          }
        }
        totalCharWidth += lineW;
        estTotalLines += Math.max(1, Math.ceil(lineW / Math.max(1, el.bounds.width)));
      }

      const estRequiredHeight = estTotalLines * lhPt;
      const heightDeficit = estRequiredHeight - el.bounds.height;

      // Find elements physically below this element
      const belowElements: TextAnalysis["belowElements"] = [];
      for (let j = 0; j < elements.length; j++) {
        if (i === j) continue;
        const other = elements[j];
        // Check if other is situated vertically at or below this element
        const vertGap = other.bounds.y - (el.bounds.y + el.bounds.height);
        // Check horizontal overlap between el.bounds and other.bounds
        const horzOverlap =
          Math.max(el.bounds.x, other.bounds.x) <
          Math.min(el.bounds.x + el.bounds.width, other.bounds.x + other.bounds.width);

        if (horzOverlap && vertGap >= -50 && vertGap <= 40) {
          belowElements.push({
            id: other.id,
            name: other.name || other.id,
            type: other.type,
            bounds: { ...other.bounds },
            verticalGapPt: vertGap,
            horizontalOverlap: horzOverlap,
          });
        }
      }

      allAnalyses.push({
        id: el.id,
        name: el.name || el.id,
        page: pageNum,
        bounds: { ...el.bounds },
        fontSizePt: fsPt,
        lineHeightPt: lhPt,
        textAutoResize: el.textAutoResize,
        verticalAlign: el.verticalAlign,
        text: fullText,
        explicitLinesCount: explicitLines.length,
        estimatedCharWidthPt: totalCharWidth,
        estimatedWrappedLines: estTotalLines,
        estimatedRequiredHeightPt: estRequiredHeight,
        heightDeficitPt: heightDeficit,
        belowElements,
      });
    }
  }

  // Filter for textboxes that overflow height AND have elements dangerously close below them
  const criticalCollisions = allAnalyses.filter(
    (a) => a.heightDeficitPt > 3 && a.belowElements.some((b) => b.verticalGapPt < a.heightDeficitPt + 5)
  );

  console.log(`Total textboxes analyzed: ${allAnalyses.length}`);
  console.log(`Critical collision risk textboxes: ${criticalCollisions.length}`);

  console.log(`\n--- Top 10 High-Risk Collision Elements ---`);
  for (let k = 0; k < Math.min(10, criticalCollisions.length); k++) {
    const c = criticalCollisions[k];
    console.log(`\n[#${k + 1}] Page ${c.page} | ID: ${c.id} ("${c.name}")`);
    console.log(`  Bounds: x=${c.bounds.x.toFixed(1)}, y=${c.bounds.y.toFixed(1)}, w=${c.bounds.width.toFixed(1)}, h=${c.bounds.height.toFixed(1)}`);
    console.log(`  Text (${c.text.length} chars, ${c.explicitLinesCount} explicit lines -> ${c.estimatedWrappedLines} wrapped lines): "${c.text.replace(/\n/g, "\\n").slice(0, 70)}..."`);
    console.log(`  FontSize: ${c.fontSizePt}pt, LineHeight: ${c.lineHeightPt.toFixed(1)}pt`);
    console.log(`  Est Required H: ${c.estimatedRequiredHeightPt.toFixed(1)}pt vs Box H: ${c.bounds.height.toFixed(1)}pt (Deficit: +${c.heightDeficitPt.toFixed(1)}pt)`);
    console.log(`  Close Elements Below:`);
    for (const b of c.belowElements) {
      console.log(`    -> Target ID: ${b.id} ("${b.name}", type=${b.type}) at y=${b.bounds.y.toFixed(1)} (Gap: ${b.verticalGapPt.toFixed(1)}pt)`);
    }
  }

  return { doc, allAnalyses, criticalCollisions };
}

analyzeDoc("Stage 6 (Proposal)", "samples/real-world/sample-a-proposal-doc.json");
analyzeDoc("Stage 7 (Customer Report)", "debug/customer/Report1-Live-Snapshot.json");
