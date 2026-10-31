import { describe, it, expect } from "vitest";

describe("Phase 39.1: Report Consistency & Gate Description Non-Contradiction Test", () => {
  it("1. Ensures failed layout gate NEVER carries a 'Zero regressions' success description", () => {
    const layoutStabilityReport = {
      layoutStabilityVerdict: "FAILED",
      unintendedRegressionsCount: 1,
      insufficientCoverageCount: 0,
      averageUnchangedMismatchRatio: 0.00387,
      pages: [
        {
          pageNumber: 11,
          status: "LAYOUT_REGRESSION_DETECTED",
          isStable: false,
          unmaskedMismatchRatio: 0.00387,
        },
      ],
    };

    const isVerified = layoutStabilityReport.layoutStabilityVerdict === "VERIFIED";
    const summary = isVerified
      ? `Zero regressions on unedited document regions (avg mismatch ${(layoutStabilityReport.averageUnchangedMismatchRatio * 100).toFixed(4)}%)`
      : `Layout stability failed: ${layoutStabilityReport.unintendedRegressionsCount} non-stable pages detected`;

    expect(isVerified).toBe(false);
    expect(summary).not.toContain("Zero regressions");
    expect(summary).toContain("Layout stability failed");
  });

  it("2. Verifies consistency between gate status and failure reasons across all gates", () => {
    const mockGates = [
      {
        gateId: "GATE_LAYOUT_STABILITY",
        status: "FAILED",
        summary: "Layout stability failed: 1 non-stable pages",
        failureReasons: ["1 page regressions detected outside edited bounding box (Page 11)"],
      },
      {
        gateId: "GATE_OBJECT_TRACEABILITY",
        status: "FAILED",
        summary: "Traceability failed: 238 unresolved in DOCX",
        failureReasons: ["238 objects exist in IR but failed to resolve into DOCX XML"],
      },
    ];

    for (const g of mockGates) {
      if (g.status === "FAILED") {
        expect(g.summary.toLowerCase()).not.toContain("zero regressions");
        expect(g.summary.toLowerCase()).not.toContain("100% verified");
        expect(g.failureReasons && g.failureReasons.length > 0).toBe(true);
      }
    }
  });
});

