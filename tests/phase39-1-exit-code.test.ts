import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Phase 39.1: Real Child Process OS Exit Code & Gate Completeness Test", () => {
  let tmpDir: string;
  let runnerScript: string;
  const projectRoot = process.cwd();

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase39-1-exit-"));
    runnerScript = path.join(tmpDir, "exit_code_runner.ts");

    const verdictModulePath = path
      .resolve(projectRoot, "src/fidelity/verificationVerdict.js")
      .replace(/\\/g, "/");

    fs.writeFileSync(
      runnerScript,
      `import { evaluateFinalVerdict, REQUIRED_GATES_BY_MODE } from "${verdictModulePath}";
import * as fs from "fs";

const mode = process.argv[2];
const manifestPath = process.argv[3];

let requiredGates: any[] = [];

if (mode === "ALL_PASSED") {
  requiredGates = REQUIRED_GATES_BY_MODE.PRODUCTION_QUALITY_AUDIT.map((id) => ({
    gateId: id,
    name: id,
    status: "PASSED",
    summary: "Gate passed",
  }));
} else if (mode === "ONE_FAILED") {
  requiredGates = REQUIRED_GATES_BY_MODE.PRODUCTION_QUALITY_AUDIT.map((id, idx) => ({
    gateId: id,
    name: id,
    status: idx === 0 ? "FAILED" : "PASSED",
    summary: idx === 0 ? "Failed" : "Passed",
    failureReasons: idx === 0 ? ["Simulated failure"] : undefined,
  }));
} else if (mode === "GATE_MISSING") {
  requiredGates = REQUIRED_GATES_BY_MODE.PRODUCTION_QUALITY_AUDIT.slice(1).map((id) => ({
    gateId: id,
    name: id,
    status: "PASSED",
    summary: "Gate passed",
  }));
} else if (mode === "THROWS_EXCEPTION") {
  throw new Error("Uncaught runtime exception");
}

const verdict = evaluateFinalVerdict({
  runId: "test_run",
  executionMode: "PRODUCTION_QUALITY_AUDIT",
  requiredGates,
});

if (manifestPath) {
  fs.writeFileSync(manifestPath, JSON.stringify(verdict, null, 2), "utf8");
}

process.exitCode = verdict.exitCode;
`,
      "utf8"
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runChild(mode: string, manifestPath?: string) {
    const args = ["--import", "tsx", runnerScript, mode];
    if (manifestPath) args.push(manifestPath);
    return spawnSync(process.execPath, args, { encoding: "utf8" });
  }

  it("1. All required gates PASSED -> Child process exits with OS code 0", () => {
    const manifestPath = path.join(tmpDir, "manifest_pass.json");
    const res = runChild("ALL_PASSED", manifestPath);

    expect(res.status).toBe(0);
    expect(fs.existsSync(manifestPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(saved.isApproved).toBe(true);
    expect(saved.exitCode).toBe(0);
    expect(saved.overallStatus).toBe("PASSED");
  });

  it("2. Any required gate FAILED -> Child process exits with OS code 1", () => {
    const manifestPath = path.join(tmpDir, "manifest_fail.json");
    const res = runChild("ONE_FAILED", manifestPath);

    expect(res.status).toBe(1);
    expect(fs.existsSync(manifestPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(saved.isApproved).toBe(false);
    expect(saved.exitCode).toBe(1);
    expect(saved.overallStatus).toBe("FAILED");
  });

  it("3. Required gate missing from input -> Child process exits with OS code 1", () => {
    const manifestPath = path.join(tmpDir, "manifest_missing.json");
    const res = runChild("GATE_MISSING", manifestPath);

    expect(res.status).toBe(1);
    expect(fs.existsSync(manifestPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(saved.isApproved).toBe(false);
    expect(saved.exitCode).toBe(1);
    expect(saved.overallStatus).toBe("FAILED");
    expect(saved.failureReasons.some((r: string) => r.includes("MISSING_REQUIRED_GATE"))).toBe(true);
  });

  it("4. Uncaught runtime exception -> Child process exits with non-zero code", () => {
    const res = runChild("THROWS_EXCEPTION");

    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("Uncaught runtime exception");
  });

  it("5. Verifies failed run writes fresh manifest and never reuses previous pass", () => {
    const reusePath = path.join(tmpDir, "manifest_reuse_test.json");
    fs.writeFileSync(
      reusePath,
      JSON.stringify({ isApproved: true, overallStatus: "PASSED", exitCode: 0 }),
      "utf8"
    );

    const res = runChild("ONE_FAILED", reusePath);

    expect(res.status).toBe(1);
    const updated = JSON.parse(fs.readFileSync(reusePath, "utf8"));
    expect(updated.isApproved).toBe(false);
    expect(updated.overallStatus).toBe("FAILED");
    expect(updated.exitCode).toBe(1);
  });
});
