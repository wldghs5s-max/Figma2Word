import * as fs from "fs";
import * as path from "path";

function inspectSnapshot(snapshotPath: string) {
  const raw = fs.readFileSync(snapshotPath, "utf-8");
  const data = JSON.parse(raw);
  const document = data.document;

  const pages = document.children || [];
  const reportFrames: { id: string; name: string; type: string; bounds?: any }[] = [];

  function findTopFrames(node: any) {
    if (!node.children) return;
    for (const child of node.children) {
      if (child.type === "FRAME" || child.type === "SECTION" || child.type === "COMPONENT") {
        reportFrames.push({
          id: child.id,
          name: child.name,
          type: child.type,
          bounds: child.absoluteBoundingBox,
        });
      }
    }
  }

  for (const page of pages) {
    findTopFrames(page);
  }

  return {
    documentName: data.name || "Untitled",
    canvasPagesCount: pages.length,
    canvasPageNames: pages.map((p: any) => p.name),
    topFramesCount: reportFrames.length,
    topFrames: reportFrames.slice(0, 15),
  };
}

const reports = [
  { name: "Report 1", path: "debug/customer/Report1-Live-Snapshot.json" },
  { name: "Report 2", path: "debug/customer/Report2-Live-Snapshot.json" },
  { name: "Report 3", path: "debug/customer/Report3-Live-Snapshot.json" },
];

for (const r of reports) {
  console.log(`\n================ ${r.name} (${r.path}) ================`);
  const info = inspectSnapshot(r.path);
  console.log(`Document Name: ${info.documentName}`);
  console.log(`Pages in Figma Canvas: ${info.canvasPagesCount} (${info.canvasPageNames.join(", ")})`);
  console.log(`Top Frames Count: ${info.topFramesCount}`);
  for (const f of info.topFrames) {
    console.log(`  - [${f.id}] "${f.name}" (${f.bounds?.width}x${f.bounds?.height} at (${f.bounds?.x}, ${f.bounds?.y}))`);
  }
}
