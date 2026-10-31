# Phase 36 Report 05: Gate Failure Exit Code Hardening (Audit Finding A-04)

## Objective

To eliminate the possibility of a pipeline continuing execution or silently passing CI/CD when a Provenance Gate or Measurement Integrity Gate violation occurs.

---

## The Previous Vulnerability

In Phase 35.2, `run_phase35_2_production_recovery.ts` logged gate failures using `console.error(...)` but did not throw an exception or set `process.exitCode = 1`. Consequently, a process could theoretically complete with code 0 even if integrity violations occurred.

---

## Architectural Implementation

In `src/fidelity/integrityGate.ts`, a centralized assertion helper was added:

```ts
/**
 * Asserts that a gate check passed. If failed, sets process.exitCode = 1 and throws an Error.
 */
export function assertGatePassed(
  name: string,
  result: { passed: boolean; violations: string[] }
): void {
  if (!result.passed) {
    process.exitCode = 1;
    const details =
      result.violations.length > 0 ? `:\n - ${result.violations.join("\n - ")}` : "";
    throw new Error(`[GATE_FAILURE] ${name} check failed with non-zero exit code${details}`);
  }
}
```

In `scripts/run_phase36_production_optimization.ts`:
- Step 9: `assertGatePassed("ProvenanceGate", provResult);`
- Step 10: `assertGatePassed("MeasurementIntegrityGate", integrityResult);`

If any check fails:
1. `process.exitCode` is immediately set to `1`.
2. A descriptive `[GATE_FAILURE]` exception is thrown, halting further execution.
3. The process terminates with non-zero exit code, blocking downstream steps.

---

## Negative Automated Unit Tests

In `tests/phase36-audit-fixes.test.ts`:
1. **Provenance Gate Failure Test**: Constructs a corrupted provenance record (synthetic document flag, invalid JSON hash, 0 nodes). Asserts that `assertGatePassed` throws an error matching `/GATE_FAILURE/` and sets `process.exitCode === 1`.
2. **Measurement Integrity Gate Failure Test**: Constructs a measurement bundle where Word automation failed. Asserts that `assertGatePassed` throws an error and sets `process.exitCode === 1`.
3. **Passing Gate Test**: Verifies that a passing gate result does not throw and leaves `process.exitCode === 0`.

All unit tests pass with zero regressions.
