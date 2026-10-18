import fs from "fs";
import path from "path";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument, CanvasElement } from "../src/canvas/types.js";

interface RawFigmaNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  children?: RawFigmaNode[];
  layoutMode?: string;
  style?: any;
}

export interface GeometryAuditItem {
  id: string;
  name: string;
  textSnippet: string;
  figmaBBox: { x: number; y: number; width: number; height: number };
  canvasBounds: { x: number; y: number; width: number; height: number };
  contentHeightPt?: number;
  verticalAlign?: string;
  parentInfo: {
    id: string;
    name: string;
    type: string;
    layoutMode?: string;
    childCount: number;
    bbox: { x: number; y: number; width: number; height: number };
  };
  delta: {
    yDiffPt: number;
    heightDiffPt: number;
    isHeightInflated: boolean;
    inflationRatio: number;
  };
  category: "INTENTIONAL_BADGE" | "BUTTON_OR_CHIP" | "CARD_INTERNAL_TEXT" | "MULTI_CHILD_CONTAINER" | "UNCERTAIN";
  rationale: string;
}

export function auditParserGeometry(rawSnapshotPath: string, stageName: string) {
  const rawJson = JSON.parse(fs.readFileSync(rawSnapshotPath, "utf-8"));
  const parser = new FigmaCanvasParser();
  const doc = parser.parse(rawJson);

  // Index all raw Figma nodes and their parents
  const rawNodeMap = new Map<string, { node: RawFigmaNode; parent?: RawFigmaNode }>();

  function indexRawNodes(node: RawFigmaNode, parent?: RawFigmaNode) {
    rawNodeMap.set(node.id, { node, parent });
    if (node.children) {
      for (const child of node.children) {
        indexRawNodes(child, node);
      }
    }
  }

  // Find root
  const rootNode = rawJson.document || rawJson.figmaNode || rawJson;
  indexRawNodes(rootNode);

  // Map canvas elements
  const items: GeometryAuditItem[] = [];

  for (const page of doc.pages) {
    for (const el of page.elements) {
      if (el.type !== "text" && (!el.textRuns || el.textRuns.length === 0)) continue;

      const rawEntry = rawNodeMap.get(el.id);
      if (!rawEntry || !rawEntry.node.absoluteBoundingBox) continue;

      const rawNode = rawEntry.node;
      const parentNode = rawEntry.parent;

      const figmaBox = rawNode.absoluteBoundingBox;
      const textSnippet = el.textRuns?.map((r) => r.text).join("").trim() || el.name;

      // Check if height was modified (e.g. contentHeightPt is set, or height differs significantly from Figma BBox)
      // Note: scale conversion from px to pt is 0.75 (96 DPI / 72 DPI)
      // Let's determine local page scale
      const expectedHPt = figmaBox.height * 0.7497; // approx pt
      const heightDiffPt = el.bounds.height - (el.contentHeightPt || expectedHPt);
      const isHeightInflated = el.contentHeightPt !== undefined && el.bounds.height > el.contentHeightPt * 1.25;

      const parentBBox = parentNode?.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 };
      const childCount = parentNode?.children?.length || 0;
      const layoutMode = parentNode?.layoutMode;

      // Categorize
      let category: GeometryAuditItem["category"] = "UNCERTAIN";
      let rationale = "";

      const lowerName = (el.name + " " + (parentNode?.name || "")).toLowerCase();
      const parentHeightPt = parentBBox.height * 0.75;

      if (isHeightInflated) {
        if (childCount === 1 && parentHeightPt <= 26) {
          category = "INTENTIONAL_BADGE";
          rationale = `Single-child small container (h=${parentHeightPt.toFixed(1)}pt <= 26pt). Centered alignment desired.`;
        } else if (childCount <= 2 && (lowerName.includes("btn") || lowerName.includes("button") || lowerName.includes("chip"))) {
          category = "BUTTON_OR_CHIP";
          rationale = `Button/chip element with icon+text or single label. Vertical centering desired.`;
        } else if (childCount > 1 && (lowerName.includes("card") || lowerName.includes("banner") || parentHeightPt >= 30)) {
          category = "CARD_INTERNAL_TEXT";
          rationale = `Internal text inside larger container/card (h=${parentHeightPt.toFixed(1)}pt, ${childCount} children). Stretched height to card causes baseline downward drift!`;
        } else if (childCount > 2) {
          category = "MULTI_CHILD_CONTAINER";
          rationale = `Container has ${childCount} children. Expanding single text to full container risks collision.`;
        } else {
          category = "UNCERTAIN";
          rationale = `Ambiguous container layout (h=${parentHeightPt.toFixed(1)}pt, ${childCount} children).`;
        }

        items.push({
          id: el.id,
          name: el.name,
          textSnippet: textSnippet.slice(0, 50),
          figmaBBox: figmaBox,
          canvasBounds: el.bounds,
          contentHeightPt: el.contentHeightPt,
          verticalAlign: el.verticalAlign,
          parentInfo: {
            id: parentNode?.id || "",
            name: parentNode?.name || "",
            type: parentNode?.type || "",
            layoutMode,
            childCount,
            bbox: parentBBox,
          },
          delta: {
            yDiffPt: el.contentHeightPt ? el.bounds.height - el.contentHeightPt : 0,
            heightDiffPt: parseFloat(heightDiffPt.toFixed(2)),
            isHeightInflated,
            inflationRatio: el.contentHeightPt ? parseFloat((el.bounds.height / el.contentHeightPt).toFixed(2)) : 1.0,
          },
          category,
          rationale,
        });
      }
    }
  }

  return {
    stageName,
    totalTextElementsCount: doc.pages.reduce((sum, p) => sum + p.elements.filter((e) => e.type === "text").length, 0),
    inflatedElementsCount: items.length,
    items,
    categoryCounts: {
      INTENTIONAL_BADGE: items.filter((i) => i.category === "INTENTIONAL_BADGE").length,
      BUTTON_OR_CHIP: items.filter((i) => i.category === "BUTTON_OR_CHIP").length,
      CARD_INTERNAL_TEXT: items.filter((i) => i.category === "CARD_INTERNAL_TEXT").length,
      MULTI_CHILD_CONTAINER: items.filter((i) => i.category === "MULTI_CHILD_CONTAINER").length,
      UNCERTAIN: items.filter((i) => i.category === "UNCERTAIN").length,
    },
  };
}

