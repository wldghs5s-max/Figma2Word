import fs from "fs";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument, CanvasPage, CanvasElement } from "../src/canvas/types.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";

const raw = JSON.parse(fs.readFileSync("debug/customer/Report1-Live-Snapshot.json", "utf-8"));
const parser = new FigmaCanvasParser();
const fullDoc = parser.parse(raw);

const p1Elements = fullDoc.pages[0].elements;
const p2Elements = fullDoc.pages[1].elements;

// IDs for Group 1 & Group 2 (Page 1)
const p1TargetIds = [
  "7:978", // Card background
  "7:979", // Metric 1 card
  "7:980", // 균열밀도 (CDI)
  "7:981", // 0.031%
  "7:982", // 안전 기준선 이하
  "7:987", // Metric 2 card
  "7:988", // 정제 검출 균열
  "7:989", // 1,248 개
  "7:990", // 노이즈 정제 완료
  "7:995", // Summary card background
  "7:996", // Badge card
  "7:997", // A 등급 text
  "7:998", // Multi-line summary text
  "7:999", // Spacer / card below summary
];

// IDs for Group 3 (Page 2)
const p2TargetIds = [
  "7:1080", // Banner card background
  "7:1081", // Icon
  "7:1082", // Center-aligned banner text
];

const selectedP1 = p1Elements.filter(e => p1TargetIds.includes(e.id));
const selectedP2 = p2Elements.filter(e => p2TargetIds.includes(e.id));

console.log(`Selected P1 elements: ${selectedP1.length} / ${p1TargetIds.length}`);
console.log(`Selected P2 elements: ${selectedP2.length} / ${p2TargetIds.length}`);

// Header label element for Page 1
const p1Header: CanvasElement = {
  id: "diag:header:p1",
  name: "Diagnostic Header Page 1",
  type: "text",
  bounds: { x: 40.49, y: 40, width: 514.31, height: 24 },
  textAutoResize: "HEIGHT",
  verticalAlign: "top",
  style: { opacity: 1 },
  textRuns: [
    {
      text: "[MRE DIAGNOSTIC PAGE 1] 단일행 라벨/수치 충돌 (7:980 vs 7:981) 및 다중행 본문 (7:998)",
      fontSizePt: 11,
      fontFamily: "Inter",
      colorHex: "1E2022",
      bold: true,
    },
  ],
};

// Header label element for Page 2
const p2Header: CanvasElement = {
  id: "diag:header:p2",
  name: "Diagnostic Header Page 2",
  type: "text",
  bounds: { x: 40.49, y: 40, width: 514.31, height: 24 },
  textAutoResize: "HEIGHT",
  verticalAlign: "top",
  style: { opacity: 1 },
  textRuns: [
    {
      text: "[MRE DIAGNOSTIC PAGE 2] 중앙 정렬 배너 기하학 및 수직 정렬 왜곡 (7:1082)",
      fontSizePt: 11,
      fontFamily: "Inter",
      colorHex: "1E2022",
      bold: true,
    },
  ],
};

  // Only include resources that are actually referenced
  const usedResourceKeys = new Set<string>();
  for (const el of [...selectedP1, ...selectedP2]) {
    if (el.imageRef) usedResourceKeys.add(el.imageRef);
    if (el.style.fillImageRef) usedResourceKeys.add(el.style.fillImageRef);
  }
  const filteredResources: Record<string, any> = {};
  if (fullDoc.resources) {
    for (const [k, v] of Object.entries(fullDoc.resources)) {
      if (usedResourceKeys.has(k)) {
        filteredResources[k] = v;
      }
    }
  }

  const mreDoc: CanvasDocument = {
    id: "hwpx-overlap-mre-doc",
    title: "HWPX Overlap Root Cause Isolation MRE",
    version: "1.0",
    pageSize: {
      widthPt: 595.28,
      heightPt: 841.89,
      orientation: "portrait",
    },
    pages: [
      {
        pageNumber: 1,
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: fullDoc.pages[0].backgroundColor || "FFFFFF",
        elements: [p1Header, ...selectedP1],
      },
      {
        pageNumber: 2,
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: fullDoc.pages[1].backgroundColor || "FFFFFF",
        elements: [p2Header, ...selectedP2],
      },
    ],
    resources: filteredResources,
  };

async function run() {
  const renderer = new HwpxCanvasRenderer();
  const buf = await renderer.renderToBuffer(mreDoc);
  if (!fs.existsSync("debug/hwpx-overlap-mre")) {
    fs.mkdirSync("debug/hwpx-overlap-mre", { recursive: true });
  }
  fs.writeFileSync("debug/hwpx-overlap-mre/mre-A-baseline.hwpx", buf);
  console.log(`Generated mre-A-baseline.hwpx (${buf.length} bytes)`);
}

run().catch(console.error);
