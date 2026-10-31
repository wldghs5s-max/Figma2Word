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

export function computeNormalizedSha256(content: string | Buffer): string {
  const str = typeof content === "string" ? content : content.toString("utf8");
  const normalized = str.replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Automatically verifies that a renderer/parser source file in the filesystem
 * matches the exact Git commit object, failing closed (exit code 1 + throws) on any discrepancy.
 */
export function verifyGitBaselineOrigin(
  commitSha: string,
  relFilePath: string,
  diskBasePath: string = process.cwd()
): GitLineageVerificationResult {
  const posixPath = relFilePath.replace(/\\/g, "/");
  const fullDiskPath = path.resolve(diskBasePath, relFilePath);

  // 1. Fetch exact blob from git object store
  let gitSource: string;
  try {
    gitSource = execSync(`git show ${commitSha}:${posixPath}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err: any) {
    const errorMsg = `GIT_ORIGIN_VERIFY_FAILED: Failed to fetch git object for ${commitSha}:${posixPath} - ${err?.message || err}`;
    process.exitCode = 1;
    throw new Error(errorMsg);
  }

  // 2. Read disk file
  if (!fs.existsSync(fullDiskPath)) {
    const errorMsg = `GIT_ORIGIN_VERIFY_FAILED: Disk file does not exist at ${fullDiskPath}`;
    process.exitCode = 1;
    throw new Error(errorMsg);
  }

  const diskSource = fs.readFileSync(fullDiskPath, "utf8");

  // 3. Normalize newlines (CRLF -> LF)
  const gitSha = computeNormalizedSha256(gitSource);
  const diskSha = computeNormalizedSha256(diskSource);

  // 4. Strict hash equality assertion
  if (gitSha !== diskSha) {
    const errorMsg = `GIT_ORIGIN_TAMPER_DETECTED: Source file ${posixPath} does not match git commit ${commitSha}!\n` +
      `  Git Blob SHA-256 (LF): ${gitSha}\n` +
      `  Disk File SHA-256 (LF): ${diskSha}`;
    process.exitCode = 1;
    throw new Error(errorMsg);
  }

  return {
    commitSha,
    filePath: posixPath,
    gitBlobSha256: gitSha,
    diskFileSha256: diskSha,
    normalizedMatch: true,
    newlinePolicy: "LF_NORMALIZED",
    status: "VERIFIED",
  };
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

