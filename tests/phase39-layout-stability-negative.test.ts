import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { encodePng, DecodedImage } from "../src/fidelity/pngDecoder.js";
import {
  auditLayoutStability,
  EditedObjectBox,
} from "../src/fidelity/layoutStabilityAuditor.js";

function createSolidImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255
): DecodedImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { width, height, data };
}

describe("Phase 39: Layout Stability Auditor Vulnerability Hardening Suite", () => {
  let tmpDir: string;
  let beforeDir: string;
  let afterDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase39-layout-"));
    beforeDir = path.join(tmpDir, "before");
    afterDir = path.join(tmpDir, "after");
    fs.mkdirSync(beforeDir, { recursive: true });
    fs.mkdirSync(afterDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1. Rejects zero total pages (totalPages = 0 cannot pass as VERIFIED)", () => {
    const report = auditLayoutStability(beforeDir, afterDir, [], 0, true, true);
    expect(report.layoutStabilityVerdict).toBe("FAILED");
    expect(report.totalPages).toBe(0);
  });

  it("2. Rejects full mask covering entire page (inspected pixels = 0)", () => {
    const img = createSolidImage(100, 100, 255, 255, 255);
    const pngBuf = encodePng(img);
    fs.writeFileSync(path.join(beforeDir, "page-001.png"), pngBuf);
    fs.writeFileSync(path.join(afterDir, "page-001.png"), pngBuf);

    // Box that covers the whole page (100x100 at 96dpi is 75x75 pt)
    const fullMaskBox: EditedObjectBox = {
      page: 1,
      leftPt: 0,
      topPt: 0,
      widthPt: 100,
      heightPt: 100,
      category: "FULL_MASK",
    };

    const report = auditLayoutStability(beforeDir, afterDir, [fullMaskBox], 1, true, true);
    expect(report.layoutStabilityVerdict).toBe("FAILED");
    expect(report.pages[0].isStable).toBe(false);
    expect(report.pages[0].inspectedPixels).toBe(0);
    expect(report.pages[0].diagnostics).toContain("Insufficient inspected pixels");
  });

  it("3. Rejects dimension mismatch between Before and After images (different widths/strides)", () => {
    const beforeImg = createSolidImage(100, 100, 255, 255, 255);
    const afterImg = createSolidImage(120, 100, 255, 255, 255); // 120 width!
    fs.writeFileSync(path.join(beforeDir, "page-001.png"), encodePng(beforeImg));
    fs.writeFileSync(path.join(afterDir, "page-001.png"), encodePng(afterImg));

    const report = auditLayoutStability(beforeDir, afterDir, [], 1, true, true);
    expect(report.layoutStabilityVerdict).toBe("FAILED");
    expect(report.pages[0].isStable).toBe(false);
    expect(report.pages[0].diagnostics).toContain("Image dimension mismatch");
  });

  it("4. Rejects missing PNG files with explicit diagnostic failure", () => {
    const report = auditLayoutStability(beforeDir, afterDir, [], 1, true, true);
    expect(report.layoutStabilityVerdict).toBe("FAILED");
    expect(report.pages[0].isStable).toBe(false);
    expect(report.pages[0].diagnostics).toContain("Missing PNG file");
  });

  it("5. Detects unintended alterations outside masked area as UNSTABLE", () => {
    const beforeImg = createSolidImage(200, 200, 255, 255, 255);
    const afterImg = createSolidImage(200, 200, 255, 255, 255);

    // Alter an unmasked pixel at (180, 180)
    const alteredIdx = (180 * 200 + 180) * 4;
    afterImg.data[alteredIdx] = 0; // Black pixel
    afterImg.data[alteredIdx + 1] = 0;
    afterImg.data[alteredIdx + 2] = 0;

    fs.writeFileSync(path.join(beforeDir, "page-001.png"), encodePng(beforeImg));
    fs.writeFileSync(path.join(afterDir, "page-001.png"), encodePng(afterImg));

    // Edit box at (10, 10) of size (20, 20)
    const editBox: EditedObjectBox = {
      page: 1,
      leftPt: 10,
      topPt: 10,
      widthPt: 20,
      heightPt: 20,
      category: "SMALL_EDIT",
    };

    const report = auditLayoutStability(beforeDir, afterDir, [editBox], 1, true, true);
    // There are 200x200 = 40,000 pixels. 1 altered pixel in 40,000 is 0.000025.
    // If we alter a 10x10 patch at (150, 150) -> 100 pixels / 40,000 = 0.0025 > 0.001
    for (let dy = 0; dy < 10; dy++) {
      for (let dx = 0; dx < 10; dx++) {
        const idx = ((150 + dy) * 200 + (150 + dx)) * 4;
        afterImg.data[idx] = 0;
      }
    }
    fs.writeFileSync(path.join(afterDir, "page-001.png"), encodePng(afterImg));

    const report2 = auditLayoutStability(beforeDir, afterDir, [editBox], 1, true, true);
    expect(report2.layoutStabilityVerdict).toBe("FAILED");
    expect(report2.pages[0].isStable).toBe(false);
    expect(report2.pages[0].diagnostics).toContain("UNSTABLE");
  });

  it("6. Passes genuinely stable renders with valid masked area and unchanged unmasked regions", () => {
    const beforeImg = createSolidImage(200, 200, 255, 255, 255);
    const afterImg = createSolidImage(200, 200, 255, 255, 255);

    // Edit box at (20, 20) of size (30, 30) pt
    const editBox: EditedObjectBox = {
      page: 1,
      leftPt: 20,
      topPt: 20,
      widthPt: 30,
      heightPt: 30,
      category: "LEGIT_EDIT",
    };

    // Modify pixels strictly within the masked zone (20 pt = 26.6 px, with padding 30 px, zone is ~0 to 70 px)
    const editPixelIdx = (30 * 200 + 30) * 4;
    afterImg.data[editPixelIdx] = 0;

    fs.writeFileSync(path.join(beforeDir, "page-001.png"), encodePng(beforeImg));
    fs.writeFileSync(path.join(afterDir, "page-001.png"), encodePng(afterImg));

    const report = auditLayoutStability(beforeDir, afterDir, [editBox], 1, true, true);
    expect(report.layoutStabilityVerdict).toBe("VERIFIED");
    expect(report.pages[0].isStable).toBe(true);
    expect(report.unintendedRegressionsCount).toBe(0);
  });
});

