export type AffineTransformType =
  | "IDENTITY"
  | "AXIS_ALIGNED"
  | "ROTATED"
  | "REFLECTED"
  | "SHEARED"
  | "SINGULAR"
  | "INVALID_NUMERIC";

export interface AnalyzedAffineTransform {
  transformType: AffineTransformType;
  determinant: number;
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
  rotationDegrees?: number;
  isFlippedX: boolean;
  isFlippedY: boolean;
  isSheared: boolean;
  crop?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  status:
    | "VALID_AXIS_ALIGNED"
    | "VALID_ROTATED"
    | "VALID_REFLECTED"
    | "DEGRADED_SHEARED"
    | "DEGRADED_SINGULAR"
    | "DEGRADED_INVALID_NUMERIC"
    | "IDENTITY";
  diagnostics: string;
}

/**
 * Analyzes a Figma 2x3 affine imageTransform matrix [[m00, m01, m02], [m10, m11, m12]],
 * categorizing scale, translation, rotation, reflection, shear, and numerical singularities,
 * and computing mathematically bounded crop coordinates for Word rendering.
 */
export function analyzeFigmaImageTransform(
  transform: any
): AnalyzedAffineTransform {
  // 1. Structure and numeric validity check
  if (
    !Array.isArray(transform) ||
    transform.length !== 2 ||
    !Array.isArray(transform[0]) ||
    !Array.isArray(transform[1]) ||
    transform[0].length !== 3 ||
    transform[1].length !== 3
  ) {
    return {
      transformType: "INVALID_NUMERIC",
      determinant: 0,
      scaleX: 1,
      scaleY: 1,
      translateX: 0,
      translateY: 0,
      isFlippedX: false,
      isFlippedY: false,
      isSheared: false,
      status: "DEGRADED_INVALID_NUMERIC",
      diagnostics: "Matrix does not conform to 2x3 array structure",
    };
  }

  const m00 = transform[0][0];
  const m01 = transform[0][1];
  const m02 = transform[0][2];
  const m10 = transform[1][0];
  const m11 = transform[1][1];
  const m12 = transform[1][2];

  const allNumbersFinite =
    Number.isFinite(m00) &&
    Number.isFinite(m01) &&
    Number.isFinite(m02) &&
    Number.isFinite(m10) &&
    Number.isFinite(m11) &&
    Number.isFinite(m12);

  if (!allNumbersFinite) {
    return {
      transformType: "INVALID_NUMERIC",
      determinant: 0,
      scaleX: 1,
      scaleY: 1,
      translateX: 0,
      translateY: 0,
      isFlippedX: false,
      isFlippedY: false,
      isSheared: false,
      status: "DEGRADED_INVALID_NUMERIC",
      diagnostics: "Matrix contains non-finite (NaN or Infinity) numeric values",
    };
  }

  // 2. Determinant check
  const det = m00 * m11 - m01 * m10;
  if (Math.abs(det) < 1e-6) {
    return {
      transformType: "SINGULAR",
      determinant: det,
      scaleX: 0,
      scaleY: 0,
      translateX: m02,
      translateY: m12,
      isFlippedX: false,
      isFlippedY: false,
      isSheared: false,
      status: "DEGRADED_SINGULAR",
      diagnostics: `Singular degenerate matrix (determinant ${det.toFixed(8)} ~= 0); zero area`,
    };
  }

  // 3. Magnitude and Orthogonality (Shear check)
  const sx = Math.sqrt(m00 * m00 + m10 * m10);
  const sy = Math.sqrt(m01 * m01 + m11 * m11);
  const dot = m00 * m01 + m10 * m11;
  const cosAngle = Math.abs(dot) / Math.max(1e-9, sx * sy);
  const isSheared = cosAngle > 1e-4;

  const isFlippedX = m00 < -1e-6;
  const isFlippedY = (det < 0 && !isFlippedX) || (m11 < -1e-6);

  // 4. Identity check
  const isIdentity =
    Math.abs(m00 - 1) < 1e-4 &&
    Math.abs(m11 - 1) < 1e-4 &&
    Math.abs(m01) < 1e-4 &&
    Math.abs(m10) < 1e-4 &&
    Math.abs(m02) < 1e-4 &&
    Math.abs(m12) < 1e-4;

  if (isIdentity) {
    return {
      transformType: "IDENTITY",
      determinant: det,
      scaleX: 1,
      scaleY: 1,
      translateX: 0,
      translateY: 0,
      isFlippedX: false,
      isFlippedY: false,
      isSheared: false,
      status: "IDENTITY",
      diagnostics: "Identity matrix; no transformation required",
    };
  }

  if (isSheared) {
    return {
      transformType: "SHEARED",
      determinant: det,
      scaleX: sx,
      scaleY: sy,
      translateX: m02,
      translateY: m12,
      isFlippedX,
      isFlippedY,
      isSheared: true,
      status: "DEGRADED_SHEARED",
      diagnostics: `Shear transformation detected (orthogonality divergence ${cosAngle.toFixed(4)}); not natively expressible via rectangular VML crop`,
    };
  }

  // 5. Rotation vs Axis-Aligned
  const isRotated = Math.abs(m10) > 1e-4 || Math.abs(m01) > 1e-4;
  let rotationDeg: number | undefined;
  if (isRotated) {
    const rawAngle = (Math.atan2(m10, m00) * 180) / Math.PI;
    rotationDeg = Number((((rawAngle % 360) + 360) % 360).toFixed(2));
  }

  // 6. Crop calculation
  // IMPORTANT (Phase 38 Remediation H-02): Crop calculation MUST NOT be applied to ROTATED or SHEARED matrices.
  // Axis-aligned crop using m00/m11 is strictly invalid when the coordinate axes are rotated.
  // For ROTATED matrices, rotationDegrees is provided for native Word rotation without destructive axis-aligned clipping.
  let crop: AnalyzedAffineTransform["crop"] | undefined;

  if (!isRotated && !isSheared) {
    const effectiveSx = Math.abs(m00);
    const effectiveSy = Math.abs(m11);
    const effectiveTx = m02;
    const effectiveTy = m12;

    // Direct mapping: bounds within image
    let left = Math.max(0, Math.min(0.95, effectiveTx));
    let top = Math.max(0, Math.min(0.95, effectiveTy));
    let right = Math.max(0, Math.min(0.95, 1 - (effectiveTx + effectiveSx)));
    let bottom = Math.max(0, Math.min(0.95, 1 - (effectiveTy + effectiveSy)));

    // Inverted mapping branch: when transform maps image UV to box UV
    if (
      left === 0 &&
      right === 0 &&
      top === 0 &&
      bottom === 0 &&
      effectiveSx > 0 &&
      effectiveSy > 0 &&
      (effectiveSx !== 1 || effectiveSy !== 1)
    ) {
      left = Math.max(0, Math.min(0.95, -effectiveTx / effectiveSx));
      top = Math.max(0, Math.min(0.95, -effectiveTy / effectiveSy));
      right = Math.max(0, Math.min(0.95, 1 - (1 - effectiveTx) / effectiveSx));
      bottom = Math.max(0, Math.min(0.95, 1 - (1 - effectiveTy) / effectiveSy));
    }

    // Safety guard against total elimination of image
    if (left + right >= 0.98) {
      right = Math.max(0, 0.95 - left);
    }
    if (top + bottom >= 0.98) {
      bottom = Math.max(0, 0.95 - top);
    }

    if (left > 0.0005 || top > 0.0005 || right > 0.0005 || bottom > 0.0005) {
      crop = {
        top: Number(top.toFixed(5)),
        bottom: Number(bottom.toFixed(5)),
        left: Number(left.toFixed(5)),
        right: Number(right.toFixed(5)),
      };
    }
  }

  const transformType: AffineTransformType = isRotated
    ? "ROTATED"
    : isFlippedX || isFlippedY
    ? "REFLECTED"
    : "AXIS_ALIGNED";

  const status = isRotated
    ? "VALID_ROTATED"
    : isFlippedX || isFlippedY
    ? "VALID_REFLECTED"
    : "VALID_AXIS_ALIGNED";

  return {
    transformType,
    determinant: det,
    scaleX: sx,
    scaleY: sy,
    translateX: m02,
    translateY: m12,
    rotationDegrees: rotationDeg,
    isFlippedX,
    isFlippedY,
    isSheared: false,
    crop,
    status,
    diagnostics: `${transformType} transformation successfully analyzed (det: ${det.toFixed(4)}, rotation: ${rotationDeg ?? 0}deg)`,
  };
}

