import * as fs from "fs";

const data = JSON.parse(fs.readFileSync("debug/phase40-unresolved-raw-analysis.json", "utf8"));
const vectors = data.analyzed.filter((a: any) => a.sourceNodeType === "VECTOR");

console.log("Total VECTOR nodes:", vectors.length);

const frameCounts: Record<string, number> = {};
const nameCounts: Record<string, number> = {};
const sizeBuckets: Record<string, number> = {};

for (const v of vectors) {
  frameCounts[v.sourceFrameNodeId] = (frameCounts[v.sourceFrameNodeId] || 0) + 1;
  nameCounts[v.name || "unnamed"] = (nameCounts[v.name || "unnamed"] || 0) + 1;
  const w = Math.round(v.bbox?.width || 0);
  const h = Math.round(v.bbox?.height || 0);
  const key = `${w}x${h}`;
  sizeBuckets[key] = (sizeBuckets[key] || 0) + 1;
}

console.log("Vector counts by target frame:", frameCounts);
console.log("Top 15 vector names:", Object.entries(nameCounts).sort((a, b) => b[1] - a[1]).slice(0, 15));
console.log("Top 15 vector sizes (WxH):", Object.entries(sizeBuckets).sort((a, b) => b[1] - a[1]).slice(0, 15));

// Inspect 5 sample vectors
console.log("\nSample 5 Vectors:");
vectors.slice(0, 5).forEach((v: any) => {
  console.log({
    id: v.sourceNodeId,
    name: v.name,
    frame: v.sourceFrameNodeId,
    parent: v.parentId,
    bbox: v.bbox,
    fills: v.fills,
    strokes: v.strokes,
  });
});

