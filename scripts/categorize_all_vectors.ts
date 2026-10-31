import * as fs from "fs";

const jsonRaw = JSON.parse(fs.readFileSync("펜테크 3차 디자인.json", "utf8"));
const data = JSON.parse(fs.readFileSync("debug/phase40-unresolved-raw-analysis.json", "utf8"));
const vectors = data.analyzed.filter((a: any) => a.sourceNodeType === "VECTOR");

function findNode(n: any, id: string): any {
  if (!n) return null;
  if (n.id === id) return n;
  if (n.children && Array.isArray(n.children)) {
    for (const c of n.children) {
      const res = findNode(c, id);
      if (res) return res;
    }
  }
  return null;
}

const root = jsonRaw.figmaNode || jsonRaw.document || jsonRaw;
const parentNames: Record<string, number> = {};
const combinations: Record<string, number> = {};

for (const v of vectors) {
  const parent = v.parentId ? findNode(root, v.parentId) : null;
  const pName = parent ? parent.name : "NO_PARENT";
  const combo = `${pName} -> ${v.name} (${Math.round(v.bbox?.width || 0)}x${Math.round(v.bbox?.height || 0)})`;
  parentNames[pName] = (parentNames[pName] || 0) + 1;
  combinations[combo] = (combinations[combo] || 0) + 1;
}

console.log("Top Parent Names:", Object.entries(parentNames).sort((a, b) => b[1] - a[1]));
console.log("\nTop 30 Combinations:");
Object.entries(combinations).sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, c]) => {
  console.log(`  ${c}x: ${k}`);
});

