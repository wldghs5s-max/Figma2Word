import { describe, it, expect } from "vitest";
import {
  evaluateProvenanceGate,
  evaluateMeasurementIntegrity,
  ProvenanceRecord,
  MeasurementBundle,
} from "../src/fidelity/integrityGate.js";

describe("Phase 39: Integrity Gate Codex Vulnerability Hardening Suite", () => {
  const baseValidBundle: MeasurementBundle = {
    mode: "real",
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
        nodeId: "1:100",
        frameName: "Page 1",
        status: "VALID_BENCHMARK",
        baselinePngPath: "out/b1.png",
        baselinePngSha256: "hash_base_1".repeat(4),
        improvedPngPath: "out/i1.png",
        improvedPngSha256: "hash_imp_1".repeat(4),
        baselineSsim: 0.8500,
        baselineMae: 10.0,
        baselineRmse: 15.0,
        baselineMismatch: 0.20,
        improvedSsim: 0.8650,
        improvedMae: 9.5,
        improvedRmse: 14.5,
        improvedMismatch: 0.18,
        ssimDelta: 0.0150,
      },
      {
        pageNumber: 2,
        nodeId: "1:200",
        frameName: "Page 2",
        status: "VALID_BENCHMARK",
        baselinePngPath: "out/b2.png",
        baselinePngSha256: "hash_base_2".repeat(4),
        improvedPngPath: "out/i2.png",
        improvedPngSha256: "hash_imp_2".repeat(4),
        baselineSsim: 0.8800,
        baselineMae: 8.0,
        baselineRmse: 12.0,
        baselineMismatch: 0.15,
        improvedSsim: 0.8880,
        improvedMae: 7.7,
        improvedRmse: 11.6,
        improvedMismatch: 0.14,
        ssimDelta: 0.0080,
      },
    ],
    averages: {
      baselineSsim: 0.8650,
      improvedSsim: 0.8765,
      ssimDelta: 0.0115,
      baselineMae: 9.0,
      improvedMae: 8.6,
      baselineRmse: 13.5,
      improvedRmse: 13.05,
    },
  };

  it("1. Rejects non-existent input files when verifyDiskFiles is enabled", () => {
    const provRecord: ProvenanceRecord = {
      jsonPath: "non/existent/customer/design.json",
      jsonSha256: "f".repeat(64),
      jsonSizeBytes: 1024,
      nodeTreeExtracted: true,
      totalNodesExtracted: 100,
      totalTextNodes: 50,
      totalShapeNodes: 50,
      canvasIrCreated: true,
      irPageCount: 1,
      irElementCount: 100,
      docxCreated: true,
      docxSha256: "1".repeat(64),
      docxSizeBytes: 2048,
      pdfCreated: true,
      pdfSha256: "2".repeat(64),
      wordPngCount: 1,
      wordPngSha256List: ["3".repeat(64)],
      refPngCount: 1,
      refPngSha256List: ["4".repeat(64)],
      isSyntheticDocument: false,
    };

    const res = evaluateProvenanceGate(provRecord, { verifyDiskFiles: true });
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes("does not exist on disk"))).toBe(true);
  });

  it("2. Rejects fake/malformed DOCX or PDF hashes in Provenance and Measurement", () => {
    const badProv: ProvenanceRecord = {
      jsonPath: "dummy.json",
      jsonSha256: "a".repeat(64),
      jsonSizeBytes: 100,
      nodeTreeExtracted: true,
      totalNodesExtracted: 1,
      totalTextNodes: 1,
      totalShapeNodes: 0,
      canvasIrCreated: true,
      irPageCount: 1,
      irElementCount: 1,
      docxCreated: true,
      docxSha256: "fake_short_hash", // Not 64 hex!
      docxSizeBytes: 100,
      pdfCreated: true,
      pdfSha256: "", // Empty hash!
      wordPngCount: 1,
      wordPngSha256List: ["c".repeat(64)],
      refPngCount: 1,
      refPngSha256List: ["d".repeat(64)],
      isSyntheticDocument: false,
    };
    const provRes = evaluateProvenanceGate(badProv);
    expect(provRes.passed).toBe(false);
    expect(provRes.violations.some((v) => v.includes("empty/invalid hash"))).toBe(true);

    const badBundle: MeasurementBundle = {
      ...baseValidBundle,
      baselineDocxSha256: "short",
    };
    const measRes = evaluateMeasurementIntegrity(badBundle);
    expect(measRes.passed).toBe(false);
    expect(measRes.violations.some((v) => v.includes("INTEGRITY_FAIL_04"))).toBe(true);
  });

  it("3. Rejects empty PNG hash on benchmark page", () => {
    const badBundle: MeasurementBundle = {
      ...baseValidBundle,
      pages: [
        {
          ...baseValidBundle.pages[0],
          baselinePngSha256: "", // Empty PNG hash!
        },
        baseValidBundle.pages[1],
      ],
    };
    const res = evaluateMeasurementIntegrity(badBundle);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes("INTEGRITY_FAIL_EMPTY_PNG_HASH"))).toBe(true);
  });

  it("4. Rejects duplicate page numbers and duplicate node IDs (16 identical duplicated pages)", () => {
    const duplicatedPages = Array(16).fill(null).map(() => ({ ...baseValidBundle.pages[0] }));
    const dupBundle: MeasurementBundle = {
      ...baseValidBundle,
      pages: duplicatedPages,
    };
    const res = evaluateMeasurementIntegrity(dupBundle);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes("INTEGRITY_FAIL_DUP_PAGE"))).toBe(true);
  });

  it("5. Rejects SSIM NaN and Infinity", () => {
    const nanBundle: MeasurementBundle = {
      ...baseValidBundle,
      pages: [
        {
          ...baseValidBundle.pages[0],
          baselineSsim: NaN,
        },
        baseValidBundle.pages[1],
      ],
    };
    const resNan = evaluateMeasurementIntegrity(nanBundle);
    expect(resNan.passed).toBe(false);
    expect(resNan.violations.some((v) => v.includes("INTEGRITY_FAIL_NON_FINITE_SSIM"))).toBe(true);

    const infBundle: MeasurementBundle = {
      ...baseValidBundle,
      pages: [
        {
          ...baseValidBundle.pages[0],
          improvedSsim: Infinity,
        },
        baseValidBundle.pages[1],
      ],
    };
    const resInf = evaluateMeasurementIntegrity(infBundle);
    expect(resInf.passed).toBe(false);
    expect(resInf.violations.some((v) => v.includes("INTEGRITY_FAIL_NON_FINITE_SSIM"))).toBe(true);
  });

  it("6. Rejects negative MAE and RMSE values", () => {
    const negMaeBundle: MeasurementBundle = {
      ...baseValidBundle,
      pages: [
        {
          ...baseValidBundle.pages[0],
          baselineMae: -5.0,
        },
        baseValidBundle.pages[1],
      ],
    };
    const resMae = evaluateMeasurementIntegrity(negMaeBundle);
    expect(resMae.passed).toBe(false);
    expect(resMae.violations.some((v) => v.includes("INTEGRITY_FAIL_INVALID_MAE"))).toBe(true);

    const negRmseBundle: MeasurementBundle = {
      ...baseValidBundle,
      pages: [
        {
          ...baseValidBundle.pages[0],
          improvedRmse: -0.01,
        },
        baseValidBundle.pages[1],
      ],
    };
    const resRmse = evaluateMeasurementIntegrity(negRmseBundle);
    expect(resRmse.passed).toBe(false);
    expect(resRmse.violations.some((v) => v.includes("INTEGRITY_FAIL_INVALID_RMSE"))).toBe(true);
  });

  it("7. Rejects mismatch ratio greater than 1.0 (e.g. ratio = 2)", () => {
    const badRatioBundle: MeasurementBundle = {
      ...baseValidBundle,
      pages: [
        {
          ...baseValidBundle.pages[0],
          baselineMismatch: 2.0, // Invalid ratio! Must be <= 1.0
        },
        baseValidBundle.pages[1],
      ],
    };
    const res = evaluateMeasurementIntegrity(badRatioBundle);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes("INTEGRITY_FAIL_INVALID_MISMATCH"))).toBe(true);
  });

  it("8. Rejects fake PNG paths when verifyDiskFiles is enabled", () => {
    const res = evaluateMeasurementIntegrity(baseValidBundle, undefined, { verifyDiskFiles: true });
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes("INTEGRITY_FAIL_FILE_NOT_FOUND"))).toBe(true);
  });
});

