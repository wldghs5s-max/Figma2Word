import fs from "fs";
import path from "path";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument, CanvasElement } from "../src/canvas/types.js";
import { classifyTextWrap } from "./lib/wrapClassifier.js";
import { analyzeHwpxLayout, HwpxLayoutAnalysisReport } from "./analyze_hwpx_layout.js";

export type CollisionRiskType =
  | "NARROW_SINGLE_LINE_WRAP_RISK"
  | "VERTICAL_OVERFLOW_COLLISION"
  | "EXCESSIVE_LINE_SPACING_EXPANSION"
  | "INSUFFICIENT_BOX_HEIGHT"
  | "PARENT_GEOMETRY_INFLATION"
  | "FONT_FALLBACK_RISK"
  | "ACTUAL_BBOX_INTERSECTION"
  | "INTENTIONAL_BACKGROUND_OVERLAY";

export interface CollisionRiskItem {
  id: string;
  name: string;
  textSnippet: string;
  pageNumber: number;
  riskType: CollisionRiskType;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  isIntentional: boolean;
  boundsPt: { x: number; y: number; width: number; height: number };
  evidence: {
    boxWidthPt: number;
    boxHeightPt: number;
    estimatedTextWidthPt: number;
    estimatedTextHeightPt: number;
    lineWrap: string;
    lineSpacing: string;
    gapToNextElementPt?: number;
    overlappingWithElementId?: string;
    overlappingWithElementName?: string;
  };
  explanation: string;
}

export interface CollisionRiskReport {
  stageName: string;
  generatedAt: string;
  totalPages: number;
  totalElements: number;
  totalTextElements: number;
  riskSummary: Record<CollisionRiskType, number>;
  confidenceSummary: { HIGH: number; MEDIUM: number; LOW: number };
  criticalCollisionRisks: CollisionRiskItem[];
  intentionalOverlays: CollisionRiskItem[];
}

