import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  verifyGitBaselineOrigin,
  computeNormalizedSha256,
} from "../src/fidelity/gitOriginVerifier.js";

describe("Phase 37: Automated Git Baseline Origin Verification Suite", () => {
  const origExitCode = process.exitCode;

  beforeEach(() => {
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = origExitCode;
  });

  it("1. Successfully verifies unmodified file against commit aca7bd9", () => {
    const res = verifyGitBaselineOrigin(
      "aca7bd9",
      "phase36-renderer-optimization/reports/01-audit-defects-resolution.md"
    );
    expect(res.status).toBe("VERIFIED");
    expect(res.normalizedMatch).toBe(true);
    expect(res.gitBlobSha256).toBe(res.diskFileSha256);
    expect(process.exitCode).toBeUndefined();
  });

  it("2. Fails closed and sets exitCode=1 when source file is tampered", () => {
    // Create temporary tampered file in a test directory
    const tmpDir = path.resolve("debug/test-git-tamper");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "dummy-tampered.ts");
    fs.writeFileSync(tmpFile, "// TAMPERED MALICIOUS CODE\nexport const x = 999;", "utf8");

    try {
      expect(() => {
        verifyGitBaselineOrigin("aca7bd9", "src/fidelity/integrityGate.ts", tmpDir);
      }).toThrow(/GIT_ORIGIN_VERIFY_FAILED|GIT_ORIGIN_TAMPER_DETECTED/);
      expect(process.exitCode).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("3. Fails closed and throws when target file does not exist on disk", () => {
    expect(() => {
      verifyGitBaselineOrigin("aca7bd9", "non_existent_file_path.ts");
    }).toThrow(/does not exist/);
    expect(process.exitCode).toBe(1);
  });

  it("4. Fails closed when commit hash does not exist in git", () => {
    expect(() => {
      verifyGitBaselineOrigin("ffffffffffffffffffffffffffffffffffffffff", "src/fidelity/integrityGate.ts");
    }).toThrow(/Failed to fetch git object/);
    expect(process.exitCode).toBe(1);
  });
});

