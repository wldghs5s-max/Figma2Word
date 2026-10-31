import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { decodePng, encodePng, DecodedImage } from "../src/fidelity/pngDecoder.js";
import {
  compareImages,
  compositeOverWhite,
  computeContentBoundingBox,
  computeSha256,
} from "../src/fidelity/benchmarkEngine.js";

function createSolidImage(width: number, height: number, r: number, g: number, b: number, a = 255): DecodedImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { width, height, data };
}

describe("Phase 35: Reproducible Visual Fidelity Benchmark Engine Suite", () => {
  it("1. Identical images comparison yields exact SSIM 1.0, MAE 0.0, RMSE 0.0, Mismatch 0.0", () => {
    const img1 = createSolidImage(64, 64, 100, 150, 200);
    const img2 = createSolidImage(64, 64, 100, 150, 200);

    const res = compareImages(img1, img2);
    expect(res.ssim).toBe(1.0);
    expect(res.mae).toBe(0.0);
    expect(res.rmse).toBe(0.0);
    expect(res.mismatchRatio).toBe(0.0);
    expect(res.mismatchPixelCount).toBe(0);
  });

  it("2. Completely different solid images produce significant errors", () => {
    const white = createSolidImage(64, 64, 255, 255, 255);
    const black = createSolidImage(64, 64, 0, 0, 0);

    const res = compareImages(white, black);
    expect(res.ssim).toBeLessThan(0.05);
    expect(res.mae).toBe(255.0);
    expect(res.rmse).toBe(255.0);
    expect(res.mismatchRatio).toBe(1.0);
  });

  it("3. Single pixel change is detected accurately in mismatch counts and MAE", () => {
    const img1 = createSolidImage(32, 32, 200, 200, 200);
    const img2 = createSolidImage(32, 32, 200, 200, 200);
    // Mutate exactly one pixel with severe difference
    img2.data[0] = 0;
    img2.data[1] = 0;
    img2.data[2] = 0;

    const res = compareImages(img1, img2, { tolerance: 10 });
    expect(res.mismatchPixelCount).toBe(1);
    expect(res.mismatchRatio).toBeCloseTo(1 / (32 * 32), 4);
    expect(res.mae).toBeGreaterThan(0.0);
    expect(res.ssim).toBeGreaterThan(0.90);
  });

  it("4. Dimension mismatch triggers proper canvas bounds and warning without crash", () => {
    const img1 = createSolidImage(40, 40, 200, 200, 200);
    const img2 = createSolidImage(80, 40, 200, 200, 200);

    const res = compareImages(img1, img2);
    expect(res.canvasWidth).toBe(80);
    expect(res.canvasHeight).toBe(40);
    expect(res.dimensionMismatchRatio).toBe(0.5);
    expect(res.warnings.some((w) => w.includes("Dimension mismatch"))).toBe(true);
  });

  it("5. Divergent aspect ratios prevent stretch and record warning", () => {
    const img1 = createSolidImage(100, 100, 255, 255, 255); // 1.0 AR
    const img2 = createSolidImage(200, 100, 255, 255, 255); // 2.0 AR

    const res = compareImages(img1, img2);
    expect(res.warnings.some((w) => w.includes("Aspect ratio divergence"))).toBe(true);
  });

  it("6. Alpha channel differences are composited consistently over white", () => {
    // 50% semi-transparent black over white: R=round(0*0.5 + 255*0.5)=128
    const transparentBlack = createSolidImage(16, 16, 0, 0, 0, 128);
    const opaqueGray = createSolidImage(16, 16, 128, 128, 128, 255);

    const res = compareImages(transparentBlack, opaqueGray, { tolerance: 2 });
    // After white compositing, both become approximately (128, 128, 128)
    expect(res.mae).toBeLessThanOrEqual(1.0);
    expect(res.ssim).toBeGreaterThan(0.99);
  });

  it("7. RGB channel difference computes mathematically exact MAE", () => {
    // Image 1: (100, 100, 100), Image 2: (130, 100, 100) -> dr=30, dg=0, db=0 -> avgDiff = 10.0
    const img1 = createSolidImage(16, 16, 100, 100, 100);
    const img2 = createSolidImage(16, 16, 130, 100, 100);

    const res = compareImages(img1, img2);
    expect(res.mae).toBe(10.0);
    expect(res.rmse).toBe(10.0);
  });

  it("8. Self-comparison / identical SHA-256 detection", () => {
    const img = createSolidImage(16, 16, 255, 0, 0);
    const encoded = encodePng(img);
    const hash1 = computeSha256(encoded);
    const hash2 = computeSha256(encoded);
    expect(hash1).toBe(hash2);
  });

  it("9. Decodes real PNG buffer and encodes lossless roundtrip", () => {
    const original = createSolidImage(32, 24, 50, 100, 150, 200);
    const pngBuf = encodePng(original);
    expect(pngBuf.readUInt32BE(0)).toBe(0x89504e47); // PNG magic

    const decoded = decodePng(pngBuf);
    expect(decoded.width).toBe(32);
    expect(decoded.height).toBe(24);
    expect(decoded.data.length).toBe(32 * 24 * 4);
    expect(decoded.data[0]).toBe(50);
    expect(decoded.data[1]).toBe(100);
    expect(decoded.data[2]).toBe(150);
    expect(decoded.data[3]).toBe(200);
  });

  it("10. Content Bounding Box accurately identifies non-white margins", () => {
    const img = createSolidImage(100, 100, 255, 255, 255); // all white
    // Draw an inner rectangle from (20, 30) to (59, 69) -> w=40, h=40
    for (let y = 30; y < 70; y++) {
      for (let x = 20; x < 60; x++) {
        const idx = (y * 100 + x) * 4;
        img.data[idx] = 0; // Black
        img.data[idx + 1] = 0;
        img.data[idx + 2] = 0;
      }
    }

    const bbox = computeContentBoundingBox(img);
    expect(bbox.minX).toBe(20);
    expect(bbox.minY).toBe(30);
    expect(bbox.maxX).toBe(59);
    expect(bbox.maxY).toBe(69);
    expect(bbox.width).toBe(40);
    expect(bbox.height).toBe(40);
  });

  it("11. Corrupted PNG buffer throws meaningful error rather than crashing unhandled", () => {
    const corruptBuf = Buffer.from("NOT_A_PNG_PAYLOAD_AT_LEAST_24_BYTES_LONG");
    expect(() => decodePng(corruptBuf)).toThrow("Invalid PNG signature");
  });

  it("12. Truncated PNG buffer throws error", () => {
    const incompleteBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(() => decodePng(incompleteBuf)).toThrow();
  });

  it("13. Benchmark execution is strictly deterministic across repeated runs", () => {
    const img1 = createSolidImage(64, 64, 120, 140, 160);
    const img2 = createSolidImage(64, 64, 130, 135, 170);

    const run1 = compareImages(img1, img2);
    const run2 = compareImages(img1, img2);
    expect(run1.ssim).toBe(run2.ssim);
    expect(run1.mae).toBe(run2.mae);
    expect(run1.rmse).toBe(run2.rmse);
    expect(run1.mismatchRatio).toBe(run2.mismatchRatio);
  });

  it("14. Generates valid difference and overlay visualization images", () => {
    const img1 = createSolidImage(32, 32, 255, 255, 255);
    const img2 = createSolidImage(32, 32, 200, 100, 50);

    const res = compareImages(img1, img2, { generateDiffImage: true, generateOverlayImage: true });
    expect(res.diffImage).toBeDefined();
    expect(res.overlayImage).toBeDefined();

    const diffPng = encodePng(res.diffImage!);
    expect(diffPng.length).toBeGreaterThan(50);
    const overlayPng = encodePng(res.overlayImage!);
    expect(overlayPng.length).toBeGreaterThan(50);
  });

  it("15. Empty image comparison throws error", () => {
    const empty1 = { width: 0, height: 0, data: new Uint8Array(0) };
    const empty2 = { width: 0, height: 0, data: new Uint8Array(0) };
    expect(() => compareImages(empty1, empty2)).toThrow("Cannot compare empty images");
  });

  it("16. NaN and Infinity defenses clamp SSIM strictly between 0.0 and 1.0", () => {
    const zeroVarImg1 = createSolidImage(16, 16, 128, 128, 128);
    const zeroVarImg2 = createSolidImage(16, 16, 128, 128, 128);
    const res = compareImages(zeroVarImg1, zeroVarImg2);
    expect(Number.isFinite(res.ssim)).toBe(true);
    expect(res.ssim).toBeGreaterThanOrEqual(0.0);
    expect(res.ssim).toBeLessThanOrEqual(1.0);
  });
});
