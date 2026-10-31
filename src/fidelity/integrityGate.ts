import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

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
  docxPath?: string;
  pdfCreated: boolean;
  pdfSha256: string;
  pdfSizeBytes?: number;
  pdfPath?: string;
  wordPngCount: number;
  wordPngSha256List: string[];
  wordPngPaths?: string[];
  refPngCount: number;
  refPngSha256List: string[];
  refPngPaths?: string[];
  runId?: string;
  commitHash?: string;
  isSyntheticDocument: boolean;
}

export interface ProvenanceGateOptions {
  verifyDiskFiles?: boolean;
}

export interface MeasurementIntegrityOptions {
  verifyDiskFiles?: boolean;
  allowIdenticalDeltasWithEvidence?: boolean;
}

export interface ProvenanceGateResult {
  passed: boolean;
  status: "REAL_DOCUMENT_BENCHMARK" | "INVALID_PROVENANCE" | "BLOCKED";
  violations: string[];
  record?: ProvenanceRecord;
}

export type BenchmarkComparisonMode =
  | "ABSOLUTE_FIGMA_TO_WORD"
  | "INDEPENDENT_BASELINE_VS_CANDIDATE"
  | "NOT_COMPARABLE";

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
  comparisonMode?: BenchmarkComparisonMode;
  inputJsonSha256: string;
  baselineDocxSha256?: string;
  improvedDocxSha256: string;
  baselinePdfSha256?: string;
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

