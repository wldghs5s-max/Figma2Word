import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export interface GitLineageVerificationResult {
  commitSha: string;
  filePath: string;
  gitBlobSha256: string;
  diskFileSha256: string;
  normalizedMatch: boolean;
  newlinePolicy: "LF_NORMALIZED";
  status: "VERIFIED" | "HASH_MISMATCH" | "FILE_NOT_FOUND" | "COMMIT_NOT_FOUND";
  error?: string;
}

export interface CoreRendererLineageManifest {
  baselineCommitSha: string;
  verifiedAt: string;
  overallStatus: "VERIFIED" | "TAMPER_DETECTED" | "ERROR";
  verifiedModuleCount: number;
  modules: GitLineageVerificationResult[];
  runtimeProcessInfo: {
    nodeVersion: string;
    pid: number;
    platform: string;
    cwd: string;
  };
}

export const CORE_RENDERER_SOURCE_FILES: string[] = [
  "src/canvas/parser/figmaCanvasParser.ts",
  "src/canvas/pipeline/canvasPipeline.ts",
  "src/canvas/types.ts",
  "src/canvas/renderer/docxCanvasRenderer.ts",
  "src/canvas/utils/imageResolver.ts",
  "src/canvas/geometry/svgPathParser.ts",
  "src/fidelity/affineTransformEngine.ts",
  "src/fidelity/mediaRelationshipAuditor.ts",
  "src/fidelity/editabilityAuditor.ts",
  "src/fidelity/integrityGate.ts",
];

export function computeNormalizedSha256(content: string | Buffer): string {
  const str = typeof content === "string" ? content : content.toString("utf8");
  const normalized = str.replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Checks a file against git commit without throwing, returning the detailed verification result.
 */
export function checkGitBaselineOrigin(
  commitSha: string,
  relFilePath: string,
  diskBasePath: string = process.cwd()
): GitLineageVerificationResult {
  const posixPath = relFilePath.replace(/\\/g, "/");
  const fullDiskPath = path.resolve(diskBasePath, relFilePath);

  if (!fs.existsSync(fullDiskPath)) {
    return {
      commitSha,
      filePath: posixPath,
      gitBlobSha256: "",
      diskFileSha256: "",
      normalizedMatch: false,
      newlinePolicy: "LF_NORMALIZED",
      status: "FILE_NOT_FOUND",
      error: `Disk file not found: ${fullDiskPath}`,
    };
  }

  let gitSource: string;
  try {
    gitSource = execSync(`git show ${commitSha}:${posixPath}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err: any) {
    return {
      commitSha,
      filePath: posixPath,
      gitBlobSha256: "",
      diskFileSha256: "",
      normalizedMatch: false,
      newlinePolicy: "LF_NORMALIZED",
      status: "COMMIT_NOT_FOUND",
      error: `Failed to fetch blob from git object store for ${commitSha}:${posixPath}`,
    };
  }

  const diskSource = fs.readFileSync(fullDiskPath, "utf8");
  const gitSha = computeNormalizedSha256(gitSource);
  const diskSha = computeNormalizedSha256(diskSource);
  const match = gitSha === diskSha;

  return {
    commitSha,
    filePath: posixPath,
    gitBlobSha256: gitSha,
    diskFileSha256: diskSha,
    normalizedMatch: match,
    newlinePolicy: "LF_NORMALIZED",
    status: match ? "VERIFIED" : "HASH_MISMATCH",
  };
}

/**
 * Automatically verifies that a source file matches git commit object, failing closed.
 */
export function verifyGitBaselineOrigin(
  commitSha: string,
  relFilePath: string,
  diskBasePath: string = process.cwd()
): GitLineageVerificationResult {
  const result = checkGitBaselineOrigin(commitSha, relFilePath, diskBasePath);
  if (result.status !== "VERIFIED") {
    let details = result.error || "Content mismatch";
    if (result.status === "FILE_NOT_FOUND") {
      details = `Disk file does not exist at ${path.resolve(diskBasePath, relFilePath)}`;
    } else if (result.status === "COMMIT_NOT_FOUND") {
      details = `Failed to fetch git object for ${commitSha}:${result.filePath}`;
    }
    const errorMsg =
      `GIT_ORIGIN_VERIFY_FAILED: File ${result.filePath} does not match git commit ${commitSha}!\n` +
      `  Status: ${result.status}\n` +
      `  Git Blob SHA-256 (LF): ${result.gitBlobSha256}\n` +
      `  Disk File SHA-256 (LF): ${result.diskFileSha256}\n` +
      `  Details: ${details}`;
    process.exitCode = 1;
    throw new Error(errorMsg);
  }
  return result;
}

/**
 * Asserts verification for multiple files, aborting on the first mismatch.
 */
export function assertGitBaselineLineage(
  commitSha: string,
  filePaths: string[],
  diskBasePath: string = process.cwd()
): GitLineageVerificationResult[] {
  const results: GitLineageVerificationResult[] = [];
  for (const fp of filePaths) {
    results.push(verifyGitBaselineOrigin(commitSha, fp, diskBasePath));
  }
  return results;
}

/**
 * Audits all core production renderer and parser modules against a target git commit,
 * generating a full cryptographic lineage manifest.
 */
export function auditCoreRendererLineage(
  commitSha: string,
  filePaths: string[] = CORE_RENDERER_SOURCE_FILES,
  diskBasePath: string = process.cwd()
): CoreRendererLineageManifest {
  const modules: GitLineageVerificationResult[] = [];
  let anyTampered = false;

  for (const fp of filePaths) {
    const res = checkGitBaselineOrigin(commitSha, fp, diskBasePath);
    modules.push(res);
    if (res.status !== "VERIFIED") {
      anyTampered = true;
    }
  }

  return {
    baselineCommitSha: commitSha,
    verifiedAt: new Date().toISOString(),
    overallStatus: anyTampered ? "TAMPER_DETECTED" : "VERIFIED",
    verifiedModuleCount: modules.length,
    modules,
    runtimeProcessInfo: {
      nodeVersion: process.version,
      pid: process.pid,
      platform: process.platform,
      cwd: diskBasePath,
    },
  };
}
