import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  evaluateProvenanceGate,
  evaluateMeasurementIntegrity,
  ProvenanceRecord,
  MeasurementBundle,
} from "../src/fidelity/integrityGate.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Phase 39.1: Provenance, PNG Byte Hash & Measurement Separation Test Suite", () => {
  let tmpDir: string;
  let testPngPath: string;
  const genuineHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // 0-byte sha256

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase39-1-integrity-"));
    testPngPath = path.join(tmpDir, "test.png");
    fs.writeFileSync(testPngPath, Buffer.alloc(0));
    fs.writeFileSync(path.join(tmpDir, "test2.png"), Buffer.alloc(0));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1. Rejects PNG byte SHA-256 hash mismatch in evaluateMeasurementIntegrity", () => {
    const bundle: MeasurementBundle = {
      mode: "real",
      comparisonMode: "INDEPENDENT_BASELINE_VS_CANDIDATE",
      inputJsonSha256: "a".repeat(64),
      baselineDocxSha256: "b".repeat(64),
      improvedDocxSha256: "c".repeat(64),
      baselinePdfSha256: "d".repeat(64),
      improvedPdfSha256: "e".repeat(64),
      wordAutomationSucceeded: true,
      computedAt: new Date().toISOString(),
      pages: [
        {
          pageNumber: 1,
          nodeId: "1:1",
          frameName: "Frame 1",
          status: "VALID_BENCHMARK",
          baselinePngPath: testPngPath,
          baselinePngSha256: "WRONG_HASH_00000000000000000000000000000000000000000000000000000000",
          improvedPngPath: path.join(tmpDir, "test2.png"),
          improvedPngSha256: genuineHash,
          baselineSsim: 0.9,
          baselineMae: 5,
          baselineRmse: 8,
          baselineMismatch: 0.1,
          improvedSsim: 0.95,
          improvedMae: 3,
          improvedRmse: 5,
          improvedMismatch: 0.05,
          ssimDelta: 0.05,
        },
      ],
      averages: {
        baselineSsim: 0.9,
        improvedSsim: 0.95,
        ssimDelta: 0.05,
        baselineMae: 5,
        improvedMae: 3,
        baselineRmse: 8,
        improvedRmse: 5,
      },
    };

    const res = evaluateMeasurementIntegrity(bundle, 1, { verifyDiskFiles: true });
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes("baseline PNG SHA-256 mismatch"))).toBe(true);
  });

  it("2. Rejects Word PNG byte SHA-256 hash mismatch in evaluateProvenanceGate", () => {
    const record: ProvenanceRecord = {
      jsonPath: testPngPath,
      jsonSha256: genuineHash,
      jsonSizeBytes: 0, // will fail json size, let's write 10 bytes to a json file
      nodeTreeExtracted: true,
      totalNodesExtracted: 10,
      totalTextNodes: 5,
      totalShapeNodes: 5,
      canvasIrCreated: true,
      irPageCount: 1,
      irElementCount: 10,
      docxCreated: true,
      docxSha256: "1".repeat(64),
      docxSizeBytes: 100,
      pdfCreated: true,
      pdfSha256: "2".repeat(64),
      wordPngCount: 1,
      wordPngSha256List: ["WRONG_HASH_DECLARED_00000000000000000000000000000000000000000000000"],
      wordPngPaths: [testPngPath],
      refPngCount: 1,
      refPngSha256List: [genuineHash],
      refPngPaths: [testPngPath],
      isSyntheticDocument: false,
    };

    const res = evaluateProvenanceGate(record, { verifyDiskFiles: true });
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes("Word PNG SHA-256 mismatch"))).toBe(true);
  });

  it("3. Rejects artificial ssimDelta when comparisonMode is ABSOLUTE_FIGMA_TO_WORD", () => {
    const bundle: MeasurementBundle = {
      mode: "real",
      comparisonMode: "ABSOLUTE_FIGMA_TO_WORD",
      inputJsonSha256: "a".repeat(64),
      improvedDocxSha256: "c".repeat(64),
      improvedPdfSha256: "e".repeat(64),
      wordAutomationSucceeded: true,
      computedAt: new Date().toISOString(),
      pages: [
        {
          pageNumber: 1,
          nodeId: "1:1",
          frameName: "Frame 1",
          status: "VALID_BENCHMARK",
          referencePngPath: "ref.png",
          referencePngSha256: "r".repeat(64),
          baselinePngPath: "a.png",
          baselinePngSha256: "a".repeat(64),
          improvedPngPath: "b.png",
          improvedPngSha256: "b".repeat(64),
          baselineSsim: 0.9,
          baselineMae: 5,
          baselineRmse: 8,
          baselineMismatch: 0.1,
          improvedSsim: 0.95,
          improvedMae: 3,
          improvedRmse: 5,
          improvedMismatch: 0.05,
          ssimDelta: 0.05, // Artificial delta in absolute mode! Prohibited!
        },
      ],
      averages: {
        baselineSsim: null,
        improvedSsim: 0.95,
        ssimDelta: null,
        baselineMae: null,
        improvedMae: 3,
        baselineRmse: null,
        improvedRmse: 5,
      },
    };

    const res = evaluateMeasurementIntegrity(bundle);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes("INTEGRITY_FAIL_ARTIFICIAL_DELTA"))).toBe(true);
  });

  it("4. Rejects duplicated candidate hash into baseline in comparative benchmark", () => {
    const bundle: MeasurementBundle = {
      mode: "real",
      comparisonMode: "INDEPENDENT_BASELINE_VS_CANDIDATE",
      inputJsonSha256: "a".repeat(64),
      baselineDocxSha256: "c".repeat(64), // identical to improvedDocxSha256!
      improvedDocxSha256: "c".repeat(64),
      baselinePdfSha256: "d".repeat(64),
      improvedPdfSha256: "e".repeat(64),
      wordAutomationSucceeded: true,
      computedAt: new Date().toISOString(),
      pages: [],
      averages: {
        baselineSsim: null,
        improvedSsim: null,
        ssimDelta: null,
        baselineMae: null,
        improvedMae: null,
        baselineRmse: null,
        improvedRmse: null,
      },
    };

    const res = evaluateMeasurementIntegrity(bundle);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes("duplicated into Baseline DOCX hash"))).toBe(true);
  });

  it("5. Successfully passes genuine ABSOLUTE_FIGMA_TO_WORD benchmark with disk verification", () => {
    const refPngPath = path.join(tmpDir, "test.png");
    const candPngPath = path.join(tmpDir, "test2.png");

    const bundle: MeasurementBundle = {
      mode: "real",
      comparisonMode: "ABSOLUTE_FIGMA_TO_WORD",
      inputJsonSha256: "a".repeat(64),
      improvedDocxSha256: "b".repeat(64),
      improvedPdfSha256: "c".repeat(64),
      wordAutomationSucceeded: true,
      computedAt: new Date().toISOString(),
      pages: [
        {
          pageNumber: 1,
          nodeId: "1:100",
          frameName: "Cover Page",
          status: "VALID_BENCHMARK",
          referencePngPath: refPngPath,
          referencePngSha256: genuineHash,
          improvedPngPath: candPngPath,
          improvedPngSha256: genuineHash,
          baselinePngPath: undefined,
          baselinePngSha256: undefined,
          baselineSsim: null,
          baselineMae: null,
          baselineRmse: null,
          baselineMismatch: null,
          improvedSsim: 0.945,
          improvedMae: 1.25,
          improvedRmse: 3.42,
          improvedMismatch: 0.02,
          ssimDelta: null,
        },
      ],
      averages: {
        baselineSsim: null,
        improvedSsim: 0.945,
        ssimDelta: null,
        baselineMae: null,
        improvedMae: 1.25,
        baselineRmse: null,
        improvedRmse: 3.42,
      },
    };

    const res = evaluateMeasurementIntegrity(bundle, 1, { verifyDiskFiles: true });
    expect(res.passed).toBe(true);
    expect(res.coverageStatus).toBe("EXPECTED_REFERENCE_COVERAGE_MET");
    expect(res.violations).toHaveLength(0);
  });

  it("6. Rejects ABSOLUTE_FIGMA_TO_WORD when baselineDocxSha256 is illegally populated", () => {
    const bundle: MeasurementBundle = {
      mode: "real",
      comparisonMode: "ABSOLUTE_FIGMA_TO_WORD",
      inputJsonSha256: "a".repeat(64),
      baselineDocxSha256: "d".repeat(64), // ILLEGAL in ABSOLUTE mode
      improvedDocxSha256: "b".repeat(64),
      improvedPdfSha256: "c".repeat(64),
      wordAutomationSucceeded: true,
      computedAt: new Date().toISOString(),
      pages: [
        {
          pageNumber: 1,
          nodeId: "1:100",
          frameName: "Cover",
          status: "VALID_BENCHMARK",
          referencePngPath: testPngPath,
          referencePngSha256: genuineHash,
          improvedPngPath: path.join(tmpDir, "test2.png"),
          improvedPngSha256: genuineHash,
          baselineSsim: null,
          baselineMae: null,
          baselineRmse: null,
          baselineMismatch: null,
          improvedSsim: 0.95,
          improvedMae: 1.0,
          improvedRmse: 2.0,
          improvedMismatch: 0.01,
          ssimDelta: null,
        },
      ],
      averages: {
        baselineSsim: null,
        improvedSsim: 0.95,
        ssimDelta: null,
        baselineMae: null,
        improvedMae: 1.0,
        baselineRmse: null,
        improvedRmse: 2.0,
      },
    };

    const res = evaluateMeasurementIntegrity(bundle);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes("Baseline DOCX SHA-256 populated in ABSOLUTE_FIGMA_TO_WORD mode"))).toBe(true);
  });

  it("7. Rejects ABSOLUTE_FIGMA_TO_WORD when referencePngPath is missing", () => {
    const bundle: MeasurementBundle = {
      mode: "real",
      comparisonMode: "ABSOLUTE_FIGMA_TO_WORD",
      inputJsonSha256: "a".repeat(64),
      improvedDocxSha256: "b".repeat(64),
      improvedPdfSha256: "c".repeat(64),
      wordAutomationSucceeded: true,
      computedAt: new Date().toISOString(),
      pages: [
        {
          pageNumber: 1,
          nodeId: "1:100",
          frameName: "Cover",
          status: "VALID_BENCHMARK",
          referencePngPath: undefined, // MISSING
          referencePngSha256: undefined,
          improvedPngPath: path.join(tmpDir, "test2.png"),
          improvedPngSha256: genuineHash,
          baselineSsim: null,
          baselineMae: null,
          baselineRmse: null,
          baselineMismatch: null,
          improvedSsim: 0.95,
          improvedMae: 1.0,
          improvedRmse: 2.0,
          improvedMismatch: 0.01,
          ssimDelta: null,
        },
      ],
      averages: {
        baselineSsim: null,
        improvedSsim: 0.95,
        ssimDelta: null,
        baselineMae: null,
        improvedMae: 1.0,
        baselineRmse: null,
        improvedRmse: 2.0,
      },
    };

    const res = evaluateMeasurementIntegrity(bundle);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes("missing reference or improved PNG path in absolute mode"))).toBe(true);
  });

  it("8. Rejects ABSOLUTE_FIGMA_TO_WORD when average baselineSsim or ssimDelta is populated", () => {
    const bundle: MeasurementBundle = {
      mode: "real",
      comparisonMode: "ABSOLUTE_FIGMA_TO_WORD",
      inputJsonSha256: "a".repeat(64),
      improvedDocxSha256: "b".repeat(64),
      improvedPdfSha256: "c".repeat(64),
      wordAutomationSucceeded: true,
      computedAt: new Date().toISOString(),
      pages: [
        {
          pageNumber: 1,
          nodeId: "1:100",
          frameName: "Cover",
          status: "VALID_BENCHMARK",
          referencePngPath: testPngPath,
          referencePngSha256: genuineHash,
          improvedPngPath: path.join(tmpDir, "test2.png"),
          improvedPngSha256: genuineHash,
          baselineSsim: null,
          baselineMae: null,
          baselineRmse: null,
          baselineMismatch: null,
          improvedSsim: 0.95,
          improvedMae: 1.0,
          improvedRmse: 2.0,
          improvedMismatch: 0.01,
          ssimDelta: null,
        },
      ],
      averages: {
        baselineSsim: 0.90, // ILLEGAL in ABSOLUTE mode!
        improvedSsim: 0.95,
        ssimDelta: 0.05,    // ILLEGAL in ABSOLUTE mode!
        baselineMae: null,
        improvedMae: 1.0,
        baselineRmse: null,
        improvedRmse: 2.0,
      },
    };

    const res = evaluateMeasurementIntegrity(bundle);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes("INTEGRITY_FAIL_09C"))).toBe(true);
  });
});
