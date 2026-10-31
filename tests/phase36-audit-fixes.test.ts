import { describe, it, expect } from "vitest";
import * as crypto from "crypto";
import {
  evaluateProvenanceGate,
  evaluateMeasurementIntegrity,
  assertGatePassed,
  ProvenanceRecord,
  MeasurementBundle,
} from "../src/fidelity/integrityGate.js";

describe("Phase 36: Part A Audit Fixes & Quality Gates Suite", () => {
  describe("A-04: Non-zero exit code on Gate Failure", () => {
    it("throws and sets process.exitCode = 1 when Provenance Gate fails", () => {
      const badProvenance: ProvenanceRecord = {
        jsonPath: "test.json",
        jsonSha256: "invalid-hash",
        jsonSizeBytes: 0,
        nodeTreeExtracted: false,
        totalNodesExtracted: 0,
        totalTextNodes: 0,
        totalShapeNodes: 0,
        canvasIrCreated: false,
        irPageCount: 0,
        irElementCount: 0,
        docxCreated: false,
        docxSha256: "",
        docxSizeBytes: 0,
        pdfCreated: false,
        pdfSha256: "",
        wordPngCount: 0,
        wordPngSha256List: [],
        refPngCount: 0,
        refPngSha256List: [],
        isSyntheticDocument: true,
      };

      const result = evaluateProvenanceGate(badProvenance);
      expect(result.passed).toBe(false);

      // Reset exitCode before test
      process.exitCode = 0;

      expect(() => {
        assertGatePassed("ProvenanceGate", result);
      }).toThrow(/GATE_FAILURE/);

      expect(process.exitCode).toBe(1);

      // Reset
      process.exitCode = 0;
    });

    it("throws and sets process.exitCode = 1 when Measurement Integrity Gate fails", () => {
      const badBundle: MeasurementBundle = {
        mode: "real",
        inputJsonSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        baselineDocxSha256: "some-hash",
        improvedDocxSha256: "some-hash",
        baselinePdfSha256: "pdf-hash",
        improvedPdfSha256: "pdf-hash",
        wordAutomationSucceeded: false, // Word automation failed!
        computedAt: new Date().toISOString(),
        pages: [],
        averages: {
          baselineSsim: 0.8,
          improvedSsim: 0.9,
          ssimDelta: 0.1,
          baselineMae: 5,
          improvedMae: 4,
          baselineRmse: 10,
          improvedRmse: 8,
        },
      };

      const result = evaluateMeasurementIntegrity(badBundle, 16);
      expect(result.passed).toBe(false);

      // Reset exitCode
      process.exitCode = 0;

      expect(() => {
        assertGatePassed("MeasurementIntegrityGate", result);
      }).toThrow(/GATE_FAILURE/);

      expect(process.exitCode).toBe(1);

      // Reset
      process.exitCode = 0;
    });

    it("does NOT throw and does NOT modify process.exitCode when gate passes", () => {
      process.exitCode = 0;
      const passingResult = {
        passed: true,
        violations: [],
      };

      expect(() => {
        assertGatePassed("PassingGate", passingResult);
      }).not.toThrow();

      expect(process.exitCode).toBe(0);
    });
  });

  describe("A-02: Normalized Git Line Ending Verification", () => {
    it("verifies CRLF and LF content equivalence after newline normalization", () => {
      const contentLF = "import { Canvas } from './types';\nexport class DocxCanvasRenderer {\n  render() {\n    return true;\n  }\n}\n";
      const contentCRLF = "import { Canvas } from './types';\r\nexport class DocxCanvasRenderer {\r\n  render() {\r\n    return true;\r\n  }\r\n}\r\n";

      const hashLF = crypto.createHash("sha256").update(contentLF).digest("hex");
      const hashCRLF = crypto.createHash("sha256").update(contentCRLF).digest("hex");

      // Raw hashes differ due to CRLF vs LF
      expect(hashLF).not.toBe(hashCRLF);

      // Normalized hashes match 100%
      const normLF = crypto.createHash("sha256").update(contentLF.replace(/\r\n/g, "\n")).digest("hex");
      const normCRLF = crypto.createHash("sha256").update(contentCRLF.replace(/\r\n/g, "\n")).digest("hex");

      expect(normLF).toBe(normCRLF);
    });
  });
});