export function evaluateCollisionRisks(
  doc: CanvasDocument,
  hwpxReport: HwpxLayoutAnalysisReport,
  stageName: string
): CollisionRiskReport {
  const risks: CollisionRiskItem[] = [];

  const hwpxBoxMap = new Map<string, typeof hwpxReport.textboxes[0]>();
  for (const tb of hwpxReport.textboxes) {
    hwpxBoxMap.set(tb.rectId, tb);
  }

  for (const page of doc.pages) {
    const pElements = page.elements;

    for (let i = 0; i < pElements.length; i++) {
      const el = pElements[i];
      const isText = el.type === "text" || (el.textRuns && el.textRuns.length > 0);
      if (!isText) continue;

      const textSnippet = el.textRuns?.map((r) => r.text).join("").trim() || el.name;
      const wrapRes = classifyTextWrap(el);
      const hwpxTb = hwpxBoxMap.get(el.id);

      const boxW = el.bounds.width;
      const boxH = el.bounds.height;
      const estW = hwpxTb?.estimatedMetrics.estimatedTextWidthPt || boxW;
      const estH = hwpxTb?.estimatedMetrics.estimatedTextHeightPt || (el.contentHeightPt || boxH);
      const lineWrap = hwpxTb?.lineWrap || "BREAK";
      const lineSpacingStr = hwpxTb ? `${hwpxTb.lineSpacingType} ${hwpxTb.lineSpacingValue}` : "PERCENT 160";

      // 1. Check Parent Geometry Inflation (like 7:1082)
      if (el.contentHeightPt && el.bounds.height > el.contentHeightPt * 1.5) {
        risks.push({
          id: el.id,
          name: el.name,
          textSnippet: textSnippet.slice(0, 40),
          pageNumber: page.pageNumber,
          riskType: "PARENT_GEOMETRY_INFLATION",
          confidence: "HIGH",
          isIntentional: false,
          boundsPt: el.bounds,
          evidence: {
            boxWidthPt: boxW,
            boxHeightPt: boxH,
            estimatedTextWidthPt: estW,
            estimatedTextHeightPt: el.contentHeightPt,
            lineWrap,
            lineSpacing: lineSpacingStr,
          },
          explanation: `Text box height was inflated from ${el.contentHeightPt.toFixed(1)}pt to ${boxH.toFixed(1)}pt by parent centering. In HWPX, vertAlign="CENTER" pushes text baseline downward into card.`,
        });
      }

      // 2. Check Narrow Single Line Wrap Risk
      if (!wrapRes.isMultiLineBox && lineWrap === "BREAK" && estW > boxW + 2) {
        risks.push({
          id: el.id,
          name: el.name,
          textSnippet: textSnippet.slice(0, 40),
          pageNumber: page.pageNumber,
          riskType: "NARROW_SINGLE_LINE_WRAP_RISK",
          confidence: "HIGH",
          isIntentional: false,
          boundsPt: el.bounds,
          evidence: {
            boxWidthPt: boxW,
            boxHeightPt: boxH,
            estimatedTextWidthPt: estW,
            estimatedTextHeightPt: estH,
            lineWrap,
            lineSpacing: lineSpacingStr,
          },
          explanation: `Single-line label has width deficit (est text width ${estW.toFixed(1)}pt > box width ${boxW.toFixed(1)}pt). Under lineWrap="BREAK", it wraps into 2 lines, doubling height.`,
        });
      }

      // 3. Check Font Fallback Risk
      const hasKorean = /[가-힣]/.test(textSnippet);
      const isReferencedToLatin = hwpxTb?.runs.some((r) => r.fontFaceHangul === "Inter");
      if (hasKorean && isReferencedToLatin) {
        risks.push({
          id: el.id,
          name: el.name,
          textSnippet: textSnippet.slice(0, 40),
          pageNumber: page.pageNumber,
          riskType: "FONT_FALLBACK_RISK",
          confidence: "MEDIUM",
          isIntentional: false,
          boundsPt: el.bounds,
          evidence: {
            boxWidthPt: boxW,
            boxHeightPt: boxH,
            estimatedTextWidthPt: estW,
            estimatedTextHeightPt: estH,
            lineWrap,
            lineSpacing: lineSpacingStr,
          },
          explanation: `Korean text references ASCII font "Inter" (font id 1). Hancom Viewer falls back to system font, which has wider glyph advances, expanding width by ~5-15%.`,
        });
      }

      // 4. Check Vertical Overflow and Immediate Downward Collision
      // Find elements located below this text element
      const siblingsBelow = pElements.filter(
        (sib) =>
          sib.id !== el.id &&
          sib.bounds.y >= el.bounds.y + el.bounds.height - 2 && // below
          sib.bounds.y <= el.bounds.y + el.bounds.height + 40 && // within 40pt
          Math.max(el.bounds.x, sib.bounds.x) < Math.min(el.bounds.x + el.bounds.width, sib.bounds.x + sib.bounds.width) // horizontally overlapping
      );

      for (const sib of siblingsBelow) {
        const gapPt = sib.bounds.y - (el.bounds.y + el.bounds.height);
        // If text wraps into 2 lines, extra height added:
        const extraWrapHeight = (!wrapRes.isMultiLineBox && estW > boxW) ? (el.fontSizePt || 10) * 1.6 : 0;
        if (extraWrapHeight > gapPt) {
          risks.push({
            id: el.id,
            name: el.name,
            textSnippet: textSnippet.slice(0, 40),
            pageNumber: page.pageNumber,
            riskType: "VERTICAL_OVERFLOW_COLLISION",
            confidence: "HIGH",
            isIntentional: false,
            boundsPt: el.bounds,
            evidence: {
              boxWidthPt: boxW,
              boxHeightPt: boxH,
              estimatedTextWidthPt: estW,
              estimatedTextHeightPt: estH,
              lineWrap,
              lineSpacing: lineSpacingStr,
              gapToNextElementPt: parseFloat(gapPt.toFixed(2)),
              overlappingWithElementId: sib.id,
              overlappingWithElementName: sib.name,
            },
            explanation: `Gap to sibling below ("${sib.name.slice(0, 20)}") is only ${gapPt.toFixed(1)}pt. Wrap expansion (${extraWrapHeight.toFixed(1)}pt) directly collides with below element!`,
          });
        }
      }

      // 5. Check Intentional Background Overlay vs Actual BBox Intersection
      for (let j = 0; j < pElements.length; j++) {
        if (i === j) continue;
        const other = pElements[j];

        // Check 2D intersection
        const xOverlap = Math.max(0, Math.min(el.bounds.x + el.bounds.width, other.bounds.x + other.bounds.width) - Math.max(el.bounds.x, other.bounds.x));
        const yOverlap = Math.max(0, Math.min(el.bounds.y + el.bounds.height, other.bounds.y + other.bounds.height) - Math.max(el.bounds.y, other.bounds.y));

        if (xOverlap > 5 && yOverlap > 5) {
          const isOtherContainer =
            other.type === "card" ||
            other.type === "image" ||
            (other.style && other.style.fillColor && !other.textRuns);

          if (isOtherContainer) {
            risks.push({
              id: el.id,
              name: el.name,
              textSnippet: textSnippet.slice(0, 40),
              pageNumber: page.pageNumber,
              riskType: "INTENTIONAL_BACKGROUND_OVERLAY",
              confidence: "LOW",
              isIntentional: true,
              boundsPt: el.bounds,
              evidence: {
                boxWidthPt: boxW,
                boxHeightPt: boxH,
                estimatedTextWidthPt: estW,
                estimatedTextHeightPt: estH,
                lineWrap,
                lineSpacing: lineSpacingStr,
                overlappingWithElementId: other.id,
                overlappingWithElementName: other.name,
              },
              explanation: `Intentional background card/container overlay with ${other.type} "${other.name}". Not a visual error.`,
            });
          } else if (other.type === "text" || (other.textRuns && other.textRuns.length > 0)) {
            // Text on text collision!
            risks.push({
              id: el.id,
              name: el.name,
              textSnippet: textSnippet.slice(0, 40),
              pageNumber: page.pageNumber,
              riskType: "ACTUAL_BBOX_INTERSECTION",
              confidence: "HIGH",
              isIntentional: false,
              boundsPt: el.bounds,
              evidence: {
                boxWidthPt: boxW,
                boxHeightPt: boxH,
                estimatedTextWidthPt: estW,
                estimatedTextHeightPt: estH,
                lineWrap,
                lineSpacing: lineSpacingStr,
                overlappingWithElementId: other.id,
                overlappingWithElementName: other.name,
              },
              explanation: `Direct BBox intersection (${xOverlap.toFixed(1)} x ${yOverlap.toFixed(1)} pt) with another text element "${other.name.slice(0, 25)}" on page ${page.pageNumber}.`,
            });
          }
        }
      }
    }
  }

  // Deduplicate and aggregate
  const riskSummary: Record<CollisionRiskType, number> = {
    NARROW_SINGLE_LINE_WRAP_RISK: 0,
    VERTICAL_OVERFLOW_COLLISION: 0,
    EXCESSIVE_LINE_SPACING_EXPANSION: 0,
    INSUFFICIENT_BOX_HEIGHT: 0,
    PARENT_GEOMETRY_INFLATION: 0,
    FONT_FALLBACK_RISK: 0,
    ACTUAL_BBOX_INTERSECTION: 0,
    INTENTIONAL_BACKGROUND_OVERLAY: 0,
  };

  for (const r of risks) {
    riskSummary[r.riskType] = (riskSummary[r.riskType] || 0) + 1;
  }

  const criticalRisks = risks.filter((r) => !r.isIntentional);
  const intentionalOverlays = risks.filter((r) => r.isIntentional);

  return {
    stageName,
    generatedAt: new Date().toISOString(),
    totalPages: doc.pages.length,
    totalElements: doc.pages.reduce((sum, p) => sum + p.elements.length, 0),
    totalTextElements: doc.pages.reduce((sum, p) => sum + p.elements.filter((e) => e.type === "text").length, 0),
    riskSummary,
    confidenceSummary: {
      HIGH: criticalRisks.filter((r) => r.confidence === "HIGH").length,
      MEDIUM: criticalRisks.filter((r) => r.confidence === "MEDIUM").length,
      LOW: criticalRisks.filter((r) => r.confidence === "LOW").length,
    },
    criticalCollisionRisks: criticalRisks,
    intentionalOverlays,
  };
}

