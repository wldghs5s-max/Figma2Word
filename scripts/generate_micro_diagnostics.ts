import fs from "fs";
import path from "path";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";

async function main() {
  const dir = path.resolve(process.cwd(), "debug/hwpx-phase21");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const baseDoc: CanvasDocument = {
    title: "Micro Diagnostic",
    pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
    marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
    pages: [{
      pageNumber: 1,
      bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
      backgroundColor: "#FFFFFF",
      elements: []
    }],
    resources: {},
    diagnostics: { notices: [], warnings: [] }
  };

  const renderer = new HwpxCanvasRenderer();

  // Test 1: Line only
  const docLine: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  docLine.title = "Diag 1: Line Only";
  docLine.pages[0].elements = [{
    id: "l1", type: "line", bounds: { x: 50, y: 50, width: 200, height: 0 },
    zIndex: 1, style: { strokeColor: "#000000", strokeWidth: 1 }
  }];
  fs.writeFileSync(path.join(dir, "diag-line-only.hwpx"), await renderer.renderToBuffer(docLine));

  // Test 2: Rect with ratio only
  const docRatio: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  docRatio.title = "Diag 2: Rect Ratio Only";
  docRatio.pages[0].elements = [{
    id: "r1", type: "card", bounds: { x: 50, y: 50, width: 200, height: 100 },
    zIndex: 1, style: { cornerRadius: 10, fillColor: "#EEEEEE" }
  }];
  fs.writeFileSync(path.join(dir, "diag-rect-ratio.hwpx"), await renderer.renderToBuffer(docRatio));

  // Test 3: Rect with stroke
  const docStroke: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  docStroke.title = "Diag 3: Rect Stroke Only";
  docStroke.pages[0].elements = [{
    id: "r2", type: "card", bounds: { x: 50, y: 50, width: 200, height: 100 },
    zIndex: 1, style: { strokeColor: "#3B82F6", strokeWidth: 2, fillColor: "#FFFFFF" }
  }];
  fs.writeFileSync(path.join(dir, "diag-rect-stroke.hwpx"), await renderer.renderToBuffer(docStroke));

  // Test 4: Oval only
  const docOval: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  docOval.title = "Diag 4: Oval Only";
  docOval.pages[0].elements = [{
    id: "o1", type: "oval", bounds: { x: 50, y: 50, width: 100, height: 100 },
    zIndex: 1, style: { fillColor: "#00AAEE", strokeColor: "#003366", strokeWidth: 1 }
  }];
  fs.writeFileSync(path.join(dir, "diag-oval-only.hwpx"), await renderer.renderToBuffer(docOval));

  // Test 5: Polygon only
  const docPoly: CanvasDocument = JSON.parse(JSON.stringify(baseDoc));
  docPoly.title = "Diag 5: Polygon Only";
  docPoly.pages[0].elements = [{
    id: "p1", type: "vector", bounds: { x: 50, y: 50, width: 100, height: 100 },
    zIndex: 1, style: { fillColor: "#10B981" },
    vectorPoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }]
  }];
  fs.writeFileSync(path.join(dir, "diag-polygon-only.hwpx"), await renderer.renderToBuffer(docPoly));

  console.log("All diagnostic files written successfully to debug/hwpx-phase21!");
}

main().catch(err => {
  console.error("Diagnostic generator error:", err);
  process.exit(1);
});

