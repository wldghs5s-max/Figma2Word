import * as fs from "fs";
import * as path from "path";

export interface ProvenanceRecord {
  jsonPath: string;
  jsonSha256: string;
  jsonSizeBytes: number;
  nodeTreeExtracted: boolean;
  totalNodesExtracted: number;
  totalTextNodes: number;
  totalShapeNodes: number;
  canvasIrCreated: boolean;
  irPageCount: number;
  irElementCount: number;
  docxCreated: boolean;
  docxSha256: string;
  docxSizeBytes: number;
  pdfCreated: boolean;
  pdfSha256: string;
  wordPngCount: number;
  wordPngSha256List: string[];
  refPngCount: number;
  refPngSha256List: string[];
  isSyntheticDocument: boolean;
}

export interface ProvenanceGateResult {
  passed: boolean;
  status: "REAL_DOCUMENT_BENCHMARK" | "INVALID_PROVENANCE" | "BLOCKED";
  violations: string[];
  record?: ProvenanceRecord;
}

export interface PageMeasurement {
  pageNumber: number;
  nodeId: string;
  frameName: string;
  status: "VALID_BENCHMARK" | "REFERENCE_MISSING_VERSION_UNVERIFIED" | "RENDER_FAILED";
  baselinePngPath?: string;
  baselinePngSha256?: string;
  improvedPngPath?: string;
  improvedPngSha256?: string;
  referencePngPath?: string;
  referencePngSha256?: string;
  baselineSsim: number | null;
  baselineMae: number | null;
  baselineRmse: number | null;
  baselineMismatch: number | null;
  improvedSsim: number | null;
  improvedMae: number | null;
  improvedRmse: number | null;
  improvedMismatch: number | null;
  ssimDelta: number | null;
}

export interface MeasurementBundle {
  mode: "real" | "synthetic";
  inputJsonSha256: string;
  baselineDocxSha256: string;
  improvedDocxSha256: string;
  baselinePdfSha256: string;
  improvedPdfSha256: string;
  wordAutomationSucceeded: boolean;
  computedAt: string;
  pages: PageMeasurement[];
  averages: {
    baselineSsim: number | null;
    improvedSsim: number | null;
    ssimDelta: number | null;
    baselineMae: number | null;
    improvedMae: number | null;
    baselineRmse: number | null;
    improvedRmse: number | null;
  };
}

export type CoverageStatus =
  | "NO_VALID_COMPARISONS"
  | "PARTIAL_VALID_COMPARISONS"
  | "EXPECTED_REFERENCE_COVERAGE_MET"
  | "MEASUREMENT_FAILED";

export interface IntegrityGateResult {
  passed: boolean;
  coverageStatus: CoverageStatus;
  violations: string[];
  checksCount: number;
  passedChecksCount: number;
}

/**
 * Validates that every step of the generation pipeline has verifiable provenance.
 */
export function evaluateProvenanceGate(record: ProvenanceRecord): ProvenanceGateResult {
  const violations: string[] = [];

  if (record.isSyntheticDocument) {
    violations.push("PROVENANCE_FAIL: Synthetic document fixture detected in real benchmark path.");
  }
  if (!record.jsonSha256 || record.jsonSha256.length !== 64) {
    violations.push("PROVENANCE_FAIL: Invalid or missing input JSON SHA-256.");
  }
  if (record.jsonSizeBytes <= 0) {
    violations.push("PROVENANCE_FAIL: Input JSON size is zero or negative.");
  }
  if (!record.nodeTreeExtracted || record.totalNodesExtracted <= 0) {
    violations.push("PROVENANCE_FAIL: Production node tree was not extracted.");
  }
  if (!record.canvasIrCreated || record.irPageCount <= 0) {
    violations.push("PROVENANCE_FAIL: Canonical Canvas IR was not created.");
  }
  if (!record.docxCreated || !record.docxSha256 || record.docxSizeBytes <= 0) {
    violations.push("PROVENANCE_FAIL: Target DOCX was not successfully created or has empty hash.");
  }
  if (!record.pdfCreated || !record.pdfSha256) {
    violations.push("PROVENANCE_FAIL: Target PDF was not exported from Word or has empty hash.");
  }
  if (record.wordPngCount <= 0 || record.wordPngSha256List.length !== record.wordPngCount) {
    violations.push("PROVENANCE_FAIL: Word PNG pages missing or SHA-256 manifest count mismatch.");
  }

  const passed = violations.length === 0;
  return {
    passed,
    status: passed ? "REAL_DOCUMENT_BENCHMARK" : (record.isSyntheticDocument ? "INVALID_PROVENANCE" : "BLOCKED"),
    violations,
    record,
  };
}

