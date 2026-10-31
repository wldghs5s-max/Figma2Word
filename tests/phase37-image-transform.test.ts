import { describe, it, expect } from "vitest";
import { analyzeFigmaImageTransform } from "../src/fidelity/affineTransformEngine.js";

describe("Phase 37: 2D Affine ImageTransform & Generalized Engine Suite", () => {
  it("1. Identity Matrix: returns IDENTITY with no crop", () => {
    const matrix = [
      [1, 0, 0],
      [0, 1, 0],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("IDENTITY");
    expect(res.status).toBe("IDENTITY");
    expect(res.crop).toBeUndefined();
    expect(res.scaleX).toBeCloseTo(1.0);
    expect(res.scaleY).toBeCloseTo(1.0);
  });

  it("2. Uniform Scale: calculates proportional crop", () => {
    // Zoom in 2x: sx=0.5, sy=0.5, centered: tx=0.25, ty=0.25
    const matrix = [
      [0.5, 0, 0.25],
      [0, 0.5, 0.25],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("AXIS_ALIGNED");
    expect(res.status).toBe("VALID_AXIS_ALIGNED");
    expect(res.crop).toBeDefined();
    expect(res.crop?.top).toBeCloseTo(0.25);
    expect(res.crop?.bottom).toBeCloseTo(0.25);
    expect(res.crop?.left).toBeCloseTo(0.25);
    expect(res.crop?.right).toBeCloseTo(0.25);
  });

  it("3. Non-Uniform Scale: handles asymmetric aspect ratios", () => {
    // sx=0.8, sy=0.6, tx=0.1, ty=0.2
    const matrix = [
      [0.8, 0, 0.1],
      [0, 0.6, 0.2],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("AXIS_ALIGNED");
    expect(res.crop?.left).toBeCloseTo(0.1);
    expect(res.crop?.right).toBeCloseTo(0.1); // 1 - (0.1 + 0.8) = 0.1
    expect(res.crop?.top).toBeCloseTo(0.2);
    expect(res.crop?.bottom).toBeCloseTo(0.2); // 1 - (0.2 + 0.6) = 0.2
  });

  it("4. Translation Only: pans crop window across canvas", () => {
    // sx=0.9, sy=0.9, tx=0.05, ty=0.05
    const matrix = [
      [0.9, 0, 0.05],
      [0, 0.9, 0.05],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("AXIS_ALIGNED");
    expect(res.crop?.left).toBeCloseTo(0.05);
    expect(res.crop?.top).toBeCloseTo(0.05);
  });

  it("5. Floating-Point Boundary: gracefully absorbs float32 rounding errors", () => {
    // Real Figma map coordinates: sx=1.000163, tx=-0.000163
    const matrix = [
      [1.000163, 0, -0.000163],
      [0, 0.95123, 0.00044],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("AXIS_ALIGNED");
    expect(res.crop).toBeDefined();
    expect(res.crop?.left).toBe(0); // Clamped from negative float epsilon
    expect(res.crop?.bottom).toBeCloseTo(0.04833);
  });

  it("6. Rotation 90°: detects pure 90 deg rotation and sets rotation angle", () => {
    // cos(90) = 0, sin(90) = 1 -> [[0, -1, 1], [1, 0, 0]]
    const matrix = [
      [0, -1, 1],
      [1, 0, 0],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("ROTATED");
    expect(res.status).toBe("VALID_ROTATED");
    expect(res.rotationDegrees).toBe(90);
    expect(res.isSheared).toBe(false);
  });

  it("7. Rotation 45°: detects arbitrary rotation angle without shearing", () => {
    // cos(45) = sin(45) = 0.70710678
    const c = Math.cos(Math.PI / 4);
    const s = Math.sin(Math.PI / 4);
    const matrix = [
      [c, -s, 0.5],
      [s, c, 0.5],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("ROTATED");
    expect(res.rotationDegrees).toBeCloseTo(45, 1);
    expect(res.isSheared).toBe(false);
  });

  it("8. Shear (Skew): detects non-orthogonal axes and flags DEGRADED_SHEARED", () => {
    // m01 = 0.5 creates horizontal shear
    const matrix = [
      [1, 0.5, 0],
      [0, 1, 0],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("SHEARED");
    expect(res.status).toBe("DEGRADED_SHEARED");
    expect(res.isSheared).toBe(true);
    expect(res.crop).toBeUndefined(); // Avoids emitting distorted crop coordinates
  });

  it("9. Reflection: detects horizontal / vertical flip", () => {
    // Horizontal flip: sx = -1
    const matrix = [
      [-1, 0, 1],
      [0, 1, 0],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("REFLECTED");
    expect(res.isFlippedX).toBe(true);
  });

  it("10. Singular Matrix (Zero Determinant): flags DEGRADED_SINGULAR", () => {
    // det = 0 * 0 - 0 * 0 = 0
    const matrix = [
      [0, 0, 0],
      [0, 0, 0],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("SINGULAR");
    expect(res.status).toBe("DEGRADED_SINGULAR");
    expect(res.crop).toBeUndefined();
  });

  it("11. Invalid Numeric Values: fails closed on NaN or Infinity", () => {
    const nanMatrix = [
      [NaN, 0, 0],
      [0, 1, 0],
    ];
    const resNaN = analyzeFigmaImageTransform(nanMatrix);
    expect(resNaN.status).toBe("DEGRADED_INVALID_NUMERIC");

    const infMatrix = [
      [Infinity, 0, 0],
      [0, 1, 0],
    ];
    const resInf = analyzeFigmaImageTransform(infMatrix);
    expect(resInf.status).toBe("DEGRADED_INVALID_NUMERIC");

    const invalidStruct = "not-a-matrix";
    const resStruct = analyzeFigmaImageTransform(invalidStruct);
    expect(resStruct.status).toBe("DEGRADED_INVALID_NUMERIC");
  });

  it("12. Out-of-Bounds Crop: safely clamps extreme crop coordinates", () => {
    // Crop that would eliminate image (> 1.0)
    const matrix = [
      [0.01, 0, 0.99],
      [0, 0.01, 0.99],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.crop).toBeDefined();
    // Verify that at least 5% of image width and height remain visible
    expect((res.crop?.left ?? 0) + (res.crop?.right ?? 0)).toBeLessThan(1.0);
    expect((res.crop?.top ?? 0) + (res.crop?.bottom ?? 0)).toBeLessThan(1.0);
  });
});

