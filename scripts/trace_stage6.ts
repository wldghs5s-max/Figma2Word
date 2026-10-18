import fs from "fs";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { ptToHwpu } from "../src/canvas/types.js";

const raw = JSON.parse(fs.readFileSync("samples/real-world/sample-a-proposal-doc.json", "utf-8"));
const parser = new FigmaCanvasParser();
const doc = parser.parse(raw);

console.log("=== Stage 6 Elements in Canvas IR ===");
doc.pages[0].elements.forEach((el, i) => {
  const isText = el.type === "text" || (el.textRuns && el.textRuns.length > 0);
  console.log(`[${i}] ${el.type} (${el.id}) name="${el.name}"`);
  console.log(`  bounds: x=${el.bounds.x.toFixed(1)}, y=${el.bounds.y.toFixed(1)}, w=${el.bounds.width.toFixed(1)}, h=${el.bounds.height.toFixed(1)}`);
  if (isText) {
    const textStr = el.textRuns?.map(r => r.text).join("") || "";
    console.log(`  runs=${el.textRuns?.length}, fs=${el.textRuns?.[0]?.fontSizePt}pt, lh=${el.textRuns?.[0]?.lineHeightPt}pt`);
    console.log(`  text: ${JSON.stringify(textStr)}`);
  }
});
