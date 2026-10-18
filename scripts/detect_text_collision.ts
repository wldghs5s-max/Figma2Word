import fs from "fs";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument, CanvasPage, CanvasElement } from "../src/canvas/types.js";

export type OverflowCategory = 
  | "A_HORIZONTAL_OVERFLOW"
  | "B_VERTICAL_OVERFLOW"
  | "C_INTER_ELEMENT_COLLISION"
  | "D_OCCLUSION"
  | "E_SOURCE_GEOMETRY_CONFLICT";

export interface CollisionRecord {
  pageNumber: number;
  sourceElementId: string;
  sourceElementName: string;
  category: OverflowCategory;
  description: string;
  bounds: { x: number; y: number; width: number; height: number };
  targetElementId?: string;
  targetElementName?: string;
  targetBounds?: { x: number; y: number; width: number; height: number };
  overlapArea?: { x: number; y: number; width: number; height: number };
  isSourceConflict: boolean;
  isRendererInduced: boolean;
}

export class TextCollisionDetector {
  public analyzeDocument(doc: CanvasDocument): CollisionRecord[] {
    const records: CollisionRecord[] = [];

    for (const page of doc.pages) {
      const pageNum = page.pageNumber;
      const elements = page.elements;

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (el.type !== "text" && (!el.textRuns || el.textRuns.length === 0)) continue;

        const textStr = el.textRuns?.map(r => r.text).join("") || "";
        const fs = el.textRuns?.[0]?.fontSizePt || 10;
        const lh = el.textRuns?.[0]?.lineHeightPt || (fs * 1.35);

        // 1. Calculate estimated text length
        let estWidthPt = 0;
        for (let ch of textStr) {
          if (ch === "\n") continue;
          const code = ch.charCodeAt(0);
          if (
            (code >= 0x1100 && code <= 0x11ff) ||
            (code >= 0x3130 && code <= 0x318f) ||
            (code >= 0xac00 && code <= 0xd7a3) ||
            (code >= 0x4e00 && code <= 0x9fff) ||
            (code >= 0xff00 && code <= 0xffef)
          ) {
            estWidthPt += fs * 1.0;
          } else {
            estWidthPt += fs * 0.55;
          }
        }

        const boxW = el.bounds.width;
        const boxH = el.bounds.height;
        const explicitLines = textStr.split(/\r\n|\r|\n/);
        
        let estTotalLines = 0;
        for (const line of explicitLines) {
          if (line.length === 0) {
            estTotalLines += 1;
            continue;
          }
          let lineW = 0;
          for (let ch of line) {
            const code = ch.charCodeAt(0);
            if (
              (code >= 0x1100 && code <= 0x11ff) ||
              (code >= 0x3130 && code <= 0x318f) ||
              (code >= 0xac00 && code <= 0xd7a3) ||
              (code >= 0x4e00 && code <= 0x9fff) ||
              (code >= 0xff00 && code <= 0xffef)
            ) {
              lineW += fs * 1.0;
            } else {
              lineW += fs * 0.55;
            }
          }
          estTotalLines += Math.max(1, Math.ceil(lineW / boxW));
        }

        const neededHeightPt = estTotalLines * lh;

        // Check A: Horizontal Overflow (single line label where width is too small)
        if (explicitLines.length === 1 && estTotalLines === 1 && estWidthPt > boxW * 1.05) {
          records.push({
            pageNumber: pageNum,
            sourceElementId: el.id,
            sourceElementName: el.name || el.id,
            category: "A_HORIZONTAL_OVERFLOW",
            description: `Single-line text width (${estWidthPt.toFixed(1)}pt) exceeds box width (${boxW.toFixed(1)}pt) by ${(estWidthPt - boxW).toFixed(1)}pt.`,
            bounds: { ...el.bounds },
            isSourceConflict: true,
            isRendererInduced: false,
          });
        }

        // Check B: Vertical Overflow (text wraps and needs more vertical space than box height)
        if (neededHeightPt > boxH * 1.15 && boxH > 0) {
          const isSourceConflict = el.textAutoResize === "HEIGHT" && (neededHeightPt - boxH) > lh;
          records.push({
            pageNumber: pageNum,
            sourceElementId: el.id,
            sourceElementName: el.name || el.id,
            category: isSourceConflict ? "E_SOURCE_GEOMETRY_CONFLICT" : "B_VERTICAL_OVERFLOW",
            description: `Wrapped text height (${neededHeightPt.toFixed(1)}pt for ${estTotalLines} lines) exceeds allocated box height (${boxH.toFixed(1)}pt).`,
            bounds: { ...el.bounds },
            isSourceConflict,
            isRendererInduced: false,
          });
        }

        // Check C: Inter-Element Collision (element renders into following downstream elements)
        const effectiveBottomY = el.bounds.y + Math.max(boxH, neededHeightPt);
        for (let j = 0; j < elements.length; j++) {
          if (i === j) continue;
          const other = elements[j];
          
          // Only check elements located below or overlapping vertically
          const xOverlap = Math.max(0, Math.min(el.bounds.x + boxW, other.bounds.x + other.bounds.width) - Math.max(el.bounds.x, other.bounds.x));
          if (xOverlap > 5) {
            // Check if other is placed inside the vertical span of this text
            if (other.bounds.y >= el.bounds.y && other.bounds.y < effectiveBottomY - 2) {
              // Distinguish intentional card background / badge container (occlusion / container) vs sibling text collision
              const isOtherContainer = other.bounds.x <= el.bounds.x + 2 && (other.bounds.x + other.bounds.width) >= (el.bounds.x + boxW - 2) && other.bounds.height > boxH;
              
              if (!isOtherContainer) {
                const overlapH = Math.min(effectiveBottomY, other.bounds.y + other.bounds.height) - other.bounds.y;
                records.push({
                  pageNumber: pageNum,
                  sourceElementId: el.id,
                  sourceElementName: el.name || el.id,
                  category: "C_INTER_ELEMENT_COLLISION",
                  description: `Text vertical span [${el.bounds.y.toFixed(1)} .. ${effectiveBottomY.toFixed(1)}pt] collides with '${other.name || other.id}' [y=${other.bounds.y.toFixed(1)}pt, gap=${(other.bounds.y - (el.bounds.y + boxH)).toFixed(1)}pt].`,
                  bounds: { ...el.bounds },
                  targetElementId: other.id,
                  targetElementName: other.name || other.id,
                  targetBounds: { ...other.bounds },
                  overlapArea: {
                    x: Math.max(el.bounds.x, other.bounds.x),
                    y: other.bounds.y,
                    width: xOverlap,
                    height: overlapH,
                  },
                  isSourceConflict: other.bounds.y < (el.bounds.y + boxH),
                  isRendererInduced: false,
                });
              }
            }
          }
        }
      }
    }

    return records;
  }
}

// CLI entry point
if (process.argv[1] && process.argv[1].includes("detect_text_collision")) {
  const target = process.argv[2] || "samples/real-world/sample-a-proposal-doc.json";
  console.log(`Running TextCollisionDetector on: ${target}`);
  const raw = JSON.parse(fs.readFileSync(target, "utf-8"));
  const parser = new FigmaCanvasParser();
  const doc = parser.parse(raw);
  const detector = new TextCollisionDetector();
  const records = detector.analyzeDocument(doc);

  console.log(`\nDetected ${records.length} collision / overflow events:`);
  for (const r of records) {
    console.log(`- [P${r.pageNumber}][${r.category}] ${r.sourceElementName} (${r.sourceElementId})`);
    console.log(`    ${r.description}`);
    if (r.targetElementId) {
      console.log(`    --> Target: ${r.targetElementName} (${r.targetElementId})`);
    }
  }
}
