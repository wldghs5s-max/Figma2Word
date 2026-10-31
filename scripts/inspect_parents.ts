import * as fs from "fs";

const jsonRaw = JSON.parse(fs.readFileSync("펜테크 3차 디자인.json", "utf8"));
const parentIds = ["766:410", "759:795", "759:800", "759:815"];

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
for (const id of parentIds) {
  const node = findNode(root, id);
  console.log(`\n--- Parent Node ${id} ---`);
  if (!node) {
    console.log("NOT FOUND");
    continue;
  }
  console.log("Name:", node.name);
  console.log("Type:", node.type);
  console.log("BBox:", node.absoluteBoundingBox);
  console.log("Children count:", node.children?.length);
  console.log("Children:", node.children?.map((c: any) => ({ id: c.id, name: c.name, type: c.type, bbox: c.absoluteBoundingBox })));
}

