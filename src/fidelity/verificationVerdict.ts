export type VerificationStatus =
  | "PASSED"
  | "FAILED"
  | "PARTIAL"
  | "UNVERIFIED"
  | "SKIPPED"
  | "BLOCKED";

export interface GateResult {
  gateId: string;
  name: string;
  status: VerificationStatus;
  summary: string;
  details?: Record<string, any>;
  failureReasons?: string[];
  evidencePaths?: string[];
}

export interface EvidenceFileEntry {
  path: string;
  sha256?: string;
  exists: boolean;
  required?: boolean;
}

export interface FinalVerdictEvaluationOptions {
  runId: string;
  requiredGates: GateResult[];
  optionalGates?: GateResult[];
  evidenceManifest?: {
    files: EvidenceFileEntry[];
  };
  measurements?: Record<string, any>;
}

export interface FinalVerdictResult {
  runId: string;
  evaluatedAt: string;
  overallStatus: "PASSED" | "FAILED" | "PARTIAL" | "UNVERIFIED";
  isApproved: boolean; // true ONLY if overallStatus === "PASSED"
  requiredGateCount: number;
  passedGateCount: number;
  failedGateCount: number;
  partialGateCount: number;
  unverifiedGateCount: number;
  skippedGateCount: number;
  gateResults: Record<string, GateResult>;
  failureReasons: string[];
  exitCode: number; // 0 if isApproved, 1 if not
}

/**
 * Evaluates the single, canonical final verdict across all required and optional gates.
 * Fails closed on any non-PASSED required gate, missing files, or empty gate sets.
 */
export function evaluateFinalVerdict(
  options: FinalVerdictEvaluationOptions
): FinalVerdictResult {
  const { runId, requiredGates, optionalGates = [], evidenceManifest } = options;
  const failureReasons: string[] = [];

  const gateResults: Record<string, GateResult> = {};
  let passedCount = 0;
  let failedCount = 0;
  let partialCount = 0;
  let unverifiedCount = 0;
  let skippedCount = 0;

  if (!requiredGates || requiredGates.length === 0) {
    failureReasons.push("FATAL_POLICY_VIOLATION: No required gates supplied; empty gate set cannot be approved.");
  }

  for (const gate of requiredGates || []) {
    gateResults[gate.gateId] = gate;

    switch (gate.status) {
      case "PASSED":
        passedCount++;
        break;
      case "FAILED":
      case "BLOCKED":
        failedCount++;
        const fMsg = gate.failureReasons && gate.failureReasons.length > 0
          ? gate.failureReasons.join("; ")
          : gate.summary || "Unspecified gate failure";
        failureReasons.push(`Gate '${gate.gateId}' failed: ${fMsg}`);
        break;
      case "PARTIAL":
        partialCount++;
        const pMsg = gate.failureReasons && gate.failureReasons.length > 0
          ? gate.failureReasons.join("; ")
          : gate.summary || "Gate partially verified";
        failureReasons.push(`Gate '${gate.gateId}' returned PARTIAL: ${pMsg}`);
        break;
      case "UNVERIFIED":
        unverifiedCount++;
        const uMsg = gate.failureReasons && gate.failureReasons.length > 0
          ? gate.failureReasons.join("; ")
          : gate.summary || "Gate unverified";
        failureReasons.push(`Gate '${gate.gateId}' is UNVERIFIED: ${uMsg}`);
        break;
      case "SKIPPED":
        skippedCount++;
        failureReasons.push(`Gate '${gate.gateId}' was SKIPPED; required gate omission cannot be approved.`);
        break;
      default:
        failedCount++;
        failureReasons.push(`Gate '${gate.gateId}' has unknown status: '${gate.status}'`);
        break;
    }
  }

  for (const gate of optionalGates) {
    gateResults[gate.gateId] = gate;
  }

  // Check evidence manifest if provided
  if (evidenceManifest && Array.isArray(evidenceManifest.files)) {
    for (const file of evidenceManifest.files) {
      if (!file.exists || !file.sha256 || file.sha256.length === 0) {
        failureReasons.push(`Evidence file missing or invalid: ${file.path}`);
      }
    }
  }

  // Calculate final status
  let overallStatus: "PASSED" | "FAILED" | "PARTIAL" | "UNVERIFIED" = "PASSED";

  if (!requiredGates || requiredGates.length === 0) {
    overallStatus = "FAILED";
  } else if (failedCount > 0 || skippedCount > 0 || failureReasons.some((r) => r.includes("Evidence file missing"))) {
    overallStatus = "FAILED";
  } else if (unverifiedCount > 0) {
    overallStatus = "UNVERIFIED";
  } else if (partialCount > 0) {
    overallStatus = "PARTIAL";
  } else if (passedCount !== requiredGates.length) {
    overallStatus = "FAILED";
  }

  const isApproved = overallStatus === "PASSED" && failureReasons.length === 0;
  const exitCode = isApproved ? 0 : 1;

  return {
    runId,
    evaluatedAt: new Date().toISOString(),
    overallStatus,
    isApproved,
    requiredGateCount: (requiredGates || []).length,
    passedGateCount: passedCount,
    failedGateCount: failedCount,
    partialGateCount: partialCount,
    unverifiedGateCount: unverifiedCount,
    skippedGateCount: skippedCount,
    gateResults,
    failureReasons,
    exitCode,
  };
}