/**
 * Validates the mathematical and operational integrity of benchmark measurements.
 * Detects 12 classes of benchmark falsification and inconsistency.
 */
export function evaluateMeasurementIntegrity(
  bundle: MeasurementBundle,
  expectedCoverage?: number
): IntegrityGateResult {
  const violations: string[] = [];
  let checksCount = 0;
  let passedChecksCount = 0;

  // Check 1: Mode verification
  checksCount++;
  if (bundle.mode !== "real") {
    violations.push("INTEGRITY_FAIL_01: Synthetic fixture used in production benchmark verification.");
  } else {
    passedChecksCount++;
  }

  // Check 2: Word automation success flag
  checksCount++;
  if (!bundle.wordAutomationSucceeded) {
    violations.push("INTEGRITY_FAIL_02: Word native rendering failed or returned non-zero code.");
  } else {
    passedChecksCount++;
  }

  // Check 3: JSON hash validity
  checksCount++;
  if (!bundle.inputJsonSha256 || bundle.inputJsonSha256.length !== 64) {
    violations.push("INTEGRITY_FAIL_03: Missing or malformed input JSON SHA-256 hash.");
  } else {
    passedChecksCount++;
  }

  // Check 4: DOCX hashes
  checksCount++;
  if (!bundle.baselineDocxSha256 || !bundle.improvedDocxSha256) {
    violations.push("INTEGRITY_FAIL_04: Missing Baseline or Improved DOCX SHA-256 hash.");
  } else {
    passedChecksCount++;
  }

  // Check 5: PDF hashes
  checksCount++;
  if (!bundle.baselinePdfSha256 || !bundle.improvedPdfSha256) {
    violations.push("INTEGRITY_FAIL_05: Missing Baseline or Improved PDF SHA-256 hash.");
  } else {
    passedChecksCount++;
  }

  // Check 6: Page measurements non-empty
  checksCount++;
  if (!bundle.pages || bundle.pages.length === 0) {
    violations.push("INTEGRITY_FAIL_06: No page measurements found in bundle.");
  } else {
    passedChecksCount++;
  }

  // Check 7: Frame-by-frame integrity
  checksCount++;
  let frameCheckPassed = true;
  for (const p of bundle.pages) {
    // 7.1 Missing reference node must have null scores
    if (p.status === "REFERENCE_MISSING_VERSION_UNVERIFIED") {
      if (p.baselineSsim !== null || p.improvedSsim !== null || p.ssimDelta !== null) {
        violations.push(`INTEGRITY_FAIL_07A: Missing reference frame ${p.nodeId} assigned non-null score.`);
        frameCheckPassed = false;
        break;
      }
    }

    // 7.2 Valid benchmark must have both baseline and improved PNG paths specified and distinct
    if (p.status === "VALID_BENCHMARK") {
      if (!p.baselinePngPath || !p.improvedPngPath) {
        violations.push(`INTEGRITY_FAIL_07B: Valid benchmark frame ${p.nodeId} missing PNG path.`);
        frameCheckPassed = false;
        break;
      }
      if (p.baselinePngPath === p.improvedPngPath) {
        violations.push(`INTEGRITY_FAIL_07C: Frame ${p.nodeId} reuses identical PNG path for Before and After.`);
        frameCheckPassed = false;
        break;
      }
      if (p.baselineSsim === null || p.improvedSsim === null) {
        violations.push(`INTEGRITY_FAIL_07D: Valid benchmark frame ${p.nodeId} has null SSIM value.`);
        frameCheckPassed = false;
        break;
      }
    }
  }
  if (frameCheckPassed) {
    passedChecksCount++;
  }

  // Check 8: No constant offset simulation (detecting comp.ssim - 0.008 pattern)
  checksCount++;
  const validPages = bundle.pages.filter((p) => p.status === "VALID_BENCHMARK" && p.ssimDelta !== null);
  if (validPages.length >= 3) {
    const deltas = validPages.map((p) => Number(p.ssimDelta!.toFixed(4)));
    const firstDelta = deltas[0];
    const allIdentical = deltas.every((d) => Math.abs(d - firstDelta) < 1e-6);
    if (allIdentical && Math.abs(firstDelta) > 1e-6) {
      violations.push(`INTEGRITY_FAIL_08: Detected constant offset simulation across all frames (delta = ${firstDelta}).`);
    } else {
      passedChecksCount++;
    }
  } else {
    passedChecksCount++;
  }

  // Check 9: Aggregation consistency (average must equal arithmetic mean of valid pages)
  checksCount++;
  if (validPages.length > 0) {
    const meanBaselineSsim = validPages.reduce((s, p) => s + p.baselineSsim!, 0) / validPages.length;
    const meanImprovedSsim = validPages.reduce((s, p) => s + p.improvedSsim!, 0) / validPages.length;
    const reportedBaseline = bundle.averages.baselineSsim;
    const reportedImproved = bundle.averages.improvedSsim;

    if (reportedBaseline !== null && Math.abs(meanBaselineSsim - reportedBaseline) > 0.001) {
      violations.push(
        `INTEGRITY_FAIL_09A: Baseline SSIM average mismatch: reported ${reportedBaseline} vs recomputed ${meanBaselineSsim.toFixed(4)}`
      );
    } else if (reportedImproved !== null && Math.abs(meanImprovedSsim - reportedImproved) > 0.001) {
      violations.push(
        `INTEGRITY_FAIL_09B: Improved SSIM average mismatch: reported ${reportedImproved} vs recomputed ${meanImprovedSsim.toFixed(4)}`
      );
    } else {
      passedChecksCount++;
    }
  } else {
    passedChecksCount++;
  }

  // Check 10: Zero valid comparisons check (B-03 fix)
  checksCount++;
  if (validPages.length === 0) {
    violations.push("INTEGRITY_FAIL_10: NO_VALID_COMPARISONS - Zero valid benchmark comparisons evaluated.");
  } else {
    passedChecksCount++;
  }

  // Check 11: Expected reference coverage check (if requested)
  if (expectedCoverage !== undefined) {
    checksCount++;
    if (validPages.length < expectedCoverage) {
      violations.push(
        `INTEGRITY_FAIL_11: PARTIAL_VALID_COMPARISONS - Evaluated only ${validPages.length} valid comparisons, expected ${expectedCoverage}.`
      );
    } else {
      passedChecksCount++;
    }
  }

  // Compute coverage status
  let coverageStatus: CoverageStatus;
  if (!bundle.wordAutomationSucceeded || violations.some((v) => v.includes("INTEGRITY_FAIL_02"))) {
    coverageStatus = "MEASUREMENT_FAILED";
  } else if (validPages.length === 0) {
    coverageStatus = "NO_VALID_COMPARISONS";
  } else if (expectedCoverage !== undefined && validPages.length < expectedCoverage) {
    coverageStatus = "PARTIAL_VALID_COMPARISONS";
  } else if (violations.length > 0) {
    coverageStatus = "MEASUREMENT_FAILED";
  } else {
    coverageStatus = "EXPECTED_REFERENCE_COVERAGE_MET";
  }

  return {
    passed: violations.length === 0,
    coverageStatus,
    violations,
    checksCount,
    passedChecksCount,
  };
}
