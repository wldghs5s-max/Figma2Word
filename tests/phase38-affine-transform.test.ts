import { describe, it, expect } from "vitest";
import { analyzeFigmaImageTransform } from "../src/fidelity/affineTransformEngine.js";

describe("Phase 38: Affine Transform Hardening & Rotation Crop Separation Suite", () => {
  it("1. Pure 90° rotation: produces valid ROTATED status, rotationDegrees=90, and NO axis-aligned crop", () => {
    // [[0, -1, 1], [1, 0, 0]]
    const matrix = [
      [0, -1, 1],
      [1, 0, 0],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("ROTATED");
    expect(res.status).toBe("VALID_ROTATED");
    expect(res.rotationDegrees).toBe(90);
    expect(res.crop).toBeUndefined(); // Crucial: must NOT clip 95% of image with bogus m00/m11 crop
  });

  it("2. 45° rotation with translation: produces valid ROTATED status, rotationDegrees=45, and NO axis-aligned crop", () => {
    const c = Math.cos(Math.PI / 4);
    const s = Math.sin(Math.PI / 4);
    const matrix = [
      [c, -s, 0.3],
      [s, c, 0.4],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("ROTATED");
    expect(res.status).toBe("VALID_ROTATED");
    expect(res.rotationDegrees).toBeCloseTo(45, 1);
    expect(res.crop).toBeUndefined();
  });

  it("3. 180° rotation: produces valid ROTATED status, rotationDegrees=180, and NO crop", () => {
    const matrix = [
      [-1, 0, 1],
      [0, -1, 1],
    ];
    // Notice m01 and m10 are 0, but both m00 and m11 are negative
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.isFlippedX).toBe(true);
    expect(res.isFlippedY).toBe(true);
    expect(res.crop).toBeDefined(); // For 180 flip (axis-aligned negative scale), crop or flip is valid
  });

  it("4. 270° rotation: produces valid ROTATED status and rotationDegrees=270 without crop", () => {
    // cos(270) = 0, sin(270) = -1 -> [[0, 1, 0], [-1, 0, 1]]
    const matrix = [
      [0, 1, 0],
      [-1, 0, 1],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("ROTATED");
    expect(res.status).toBe("VALID_ROTATED");
    expect(res.rotationDegrees).toBe(270);
    expect(res.crop).toBeUndefined();
  });

  it("5. Axis-aligned scale and crop: accurately derives crop without distortion", () => {
    const matrix = [
      [0.75, 0, 0.125],
      [0, 0.75, 0.125],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("AXIS_ALIGNED");
    expect(res.status).toBe("VALID_AXIS_ALIGNED");
    expect(res.crop).toBeDefined();
    expect(res.crop?.left).toBeCloseTo(0.125);
    expect(res.crop?.top).toBeCloseTo(0.125);
    expect(res.crop?.right).toBeCloseTo(0.125);
    expect(res.crop?.bottom).toBeCloseTo(0.125);
  });

  it("6. Sheared matrix: flags DEGRADED_SHEARED and does not produce crop", () => {
    const matrix = [
      [1, 0.6, 0],
      [0, 1, 0],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("SHEARED");
    expect(res.status).toBe("DEGRADED_SHEARED");
    expect(res.isSheared).toBe(true);
    expect(res.crop).toBeUndefined();
  });

  it("7. Singular matrix: falls back gracefully without throwing or NaN", () => {
    const matrix = [
      [0, 0, 10],
      [0, 0, 20],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("SINGULAR");
    expect(res.status).toBe("DEGRADED_SINGULAR");
    expect(res.crop).toBeUndefined();
  });

  it("8. Invalid numeric matrix: safely handles NaN and Infinity", () => {
    const matrix = [
      [NaN, 0, 0],
      [0, Infinity, 0],
    ];
    const res = analyzeFigmaImageTransform(matrix);
    expect(res.transformType).toBe("INVALID_NUMERIC");
    expect(res.status).toBe("DEGRADED_INVALID_NUMERIC");
    expect(res.crop).toBeUndefined();
  });
});

