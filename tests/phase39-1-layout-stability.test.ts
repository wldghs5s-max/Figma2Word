import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { auditLayoutStability } from "../src/fidelity/layoutStabilityAuditor.js";
import { encodePng, DecodedImage } from "../src/fidelity/pngDecoder.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function createSolidImage(width: number, height: number, r: number, g: number, b: number): DecodedImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

describe("Phase 39.1: Precision Layout Stability & Failure Taxonomy Test Suite", () => {
  let tmpDir: string;
  let beforeDir: string;
  let afterDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase39-1-layout-"));
    beforeDir = path.join(tmpDir, "before");
    afterDir = path.join(tmpDir, "after");
    fs.mkdirSync(beforeDir, { recursive: true });
    fs.mkdirSync(afterDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1. Distinguishes INSUFFICIENT_INSPECTION_COVERAGE from LAYOUT_REGRESSION_DETECTED", () => {
    // Page 1: Insufficient inspection coverage (full mask)
    fs.writeFileSync(path.join(beforeDir, "page-001.png"), encodePng(createSolidImage(100, 100, 255, 255, 255)));
    fs.writeFileSync(path.join(afterDir, "page-001.png"), encodePng(createSolidImage(100, 100, 255, 255, 255)));

    // Page 2: Layout regression (alteration outside edited box)
    const after2Img = createSolidImage(100, 100, 255, 255, 255);
    // Add corrupted pixels at (5, 5) outside the edited box (50, 50)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const idx = (y * 100 + x) * 4;
        after2Img.data[idx] = 0;
        after2Img.data[idx + 1] = 0;
        after2Img.data[idx + 2] = 0;
      }
    }
    fs.writeFileSync(path.join(beforeDir, "page-002.png"), encodePng(createSolidImage(100, 100, 255, 255, 255)));
    fs.writeFileSync(path.join(afterDir, "page-002.png"), encodePng(after2Img));

    // Page 3: Genuinely stable
    fs.writeFileSync(path.join(beforeDir, "page-003.png"), encodePng(createSolidImage(100, 100, 200, 200, 200)));
    fs.writeFileSync(path.join(afterDir, "page-003.png"), encodePng(createSolidImage(100, 100, 200, 200, 200)));

    // Edited boxes: Page 1 covers entire page (0 to 100), Page 2 covers only (50, 50, 30, 30)
    const boxes = [
      { page: 1, leftPt: 0, topPt: 0, widthPt: 100, heightPt: 100, category: "FILL" },
      { page: 2, leftPt: 50, topPt: 50, widthPt: 30, heightPt: 30, category: "TEXT" },
    ];

    const report = auditLayoutStability(beforeDir, afterDir, boxes, 3);

    expect(report.pages[0].status).toBe("INSUFFICIENT_INSPECTION_COVERAGE");
    expect(report.pages[0].isStable).toBe(false);

    expect(report.pages[1].status).toBe("LAYOUT_REGRESSION_DETECTED");
    expect(report.pages[1].isStable).toBe(false);

    expect(report.pages[2].status).toBe("STABLE");
    expect(report.pages[2].isStable).toBe(true);

    expect(report.insufficientCoverageCount).toBe(1);
    expect(report.stablePagesCount).toBe(1);
    expect(report.layoutStabilityVerdict).toBe("FAILED");
  });

  it("2. Distinguishes IMAGE_DIMENSION_MISMATCH and MISSING_RENDER_EVIDENCE", () => {
    // Page 1: dimension mismatch
    fs.writeFileSync(path.join(beforeDir, "page-001.png"), encodePng(createSolidImage(100, 100, 255, 255, 255)));
    fs.writeFileSync(path.join(afterDir, "page-001.png"), encodePng(createSolidImage(120, 100, 255, 255, 255)));

    // Page 2: missing in after
    fs.writeFileSync(path.join(beforeDir, "page-002.png"), encodePng(createSolidImage(100, 100, 255, 255, 255)));

    const report = auditLayoutStability(beforeDir, afterDir, [], 2);

    expect(report.pages[0].status).toBe("IMAGE_DIMENSION_MISMATCH");
    expect(report.dimensionMismatchCount).toBe(1);

    expect(report.pages[1].status).toBe("MISSING_RENDER_EVIDENCE");
    expect(report.missingEvidenceCount).toBe(1);

    expect(report.layoutStabilityVerdict).toBe("FAILED");
  });
});
