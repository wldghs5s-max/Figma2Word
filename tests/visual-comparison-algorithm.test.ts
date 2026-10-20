import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

describe("Phase 27: Visual Comparison Algorithm & Local Window SSIM Suite", () => {
  const tmpDir = path.resolve(process.cwd(), "debug/phase27-algorithm-test");
  const swiftScript = path.resolve(process.cwd(), "tools/visual-regression/compare_engine.swift");

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });

    // Generate synthetic PNG images using Swift AppKit for deterministic pixel values
    const genScript = `
      import AppKit
      import CoreGraphics

      func createBaseImage() -> NSImage {
          let size = NSSize(width: 200, height: 200)
          let img = NSImage(size: size)
          img.lockFocus()
          NSColor.white.setFill()
          NSRect(x: 0, y: 0, width: 200, height: 200).fill()
          // Draw a blue header bar
          NSColor.blue.setFill()
          NSRect(x: 10, y: 150, width: 180, height: 40).fill()
          // Draw a small black button
          NSColor.black.setFill()
          NSRect(x: 50, y: 50, width: 60, height: 30).fill()
          img.unlockFocus()
          return img
      }

      func savePng(_ img: NSImage, _ path: String) {
          if let tiff = img.tiffRepresentation,
             let rep = NSBitmapImageRep(data: tiff),
             let png = rep.representation(using: .png, properties: [:]) {
              try? png.write(to: URL(fileURLWithPath: path))
          }
      }

      let base = createBaseImage()
      savePng(base, "${tmpDir}/base.png")

      // 1. Identical copy
      savePng(base, "${tmpDir}/identical.png")

      // 2. Local defect: button is missing in bottom-left
      let missingBtn = createBaseImage()
      missingBtn.lockFocus()
      NSColor.white.setFill()
      NSRect(x: 50, y: 50, width: 60, height: 30).fill() // Erase button
      missingBtn.unlockFocus()
      savePng(missingBtn, "${tmpDir}/missing_btn.png")

      // 3. Color shift: header is orange instead of blue
      let colorShift = NSImage(size: NSSize(width: 200, height: 200))
      colorShift.lockFocus()
      NSColor.white.setFill()
      NSRect(x: 0, y: 0, width: 200, height: 200).fill()
      NSColor.orange.setFill()
      NSRect(x: 10, y: 150, width: 180, height: 40).fill()
      NSColor.black.setFill()
      NSRect(x: 50, y: 50, width: 60, height: 30).fill()
      colorShift.unlockFocus()
      savePng(colorShift, "${tmpDir}/color_shift.png")
    `;
    const setupScriptPath = path.join(tmpDir, "setup_images.swift");
    fs.writeFileSync(setupScriptPath, genScript);
    execSync(`swift "${setupScriptPath}"`);
  });

  it("1. Detects perfect identity on identical images (Global=1.0, Local=1.0, Worst=1.0, MAE=0.0)", () => {
    const cmd = `swift "${swiftScript}" "${tmpDir}/base.png" "${tmpDir}/identical.png"`;
    const res = JSON.parse(execSync(cmd, { encoding: "utf8" }).trim());

    expect(res.globalSsim).toBe(1.0);
    expect(res.localWindowSsim).toBe(1.0);
    expect(res.worstLocalSsim).toBe(1.0);
    expect(res.mae).toBe(0.0);
    expect(res.mismatchRatio).toBe(0.0);
  });

  it("2. Local Window SSIM catches localized missing button while Global SSIM remains falsely high", () => {
    const cmd = `swift "${swiftScript}" "${tmpDir}/base.png" "${tmpDir}/missing_btn.png"`;
    const res = JSON.parse(execSync(cmd, { encoding: "utf8" }).trim());

    // Global SSIM might appear deceptively high (> 0.85) because 95% of background is identical
    expect(res.globalSsim).toBeGreaterThan(0.8);

    // BUT Worst Local Window SSIM plunges drastically (< 0.2), successfully raising the alarm!
    expect(res.worstLocalSsim).toBeLessThan(0.3);
    expect(res.mismatchRatio).toBeGreaterThan(0.04);
    expect(res.edgeDiff).toBeGreaterThan(0.5);
  });

  it("3. Color shift significantly increases MAE and triggers mismatch ratio", () => {
    const cmd = `swift "${swiftScript}" "${tmpDir}/base.png" "${tmpDir}/color_shift.png"`;
    const res = JSON.parse(execSync(cmd, { encoding: "utf8" }).trim());

    expect(res.mae).toBeGreaterThan(20.0);
    expect(res.mismatchRatio).toBeGreaterThan(0.1);
  });
});
