import * as fs from "fs";

const jsonRaw = JSON.parse(fs.readFileSync("펜테크 3차 디자인.json", "utf8"));
const sampleIds = ["766:411", "759:796", "759:797", "759:801", "759:816"];

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
for (const id of sampleIds) {
  const node = findNode(root, id);
  console.log(`\n--- Node ${id} ---`);
  if (!node) {
    console.log("NOT FOUND");
    continue;
  }
  console.log("Keys:", Object.keys(node));
  console.log("fillGeometry:", node.fillGeometry);
  console.log("strokeGeometry:", node.strokeGeometry);
  console.log("vectorPaths:", node.vectorPaths);
  console.log("vectorNetwork:", node.vectorNetwork);
  console.log("strokeWeight:", node.strokeWeight);
  console.log("strokes:", node.strokes);
  console.log("strokeAlign:", node.strokeAlign);
  console.log("strokeCap:", node.strokeCap);
  console.log("strokeJoin:", node.strokeJoin);
  console.log("size:", node.size);
}