async function main() {
  console.log("=== TASK D: PARSER GEOMETRY PRESERVATION AUDIT ===");

  const s6Report = auditParserGeometry("samples/real-world/sample-a-proposal-doc.json", "Stage 6 (Proposal Document)");
  const s7Report = auditParserGeometry("debug/customer/Report1-Live-Snapshot.json", "Stage 7 (Customer Report)");

  console.log(`\n--- Stage 6 ---`);
  console.log(`Total Text Elements: ${s6Report.totalTextElementsCount}`);
  console.log(`Elements with Inflated Geometry (isCenteredInParent): ${s6Report.inflatedElementsCount}`);
  console.log(`Categories:`, s6Report.categoryCounts);

  console.log(`\n--- Stage 7 ---`);
  console.log(`Total Text Elements: ${s7Report.totalTextElementsCount}`);
  console.log(`Elements with Inflated Geometry (isCenteredInParent): ${s7Report.inflatedElementsCount}`);
  console.log(`Categories:`, s7Report.categoryCounts);

  // Spot check 7:1082
  const item1082 = s7Report.items.find((i) => i.id === "7:1082");
  if (item1082) {
    console.log(`\nSpotlight on 7:1082:`);
    console.log(`  Name: ${item1082.name}`);
    console.log(`  Original height: ${item1082.contentHeightPt}pt -> Inflated height: ${item1082.canvasBounds.height}pt (ratio: ${item1082.delta.inflationRatio}x)`);
    console.log(`  Category: ${item1082.category}`);
    console.log(`  Rationale: ${item1082.rationale}`);
  }

  const outDir = "research/rea-document-engine/phase24-layout-audit";
  fs.writeFileSync(
    path.join(outDir, "parser_geometry_audit.json"),
    JSON.stringify({ s6: s6Report, s7: s7Report }, null, 2),
    "utf-8"
  );
  console.log(`\nSaved parser geometry audit to ${path.join(outDir, "parser_geometry_audit.json")}`);
}

main().catch(console.error);