async function main() {
  console.log("=== TASK E: HWPX VISUAL COLLISION RISK EVALUATION ===");

  const parser = new FigmaCanvasParser();

  // Stage 6
  const s6Raw = JSON.parse(fs.readFileSync("samples/real-world/sample-a-proposal-doc.json", "utf-8"));
  const s6Doc = parser.parse(s6Raw);
  const s6HwpxAnalysis = await analyzeHwpxLayout("debug/hwpx-recovery/stage6-representative-report.hwpx");
  const s6RiskReport = evaluateCollisionRisks(s6Doc, s6HwpxAnalysis, "Stage 6 (Proposal Document)");

  // Stage 7
  const s7Raw = JSON.parse(fs.readFileSync("debug/customer/Report1-Live-Snapshot.json", "utf-8"));
  const s7Doc = parser.parse(s7Raw);
  const s7HwpxAnalysis = await analyzeHwpxLayout("debug/hwpx-recovery/stage7-full-report.hwpx");
  const s7RiskReport = evaluateCollisionRisks(s7Doc, s7HwpxAnalysis, "Stage 7 (Customer 9-Page Report)");

  console.log(`\n--- Stage 6 Collision Risks ---`);
  console.log(`Critical Risks (High Confidence): ${s6RiskReport.confidenceSummary.HIGH}`);
  console.log(`Risk Types:`, s6RiskReport.riskSummary);

  console.log(`\n--- Stage 7 Collision Risks ---`);
  console.log(`Critical Risks: HIGH=${s7RiskReport.confidenceSummary.HIGH}, MEDIUM=${s7RiskReport.confidenceSummary.MEDIUM}`);
  console.log(`Risk Types Breakdown:`, s7RiskReport.riskSummary);
  console.log(`Intentional Overlays Filtered Out: ${s7RiskReport.intentionalOverlays.length}`);

  const outDir = "research/rea-document-engine/phase24-layout-audit";
  fs.writeFileSync(
    path.join(outDir, "collision_risk_report.json"),
    JSON.stringify({ s6: s6RiskReport, s7: s7RiskReport }, null, 2),
    "utf-8"
  );
  console.log(`\nSaved collision risk report to ${path.join(outDir, "collision_risk_report.json")}`);
}

main().catch(console.error);

