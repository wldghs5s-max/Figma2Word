import fs from "fs";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { ptToHwpu } from "../src/canvas/types.js";

function traceDoc(title: string, filePath: string) {
  console.log(`\n================================================================================`);
  console.log(`GEOMETRY TRACE: ${title} (${filePath})`);
  console.log(`================================================================================`);

  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const parser = new FigmaCanvasParser();
  const doc = parser.parse(raw);

  console.log(`Page count: ${doc.pages.length}, PageSize: ${doc.pageSize.widthPt}x${doc.pageSize.heightPt} pt`);

  doc.pages.forEach((page, pIdx) => {
    console.log(`\n--- PAGE ${pIdx + 1} (${page.elements.length} elements) ---`);
    page.elements.forEach((el, eIdx) => {
      const isText = el.type === "text" || (el.textRuns && el.textRuns.length > 0);
      if (isText) {
        const textStr = el.textRuns?.map(r => r.text).join("") || "";
        const lines = textStr.split(/\r\n|\r|\n/);
        const wPt = el.bounds.width;
        const hPt = el.bounds.height;
        const wHwpu = ptToHwpu(wPt);
        const hHwpu = ptToHwpu(hPt);
        const fs = el.textRuns?.[0]?.fontSizePt || 10;
        const padL = el.innerPaddingPt?.left || 0;
        const padR = el.innerPaddingPt?.right || 0;
        const innerWPt = wPt - padL - padR;

        console.log(`\n[Text ${eIdx}] id=${el.id}, name='${el.name}', type=${el.type}`);
        console.log(`  Bounds Pt: x=${el.bounds.x.toFixed(1)}, y=${el.bounds.y.toFixed(1)}, w=${wPt.toFixed(1)}, h=${hPt.toFixed(1)}`);
        console.log(`  HWPU: w=${wHwpu}, h=${hHwpu}, padL=${ptToHwpu(padL)}, padR=${ptToHwpu(padR)}, innerW=${ptToHwpu(innerWPt)}`);
        console.log(`  Font: size=${fs}pt, runs=${el.textRuns?.length}, explicitLines=${lines.length}, textAutoResize=${el.textAutoResize}`);
        console.log(`  Content: ${JSON.stringify(textStr.substring(0, 80))}`);

        // Find immediately following elements to check vertical gap / collision
        const below = page.elements.filter(other => 
          other.id !== el.id && 
          other.bounds.y >= el.bounds.y && 
          other.bounds.y < (el.bounds.y + hPt + 50) &&
          Math.max(el.bounds.x, other.bounds.x) < Math.min(el.bounds.x + wPt, other.bounds.x + other.bounds.width)
        );
        if (below.length > 0) {
          below.forEach(b => {
            const gapY = b.bounds.y - (el.bounds.y + hPt);
            console.log(`  --> Below element (${b.id}, '${b.name}', ${b.type}): y=${b.bounds.y.toFixed(1)}, gapY=${gapY.toFixed(1)}pt`);
          });
        }
      }
    });
  });
}

traceDoc("Stage 6 (Proposal)", "samples/real-world/sample-a-proposal-doc.json");
traceDoc("Stage 7 (Customer Report)", "debug/customer/Report1-Live-Snapshot.json");
