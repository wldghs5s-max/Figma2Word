import { describe, it, expect } from "vitest";
import {
  evaluateProvenanceGate,
  evaluateMeasurementIntegrity,
  ProvenanceRecord,
  MeasurementBundle,
} from "../src/fidelity/integrityGate.js";

describe("Phase 35.1: Provenance & Measurement Integrity Gates", () => {
  const validProvenance: ProvenanceRecord = {
    jsonPath: "debug/customer/Real-Doc.json",
    jsonSha256: "a".repeat(64),
    jsonSizeBytes: 1048576,
    nodeTreeExtracted: true,
    totalNodesExtracted: 150,
    totalTextNodes: 60,
    totalShapeNodes: 80,
    canvasIrCreated: true,
    irPageCount: 5,
    irElementCount: 140,
    docxCreated: true,
    docxSha256: "b".repeat(64),
    docxSizeBytes: 524288,
    pdfCreated: true,
    pdfSha256: "c".repeat(64),
    wordPngCount: 5,
    wordPngSha256List: ["1".repeat(64), "2".repeat(64), "3".repeat(64), "4".repeat(64), "5".repeat(64)],
    refPngCount: 5,
    refPngSha256List: ["r1".repeat(32), "r2".repeat(32), "r3".repeat(32), "r4".repeat(32), "r5".repeat(32)],
    isSyntheticDocument: false,
  };

  const validBundle: MeasurementBundle = {
    mode: "real",
    inputJsonSha256: "a".repeat(64),
    baselineDocxSha256: "b1".repeat(32),
    improvedDocxSha256: "b2".repeat(32),
    baselinePdfSha256: "c1".repeat(32),
    improvedPdfSha256: "c2".repeat(32),
    wordAutomationSucceeded: true,
    computedAt: new Date().toISOString(),
    pages: [
      {
        pageNumber: 1,
        nodeId: "1:100",
        frameName: "Page 1",
        status: "VALID_BENCHMARK",
        baselinePngPath: "out/baseline/pages/page-001.png",
        baselinePngSha256: "p1_base".repeat(8),
        improvedPngPath: "out/improved/pages/page-001.png",
        improvedPngSha256: "p1_imp".repeat(8),
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
        baselinePngPath: "out/baseline/pages/page-002.png",
        baselinePngSha256: "p2_base".repeat(8),
        improvedPngPath: "out/improved/pages/page-002.png",
        improvedPngSha256: "p2_imp".repeat(8),
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
      {
        pageNumber: 3,
        nodeId: "1:300",
        frameName: "Page 3 (Missing Ref)",
        status: "REFERENCE_MISSING_VERSION_UNVERIFIED",
        baselineSsim: null,
        baselineMae: null,
        baselineRmse: null,
        baselineMismatch: null,
        improvedSsim: null,
        improvedMae: null,
        improvedRmse: null,
        improvedMismatch: null,
        ssimDelta: null,
      },
    ],
    averages: {
      baselineSsim: 0.8650, // (0.8500 + 0.8800) / 2
      improvedSsim: 0.8765, // (0.8650 + 0.8880) / 2
      ssimDelta: 0.0115,
      baselineMae: 9.0,
      improvedMae: 8.6,
      baselineRmse: 13.5,
      improvedRmse: 13.05,
    },
  };

  describe("Provenance Gate Verification", () => {
    it("1. Passes for 100% genuine pipeline records", () => {
      const res = evaluateProvenanceGate(validProvenance);
      expect(res.passed).toBe(true);
      expect(res.status).toBe("REAL_DOCUMENT_BENCHMARK");
      expect(res.violations).toHaveLength(0);
    });

    it("2. Negative Test: Rejects synthetic document fixture", () => {
      const bad = { ...validProvenance, isSyntheticDocument: true };
      const res = evaluateProvenanceGate(bad);
      expect(res.passed).toBe(false);
      expect(res.status).toBe("INVALID_PROVENANCE");
      expect(res.violations[0]).toContain("Synthetic document fixture detected");
    });

    it("3. Negative Test: Rejects missing JSON hash or zero size", () => {
      const bad = { ...validProvenance, jsonSha256: "", jsonSizeBytes: 0 };
      const res = evaluateProvenanceGate(bad);
      expect(res.passed).toBe(false);
      expect(res.violations.some((v) => v.includes("JSON SHA-256"))).toBe(true);
    });

    it("4. Negative Test: Rejects missing PDF or DOCX output hashes", () => {
      const bad = { ...validProvenance, pdfSha256: "", docxCreated: false };
      const res = evaluateProvenanceGate(bad);
      expect(res.passed).toBe(false);
      expect(res.violations.some((v) => v.includes("DOCX was not successfully created"))).toBe(true);
      expect(res.violations.some((v) => v.includes("PDF was not exported"))).toBe(true);
    });
  });

  describe("Measurement Integrity Gate Verification", () => {
    it("1. Passes for valid real benchmark bundle with genuine varying deltas", () => {
      const res = evaluateMeasurementIntegrity(validBundle);
      expect(res.passed).toBe(true);
      expect(res.violations).toHaveLength(0);
    });

    it("2. Negative Test: Detects constant offset manipulation (comp.ssim - 0.008 pattern)", () => {
      const riggedBundle: MeasurementBundle = {
        ...validBundle,
        pages: [
          { ...validBundle.pages[0], ssimDelta: 0.0080 },
          { ...validBundle.pages[1], ssimDelta: 0.0080 },
          {
            pageNumber: 4,
            nodeId: "1:400",
            frameName: "Page 4",
            status: "VALID_BENCHMARK",
            baselinePngPath: "out/b4.png",
            improvedPngPath: "out/i4.png",
            baselineSsim: 0.8000,
            improvedSsim: 0.8080,
            ssimDelta: 0.0080,
            baselineMae: 10,
            improvedMae: 8.75,
            baselineRmse: 15,
            improvedRmse: 13.55,
            baselineMismatch: 0.1,
            improvedMismatch: 0.088,
          },
        ],
      };
      const res = evaluateMeasurementIntegrity(riggedBundle);
      expect(res.passed).toBe(false);
      expect(res.violations.some((v) => v.includes("constant offset simulation"))).toBe(true);
    });

    it("3. Negative Test: Detects shared identical file path for Before and After", () => {
      const badBundle: MeasurementBundle = {
        ...validBundle,
        pages: [
          {
            ...validBundle.pages[0],
            improvedPngPath: validBundle.pages[0].baselinePngPath, // Path reused!
          },
          validBundle.pages[1],
        ],
      };
      const res = evaluateMeasurementIntegrity(badBundle);
      expect(res.passed).toBe(false);
      expect(res.violations.some((v) => v.includes("reuses identical PNG path"))).toBe(true);
    });

    it("4. Negative Test: Detects assigning score to missing reference frame", () => {
      const badBundle: MeasurementBundle = {
        ...validBundle,
        pages: [
          validBundle.pages[0],
          validBundle.pages[1],
          {
            ...validBundle.pages[2],
            baselineSsim: 0.9500, // Should be null!
          },
        ],
      };
      const res = evaluateMeasurementIntegrity(badBundle);
      expect(res.passed).toBe(false);
      expect(res.violations.some((v) => v.includes("assigned non-null score"))).toBe(true);
    });

    it("5. Negative Test: Detects Word automation failure", () => {
      const badBundle: MeasurementBundle = {
        ...validBundle,
        wordAutomationSucceeded: false,
      };
      const res = evaluateMeasurementIntegrity(badBundle);
      expect(res.passed).toBe(false);
      expect(res.violations.some((v) => v.includes("Word native rendering failed"))).toBe(true);
    });

    it("6. Negative Test: Detects aggregation math discrepancy in summary averages", () => {
      const badBundle: MeasurementBundle = {
        ...validBundle,
        averages: {
          ...validBundle.averages,
          baselineSsim: 0.9999, // Rigged average!
        },
      };
      const res = evaluateMeasurementIntegrity(badBundle);
      expect(res.passed).toBe(false);
      expect(res.violations.some((v) => v.includes("Baseline SSIM average mismatch"))).toBe(true);
    });
  });
});
