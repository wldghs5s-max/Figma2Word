import fs from "fs";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";

const raw = JSON.parse(fs.readFileSync("debug/customer/Report1-Live-Snapshot.json", "utf-8"));
const parser = new FigmaCanvasParser();
const doc = parser.parse(raw);

const p1 = doc.pages[0];
const p2 = doc.pages[1];

console.log("=== PAGE 1 ELEMENTS NEAR 7:980 & 7:998 ===");
// Sort Page 1 elements by y
const p1Sorted = [...p1.elements].sort((a, b) => a.bounds.y - b.bounds.y);
for (const el of p1Sorted) {
  if (el.bounds.y >= 440 && el.bounds.y <= 650) {
    console.log(`[P1] ID: ${el.id} | y: ${el.bounds.y.toFixed(2)}, h: ${el.bounds.height.toFixed(2)}, x: ${el.bounds.x.toFixed(2)}, w: ${el.bounds.width.toFixed(2)} | Type: ${el.type} | Name: "${el.name}"`);
  }
}

console.log("\n=== PAGE 2 ELEMENTS NEAR 7:1082 ===");
const p2Sorted = [...p2.elements].sort((a, b) => a.bounds.y - b.bounds.y);
for (const el of p2Sorted) {
  if (el.bounds.y >= 460 && el.bounds.y <= 560) {
    console.log(`[P2] ID: ${el.id} | y: ${el.bounds.y.toFixed(2)}, h: ${el.bounds.height.toFixed(2)}, x: ${el.bounds.x.toFixed(2)}, w: ${el.bounds.width.toFixed(2)} | Type: ${el.type} | Name: "${el.name}"`);
  }
}