function computeFileSha256(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * Validates that every step of the generation pipeline has verifiable provenance.
 */
export function evaluateProvenanceGate(
  record: ProvenanceRecord,
  options?: ProvenanceGateOptions
): ProvenanceGateResult {
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
  if (!record.docxCreated || !record.docxSha256 || record.docxSha256.length !== 64 || record.docxSizeBytes <= 0) {
    violations.push("PROVENANCE_FAIL: Target DOCX was not successfully created or has empty/invalid hash.");
  }
  if (!record.pdfCreated || !record.pdfSha256 || record.pdfSha256.length !== 64) {
    violations.push("PROVENANCE_FAIL: Target PDF was not exported from Word or has empty/invalid hash.");
  }
  if (record.wordPngCount <= 0 || record.wordPngSha256List.length !== record.wordPngCount) {
    violations.push("PROVENANCE_FAIL: Word PNG pages missing or SHA-256 manifest count mismatch.");
  }
  if (record.wordPngSha256List.some((h) => !h || h.trim().length === 0)) {
    violations.push("PROVENANCE_FAIL: Empty PNG hash found in Word PNG manifest.");
  }

  // Strict disk verification when requested
  if (options?.verifyDiskFiles) {
    if (record.jsonPath) {
      if (!fs.existsSync(record.jsonPath)) {
        violations.push(`PROVENANCE_FAIL: Input JSON path does not exist on disk: ${record.jsonPath}`);
      } else {
        const actualHash = computeFileSha256(record.jsonPath);
        if (actualHash !== record.jsonSha256) {
          violations.push(`PROVENANCE_FAIL: Input JSON SHA-256 mismatch: declared ${record.jsonSha256} vs actual ${actualHash}`);
        }
      }
    }
    if (record.docxPath) {
      if (!fs.existsSync(record.docxPath)) {
        violations.push(`PROVENANCE_FAIL: DOCX path does not exist on disk: ${record.docxPath}`);
      } else {
        const actualHash = computeFileSha256(record.docxPath);
        if (actualHash !== record.docxSha256) {
          violations.push(`PROVENANCE_FAIL: DOCX SHA-256 mismatch: declared ${record.docxSha256} vs actual ${actualHash}`);
        }
      }
    }
    if (record.pdfPath) {
      if (!fs.existsSync(record.pdfPath)) {
        violations.push(`PROVENANCE_FAIL: PDF path does not exist on disk: ${record.pdfPath}`);
      } else {
        const actualHash = computeFileSha256(record.pdfPath);
        if (actualHash !== record.pdfSha256) {
          violations.push(`PROVENANCE_FAIL: PDF SHA-256 mismatch: declared ${record.pdfSha256} vs actual ${actualHash}`);
        }
      }
    }
    if (record.wordPngPaths) {
      for (let i = 0; i < record.wordPngPaths.length; i++) {
        const p = record.wordPngPaths[i];
        if (!fs.existsSync(p)) {
          violations.push(`PROVENANCE_FAIL: Word PNG path does not exist on disk: ${p}`);
        } else if (record.wordPngSha256List && record.wordPngSha256List[i]) {
          const actualHash = computeFileSha256(p);
          if (actualHash !== record.wordPngSha256List[i]) {
            violations.push(
              `PROVENANCE_FAIL: Word PNG SHA-256 mismatch for ${p}: declared ${record.wordPngSha256List[i]} vs actual ${actualHash}`
            );
          }
        }
      }
    }
    if (record.refPngPaths) {
      for (let i = 0; i < record.refPngPaths.length; i++) {
        const p = record.refPngPaths[i];
        if (!fs.existsSync(p)) {
          violations.push(`PROVENANCE_FAIL: Reference PNG path does not exist on disk: ${p}`);
        } else if (record.refPngSha256List && record.refPngSha256List[i]) {
          const actualHash = computeFileSha256(p);
          if (actualHash !== record.refPngSha256List[i]) {
            violations.push(
              `PROVENANCE_FAIL: Reference PNG SHA-256 mismatch for ${p}: declared ${record.refPngSha256List[i]} vs actual ${actualHash}`
            );
          }
        }
      }
    }
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
  expectedCoverage?: number,
  options?: MeasurementIntegrityOptions
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
  const isAbsolute = bundle.comparisonMode === "ABSOLUTE_FIGMA_TO_WORD";
  if (!bundle.improvedDocxSha256 || bundle.improvedDocxSha256.length !== 64) {
    violations.push("INTEGRITY_FAIL_04: Missing or invalid Improved DOCX SHA-256 hash.");
  } else if (!isAbsolute && (!bundle.baselineDocxSha256 || bundle.baselineDocxSha256.length !== 64)) {
    violations.push("INTEGRITY_FAIL_04: Missing or invalid Baseline DOCX SHA-256 hash in comparative benchmark.");
  } else if (!isAbsolute && bundle.baselineDocxSha256 === bundle.improvedDocxSha256 && !options?.allowIdenticalDeltasWithEvidence) {
    violations.push("INTEGRITY_FAIL_04: Candidate DOCX hash was duplicated into Baseline DOCX hash.");
  } else if (isAbsolute && bundle.baselineDocxSha256 !== undefined) {
    violations.push("INTEGRITY_FAIL_04: Baseline DOCX SHA-256 populated in ABSOLUTE_FIGMA_TO_WORD mode.");
  } else {
    passedChecksCount++;
  }

  // Check 5: PDF hashes
  checksCount++;
  if (!bundle.improvedPdfSha256 || bundle.improvedPdfSha256.length !== 64) {
    violations.push("INTEGRITY_FAIL_05: Missing or invalid Improved PDF SHA-256 hash.");
  } else if (!isAbsolute && (!bundle.baselinePdfSha256 || bundle.baselinePdfSha256.length !== 64)) {
    violations.push("INTEGRITY_FAIL_05: Missing or invalid Baseline PDF SHA-256 hash in comparative benchmark.");
  } else if (isAbsolute && bundle.baselinePdfSha256 !== undefined) {
    violations.push("INTEGRITY_FAIL_05: Baseline PDF SHA-256 populated in ABSOLUTE_FIGMA_TO_WORD mode.");
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

  // Check 7: No duplicate page numbers or node IDs
  checksCount++;
  const seenPages = new Set<number>();
  const seenNodes = new Set<string>();
  let dupDetected = false;
  for (const p of bundle.pages || []) {
    if (seenPages.has(p.pageNumber)) {
      violations.push(`INTEGRITY_FAIL_DUP_PAGE: Duplicate page number ${p.pageNumber} detected.`);
      dupDetected = true;
      break;
    }
    seenPages.add(p.pageNumber);
    if (seenNodes.has(p.nodeId)) {
      violations.push(`INTEGRITY_FAIL_DUP_NODE: Duplicate frame node ID ${p.nodeId} detected.`);
      dupDetected = true;
      break;
    }
    seenNodes.add(p.nodeId);
  }
  if (!dupDetected) {
    passedChecksCount++;
  }

  // Check 8: Frame-by-frame integrity & numerical sanity
  checksCount++;
  let frameCheckPassed = true;
  for (const p of bundle.pages || []) {
    // 8.1 Missing reference node must have null scores
    if (p.status === "REFERENCE_MISSING_VERSION_UNVERIFIED") {
      if (p.baselineSsim !== null || p.improvedSsim !== null || p.ssimDelta !== null) {
        violations.push(`INTEGRITY_FAIL_07A: Missing reference frame ${p.nodeId} assigned non-null score.`);
        frameCheckPassed = false;
        break;
      }
    }

    // 8.2 Valid benchmark frame checks
    if (p.status === "VALID_BENCHMARK") {
      if (!isAbsolute) {
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
        if (!p.baselinePngSha256 || p.baselinePngSha256.trim() === "" || !p.improvedPngSha256 || p.improvedPngSha256.trim() === "") {
          violations.push(`INTEGRITY_FAIL_EMPTY_PNG_HASH: Frame ${p.nodeId} has empty baseline or improved PNG SHA-256.`);
          frameCheckPassed = false;
          break;
        }
        if (!Number.isFinite(p.baselineSsim) || !Number.isFinite(p.improvedSsim)) {
          violations.push(`INTEGRITY_FAIL_NON_FINITE_SSIM: Frame ${p.nodeId} has non-finite SSIM (NaN or Infinity).`);
          frameCheckPassed = false;
          break;
        }
        if (p.baselineSsim < -1 || p.baselineSsim > 1 || p.improvedSsim < -1 || p.improvedSsim > 1) {
          violations.push(`INTEGRITY_FAIL_OUT_OF_BOUNDS_SSIM: Frame ${p.nodeId} SSIM out of valid range [-1, 1].`);
          frameCheckPassed = false;
          break;
        }
        if (p.ssimDelta !== null) {
          if (!Number.isFinite(p.ssimDelta)) {
            violations.push(`INTEGRITY_FAIL_NON_FINITE_DELTA: Frame ${p.nodeId} has non-finite ssimDelta.`);
            frameCheckPassed = false;
            break;
          }
          const expectedDelta = p.improvedSsim - p.baselineSsim;
          if (Math.abs(p.ssimDelta - expectedDelta) > 0.001) {
            violations.push(`INTEGRITY_FAIL_DELTA_MISMATCH: Frame ${p.nodeId} delta ${p.ssimDelta} != improved (${p.improvedSsim}) - baseline (${p.baselineSsim}).`);
            frameCheckPassed = false;
            break;
          }
        }
        if (p.baselineMae !== null && (!Number.isFinite(p.baselineMae) || p.baselineMae < 0)) {
          violations.push(`INTEGRITY_FAIL_INVALID_MAE: Frame ${p.nodeId} has negative or non-finite baselineMae.`);
          frameCheckPassed = false;
          break;
        }
        if (p.baselineRmse !== null && (!Number.isFinite(p.baselineRmse) || p.baselineRmse < 0)) {
          violations.push(`INTEGRITY_FAIL_INVALID_RMSE: Frame ${p.nodeId} has negative or non-finite baselineRmse.`);
          frameCheckPassed = false;
          break;
        }
        if (p.baselineMismatch !== null && (!Number.isFinite(p.baselineMismatch) || p.baselineMismatch < 0 || p.baselineMismatch > 1)) {
          violations.push(`INTEGRITY_FAIL_INVALID_MISMATCH: Frame ${p.nodeId} baselineMismatch ratio out of range [0, 1]: ${p.baselineMismatch}`);
          frameCheckPassed = false;
          break;
        }
      } else {
        // Absolute mode (Figma Reference PNG vs Improved Word PNG)
        if (!p.referencePngPath || !p.improvedPngPath) {
          violations.push(`INTEGRITY_FAIL_07B: Valid benchmark frame ${p.nodeId} missing reference or improved PNG path in absolute mode.`);
          frameCheckPassed = false;
          break;
        }
        if (p.improvedSsim === null) {
          violations.push(`INTEGRITY_FAIL_07D: Valid benchmark frame ${p.nodeId} has null improvedSsim value.`);
          frameCheckPassed = false;
          break;
        }
        if (p.baselinePngPath !== undefined || p.baselineSsim !== null || p.ssimDelta !== null) {
          violations.push(`INTEGRITY_FAIL_ARTIFICIAL_DELTA: Frame ${p.nodeId} populates baseline PNG/SSIM or delta in absolute benchmark mode.`);
          frameCheckPassed = false;
          break;
        }
        if (!p.referencePngSha256 || p.referencePngSha256.trim() === "" || !p.improvedPngSha256 || p.improvedPngSha256.trim() === "") {
          violations.push(`INTEGRITY_FAIL_EMPTY_PNG_HASH: Frame ${p.nodeId} has empty reference or improved PNG SHA-256 in absolute mode.`);
          frameCheckPassed = false;
          break;
        }
        if (!Number.isFinite(p.improvedSsim)) {
          violations.push(`INTEGRITY_FAIL_NON_FINITE_SSIM: Frame ${p.nodeId} has non-finite improvedSsim.`);
          frameCheckPassed = false;
          break;
        }
        if (p.improvedSsim < -1 || p.improvedSsim > 1) {
          violations.push(`INTEGRITY_FAIL_OUT_OF_BOUNDS_SSIM: Frame ${p.nodeId} improvedSsim out of valid range [-1, 1].`);
          frameCheckPassed = false;
          break;
        }
      }

      // Improved metric sanity
      if (p.improvedMae !== null && (!Number.isFinite(p.improvedMae) || p.improvedMae < 0)) {
        violations.push(`INTEGRITY_FAIL_INVALID_MAE: Frame ${p.nodeId} has negative or non-finite improvedMae.`);
        frameCheckPassed = false;
        break;
      }
      if (p.improvedRmse !== null && (!Number.isFinite(p.improvedRmse) || p.improvedRmse < 0)) {
        violations.push(`INTEGRITY_FAIL_INVALID_RMSE: Frame ${p.nodeId} has negative or non-finite improvedRmse.`);
        frameCheckPassed = false;
        break;
      }
      if (p.improvedMismatch !== null && (!Number.isFinite(p.improvedMismatch) || p.improvedMismatch < 0 || p.improvedMismatch > 1)) {
        violations.push(`INTEGRITY_FAIL_INVALID_MISMATCH: Frame ${p.nodeId} improvedMismatch ratio out of range [0, 1]: ${p.improvedMismatch}`);
        frameCheckPassed = false;
        break;
      }

      // Strict disk verification
      if (options?.verifyDiskFiles) {
        if (!isAbsolute && p.baselinePngPath) {
          if (!fs.existsSync(p.baselinePngPath)) {
            violations.push(`INTEGRITY_FAIL_FILE_NOT_FOUND: Frame ${p.nodeId} baseline PNG does not exist on disk: ${p.baselinePngPath}`);
            frameCheckPassed = false;
            break;
          } else if (p.baselinePngSha256) {
            const actual = computeFileSha256(p.baselinePngPath);
            if (actual !== p.baselinePngSha256) {
              violations.push(`INTEGRITY_FAIL_PNG_HASH_MISMATCH: Frame ${p.nodeId} baseline PNG SHA-256 mismatch: declared ${p.baselinePngSha256} vs actual ${actual}`);
              frameCheckPassed = false;
              break;
            }
          }
        }
        if (p.improvedPngPath) {
          if (!fs.existsSync(p.improvedPngPath)) {
            violations.push(`INTEGRITY_FAIL_FILE_NOT_FOUND: Frame ${p.nodeId} improved PNG does not exist on disk: ${p.improvedPngPath}`);
            frameCheckPassed = false;
            break;
          } else if (p.improvedPngSha256) {
            const actual = computeFileSha256(p.improvedPngPath);
            if (actual !== p.improvedPngSha256) {
              violations.push(`INTEGRITY_FAIL_PNG_HASH_MISMATCH: Frame ${p.nodeId} improved PNG SHA-256 mismatch: declared ${p.improvedPngSha256} vs actual ${actual}`);
              frameCheckPassed = false;
              break;
            }
          }
        }
        if (p.referencePngPath) {
          if (!fs.existsSync(p.referencePngPath)) {
            violations.push(`INTEGRITY_FAIL_FILE_NOT_FOUND: Frame ${p.nodeId} reference PNG does not exist on disk: ${p.referencePngPath}`);
            frameCheckPassed = false;
            break;
          } else if (p.referencePngSha256) {
            const actual = computeFileSha256(p.referencePngPath);
            if (actual !== p.referencePngSha256) {
              violations.push(`INTEGRITY_FAIL_PNG_HASH_MISMATCH: Frame ${p.nodeId} reference PNG SHA-256 mismatch: declared ${p.referencePngSha256} vs actual ${actual}`);
              frameCheckPassed = false;
              break;
            }
          }
        }
      }
    }
  }
  if (frameCheckPassed) {
    passedChecksCount++;
  }

  // Check 9: Constant offset simulation
  checksCount++;
  if (!isAbsolute) {
    const validPagesWithDelta = (bundle.pages || []).filter((p) => p.status === "VALID_BENCHMARK" && p.ssimDelta !== null);
    if (validPagesWithDelta.length >= 3 && !options?.allowIdenticalDeltasWithEvidence) {
      const deltas = validPagesWithDelta.map((p) => Number(p.ssimDelta!.toFixed(4)));
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
  } else {
    passedChecksCount++;
  }

  // Check 10: Aggregation consistency (average must equal arithmetic mean of valid pages)
  checksCount++;
  const validBenchmarkPages = (bundle.pages || []).filter((p) => p.status === "VALID_BENCHMARK");
  if (validBenchmarkPages.length > 0) {
    let aggFailed = false;
    if (!isAbsolute) {
      const meanBaselineSsim = validBenchmarkPages.reduce((s, p) => s + (p.baselineSsim ?? 0), 0) / validBenchmarkPages.length;
      const reportedBaseline = bundle.averages.baselineSsim;
      if (reportedBaseline !== null && Math.abs(meanBaselineSsim - reportedBaseline) > 0.001) {
        violations.push(
          `INTEGRITY_FAIL_09A: Baseline SSIM average mismatch: reported ${reportedBaseline} vs recomputed ${meanBaselineSsim.toFixed(4)}`
        );
        aggFailed = true;
      }
    } else {
      if (bundle.averages.baselineSsim !== null || bundle.averages.ssimDelta !== null) {
        violations.push("INTEGRITY_FAIL_09C: Baseline SSIM average or ssimDelta populated in ABSOLUTE_FIGMA_TO_WORD mode.");
        aggFailed = true;
      }
    }

    const meanImprovedSsim = validBenchmarkPages.reduce((s, p) => s + (p.improvedSsim ?? 0), 0) / validBenchmarkPages.length;
    const reportedImproved = bundle.averages.improvedSsim;

    if (reportedImproved !== null && Math.abs(meanImprovedSsim - reportedImproved) > 0.001) {
      violations.push(
        `INTEGRITY_FAIL_09B: Improved SSIM average mismatch: reported ${reportedImproved} vs recomputed ${meanImprovedSsim.toFixed(4)}`
      );
      aggFailed = true;
    }

    if (!aggFailed) {
      passedChecksCount++;
    }
  } else {
    passedChecksCount++;
  }

  // Check 11: Zero valid comparisons check (B-03 fix)
  checksCount++;
  if (validBenchmarkPages.length === 0) {
    violations.push("INTEGRITY_FAIL_10: NO_VALID_COMPARISONS - Zero valid benchmark comparisons evaluated.");
  } else {
    passedChecksCount++;
  }

  // Check 12: Expected reference coverage check (if requested)
  if (expectedCoverage !== undefined) {
    checksCount++;
    if (validBenchmarkPages.length < expectedCoverage) {
      violations.push(
        `INTEGRITY_FAIL_11: PARTIAL_VALID_COMPARISONS - Evaluated only ${validBenchmarkPages.length} valid comparisons, expected ${expectedCoverage}.`
      );
    } else {
      passedChecksCount++;
    }
  }

  // Compute coverage status
  let coverageStatus: CoverageStatus;
  if (!bundle.wordAutomationSucceeded || violations.some((v) => v.includes("INTEGRITY_FAIL_02"))) {
    coverageStatus = "MEASUREMENT_FAILED";
  } else if (validBenchmarkPages.length === 0) {
    coverageStatus = "NO_VALID_COMPARISONS";
  } else if (expectedCoverage !== undefined && validBenchmarkPages.length < expectedCoverage) {
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

/**
 * Asserts that a gate check passed. If failed, sets process.exitCode = 1 and throws an Error.
 */
export function assertGatePassed(
  name: string,
  result: { passed: boolean; violations: string[] }
): void {
  if (!result.passed) {
    process.exitCode = 1;
    const details =
      result.violations.length > 0 ? `:\n - ${result.violations.join("\n - ")}` : "";
    throw new Error(`[GATE_FAILURE] ${name} check failed with non-zero exit code${details}`);
  }
}


