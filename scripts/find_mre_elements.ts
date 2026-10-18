import fs from "fs";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";

const raw = JSON.parse(fs.readFileSync("debug/customer/Report1-Live-Snapshot.json", "utf-8"));
const parser = new FigmaCanvasParser();
const doc = parser.parse(raw);

console.log("=== CANDIDATE ELEMENTS FOR MRE ===");
for (const p of doc.pages.slice(0, 3)) {
  console.log(`\n--- Page ${p.pageNumber} (${p.elements.length} elements) ---`);
  for (const el of p.elements) {
    if (el.textRuns && el.textRuns.length > 0) {
      const text = el.textRuns.map(r => r.text).join("");
      // Filter interesting text
      if (
        ["7:980", "7:981", "7:988", "7:989", "7:1082"].includes(el.id) ||
        text.includes("전반적인") ||
        text.includes("외벽") ||
        (el.bounds.height > 25 && text.length > 20)
      ) {
        console.log(`ID: ${el.id} | Name: "${el.name}" | Bounds: y=${el.bounds.y.toFixed(1)}, h=${el.bounds.height.toFixed(1)}, w=${el.bounds.width.toFixed(1)} | text: "${text.slice(0, 50)}..."`);
      }
    }
  }
}
