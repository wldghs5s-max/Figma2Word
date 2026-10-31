import { describe, it, expect } from "vitest";
import {
  evaluateFinalVerdict,
  GateResult,
  VerificationStatus,
} from "../src/fidelity/verificationVerdict.js";

describe("Phase 39: Unified Verdict Contract & Fail-Closed Gate Suite", () => {
  const makeGate = (
    gateId: string,
    status: VerificationStatus,
    failureReasons?: string[]
  ): GateResult => ({
    gateId,
    name: gateId,
    status,
    summary: `${gateId} summary: ${status}`,
    failureReasons,
  });

  it("1. Passes and approves when all required gates are PASSED", () => {
    const required: GateResult[] = [
      makeGate("provenance", "PASSED"),
      makeGate("measurement_integrity", "PASSED"),
      makeGate("object_traceability", "PASSED"),
      makeGate("layout_stability", "PASSED"),
    ];

    const verdict = evaluateFinalVerdict({
      runId: "run_test_001",
      requiredGates: required,
    });

    expect(verdict.isApproved).toBe(true);
    expect(verdict.overallStatus).toBe("PASSED");
    expect(verdict.exitCode).toBe(0);
    expect(verdict.failureReasons).toHaveLength(0);
    expect(verdict.passedGateCount).toBe(4);
  });

  it("2. Fails closed when any required gate is FAILED", () => {
    const required: GateResult[] = [
      makeGate("provenance", "PASSED"),
      makeGate("measurement_integrity", "FAILED", ["SSIM was NaN"]),
      makeGate("object_traceability", "PASSED"),
    ];

    const verdict = evaluateFinalVerdict({
      runId: "run_test_002",
      requiredGates: required,
    });

    expect(verdict.isApproved).toBe(false);
    expect(verdict.overallStatus).toBe("FAILED");
    expect(verdict.exitCode).toBe(1);
    expect(verdict.failureReasons).toContain("Gate 'measurement_integrity' failed: SSIM was NaN");
  });

  it("3. Fails closed and reports PARTIAL when a required gate is PARTIAL", () => {
    const required: GateResult[] = [
      makeGate("provenance", "PASSED"),
      makeGate("layout_stability", "PARTIAL", ["1 page had regressions"]),
    ];

    const verdict = evaluateFinalVerdict({
      runId: "run_test_003",
      requiredGates: required,
    });

    expect(verdict.isApproved).toBe(false);
    expect(verdict.overallStatus).toBe("PARTIAL");
    expect(verdict.exitCode).toBe(1);
  });

  it("4. Fails closed when a required gate is UNVERIFIED", () => {
    const required: GateResult[] = [
      makeGate("provenance", "PASSED"),
      makeGate("word_native_rendering", "UNVERIFIED", ["Word COM unavailable"]),
    ];

    const verdict = evaluateFinalVerdict({
      runId: "run_test_004",
      requiredGates: required,
    });

    expect(verdict.isApproved).toBe(false);
    expect(verdict.overallStatus).toBe("UNVERIFIED");
    expect(verdict.exitCode).toBe(1);
  });

  it("5. Fails closed when a required gate is SKIPPED or missing", () => {
    const required: GateResult[] = [
      makeGate("provenance", "PASSED"),
      makeGate("edit_persistence", "SKIPPED", ["Test was skipped"]),
    ];

    const verdict = evaluateFinalVerdict({
      runId: "run_test_005",
      requiredGates: required,
    });

    expect(verdict.isApproved).toBe(false);
    expect(verdict.overallStatus).toBe("FAILED");
    expect(verdict.exitCode).toBe(1);
    expect(verdict.failureReasons.some((r) => r.includes("SKIPPED"))).toBe(true);
  });

  it("6. Rejects empty required gate sets (empty set cannot approve)", () => {
    const verdict = evaluateFinalVerdict({
      runId: "run_test_006",
      requiredGates: [],
    });

    expect(verdict.isApproved).toBe(false);
    expect(verdict.overallStatus).toBe("FAILED");
    expect(verdict.exitCode).toBe(1);
    expect(verdict.failureReasons.some((r) => r.includes("No required gates"))).toBe(true);
  });

  it("7. Fails closed if evidence manifest declares missing or unverified files", () => {
    const required: GateResult[] = [makeGate("provenance", "PASSED")];

    const verdict = evaluateFinalVerdict({
      runId: "run_test_007",
      requiredGates: required,
      evidenceManifest: {
        files: [
          { path: "debug/candidate/doc.docx", sha256: "abc", exists: true },
          { path: "debug/candidate/doc.pdf", sha256: "", exists: false },
        ],
      },
    });

    expect(verdict.isApproved).toBe(false);
    expect(verdict.overallStatus).toBe("FAILED");
    expect(verdict.exitCode).toBe(1);
    expect(verdict.failureReasons.some((r) => r.includes("Evidence file missing"))).toBe(true);
  });
});

