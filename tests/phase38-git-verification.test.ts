import { describe, it, expect } from "vitest";
import {
  auditCoreRendererLineage,
  CORE_RENDERER_SOURCE_FILES,
} from "../src/fidelity/gitOriginVerifier.js";

describe("Phase 38: Core Renderer Git Lineage Audit Suite", () => {
  it("1. Successfully audits core renderer modules against commit 4672199", () => {
    const manifest = auditCoreRendererLineage("4672199");
    expect(manifest.baselineCommitSha).toBe("4672199");
    expect(manifest.verifiedModuleCount).toBe(CORE_RENDERER_SOURCE_FILES.length);
    expect(manifest.modules.length).toBe(CORE_RENDERER_SOURCE_FILES.length);

    // Each module should have valid LF SHA-256
    for (const mod of manifest.modules) {
      expect(mod.gitBlobSha256).toHaveLength(64);
      expect(mod.diskFileSha256).toHaveLength(64);
    }
  });

  it("2. Reports TAMPER_DETECTED when a module is modified", () => {
    // If we test with an invalid commit or modified path
    const manifest = auditCoreRendererLineage("aca7bd9");
    // aca7bd9 is phase36 commit, so modified phase37 files will be detected
    expect(manifest.modules.some((m) => m.status !== "VERIFIED")).toBe(true);
    expect(manifest.overallStatus).toBe("TAMPER_DETECTED");
  });

  it("3. Captures runtime process diagnostics", () => {
    const manifest = auditCoreRendererLineage("4672199");
    expect(manifest.runtimeProcessInfo.nodeVersion).toBe(process.version);
    expect(manifest.runtimeProcessInfo.pid).toBe(process.pid);
    expect(manifest.runtimeProcessInfo.platform).toBe(process.platform);
  });
});

