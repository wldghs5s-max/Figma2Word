import { describe, it, expect } from "vitest";
import { auditLayoutStability } from "../src/fidelity/layoutStabilityAuditor.js";
import fs from "fs";
import path from "path";

describe("Phase 38: Masked Layout Stability Auditor Suite", () => {
  it("1. Verifies layout stability on identical before and after renders with zero edits", () => {
    // We can test against existing candidate pages directory
    const pagesDir = path.resolve("debug/phase37-production/candidate/pages");
    if (!fs.existsSync(pagesDir)) {
      return; // Skip if directory not yet generated in fresh clone
    }

    const report = auditLayoutStability(
      pagesDir,
      pagesDir,
      [],
      17,
      true,
      true
    );

    expect(report.totalPages).toBe(17);
    expect(report.unintendedRegressionsCount).toBe(0);
    expect(report.averageUnchangedMismatchRatio).toBe(0);
    expect(report.layoutStabilityVerdict).toBe("VERIFIED");
  });

  it("2. Accurately excludes edited bounding boxes and verifies unchanged region stability", () => {
    const pagesDir = path.resolve("debug/phase37-production/candidate/pages");
    if (!fs.existsSync(pagesDir)) {
      return;
    }

    const mockBoxes = [
      {
        page: 1,
        leftPt: 50,
        topPt: 50,
        widthPt: 200,
        heightPt: 100,
        category: "VML_TEXTBOX_TEXT",
      },
      {
        page: 2,
        leftPt: 100,
        topPt: 100,
        widthPt: 150,
        heightPt: 80,
        category: "VML_SHAPE_FILL_COLOR",
      },
    ];

    const report = auditLayoutStability(
      pagesDir,
      pagesDir,
      mockBoxes,
      17,
      true,
      true
    );

    expect(report.totalEditedObjects).toBe(2);
    expect(report.pages[0].hasEdits).toBe(true);
    expect(report.pages[0].editedObjectsCount).toBe(1);
    expect(report.pages[1].hasEdits).toBe(true);
    expect(report.pages[2].hasEdits).toBe(false);
    expect(report.unintendedRegressionsCount).toBe(0);
    expect(report.layoutStabilityVerdict).toBe("VERIFIED");
  });
});

