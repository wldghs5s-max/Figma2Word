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

export type PageStabilityStatus =
  | "STABLE"
  | "LAYOUT_REGRESSION_DETECTED"
  | "INSUFFICIENT_INSPECTION_COVERAGE"
  | "INVALID_MASK"
  | "IMAGE_DIMENSION_MISMATCH"
  | "MISSING_RENDER_EVIDENCE"
  | "UNVERIFIED";

export interface PageLayoutStabilityResult {
  pageNumber: number;
  status: PageStabilityStatus;
  hasEdits: boolean;
  editedObjectsCount: number;
  totalPixelsChecked: number;
  totalPixels: number;
  maskedPixels: number;
  inspectedPixels: number;
  inspectedRatio: number;
  unchangedPixelsCount: number;
  unchangedRegionMismatchCount: number;
  unchangedRegionMismatchRatio: number;
  unmaskedMismatchRatio: number;
  unchangedRegionMae: number;
  unmaskedMae: number;
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
  insufficientCoverageCount: number;
  dimensionMismatchCount: number;
  missingEvidenceCount: number;
  stablePagesCount: number;
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
  sectionCountPreserved: boolean = true,
  options?: { minInspectedRatio?: number }
): LayoutStabilityReport {
  const minInspectedRatio = options?.minInspectedRatio ?? 0.05;
  const pageResults: PageLayoutStabilityResult[] = [];
  let regressionsCount = 0;
  let insufficientCoverageCount = 0;
  let dimensionMismatchCount = 0;
  let missingEvidenceCount = 0;
  let stablePagesCount = 0;
  let totalMismatchSum = 0;
  let totalMaeSum = 0;

  if (totalPages <= 0) {
    return {
      timestamp: new Date().toISOString(),
      totalPages: 0,
      pageCountPreserved,
      sectionCountPreserved,
      totalEditedObjects: editedBoxes.length,
      unintendedRegressionsCount: 1,
      insufficientCoverageCount: 0,
      dimensionMismatchCount: 0,
      missingEvidenceCount: 0,
      stablePagesCount: 0,
      averageUnchangedMismatchRatio: 1.0,
      averageUnchangedMae: 255,
      layoutStabilityVerdict: "FAILED",
      pages: [],
    };
  }

  for (let p = 1; p <= totalPages; p++) {
    const pStr = String(p).padStart(3, "0");
    const beforePngPath = path.join(beforePagesDir, `page-${pStr}.png`);
    const afterPngPath = path.join(afterPagesDir, `page-${pStr}.png`);

    if (!fs.existsSync(beforePngPath) || !fs.existsSync(afterPngPath)) {
      pageResults.push({
        pageNumber: p,
        status: "MISSING_RENDER_EVIDENCE",
        hasEdits: false,
        editedObjectsCount: 0,
        totalPixelsChecked: 0,
        totalPixels: 0,
        maskedPixels: 0,
        inspectedPixels: 0,
        inspectedRatio: 0,
        unchangedPixelsCount: 0,
        unchangedRegionMismatchCount: 0,
        unchangedRegionMismatchRatio: 1.0,
        unmaskedMismatchRatio: 1.0,
        unchangedRegionMae: 255,
        unmaskedMae: 255,
        isStable: false,
        diagnostics: `Missing PNG file for page ${pStr}`,
      });
      regressionsCount++;
      missingEvidenceCount++;
      continue;
    }

    const beforeImg = decodePng(fs.readFileSync(beforePngPath));
    const afterImg = decodePng(fs.readFileSync(afterPngPath));

    // Stride & dimension mismatch check:
    // Different widths or heights must fail stability, not be silently clipped!
    if (beforeImg.width !== afterImg.width || beforeImg.height !== afterImg.height) {
      pageResults.push({
        pageNumber: p,
        status: "IMAGE_DIMENSION_MISMATCH",
        hasEdits: false,
        editedObjectsCount: 0,
        totalPixelsChecked: beforeImg.width * beforeImg.height,
        totalPixels: beforeImg.width * beforeImg.height,
        maskedPixels: 0,
        inspectedPixels: 0,
        inspectedRatio: 0,
        unchangedPixelsCount: 0,
        unchangedRegionMismatchCount: 0,
        unchangedRegionMismatchRatio: 1.0,
        unmaskedMismatchRatio: 1.0,
        unchangedRegionMae: 255,
        unmaskedMae: 255,
        isStable: false,
        diagnostics: `Image dimension mismatch: Before ${beforeImg.width}x${beforeImg.height} vs After ${afterImg.width}x${afterImg.height}`,
      });
      regressionsCount++;
      dimensionMismatchCount++;
      continue;
    }

    const w = beforeImg.width;
    const h = beforeImg.height;
    const totalPixels = w * h;

    // Filter boxes on this page
    const pageBoxes = editedBoxes.filter((b) => b.page === p);
    const hasEdits = pageBoxes.length > 0;

    // Convert pt boxes to pixel coordinates
    // Word PDF rasterization is performed at 96 DPI (1 pt = 96/72 px = 4/3 px)
    const scaleX = 4 / 3;
    const scaleY = 4 / 3;

    // Create mask (true = unchanged pixel to check, false = masked edited area)
    const isUnchangedMask = new Uint8Array(totalPixels);
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

    let maskedPixels = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (isUnchangedMask[i] === 0) maskedPixels++;
    }
    const inspectedPixels = totalPixels - maskedPixels;
    const inspectedRatio = totalPixels > 0 ? Number((inspectedPixels / totalPixels).toFixed(4)) : 0;

    // Full mask or insufficient inspected ratio check (fail-closed against 0 inspected pixels)
    if (inspectedPixels === 0 || inspectedRatio < minInspectedRatio) {
      pageResults.push({
        pageNumber: p,
        status: "INSUFFICIENT_INSPECTION_COVERAGE",
        hasEdits,
        editedObjectsCount: pageBoxes.length,
        totalPixelsChecked: totalPixels,
        totalPixels,
        maskedPixels,
        inspectedPixels,
        inspectedRatio,
        unchangedPixelsCount: inspectedPixels,
        unchangedRegionMismatchCount: 0,
        unchangedRegionMismatchRatio: 1.0,
        unmaskedMismatchRatio: 1.0,
        unchangedRegionMae: 255,
        unmaskedMae: 255,
        isStable: false,
        diagnostics: `INSUFFICIENT_INSPECTION_COVERAGE: Insufficient inspected pixels: ${inspectedPixels}/${totalPixels} (inspectedRatio ${(inspectedRatio * 100).toFixed(2)}% below minimum ${(minInspectedRatio * 100).toFixed(2)}%). Mask covers entire or vast majority of page.`,
      });
      regressionsCount++;
      insufficientCoverageCount++;
      continue;
    }

    let mismatchCount = 0;
    let diffSum = 0;

    const bData = beforeImg.data;
    const aData = afterImg.data;

    // Individual stride accounting
    const bStride = beforeImg.width * 4;
    const aStride = afterImg.width * 4;

    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      const bRow = y * bStride;
      const aRow = y * aStride;
      for (let x = 0; x < w; x++) {
        const maskIdx = rowOffset + x;
        if (isUnchangedMask[maskIdx] === 0) continue; // masked out

        const bIdx = bRow + x * 4;
        const aIdx = aRow + x * 4;

        const dr = Math.abs(bData[bIdx] - aData[aIdx]);
        const dg = Math.abs(bData[bIdx + 1] - aData[aIdx + 1]);
        const db = Math.abs(bData[bIdx + 2] - aData[aIdx + 2]);

        const maxDiff = Math.max(dr, dg, db);
        diffSum += (dr + dg + db) / 3;

        // Tolerance of 10 for font anti-aliasing / subpixel rasterizer noise
        if (maxDiff > 10) {
          mismatchCount++;
        }
      }
    }

    const mismatchRatio = Number((mismatchCount / inspectedPixels).toFixed(5));
    const mae = Number((diffSum / inspectedPixels).toFixed(2));

    // Finite sanity check
    if (!Number.isFinite(mismatchRatio) || !Number.isFinite(mae)) {
      pageResults.push({
        pageNumber: p,
        status: "UNVERIFIED",
        hasEdits,
        editedObjectsCount: pageBoxes.length,
        totalPixelsChecked: totalPixels,
        totalPixels,
        maskedPixels,
        inspectedPixels,
        inspectedRatio,
        unchangedPixelsCount: inspectedPixels,
        unchangedRegionMismatchCount: mismatchCount,
        unchangedRegionMismatchRatio: 1.0,
        unmaskedMismatchRatio: 1.0,
        unchangedRegionMae: 255,
        unmaskedMae: 255,
        isStable: false,
        diagnostics: `Non-finite MAE or mismatch ratio detected on page ${pStr}`,
      });
      regressionsCount++;
      continue;
    }

    // A page is stable if unchanged regions experience less than 0.1% unintended alteration
    const isStable = mismatchRatio < 0.001;
    let pageStatus: PageStabilityStatus = "STABLE";
    if (!isStable) {
      regressionsCount++;
      pageStatus = "LAYOUT_REGRESSION_DETECTED";
    } else {
      stablePagesCount++;
    }

    totalMismatchSum += mismatchRatio;
    totalMaeSum += mae;

    pageResults.push({
      pageNumber: p,
      status: pageStatus,
      hasEdits,
      editedObjectsCount: pageBoxes.length,
      totalPixelsChecked: totalPixels,
      totalPixels,
      maskedPixels,
      inspectedPixels,
      inspectedRatio,
      unchangedPixelsCount: inspectedPixels,
      unchangedRegionMismatchCount: mismatchCount,
      unchangedRegionMismatchRatio: mismatchRatio,
      unmaskedMismatchRatio: mismatchRatio,
      unchangedRegionMae: mae,
      unmaskedMae: mae,
      isStable,
      diagnostics: isStable
        ? `Page ${pStr} stable (mismatch: ${(mismatchRatio * 100).toFixed(3)}%, MAE: ${mae})`
        : `Page ${pStr} UNSTABLE: unintended regression detected outside edited mask (mismatch: ${(mismatchRatio * 100).toFixed(3)}%). Root cause: ROOT_CAUSE_UNVERIFIED (suspect inline overflow or collateral re-flow).`,
    });
  }

  const avgMismatch = totalPages > 0 ? Number((totalMismatchSum / totalPages).toFixed(5)) : 0;
  const avgMae = totalPages > 0 ? Number((totalMaeSum / totalPages).toFixed(2)) : 0;

  let verdict: "VERIFIED" | "PARTIAL" | "FAILED" = "FAILED";
  if (totalPages <= 0) {
    verdict = "FAILED";
  } else if (pageCountPreserved && sectionCountPreserved && regressionsCount === 0) {
    verdict = "VERIFIED";
  } else if (regressionsCount < totalPages && regressionsCount <= 1 && totalPages >= 3) {
    verdict = "PARTIAL";
  } else {
    verdict = "FAILED";
  }

  return {
    timestamp: new Date().toISOString(),
    totalPages,
    pageCountPreserved,
    sectionCountPreserved,
    totalEditedObjects: editedBoxes.length,
    unintendedRegressionsCount: regressionsCount,
    insufficientCoverageCount,
    dimensionMismatchCount,
    missingEvidenceCount,
    stablePagesCount,
    averageUnchangedMismatchRatio: avgMismatch,
    averageUnchangedMae: avgMae,
    layoutStabilityVerdict: verdict,
    pages: pageResults,
  };
}
