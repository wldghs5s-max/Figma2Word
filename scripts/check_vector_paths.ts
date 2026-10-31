import * as fs from "fs";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { TARGET_17_FRAME_IDS } from "../src/fidelity/nodeIdMapper.js";

const jsonPath = "펜테크 3차 디자인.json";
const jsonRaw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const parser = new FigmaCanvasParser({
  selectedFrameIds: [...TARGET_17_FRAME_IDS],
});
const canvasDoc = parser.parse(jsonRaw);

const vectorElems = canvasDoc.pages.flatMap(p => p.elements).filter(e => e.type === "vector");
console.log("Total vector elements in canvasDoc:", vectorElems.length);

let emptyPathCount = 0;
let nonEmptyPathCount = 0;
const emptySamples: any[] = [];
const nonEmptySamples: any[] = [];

for (const v of vectorElems) {
  if (!v.vectorPath || v.vectorPath.trim() === "") {
    emptyPathCount++;
    if (emptySamples.length < 5) emptySamples.push(v);
  } else {
    nonEmptyPathCount++;
    if (nonEmptySamples.length < 5) nonEmptySamples.push(v);
  }
}

console.log({ emptyPathCount, nonEmptyPathCount });
if (emptySamples.length > 0) {
  console.log("Sample empty vector elements:", emptySamples.map(s => ({
    id: s.id,
    name: s.name,
    bounds: s.bounds,
    vectorPath: s.vectorPath,
    vectorSubpaths: s.vectorSubpaths,
  })));
}
if (nonEmptySamples.length > 0) {
  console.log("Sample non-empty vector elements:", nonEmptySamples.map(s => ({
    id: s.id,
    name: s.name,
    bounds: s.bounds,
    vectorPath: s.vectorPath,
  })));
}

