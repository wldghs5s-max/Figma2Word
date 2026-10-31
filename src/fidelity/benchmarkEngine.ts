import * as crypto from "crypto";
import { DecodedImage, encodePng } from "./pngDecoder.js";

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface ComparisonMetrics {
  width1: number;
  height1: number;
  width2: number;
  height2: number;
  canvasWidth: number;
  canvasHeight: number;
  totalEvaluatedPixels: number;
  mismatchPixelCount: number;
  mismatchRatio: number;
  mae: number;
  rmse: number;
  ssim: number;
  dimensionMismatchRatio: number;
  contentBBox1: BoundingBox;
  contentBBox2: BoundingBox;
  contentBBoxDiff: {
    dx: number;
    dy: number;
    dw: number;
    dh: number;
  };
  warnings: string[];
}

export interface ComparisonOptions {
  tolerance?: number; // default 10 (on 0-255 scale)
  windowSize?: number; // default 8
  compositeOnWhite?: boolean; // default true
  generateDiffImage?: boolean;
  generateOverlayImage?: boolean;
}

export interface ComparisonOutput extends ComparisonMetrics {
  diffImage?: DecodedImage;
  overlayImage?: DecodedImage;
}

/**
 * Pre-composites RGBA pixels over pure white (#FFFFFF) background.
 */
export function compositeOverWhite(img: DecodedImage): DecodedImage {
  const { width, height, data } = img;
  const out = new Uint8Array(width * height * 4);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3] / 255.0;

    out[i] = Math.round(r * a + 255 * (1 - a));
    out[i + 1] = Math.round(g * a + 255 * (1 - a));
    out[i + 2] = Math.round(b * a + 255 * (1 - a));
    out[i + 3] = 255;
  }

  return { width, height, data: out };
}

/**
 * Detects bounding box of non-white pixels (threshold < 252 in any RGB channel).
 */
