import fs from "fs";
import path from "path";
import { decodePng, DecodedImage } from "./pngDecoder.js";

export interface EditedObjectBox {
  page: number; // 1-indexed
  leftPt: number;
  topPt: number;
  widthPt: number;
  heightPt: number;
  category: string;
  marker?: string;
}

export interface PageLayoutStabilityResult {
  pageNumber: number;
  hasEdits: boolean;
  editedObjectsCount: number;
  totalPixelsChecked: number;
  unchangedPixelsCount: number;
  unchangedRegionMismatchCount: number;
  unchangedRegionMismatchRatio: number;
  unchangedRegionMae: number;
  isStable: boolean;
  diagnostics: string;
}

export interface LayoutStabilityReport {
  timestamp: string;
  totalPages: number;
  pageCountPreserved: boolean;
  sectionCountPreserved: boolean;
  totalEditedObjects: number;
  unintendedRegressionsCount: number;
  averageUnchangedMismatchRatio: number;
  averageUnchangedMae: number;
  layoutStabilityVerdict: "VERIFIED" | "PARTIAL" | "FAILED";
  pages: PageLayoutStabilityResult[];
}

/**
 * Audits layout stability across BeforeEdit and AfterEdit Word renders by masking
 * out edited objects and asserting zero collateral damage on unedited document regions.
 */
export function auditLayoutStability(
  beforePagesDir: string,
  afterPagesDir: string,
  editedBoxes: EditedObjectBox[],
  totalPages: number = 17,
  pageCountPreserved: boolean = true,
  sectionCountPreserved: boolean = true
): LayoutStabilityReport {
  const pageResults: PageLayoutStabilityResult[] = [];
  let regressionsCount = 0;
  let totalMismatchSum = 0;
  let totalMaeSum = 0;

  for (let p = 1; p <= totalPages; p++) {
    const pStr = String(p).padStart(3, "0");
    const beforePngPath = path.join(beforePagesDir, `page-${pStr}.png`);
    const afterPngPath = path.join(afterPagesDir, `page-${pStr}.png`);

    if (!fs.existsSync(beforePngPath) || !fs.existsSync(afterPngPath)) {
      pageResults.push({
        pageNumber: p,
        hasEdits: false,
        editedObjectsCount: 0,
        totalPixelsChecked: 0,
        unchangedPixelsCount: 0,
        unchangedRegionMismatchCount: 0,
        unchangedRegionMismatchRatio: 1.0,
        unchangedRegionMae: 255,
        isStable: false,
        diagnostics: `Missing PNG file for page ${pStr}`,
      });
      regressionsCount++;
      continue;
    }

    const beforeImg = decodePng(fs.readFileSync(beforePngPath));
    const afterImg = decodePng(fs.readFileSync(afterPngPath));

    const w = Math.min(beforeImg.width, afterImg.width);
    const h = Math.min(beforeImg.height, afterImg.height);

    // Filter boxes on this page
    const pageBoxes = editedBoxes.filter((b) => b.page === p);
    const hasEdits = pageBoxes.length > 0;

    // Convert pt boxes to pixel coordinates
    // Word PDF rasterization is performed at 96 DPI (1 pt = 96/72 px = 4/3 px)
    const scaleX = 4 / 3;
    const scaleY = 4 / 3;

    // Create mask (true = unchanged pixel to check, false = masked edited area)
    const isUnchangedMask = new Uint8Array(w * h);
    isUnchangedMask.fill(1); // default all checked

    const paddingPx = 30; // 30px padding buffer around edited bounding boxes
    for (const box of pageBoxes) {
      const minX = Math.max(0, Math.floor(box.leftPt * scaleX - paddingPx));
      const minY = Math.max(0, Math.floor(box.topPt * scaleY - paddingPx));
      const maxX = Math.min(w - 1, Math.ceil((box.leftPt + box.widthPt) * scaleX + paddingPx));
      const maxY = Math.min(h - 1, Math.ceil((box.topPt + box.heightPt) * scaleY + paddingPx));

      for (let y = minY; y <= maxY; y++) {
        const row = y * w;
        for (let x = minX; x <= maxX; x++) {
          isUnchangedMask[row + x] = 0;
        }
      }
    }

    let unchangedPixels = 0;
    let mismatchCount = 0;
    let diffSum = 0;

    const bData = beforeImg.data;
    const aData = afterImg.data;

    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        const maskIdx = rowOffset + x;
        if (isUnchangedMask[maskIdx] === 0) continue; // masked out

        unchangedPixels++;
        const pIdx = (y * beforeImg.width + x) * 4;
        const dr = Math.abs(bData[pIdx] - aData[pIdx]);
        const dg = Math.abs(bData[pIdx + 1] - aData[pIdx + 1]);
        const db = Math.abs(bData[pIdx + 2] - aData[pIdx + 2]);

        const maxDiff = Math.max(dr, dg, db);
        diffSum += (dr + dg + db) / 3;

        // Tolerance of 10 for font anti-aliasing / subpixel rasterizer noise
        if (maxDiff > 10) {
          mismatchCount++;
        }
      }
    }

    const mismatchRatio =
      unchangedPixels > 0 ? Number((mismatchCount / unchangedPixels).toFixed(5)) : 0;
    const mae = unchangedPixels > 0 ? Number((diffSum / unchangedPixels).toFixed(2)) : 0;

    // A page is stable if unchanged regions experience less than 0.1% unintended alteration
    const isStable = mismatchRatio < 0.001;
    if (!isStable) {
      regressionsCount++;
    }

    totalMismatchSum += mismatchRatio;
    totalMaeSum += mae;

    pageResults.push({
      pageNumber: p,
      hasEdits,
      editedObjectsCount: pageBoxes.length,
      totalPixelsChecked: w * h,
      unchangedPixelsCount: unchangedPixels,
      unchangedRegionMismatchCount: mismatchCount,
      unchangedRegionMismatchRatio: mismatchRatio,
      unchangedRegionMae: mae,
      isStable,
      diagnostics: isStable
        ? `Page ${pStr} stable (mismatch: ${(mismatchRatio * 100).toFixed(3)}%, MAE: ${mae})`
        : `Page ${pStr} UNSTABLE: unintended regression detected outside edited mask (mismatch: ${(mismatchRatio * 100).toFixed(3)}%)`,
    });
  }

  const avgMismatch = totalPages > 0 ? Number((totalMismatchSum / totalPages).toFixed(5)) : 0;
  const avgMae = totalPages > 0 ? Number((totalMaeSum / totalPages).toFixed(2)) : 0;

  const verdict =
    pageCountPreserved && sectionCountPreserved && regressionsCount === 0
      ? "VERIFIED"
      : regressionsCount <= 1
      ? "PARTIAL"
      : "FAILED";

  return {
    timestamp: new Date().toISOString(),
    totalPages,
    pageCountPreserved,
    sectionCountPreserved,
    totalEditedObjects: editedBoxes.length,
    unintendedRegressionsCount: regressionsCount,
    averageUnchangedMismatchRatio: avgMismatch,
    averageUnchangedMae: avgMae,
    layoutStabilityVerdict: verdict,
    pages: pageResults,
  };
}
