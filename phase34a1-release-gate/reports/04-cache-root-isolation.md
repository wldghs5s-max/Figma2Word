# Report 04: Cache Root Isolation Enforced (GATE-03)

## 1. Context & Identified Vulnerability
In Phase 34A, `getFigmaReferenceDetailed` accepted an optional parameter:
`options?: { baseDir?: string; allowedCacheDir?: string; }`

**Vulnerability:**
If `options?.allowedCacheDir` was omitted (which was true in `planOneShotCapture` and `getFigmaReference`), the directory boundary check was completely skipped:
```ts
if (options?.allowedCacheDir) {
  // check path inside directory
}
```
If an entry in `cache-manifest.json` pointed to an arbitrary path on the system (e.g. `/etc/passwd` or `../../secret.png`), the cache lookup would inspect and read that external file.

## 2. Remediated Architecture (`src/cache/cacheManifest.ts` & `src/api/oneShotCapture.ts`)

### 1) Single Source of Truth for Cache Root
Enforced strict fallback boundaries:
```ts
const allowedDir = options?.allowedCacheDir
  ? path.resolve(baseDir, options.allowedCacheDir)
  : (options?.baseDir ? baseDir : getDefaultCacheRoot(baseDir));
```
- If caller provides `allowedCacheDir`, it is resolved against `baseDir`.
- If caller omits `allowedCacheDir`, but specifies `baseDir` (e.g. in isolated test fixtures), `baseDir` is the enforced boundary.
- If caller omits both, the canonical default cache root `debug/cache` is strictly enforced.
- **There is no code path where cache boundary enforcement is bypassed.**

### 2) Identifier Sanitization
Added `isValidIdentifier(id: string)`:
- Validates that `fileKey` and `nodeId` do not contain `..`, `/`, `\`, or null bytes (`\0`).
- Any cache lookup with a traversal sequence in `fileKey` is immediately rejected with `status: "PATH_TRAVERSAL"`.

### 3) Symlink and Realpath Verification
- Before inspecting the file, `fs.lstatSync(resolvedPath)` checks if the file is a symbolic link.
- If it is a symlink, it is rejected with `status: "PATH_TRAVERSAL"`.
- If the file exists, `fs.realpathSync(resolvedPath)` resolves the canonical physical path. If the physical path resolves outside `allowedDir`, it is rejected with `status: "PATH_TRAVERSAL"`.

### 4) Pre-Write Cache Verification
In `oneShotCapture.ts`, both the temporary file path (`.tmp_${safeNodeId}_${Date.now()}.png`) and final destination (`frame_${safeNodeId}.png`) are verified via `isPathInsideDirectory(path, outputDir)` prior to write or rename operations.

## 3. Test Verification (`tests/phase34a1-release-gate.test.ts`)

| Test Case | Description | Result |
|---|---|---|
| `3.1` | Rejects cache lookup pointing to `/etc/passwd` with omitted `allowedCacheDir` | **PASSED** (`status: "PATH_TRAVERSAL"`, reason: `escapes allowed cache directory`) |
| `3.2` | Rejects path traversal sequences in `fileKey` (`../../../secret`) | **PASSED** (`status: "PATH_TRAVERSAL"`, reason: `fileKey contains path traversal`) |
| `3.3` | Rejects symlink whose physical target escapes the cache root | **PASSED** (`status: "PATH_TRAVERSAL"`, reason: `Symbolic link detected`) |
| `3.4` | Accepts genuine cache file residing inside the allowed cache root | **PASSED** (`status: "VALID"`, entry returned) |