export function computeContentBoundingBox(img: DecodedImage, threshold = 252): BoundingBox {
  const { width, height, data } = img;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (r < threshold || g < threshold || b < threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Core image comparison engine calculating exact SSIM, MAE, RMSE, Mismatch Ratio,
 * and Bounding Box divergence.
 */
export function compareImages(
  img1Raw: DecodedImage,
  img2Raw: DecodedImage,
  options?: ComparisonOptions
): ComparisonOutput {
  const tolerance = options?.tolerance ?? 10;
  const windowSize = options?.windowSize ?? 8;
  const composite = options?.compositeOnWhite ?? true;
  const genDiff = options?.generateDiffImage ?? false;
  const genOverlay = options?.generateOverlayImage ?? false;

  const warnings: string[] = [];

  const img1 = composite ? compositeOverWhite(img1Raw) : img1Raw;
  const img2 = composite ? compositeOverWhite(img2Raw) : img2Raw;

  const w1 = img1.width;
  const h1 = img1.height;
  const w2 = img2.width;
  const h2 = img2.height;

  const canvasW = Math.max(w1, w2);
  const canvasH = Math.max(h1, h2);
  const totalPixels = canvasW * canvasH;

  if (totalPixels === 0) {
    throw new Error("Cannot compare empty images (0 pixels)");
  }

  // Dimension mismatch
  const area1 = w1 * h1;
  const area2 = w2 * h2;
  const dimensionMismatchRatio = Number((Math.abs(area1 - area2) / Math.max(area1, area2)).toFixed(4));
  if (w1 !== w2 || h1 !== h2) {
    warnings.push(`Dimension mismatch: Image1 is ${w1}x${h1}, Image2 is ${w2}x${h2}`);
  }

  // Check aspect ratios
  const ar1 = w1 / h1;
  const ar2 = w2 / h2;
  if (Math.abs(ar1 - ar2) > 0.05) {
    warnings.push(`Aspect ratio divergence: ${(ar1).toFixed(3)} vs ${(ar2).toFixed(3)}`);
  }

  // Content bounding boxes
  const bbox1 = computeContentBoundingBox(img1);
  const bbox2 = computeContentBoundingBox(img2);
  const bboxDiff = {
    dx: bbox1.minX - bbox2.minX,
    dy: bbox1.minY - bbox2.minY,
    dw: bbox1.width - bbox2.width,
    dh: bbox1.height - bbox2.height,
  };

  // Difference and overlay buffers
  let diffData: Uint8Array | undefined;
  let overlayData: Uint8Array | undefined;
  if (genDiff) diffData = new Uint8Array(canvasW * canvasH * 4);
  if (genOverlay) overlayData = new Uint8Array(canvasW * canvasH * 4);

  let mismatchCount = 0;
  let sumAbsDiff = 0.0;
  let sumSqDiff = 0.0;

  // Luminance arrays for SSIM (using canvas coordinates)
  const lum1 = new Float64Array(canvasW * canvasH);
  const lum2 = new Float64Array(canvasW * canvasH);

  for (let y = 0; y < canvasH; y++) {
    const rowOffsetCanvas = y * canvasW;
    const inY1 = y < h1;
    const inY2 = y < h2;
    const rowOffset1 = inY1 ? y * w1 * 4 : 0;
    const rowOffset2 = inY2 ? y * w2 * 4 : 0;

    for (let x = 0; x < canvasW; x++) {
      const canvasIdx = rowOffsetCanvas + x;
      const canvasPixelIdx = canvasIdx * 4;

      const in1 = inY1 && x < w1;
      const in2 = inY2 && x < w2;

      let r1 = 255, g1 = 255, b1 = 255;
      let r2 = 255, g2 = 255, b2 = 255;

      if (in1) {
        const idx1 = rowOffset1 + x * 4;
        r1 = img1.data[idx1];
        g1 = img1.data[idx1 + 1];
        b1 = img1.data[idx1 + 2];
      }
      if (in2) {
        const idx2 = rowOffset2 + x * 4;
        r2 = img2.data[idx2];
        g2 = img2.data[idx2 + 1];
        b2 = img2.data[idx2 + 2];
      }

      // Convert to standard ITU-R BT.601 luminance
      const l1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
      const l2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
      lum1[canvasIdx] = l1;
      lum2[canvasIdx] = l2;

      if (in1 && in2) {
        const dr = Math.abs(r1 - r2);
        const dg = Math.abs(g1 - g2);
        const db = Math.abs(b1 - b2);
        const avgDiff = (dr + dg + db) / 3.0;

        sumAbsDiff += avgDiff;
        sumSqDiff += avgDiff * avgDiff;

        const isMismatch = avgDiff > tolerance;
        if (isMismatch) mismatchCount++;

        if (diffData) {
          if (isMismatch) {
            // Magenta highlight for difference
            diffData[canvasPixelIdx] = 235;
            diffData[canvasPixelIdx + 1] = 15;
            diffData[canvasPixelIdx + 2] = 120;
            diffData[canvasPixelIdx + 3] = 255;
          } else {
            // Muted grayscale for matching context
            const gray = Math.min(255, Math.round(l1 * 0.4 + 140));
            diffData[canvasPixelIdx] = gray;
            diffData[canvasPixelIdx + 1] = gray;
            diffData[canvasPixelIdx + 2] = gray;
            diffData[canvasPixelIdx + 3] = 255;
          }
        }

        if (overlayData) {
          overlayData[canvasPixelIdx] = Math.round(r1 * 0.5 + r2 * 0.5);
          overlayData[canvasPixelIdx + 1] = Math.round(g1 * 0.5 + g2 * 0.5);
          overlayData[canvasPixelIdx + 2] = Math.round(b1 * 0.5 + b2 * 0.5);
          overlayData[canvasPixelIdx + 3] = 255;
        }
      } else {
        // Out of bounds in one image
        mismatchCount++;
        sumAbsDiff += 255.0;
        sumSqDiff += 255.0 * 255.0;

        if (diffData) {
          // Cyan highlight for dimension overflow
          diffData[canvasPixelIdx] = 0;
          diffData[canvasPixelIdx + 1] = 180;
          diffData[canvasPixelIdx + 2] = 255;
          diffData[canvasPixelIdx + 3] = 255;
        }
        if (overlayData) {
          overlayData[canvasPixelIdx] = 240;
          overlayData[canvasPixelIdx + 1] = 240;
          overlayData[canvasPixelIdx + 2] = 240;
          overlayData[canvasPixelIdx + 3] = 255;
        }
      }
    }
  }

  const mae = Number((sumAbsDiff / totalPixels).toFixed(2));
  const rmse = Number(Math.sqrt(sumSqDiff / totalPixels).toFixed(2));
  const mismatchRatio = Number((mismatchCount / totalPixels).toFixed(4));

  // Compute SSIM using sliding / block window
  // Standard constants: C1 = (K1*L)^2, C2 = (K2*L)^2 with K1=0.01, K2=0.03, L=255
  const C1 = 6.5025;
  const C2 = 58.5225;

  let ssimSum = 0.0;
  let windowCount = 0;

  const step = windowSize;
  for (let wy = 0; wy <= canvasH - windowSize; wy += step) {
    for (let wx = 0; wx <= canvasW - windowSize; wx += step) {
      let sum1 = 0.0;
      let sum2 = 0.0;
      const n = windowSize * windowSize;

      for (let dy = 0; dy < windowSize; dy++) {
        const offset = (wy + dy) * canvasW + wx;
        for (let dx = 0; dx < windowSize; dx++) {
          sum1 += lum1[offset + dx];
          sum2 += lum2[offset + dx];
        }
      }

      const mean1 = sum1 / n;
      const mean2 = sum2 / n;

      let var1 = 0.0;
      let var2 = 0.0;
      let covar = 0.0;

      for (let dy = 0; dy < windowSize; dy++) {
        const offset = (wy + dy) * canvasW + wx;
        for (let dx = 0; dx < windowSize; dx++) {
          const d1 = lum1[offset + dx] - mean1;
          const d2 = lum2[offset + dx] - mean2;
          var1 += d1 * d1;
          var2 += d2 * d2;
          covar += d1 * d2;
        }
      }

      var1 = var1 / (n - 1);
      var2 = var2 / (n - 1);
      covar = covar / (n - 1);

      const num = (2.0 * mean1 * mean2 + C1) * (2.0 * covar + C2);
      const den = (mean1 * mean1 + mean2 * mean2 + C1) * (var1 + var2 + C2);

      let winSsim = den !== 0 ? num / den : 1.0;
      if (isNaN(winSsim)) winSsim = 0.0;
      ssimSum += Math.max(0.0, Math.min(1.0, winSsim));
      windowCount++;
    }
  }

  let finalSsim = windowCount > 0 ? ssimSum / windowCount : (mae === 0 ? 1.0 : 0.0);
  if (isNaN(finalSsim)) finalSsim = 0.0;
  finalSsim = Number(Math.max(0.0, Math.min(1.0, finalSsim)).toFixed(4));

  return {
    width1: w1,
    height1: h1,
    width2: w2,
    height2: h2,
    canvasWidth: canvasW,
    canvasHeight: canvasH,
    totalEvaluatedPixels: totalPixels,
    mismatchPixelCount: mismatchCount,
    mismatchRatio,
    mae,
    rmse,
    ssim: finalSsim,
    dimensionMismatchRatio,
    contentBBox1: bbox1,
    contentBBox2: bbox2,
    contentBBoxDiff: bboxDiff,
    warnings,
    diffImage: diffData ? { width: canvasW, height: canvasH, data: diffData } : undefined,
    overlayImage: overlayData ? { width: canvasW, height: canvasH, data: overlayData } : undefined,
  };
}

/**
 * Computes SHA-256 hash of a file or buffer.
 */
export function computeSha256(data: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
